/** Registro de salas activas. */

import type { ConfiguracionSala, IdJugador, ResumenSala } from '@colonist/motor-compartido';
import { Sala, type DependenciasSala } from './sala.js';

export class GestorSalas {
  private readonly salas = new Map<string, Sala>();
  private readonly deps: Omit<DependenciasSala, 'alCerrar'> & { alCerrar?: (sala: Sala) => void };

  constructor(deps: Omit<DependenciasSala, 'alCerrar'> & { alCerrar?: (sala: Sala) => void }) {
    this.deps = deps;
  }

  crear(nombre: string, anfitrion: { idJugador: IdJugador; nombre: string }, configuracion: Partial<ConfiguracionSala> = {}): Sala {
    const sala = new Sala(nombre, anfitrion, configuracion, {
      ...this.deps,
      alCerrar: (cerrada) => {
        this.salas.delete(cerrada.id);
        this.deps.alCerrar?.(cerrada);
      },
    });
    this.salas.set(sala.id, sala);
    return sala;
  }

  obtener(id: string): Sala | undefined {
    return this.salas.get(id);
  }

  /** Salas públicas que aún no han terminado. */
  listar(): ResumenSala[] {
    return [...this.salas.values()]
      .filter((s) => !s.configuracion.privada && s.estado !== 'terminada')
      .map((s) => s.resumen());
  }

  cerrarTodas(): void {
    for (const sala of [...this.salas.values()]) {
      sala.cerrar();
    }
  }

  get cantidad(): number {
    return this.salas.size;
  }
}

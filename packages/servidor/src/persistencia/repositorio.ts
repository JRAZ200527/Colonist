/** Almacenamiento de usuarios, partidas terminadas y ranking. */

import type { EntradaRanking } from '@colonist/motor-compartido';
import { calcularNuevosElo, ELO_INICIAL, posicionesPorPuntos } from './elo.js';

export interface ResultadoJugador {
  nombre: string;
  esBot: boolean;
  puntos: number;
  ganador: boolean;
}

export interface ResultadoPartida {
  plantilla: string;
  turnos: number;
  jugadores: ResultadoJugador[];
}

export interface Repositorio {
  readonly descripcion: string;
  registrarPartida(resultado: ResultadoPartida): Promise<void>;
  ranking(limite: number): Promise<EntradaRanking[]>;
  cerrar(): Promise<void>;
}

/** Solo los humanos cuentan para el Elo y las estadísticas. */
export function participantesHumanos(resultado: ResultadoPartida) {
  const posiciones = posicionesPorPuntos(resultado.jugadores);
  return resultado.jugadores
    .map((j, i) => ({ ...j, posicion: posiciones[i]! }))
    .filter((j) => !j.esBot);
}

/** Repositorio en memoria: para desarrollo local sin base de datos y para las pruebas. */
export class RepositorioMemoria implements Repositorio {
  readonly descripcion = 'memoria (sin base de datos)';
  private readonly usuarios = new Map<string, EntradaRanking>();
  readonly partidas: ResultadoPartida[] = [];

  async registrarPartida(resultado: ResultadoPartida): Promise<void> {
    this.partidas.push(resultado);
    const humanos = participantesHumanos(resultado);
    for (const h of humanos) {
      if (!this.usuarios.has(h.nombre)) {
        this.usuarios.set(h.nombre, { nombre: h.nombre, elo: ELO_INICIAL, partidasJugadas: 0, partidasGanadas: 0 });
      }
    }
    const nuevos = calcularNuevosElo(
      humanos.map((h) => ({ id: h.nombre, elo: this.usuarios.get(h.nombre)!.elo, posicion: h.posicion })),
    );
    for (const h of humanos) {
      const usuario = this.usuarios.get(h.nombre)!;
      usuario.elo = nuevos.get(h.nombre)!;
      usuario.partidasJugadas++;
      if (h.ganador) {
        usuario.partidasGanadas++;
      }
    }
  }

  async ranking(limite: number): Promise<EntradaRanking[]> {
    return [...this.usuarios.values()]
      .sort((a, b) => b.elo - a.elo || b.partidasGanadas - a.partidasGanadas)
      .slice(0, limite)
      .map((u) => ({ ...u }));
  }

  async cerrar(): Promise<void> {}
}

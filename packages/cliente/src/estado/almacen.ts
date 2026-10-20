/** Estado global del cliente (Zustand): conexión, vestíbulo, sala y partida. */

import type { AccionCliente, MensajeCliente } from '@colonist/motor-compartido';
import { create } from 'zustand';
import { URLS_SERVIDOR } from '../configuracion';
import { ConexionJuego, type EstadoConexion } from '../red/conexion';
import { cambiarSilencio, efectosDeEventos, estaSilenciado, reproducir } from '../sonido/sonidos';
import type { ModoConstruccion } from './derivados';
import { crearAviso, DATOS_INICIALES, procesarMensaje, type DatosServidor } from './mensajes';

const CLAVE_NOMBRE = 'colonist.nombre';

function leerNombreGuardado(): string {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? '';
  } catch {
    return '';
  }
}

interface EstadoCliente extends DatosServidor {
  conexion: EstadoConexion;
  nombreGuardado: string;
  modo: ModoConstruccion;
  silencio: boolean;
  /** Entra al juego con un nombre y abre la conexión. */
  entrar(nombre: string): void;
  enviar(mensaje: MensajeCliente): void;
  accion(accion: AccionCliente): void;
  elegirModo(modo: ModoConstruccion): void;
  alternarSilencio(): void;
  avisar(texto: string, tipo?: 'error' | 'info'): void;
  cerrarAviso(id: number): void;
}

let conexion: ConexionJuego | null = null;

export const useAlmacen = create<EstadoCliente>()((set, get) => ({
  ...DATOS_INICIALES,
  conexion: 'desconectado',
  nombreGuardado: leerNombreGuardado(),
  modo: 'ninguno',
  silencio: estaSilenciado(),

  entrar(nombre) {
    try {
      localStorage.setItem(CLAVE_NOMBRE, nombre);
    } catch {
      // Sin almacenamiento: no pasa nada, solo no se recordará el nombre.
    }
    set({ nombreGuardado: nombre });
    conexion?.cerrar();
    conexion = new ConexionJuego({ url: URLS_SERVIDOR.ws, nombre });
    conexion.alCambiarEstado((estado) => set({ conexion: estado }));
    conexion.alMensaje((mensaje) => {
      if (mensaje.tipo === 'partida' && !mensaje.registroCompleto) {
        efectosDeEventos(mensaje.eventos, get().yo?.idJugador ?? null).forEach(reproducir);
      } else if (mensaje.tipo === 'error') {
        reproducir('aviso');
      }
      const cambios = procesarMensaje(get(), mensaje);
      // Tras cada cambio de la partida se vuelve al modo normal si ya no se puede construir.
      const faseConConstruccion = mensaje.tipo === 'partida' && ['acciones', 'construccionEspecial'].includes(mensaje.vista.fase.tipo);
      if (mensaje.tipo === 'partida' && !faseConConstruccion) {
        set({ ...cambios, modo: 'ninguno' });
      } else {
        set(cambios);
      }
      if (mensaje.tipo === 'bienvenida') {
        conexion?.enviar({ tipo: 'listarSalas' });
      }
    });
    conexion.conectar();
  },

  enviar(mensaje) {
    conexion?.enviar(mensaje);
  },

  accion(accion) {
    conexion?.enviar({ tipo: 'accion', accion });
    set({ modo: 'ninguno' });
  },

  elegirModo(modo) {
    set({ modo: get().modo === modo ? 'ninguno' : modo });
  },

  alternarSilencio() {
    const silencio = !get().silencio;
    cambiarSilencio(silencio);
    set({ silencio });
  },

  avisar(texto, tipo = 'error') {
    set({ avisos: [...get().avisos, crearAviso(texto, tipo)].slice(-4) });
  },

  cerrarAviso(id) {
    set({ avisos: get().avisos.filter((a) => a.id !== id) });
  },
}));

/**
 * Mensajes del WebSocket entre cliente y servidor. Todos son JSON con un campo `tipo`.
 *
 * Conexión: el cliente envía `hola` (con su `token` si ya tenía sesión) y recibe
 * `bienvenida`. Si se corta la conexión, al reconectar con el mismo token recupera
 * su identidad, su asiento en la sala y la partida en curso.
 */

import type { AccionJuego, IdJugador, ModoDados } from '../juego/tipos.js';
import type { ModoMapa } from '../mapas/generador.js';
import type { IdPlantilla } from '../mapas/plantillas.js';
import type { EventoVisible, VistaPartida } from './vista.js';

/** Cada cuánto se envía un latido para que Render no cierre la conexión (cierra a los ~100 s sin tráfico). */
export const INTERVALO_LATIDO_MS = 25_000;
export const RUTA_WEBSOCKET = '/ws';

export const NIVELES_BOT = ['facil', 'medio', 'dificil'] as const;
export type NivelBot = (typeof NIVELES_BOT)[number];
export const NOMBRES_NIVEL_BOT: Readonly<Record<NivelBot, string>> = {
  facil: 'Fácil',
  medio: 'Medio',
  dificil: 'Difícil',
};

/** Una acción sin el campo `jugador`: el servidor lo rellena con el de la sesión. */
export type AccionCliente = AccionJuego extends infer A ? (A extends AccionJuego ? Omit<A, 'jugador'> : never) : never;

export interface ConfiguracionSala {
  plantilla: IdPlantilla;
  modoMapa: ModoMapa;
  modoDados: ModoDados;
  puntosVictoria: number;
  maxJugadores: number;
  privada: boolean;
  /** Módulo Ciudades y Caballeros. */
  ciudadesYCaballeros: boolean;
}

export type EstadoSala = 'esperando' | 'jugando' | 'terminada';

export interface AsientoSala {
  idJugador: IdJugador;
  nombre: string;
  tipo: 'humano' | 'bot';
  nivelBot: NivelBot | null;
  conectado: boolean;
  /** Un bot juega temporalmente por un humano desconectado. */
  sustituidoPorBot: boolean;
}

export interface VistaSala {
  id: string;
  nombre: string;
  anfitrion: IdJugador;
  configuracion: ConfiguracionSala;
  asientos: AsientoSala[];
  estado: EstadoSala;
}

export interface ResumenSala {
  id: string;
  nombre: string;
  plantilla: IdPlantilla;
  jugadores: number;
  maxJugadores: number;
  estado: EstadoSala;
}

export interface EntradaRanking {
  nombre: string;
  elo: number;
  partidasJugadas: number;
  partidasGanadas: number;
}

export type MensajeCliente =
  | { tipo: 'hola'; nombre: string; token?: string }
  | { tipo: 'ping'; t: number }
  | { tipo: 'listarSalas' }
  | { tipo: 'crearSala'; nombre: string; configuracion?: Partial<ConfiguracionSala> }
  | { tipo: 'unirseSala'; idSala: string }
  | { tipo: 'salirSala' }
  | { tipo: 'anadirBot'; nivel: NivelBot }
  | { tipo: 'quitarAsiento'; idJugador: IdJugador }
  | { tipo: 'cambiarConfiguracion'; configuracion: Partial<ConfiguracionSala> }
  | { tipo: 'iniciarPartida' }
  | { tipo: 'accion'; accion: AccionCliente }
  | { tipo: 'chat'; texto: string }
  | { tipo: 'pedirRanking' };

export type MensajeServidor =
  | { tipo: 'bienvenida'; token: string; idJugador: IdJugador; nombre: string; reconectado: boolean }
  | { tipo: 'pong'; t: number }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'salas'; salas: ResumenSala[] }
  | { tipo: 'sala'; sala: VistaSala | null }
  /**
   * Estado de la partida para este jugador. Con `registroCompleto`, `eventos` es
   * todo el registro (al entrar o reconectar) y sustituye al que tuviera el cliente;
   * si no, son solo los eventos nuevos.
   */
  | { tipo: 'partida'; vista: VistaPartida; eventos: EventoVisible[]; registroCompleto: boolean }
  | { tipo: 'chat'; de: IdJugador | null; nombre: string; texto: string; hora: number }
  | { tipo: 'ranking'; jugadores: EntradaRanking[] };

/**
 * Bots para partidas contra la computadora.
 *
 * - Fácil: reglas sencillas con decisiones al azar entre opciones aceptables.
 * - Medio: reglas heurísticas (colocación por probabilidad y diversidad, ladrón
 *   contra el líder, descartes y comercio orientados a un objetivo).
 * - Difícil: búsqueda Monte Carlo con determinización sobre la política Medio.
 */

import { GeneradorAleatorio, type AccionJuego, type EstadoJuego, type IdJugador, type NivelBot } from '@colonist/motor-compartido';
import { decidirConMontecarlo, OPCIONES_MONTECARLO_POR_DEFECTO, type OpcionesMontecarlo } from './montecarlo.js';
import { decidirConReglas } from './politica.js';

export { NIVELES_BOT, NOMBRES_NIVEL_BOT, type NivelBot } from '@colonist/motor-compartido';
export { determinizar, type OpcionesMontecarlo } from './montecarlo.js';
export { evaluarPosicion, puntuarVertice } from './heuristicas.js';

export interface OpcionesBot {
  /** Semilla para las decisiones al azar del bot (independiente de la de la partida). */
  semilla?: number;
  montecarlo?: Partial<OpcionesMontecarlo>;
}

/**
 * Siguiente acción de un bot en esta posición, o null si ahora no le toca actuar
 * (por ejemplo, es el turno de otro y no hay ofertas que responder).
 */
export function decidirAccionBot(
  estado: EstadoJuego,
  id: IdJugador,
  nivel: NivelBot,
  opciones: OpcionesBot = {},
): AccionJuego | null {
  const rng = new GeneradorAleatorio(opciones.semilla ?? Math.floor(Math.random() * 2 ** 32));
  if (nivel === 'dificil') {
    return decidirConMontecarlo(estado, id, rng, { ...OPCIONES_MONTECARLO_POR_DEFECTO, ...opciones.montecarlo });
  }
  return decidirConReglas(estado, id, nivel, rng);
}

/** Jugadores (bots incluidos) que deben actuar ahora: el que está en turno o los que deben descartar. */
export function jugadoresQueDebenActuar(estado: EstadoJuego): IdJugador[] {
  const fase = estado.fase;
  if (fase.tipo === 'finalizada') {
    return [];
  }
  if (fase.tipo === 'descartar' || fase.tipo === 'elegirOro') {
    return Object.keys(fase.pendientes);
  }
  if (fase.tipo === 'construccionEspecial') {
    return fase.pendientes.slice(0, 1);
  }
  return [estado.jugadores[estado.turno.jugadorActual]!.id];
}

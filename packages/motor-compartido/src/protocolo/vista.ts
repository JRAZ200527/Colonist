/**
 * Vista de la partida para un jugador concreto: el servidor nunca envía la
 * información oculta (mano de los rivales, sus cartas de desarrollo, el orden del
 * mazo ni la semilla del azar).
 */

import { puntosDeVictoria } from '../juego/reglas.js';
import { totalCartas } from '../juego/recursos.js';
import { totalMercancias } from '../juego/ciudadesCaballeros.js';
import {
  CARTAS_PROGRESO_DE_PUNTOS,
  type CartaDesarrollo,
  type EstadoCyC,
  type EstadoJuego,
  type EstadoJugador,
  type EstadoJugadorCyC,
  type EventoJuego,
  type IdJugador,
  type LineaMejora,
  type ManoMercancias,
  type ManoRecursos,
  type TipoCartaDesarrollo,
  type TipoCartaProgreso,
} from '../juego/tipos.js';
import type { Recurso } from '../terreno.js';

/** Ciudades y Caballeros: mercancías y cartas de progreso solo las ve su dueño. */
export interface VistaJugadorCyC extends Omit<EstadoJugadorCyC, 'mercancias' | 'cartasProgreso'> {
  mercancias: ManoMercancias | null;
  totalMercancias: number;
  cartasProgreso: TipoCartaProgreso[] | null;
  totalCartasProgreso: number;
}

export interface VistaJugador extends Omit<EstadoJugador, 'recursos' | 'cartasDesarrollo' | 'cyc'> {
  cyc?: VistaJugadorCyC;
  /** Solo visible para el propio jugador. */
  recursos: ManoRecursos | null;
  totalRecursos: number;
  /** Solo visible para el propio jugador. */
  cartasDesarrollo: CartaDesarrollo[] | null;
  totalCartasDesarrollo: number;
  /** Puntos que ven todos (sin cartas de Punto de Victoria ocultas). */
  puntosVisibles: number;
}

/** Ciudades y Caballeros: de los mazos de progreso solo se sabe cuántas cartas quedan. */
export interface VistaCyC extends Omit<EstadoCyC, 'mazos'> {
  cartasEnMazos: Record<LineaMejora, number>;
}

export interface VistaPartida extends Omit<EstadoJuego, 'jugadores' | 'mazoDesarrollo' | 'barajaDados' | 'semilla' | 'cyc'> {
  jugadores: VistaJugador[];
  cyc?: VistaCyC;
  cartasEnMazo: number;
  /** Jugador para el que se generó la vista (null: espectador). */
  observador: IdJugador | null;
}

export function vistaParaJugador(estado: EstadoJuego, observador: IdJugador | null): VistaPartida {
  const { jugadores, mazoDesarrollo, barajaDados: _baraja, semilla: _semilla, cyc, ...resto } = estado;
  return {
    ...resto,
    observador,
    cartasEnMazo: mazoDesarrollo.length,
    ...(cyc
      ? {
          cyc: {
            ...(({ mazos: _mazos, ...datos }) => datos)(cyc),
            cartasEnMazos: { comercio: cyc.mazos.comercio.length, politica: cyc.mazos.politica.length, ciencia: cyc.mazos.ciencia.length },
          },
        }
      : {}),
    jugadores: jugadores.map((j) => {
      const propio = j.id === observador;
      const { cyc: datosCyC, ...base } = j;
      return {
        ...base,
        recursos: propio ? { ...j.recursos } : null,
        totalRecursos: totalCartas(j.recursos),
        cartasDesarrollo: propio ? j.cartasDesarrollo.map((c) => ({ ...c })) : null,
        totalCartasDesarrollo: j.cartasDesarrollo.length,
        puntosVisibles: puntosDeVictoria(estado, j.id, false),
        ...(datosCyC
          ? {
              cyc: {
                ...datosCyC,
                mercancias: propio ? { ...datosCyC.mercancias } : null,
                totalMercancias: totalMercancias(datosCyC.mercancias),
                cartasProgreso: propio ? [...datosCyC.cartasProgreso] : null,
                totalCartasProgreso: datosCyC.cartasProgreso.length,
              },
            }
          : {}),
      };
    }),
  };
}

/** Evento tal como lo ve un jugador: sin la carta robada ni la comprada si no le afecta. */
export type EventoVisible =
  | Exclude<EventoJuego, { tipo: 'robo' } | { tipo: 'cartaDesarrolloComprada' } | { tipo: 'cartaProgresoRobada' } | { tipo: 'cartaProgresoPerdida' }>
  | { tipo: 'robo'; jugador: IdJugador; victima: IdJugador; recurso: Recurso | null }
  | { tipo: 'cartaDesarrolloComprada'; jugador: IdJugador; carta: TipoCartaDesarrollo | null }
  | { tipo: 'cartaProgresoRobada'; jugador: IdJugador; linea: LineaMejora; carta: TipoCartaProgreso | null }
  | { tipo: 'cartaProgresoPerdida'; jugador: IdJugador; victima: IdJugador; carta: TipoCartaProgreso | null };

export function eventoParaJugador(evento: EventoJuego, observador: IdJugador | null): EventoVisible {
  // Las cartas de progreso de puntos se juegan al robarlas, así que son públicas.
  if (evento.tipo === 'cartaProgresoRobada' && observador !== evento.jugador && !CARTAS_PROGRESO_DE_PUNTOS.includes(evento.carta)) {
    return { ...evento, carta: null };
  }
  if (evento.tipo === 'cartaProgresoPerdida' && observador !== evento.jugador && observador !== evento.victima) {
    return { ...evento, carta: null };
  }
  if (evento.tipo === 'robo' && observador !== evento.jugador && observador !== evento.victima) {
    return { ...evento, recurso: null };
  }
  if (evento.tipo === 'cartaDesarrolloComprada' && observador !== evento.jugador) {
    return { ...evento, carta: null };
  }
  return evento;
}

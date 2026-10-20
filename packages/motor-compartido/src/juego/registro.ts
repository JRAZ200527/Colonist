/** Textos en español del registro de la partida. */

import { NOMBRES_TERRENO } from '../terreno.js';
import { describirRecursos, totalCartas } from './recursos.js';
import type { EventoVisible } from '../protocolo/vista.js';
import {
  NOMBRES_CARTA_DESARROLLO,
  NOMBRES_CARTA_PROGRESO,
  NOMBRES_LINEA_MEJORA,
  NOMBRES_NIVEL_CABALLERO,
  POSICION_ATAQUE_BARBAROS,
  type EventoJuego,
  type IdJugador,
} from './tipos.js';

export interface OpcionesRegistro {
  /** Jugador que lee el registro: ve sus cartas robadas y compradas, pero no las de los demás. */
  observador?: IdJugador | null;
}

/**
 * Texto de un evento. Acepta eventos completos o ya filtrados para un jugador
 * (`EventoVisible`), y la partida completa o la vista de un jugador.
 */
export function describirEvento(
  evento: EventoJuego | EventoVisible,
  estado: { jugadores: readonly { id: IdJugador; nombre: string }[] },
  opciones: OpcionesRegistro = {},
): string {
  const nombre = (id: IdJugador | null): string =>
    id === null ? 'nadie' : (estado.jugadores.find((j) => j.id === id)?.nombre ?? id);
  const observador = opciones.observador ?? null;

  switch (evento.tipo) {
    case 'pobladoColocado':
      return `${nombre(evento.jugador)} colocó un poblado`;
    case 'carreteraConstruida':
      return `${nombre(evento.jugador)} construyó una carretera`;
    case 'ciudadConstruida':
      return `${nombre(evento.jugador)} construyó una ciudad`;
    case 'recursosIniciales':
      return `${nombre(evento.jugador)} recibió ${describirRecursos(evento.recursos)}`;
    case 'dadosTirados':
      return `${nombre(evento.jugador)} sacó ${evento.dados[0] + evento.dados[1]} (${evento.dados[0]} y ${evento.dados[1]})`;
    case 'produccion': {
      const partes = Object.entries(evento.reparto).map(([id, r]) => `${nombre(id)} recibió ${describirRecursos(r)}`);
      return partes.length > 0 ? partes.join('; ') : 'Nadie recibió recursos';
    }
    case 'descarte':
      return `${nombre(evento.jugador)} descartó ${totalCartas(evento.recursos)} cartas`;
    case 'ladronMovido':
      return `${nombre(evento.jugador)} movió el ladrón`;
    case 'robo': {
      const ve = evento.recurso !== null && (observador === evento.jugador || observador === evento.victima);
      const carta = ve ? `1 ${NOMBRES_TERRENO[evento.recurso!]}` : 'una carta';
      return `${nombre(evento.jugador)} robó ${carta} a ${nombre(evento.victima)}`;
    }
    case 'cartaDesarrolloComprada': {
      const ve = evento.carta !== null && observador === evento.jugador;
      const carta = ve ? `: ${NOMBRES_CARTA_DESARROLLO[evento.carta!]}` : '';
      return `${nombre(evento.jugador)} compró una carta de desarrollo${carta}`;
    }
    case 'cartaDesarrolloJugada':
      return `${nombre(evento.jugador)} jugó ${NOMBRES_CARTA_DESARROLLO[evento.carta]}`;
    case 'abundancia':
      return `${nombre(evento.jugador)} tomó ${describirRecursos(evento.recursos)} de la banca`;
    case 'monopolio':
      return `${nombre(evento.jugador)} se llevó ${evento.cantidad} de ${NOMBRES_TERRENO[evento.recurso]}`;
    case 'comercioBanca':
      return `${nombre(evento.jugador)} cambió ${describirRecursos(evento.entrega)} por ${describirRecursos(evento.recibe)} con la banca`;
    case 'ofertaPropuesta':
      return `${nombre(evento.oferta.autor)} ofrece ${describirRecursos(evento.oferta.ofrece)} a cambio de ${describirRecursos(evento.oferta.pide)}`;
    case 'ofertaRespondida':
      return `${nombre(evento.jugador)} ${evento.acepta ? 'aceptó' : 'rechazó'} la oferta`;
    case 'ofertaRetirada':
      return `${nombre(evento.jugador)} retiró su oferta`;
    case 'comercioJugadores':
      return `${nombre(evento.de)} cambió ${describirRecursos(evento.entrega)} por ${describirRecursos(evento.recibe)} con ${nombre(evento.con)}`;
    case 'tituloCambiado': {
      const titulo = evento.titulo === 'granRuta' ? 'la Gran Ruta Comercial' : 'el Mayor Ejército';
      return evento.jugador === null
        ? `${nombre(evento.anterior)} perdió ${titulo}`
        : `${nombre(evento.jugador)} consiguió ${titulo}`;
    }
    case 'turnoIniciado':
      return `Turno ${evento.numero}: le toca a ${nombre(evento.jugador)}`;
    case 'victoria':
      return `¡${nombre(evento.jugador)} ganó la partida con ${evento.puntos} puntos!`;
    case 'construccionEspecial':
      return `Construcción especial: le toca a ${nombre(evento.jugador)}`;
    case 'barcoConstruido':
      return `${nombre(evento.jugador)} construyó un barco`;
    case 'barcoMovido':
      return `${nombre(evento.jugador)} movió un barco`;
    case 'pirataMovido':
      return `${nombre(evento.jugador)} movió el barco pirata`;
    case 'oroElegido':
      return `${nombre(evento.jugador)} eligió ${describirRecursos(evento.recursos)} del oro`;
    case 'dadoEvento':
      return evento.cara === 'barco'
        ? 'Dado de evento: el barco bárbaro avanza'
        : `Dado de evento: puerta de ${NOMBRES_LINEA_MEJORA[evento.cara]}`;
    case 'barbarosAvanzan':
      return `Los bárbaros están a ${POSICION_ATAQUE_BARBAROS - evento.posicion} casillas de Catán`;
    case 'ataqueBarbaro': {
      const resumen = `¡Ataque bárbaro! Fuerza ${evento.fuerza} contra defensa ${evento.defensa}.`;
      if (evento.ganador === 'catan') {
        const defensores = evento.defensores.map(nombre).join(' y ');
        return `${resumen} Catán resiste${defensores ? `; defensor: ${defensores}` : ''}`;
      }
      const saqueos = evento.saqueos.map((s) => nombre(s.jugador)).join(' y ');
      return `${resumen} Los bárbaros saquean${saqueos ? ` una ciudad de ${saqueos}` : ''}`;
    }
    case 'caballeroConstruido':
      return `${nombre(evento.jugador)} recluta un caballero`;
    case 'caballeroActivado':
      return `${nombre(evento.jugador)} activa un caballero`;
    case 'caballeroAscendido':
      return `${nombre(evento.jugador)} asciende un caballero a ${NOMBRES_NIVEL_CABALLERO[evento.nivel]}`;
    case 'caballeroMovido':
      return evento.desplazado
        ? `${nombre(evento.jugador)} desplaza un caballero de ${nombre(evento.desplazado.jugador)}`
        : `${nombre(evento.jugador)} mueve un caballero`;
    case 'caballeroRetirado':
      return `${nombre(evento.jugador)} pierde un caballero`;
    case 'murallaConstruida':
      return `${nombre(evento.jugador)} construye una muralla`;
    case 'ciudadMejorada':
      return `${nombre(evento.jugador)} mejora ${NOMBRES_LINEA_MEJORA[evento.linea]} al nivel ${evento.nivel}`;
    case 'metropolis':
      return `${nombre(evento.jugador)} consigue la metrópolis de ${NOMBRES_LINEA_MEJORA[evento.linea]}`;
    case 'cartaProgresoRobada': {
      const carta = evento.carta !== null && observador === evento.jugador ? `: ${NOMBRES_CARTA_PROGRESO[evento.carta]}` : '';
      return `${nombre(evento.jugador)} roba una carta de progreso de ${NOMBRES_LINEA_MEJORA[evento.linea]}${carta}`;
    }
    case 'cartaProgresoJugada':
      return `${nombre(evento.jugador)} juega ${NOMBRES_CARTA_PROGRESO[evento.carta]}`;
    case 'cartaProgresoPerdida':
      return `${nombre(evento.jugador)} roba una carta de progreso a ${nombre(evento.victima)}`;
    case 'cartasTomadas': {
      const total = totalCartas(evento.recursos) + Object.values(evento.mercancias).reduce((s, n) => s + (n ?? 0), 0);
      return `${nombre(evento.jugador)} toma ${total} carta${total === 1 ? '' : 's'} de ${nombre(evento.de)}`;
    }
    case 'carreteraRetirada':
      return `Se retira una carretera de ${nombre(evento.jugador)}`;
    case 'fichasIntercambiadas':
      return `${nombre(evento.jugador)} intercambia dos fichas numéricas`;
    case 'mercaderColocado':
      return `${nombre(evento.jugador)} coloca el mercader`;
  }
}

/** Reproducción de efectos con Howler.js y qué evento suena con qué efecto. */

import type { EventoVisible, IdJugador } from '@colonist/motor-compartido';
import { Howl } from 'howler';
import { aDataUri, codificarWav, EFECTOS, PARTITURAS, sintetizar, type Efecto } from './sintetizador';

const CLAVE_SILENCIO = 'colonist.silencio';
let sonidos: Map<Efecto, Howl> | null = null;

function cargar(): Map<Efecto, Howl> {
  if (!sonidos) {
    sonidos = new Map(
      EFECTOS.map((efecto) => [
        efecto,
        new Howl({ src: [aDataUri(codificarWav(sintetizar(PARTITURAS[efecto])))], format: ['wav'], volume: 0.6 }),
      ]),
    );
  }
  return sonidos;
}

export function estaSilenciado(): boolean {
  try {
    return localStorage.getItem(CLAVE_SILENCIO) === '1';
  } catch {
    return false;
  }
}

export function cambiarSilencio(silencio: boolean): void {
  try {
    localStorage.setItem(CLAVE_SILENCIO, silencio ? '1' : '0');
  } catch {
    // Sin almacenamiento: el ajuste solo dura esta sesión.
  }
}

export function reproducir(efecto: Efecto): void {
  if (estaSilenciado() || typeof window === 'undefined') {
    return;
  }
  cargar().get(efecto)?.play();
}

/**
 * Efectos que corresponden a una tanda de eventos (como mucho uno de cada tipo,
 * para que no se amontonen cuando un bot hace varias cosas seguidas).
 */
export function efectosDeEventos(eventos: readonly EventoVisible[], yo: IdJugador | null): Efecto[] {
  const efectos = new Set<Efecto>();
  for (const evento of eventos) {
    switch (evento.tipo) {
      case 'dadosTirados':
        efectos.add('dados');
        break;
      case 'pobladoColocado':
      case 'carreteraConstruida':
      case 'ciudadConstruida':
      case 'barcoConstruido':
      case 'barcoMovido':
      case 'caballeroConstruido':
      case 'caballeroAscendido':
      case 'caballeroMovido':
      case 'murallaConstruida':
      case 'ciudadMejorada':
        efectos.add('construir');
        break;
      case 'ataqueBarbaro':
        efectos.add('ladron');
        break;
      case 'cartaProgresoRobada':
      case 'cartaProgresoJugada':
        efectos.add('carta');
        break;
      case 'ladronMovido':
      case 'pirataMovido':
      case 'robo':
        efectos.add('ladron');
        break;
      case 'comercioBanca':
      case 'comercioJugadores':
        efectos.add('comercio');
        break;
      case 'cartaDesarrolloComprada':
      case 'cartaDesarrolloJugada':
        efectos.add('carta');
        break;
      case 'turnoIniciado':
        if (evento.jugador === yo) {
          efectos.add('turno');
        }
        break;
      case 'victoria':
        efectos.add('victoria');
        break;
    }
  }
  // La victoria tapa todo lo demás.
  return efectos.has('victoria') ? ['victoria'] : [...efectos];
}

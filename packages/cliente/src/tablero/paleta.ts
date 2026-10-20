/** Colores del juego, compartidos por el tablero (PixiJS) y la interfaz (React). */

import type { ColorJugador, Recurso, TipoTerreno } from '@colonist/motor-compartido';

export const ICONO_RECURSO: Readonly<Record<Recurso, string>> = {
  madera: '🌲',
  arcilla: '🧱',
  trigo: '🌾',
  oveja: '🐑',
  mineral: '⛰️',
};

export const COLOR_TERRENO: Readonly<Record<TipoTerreno, number>> = {
  madera: 0x3f8a3a,
  arcilla: 0xc8643b,
  trigo: 0xf0c03e,
  oveja: 0x9ccd5a,
  mineral: 0x8a97a5,
  desierto: 0xe2cf9c,
  agua: 0x3d8fd1,
  oro: 0xe8b923,
};

export const COLOR_JUGADOR: Readonly<Record<ColorJugador, number>> = {
  rojo: 0xe23d3d,
  azul: 0x2f6fdf,
  naranja: 0xf08a24,
  blanco: 0xf4f4f4,
  verde: 0x2e9e4f,
  marron: 0x8a5a3c,
};

export function aCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

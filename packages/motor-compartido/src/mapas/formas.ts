/** Formas de tablero (qué coordenadas son tierra). */

import { CoordenadasCubicas, espiral } from '../coordenadas.js';

/**
 * Tablero formado por filas horizontales centradas, de arriba abajo.
 * Por ejemplo [3, 4, 5, 4, 3] es el tablero clásico. `centro` desplaza el eje
 * (usa 0.5 cuando la fila central tiene un número par de hexágonos).
 */
export function formaPorFilas(longitudes: readonly number[], centro = 0): CoordenadasCubicas[] {
  if (longitudes.length % 2 === 0) {
    throw new Error('El número de filas debe ser impar para poder centrar el tablero');
  }
  const mitad = (longitudes.length - 1) / 2;
  return longitudes.flatMap((longitud, i) => {
    const r = i - mitad;
    const qMinimo = centro - r / 2 - (longitud - 1) / 2;
    if (!Number.isInteger(qMinimo)) {
      throw new Error(`La fila ${i + 1} (${longitud} hexágonos) no se puede centrar`);
    }
    return Array.from({ length: longitud }, (_, k) => CoordenadasCubicas.desdeAxiales(qMinimo + k, r));
  });
}

/** Varias islas hexagonales de radio `radio` alrededor de los centros dados. */
export function formaIslas(centros: readonly CoordenadasCubicas[], radio: number): CoordenadasCubicas[] {
  return centros.flatMap((centro) => espiral(centro, radio));
}

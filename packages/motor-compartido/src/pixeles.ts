/**
 * Conversión entre coordenadas de hexágono y píxeles de pantalla
 * (orientación punta arriba, eje Y hacia abajo).
 *
 * `tamano` es la distancia del centro de un hexágono a cualquiera de sus esquinas.
 */

import { CoordenadasCubicas, normalizarDireccion, redondearCubicas } from './coordenadas.js';

export interface Punto {
  readonly x: number;
  readonly y: number;
}

const RAIZ_3 = Math.sqrt(3);
const ORIGEN_PANTALLA: Punto = { x: 0, y: 0 };

export function hexAPixel(
  hexagono: CoordenadasCubicas,
  tamano: number,
  origen: Punto = ORIGEN_PANTALLA,
): Punto {
  return {
    x: origen.x + tamano * (RAIZ_3 * hexagono.q + (RAIZ_3 / 2) * hexagono.r),
    y: origen.y + tamano * (1.5 * hexagono.r),
  };
}

/** Hexágono que contiene el punto de pantalla (para detectar clics y el ratón). */
export function pixelAHex(
  punto: Punto,
  tamano: number,
  origen: Punto = ORIGEN_PANTALLA,
): CoordenadasCubicas {
  const px = (punto.x - origen.x) / tamano;
  const py = (punto.y - origen.y) / tamano;
  const q = (RAIZ_3 / 3) * px - py / 3;
  const r = (2 / 3) * py;
  return redondearCubicas(q, -q - r, r);
}

/**
 * Esquina `indice` de un hexágono. La esquina i queda entre los vecinos de las
 * direcciones i e i + 1 (la esquina 0 es la superior derecha).
 */
export function esquinaHexagono(centro: Punto, tamano: number, indice: number): Punto {
  const angulo = ((-60 * normalizarDireccion(indice) - 30) * Math.PI) / 180;
  return {
    x: centro.x + tamano * Math.cos(angulo),
    y: centro.y + tamano * Math.sin(angulo),
  };
}

export function esquinasHexagono(centro: Punto, tamano: number): Punto[] {
  return [0, 1, 2, 3, 4, 5].map((i) => esquinaHexagono(centro, tamano, i));
}

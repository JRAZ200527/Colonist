/**
 * Tablero clásico fijo de 19 hexágonos y 9 puertos. Sirve para pruebas y como mapa
 * por defecto hasta que exista el generador de mapas (Fase 3).
 *
 * Los números siguen la espiral oficial (5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11),
 * colocada desde una esquina exterior hacia el centro, con el desierto en el centro.
 */

import { anillo, CoordenadasCubicas, ORIGEN } from '../coordenadas.js';
import { esquinasDeLado, idVerticeEsquina, type DefinicionHexagono } from '../grafo.js';
import type { TipoTerreno } from '../terreno.js';
import type { Puerto, TipoPuerto } from './tipos.js';

const TERRENOS_ANILLO_EXTERIOR: readonly TipoTerreno[] = [
  'madera', 'oveja', 'trigo', 'arcilla', 'mineral', 'oveja',
  'madera', 'trigo', 'arcilla', 'oveja', 'madera', 'trigo',
];
const TERRENOS_ANILLO_INTERIOR: readonly TipoTerreno[] = ['mineral', 'madera', 'oveja', 'trigo', 'arcilla', 'mineral'];
const FICHAS_EN_ESPIRAL = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

/** Puertos: hexágono de la costa (q, r), lado que mira al mar y tipo. */
const PUERTOS: readonly { q: number; r: number; lado: number; tipo: TipoPuerto }[] = [
  { q: -2, r: 2, lado: 4, tipo: 'generico' },
  { q: -1, r: 2, lado: 5, tipo: 'arcilla' },
  { q: 1, r: 1, lado: 0, tipo: 'generico' },
  { q: 2, r: -1, lado: 0, tipo: 'mineral' },
  { q: 2, r: -2, lado: 1, tipo: 'generico' },
  { q: 0, r: -2, lado: 1, tipo: 'trigo' },
  { q: -1, r: -1, lado: 2, tipo: 'madera' },
  { q: -2, r: 0, lado: 3, tipo: 'generico' },
  { q: 0, r: 2, lado: 5, tipo: 'oveja' },
];

export function crearMapaClasicoFijo(): { hexagonos: DefinicionHexagono[]; puertos: Puerto[] } {
  const espiral = [...anillo(ORIGEN, 2), ...anillo(ORIGEN, 1)];
  const terrenos = [...TERRENOS_ANILLO_EXTERIOR, ...TERRENOS_ANILLO_INTERIOR];
  const hexagonos: DefinicionHexagono[] = espiral.map((c, i) => ({
    coordenadas: c.aAxiales(),
    terreno: terrenos[i]!,
    ficha: FICHAS_EN_ESPIRAL[i]!,
  }));
  hexagonos.push({ coordenadas: ORIGEN.aAxiales(), terreno: 'desierto', ficha: null });

  const puertos: Puerto[] = PUERTOS.map(({ q, r, lado, tipo }) => {
    const hexagono = CoordenadasCubicas.desdeAxiales(q, r);
    const [a, b] = esquinasDeLado(lado);
    return { tipo, vertices: [idVerticeEsquina(hexagono, a), idVerticeEsquina(hexagono, b)] };
  });

  return { hexagonos, puertos };
}

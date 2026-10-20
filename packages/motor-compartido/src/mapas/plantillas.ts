/** Plantillas de los mapas incluidos: forma, terrenos, fichas y puertos. */

import { CoordenadasCubicas, type CoordenadasAxiales } from '../coordenadas.js';
import type { TipoTerreno } from '../terreno.js';
import type { TipoPuerto } from '../juego/tipos.js';
import { formaIslas, formaPorFilas } from './formas.js';

export const IDS_PLANTILLA = [
  'clasico',
  'expansion56',
  'duelo',
  'bosqueNegro',
  'tierrasAltas',
  'diamante',
  'volcan',
  'archipielago',
] as const;
export type IdPlantilla = (typeof IDS_PLANTILLA)[number];

export interface PlantillaMapa {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly jugadores: { readonly minimo: number; readonly maximo: number };
  readonly puntosVictoria: number;
  /** Coordenadas de tierra. El agua se añade alrededor automáticamente. */
  readonly forma: readonly CoordenadasCubicas[];
  /** Cuántos hexágonos de cada terreno (sin contar el agua); deben sumar el tamaño de la forma. */
  readonly terrenos: Readonly<Partial<Record<TipoTerreno, number>>>;
  /** Fichas numéricas, una por cada hexágono que no sea desierto. */
  readonly fichas: readonly number[];
  readonly puertos: readonly TipoPuerto[];
  /** Hexágonos con terreno fijo (por ejemplo, el volcán en el centro). */
  readonly fijos?: readonly (CoordenadasAxiales & { readonly terreno: TipoTerreno })[];
  /** Rellena de agua los huecos entre islas, no solo el borde. */
  readonly rellenarAgua?: boolean;
  /** Se juega con el módulo Navegantes (barcos, pirata y oro). */
  readonly navegantes?: boolean;
}

const FICHAS_CLASICAS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const FICHAS_EXPANSION = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
];
const PUERTOS_CLASICOS: readonly TipoPuerto[] = [
  'generico', 'generico', 'generico', 'generico',
  'madera', 'arcilla', 'trigo', 'oveja', 'mineral',
];
const PUERTOS_EXPANSION: readonly TipoPuerto[] = [
  'generico', 'generico', 'generico', 'generico', 'generico',
  'madera', 'arcilla', 'trigo', 'oveja', 'oveja', 'mineral',
];

const FORMA_CLASICA = formaPorFilas([3, 4, 5, 4, 3]);

/** Tres islas de 7 hexágonos, a 120° entre sí. */
const CENTRO_PRIMERA_ISLA = CoordenadasCubicas.desdeAxiales(2, -4);
const FORMA_ARCHIPIELAGO = formaIslas(
  [CENTRO_PRIMERA_ISLA, CENTRO_PRIMERA_ISLA.rotar(2), CENTRO_PRIMERA_ISLA.rotar(4)],
  1,
);

export const PLANTILLAS: Readonly<Record<IdPlantilla, PlantillaMapa>> = {
  clasico: {
    id: 'clasico',
    nombre: 'Clásico',
    descripcion: 'El tablero estándar de 19 hexágonos para 3 o 4 jugadores.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 10,
    forma: FORMA_CLASICA,
    terrenos: { madera: 4, oveja: 4, trigo: 4, arcilla: 3, mineral: 3, desierto: 1 },
    fichas: FICHAS_CLASICAS,
    puertos: PUERTOS_CLASICOS,
  },
  expansion56: {
    id: 'expansion56',
    nombre: 'Expansión 5-6 jugadores',
    descripcion: 'Tablero ampliado de 30 hexágonos con 2 desiertos y 11 puertos.',
    jugadores: { minimo: 5, maximo: 6 },
    puntosVictoria: 10,
    forma: formaPorFilas([3, 4, 5, 6, 5, 4, 3], 0.5),
    terrenos: { madera: 6, oveja: 6, trigo: 6, arcilla: 5, mineral: 5, desierto: 2 },
    fichas: FICHAS_EXPANSION,
    puertos: PUERTOS_EXPANSION,
  },
  duelo: {
    id: 'duelo',
    nombre: 'Duelo 1 contra 1',
    descripcion: 'Tablero clásico para dos jugadores; gana el primero en llegar a 15 puntos.',
    jugadores: { minimo: 2, maximo: 2 },
    puntosVictoria: 15,
    forma: FORMA_CLASICA,
    terrenos: { madera: 4, oveja: 4, trigo: 4, arcilla: 3, mineral: 3, desierto: 1 },
    fichas: FICHAS_CLASICAS,
    puertos: PUERTOS_CLASICOS,
  },
  bosqueNegro: {
    id: 'bosqueNegro',
    nombre: 'Bosque Negro',
    descripcion: 'Abundan la madera y el mineral; escasean la oveja y la arcilla.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 10,
    forma: FORMA_CLASICA,
    terrenos: { madera: 6, mineral: 5, trigo: 3, oveja: 2, arcilla: 2, desierto: 1 },
    fichas: FICHAS_CLASICAS,
    puertos: PUERTOS_CLASICOS,
  },
  tierrasAltas: {
    id: 'tierrasAltas',
    nombre: 'Tierras Altas',
    descripcion: 'Terreno montañoso: mucho mineral y poca arcilla.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 10,
    forma: FORMA_CLASICA,
    terrenos: { madera: 4, oveja: 4, trigo: 3, arcilla: 2, mineral: 5, desierto: 1 },
    fichas: FICHAS_CLASICAS,
    puertos: PUERTOS_CLASICOS,
  },
  diamante: {
    id: 'diamante',
    nombre: 'Diamante',
    descripcion: 'Tablero en forma de rombo de 25 hexágonos con 2 desiertos.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 10,
    forma: formaPorFilas([1, 2, 3, 4, 5, 4, 3, 2, 1]),
    terrenos: { madera: 5, oveja: 5, trigo: 5, arcilla: 4, mineral: 4, desierto: 2 },
    fichas: [...FICHAS_CLASICAS, 3, 5, 9, 10, 11],
    puertos: PUERTOS_CLASICOS,
  },
  volcan: {
    id: 'volcan',
    nombre: 'Volcán',
    descripcion: 'Un volcán (desierto) ocupa el centro y las tierras fértiles lo rodean.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 10,
    forma: FORMA_CLASICA,
    terrenos: { madera: 4, oveja: 3, trigo: 4, arcilla: 3, mineral: 4, desierto: 1 },
    fichas: FICHAS_CLASICAS,
    puertos: PUERTOS_CLASICOS,
    fijos: [{ q: 0, r: 0, terreno: 'desierto' }],
  },
  archipielago: {
    id: 'archipielago',
    nombre: 'Archipiélago',
    descripcion: 'Navegantes: tres islas separadas por el mar, con un campo de oro. Usa barcos para llegar a las demás.',
    jugadores: { minimo: 2, maximo: 4 },
    puntosVictoria: 12,
    forma: FORMA_ARCHIPIELAGO,
    terrenos: { madera: 5, oveja: 4, trigo: 4, arcilla: 3, mineral: 3, oro: 1, desierto: 1 },
    fichas: [...FICHAS_CLASICAS, 5, 9],
    puertos: PUERTOS_CLASICOS,
    rellenarAgua: true,
    navegantes: true,
  },
};

/** Comprueba que la plantilla sea coherente; lanza un error en español si no lo es. */
export function validarPlantilla(plantilla: PlantillaMapa): void {
  const claves = new Set(plantilla.forma.map((c) => c.clave()));
  if (claves.size !== plantilla.forma.length) {
    throw new Error(`La plantilla "${plantilla.nombre}" repite hexágonos`);
  }
  const totalTerrenos = Object.values(plantilla.terrenos).reduce((suma, n) => suma + (n ?? 0), 0);
  if (totalTerrenos !== plantilla.forma.length) {
    throw new Error(
      `La plantilla "${plantilla.nombre}" tiene ${totalTerrenos} terrenos para ${plantilla.forma.length} hexágonos`,
    );
  }
  if ((plantilla.terrenos.agua ?? 0) > 0) {
    throw new Error(`La plantilla "${plantilla.nombre}" no debe incluir agua en los terrenos`);
  }
  const productivos = totalTerrenos - (plantilla.terrenos.desierto ?? 0);
  if (plantilla.fichas.length !== productivos) {
    throw new Error(
      `La plantilla "${plantilla.nombre}" tiene ${plantilla.fichas.length} fichas para ${productivos} hexágonos productivos`,
    );
  }
  for (const fijo of plantilla.fijos ?? []) {
    if (!claves.has(`${fijo.q},${fijo.r}`)) {
      throw new Error(`El hexágono fijo ${fijo.q},${fijo.r} está fuera de la forma de "${plantilla.nombre}"`);
    }
  }
}

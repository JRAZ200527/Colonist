/** Tipos de terreno, recursos y fichas numéricas. */

export const RECURSOS = ['madera', 'arcilla', 'trigo', 'oveja', 'mineral'] as const;
export type Recurso = (typeof RECURSOS)[number];

export const TIPOS_TERRENO = [...RECURSOS, 'desierto', 'agua', 'oro'] as const;
export type TipoTerreno = (typeof TIPOS_TERRENO)[number];

export const NOMBRES_TERRENO: Readonly<Record<TipoTerreno, string>> = {
  madera: 'Madera',
  arcilla: 'Arcilla',
  trigo: 'Trigo',
  oveja: 'Oveja',
  mineral: 'Mineral',
  desierto: 'Desierto',
  agua: 'Agua',
  oro: 'Oro',
};

/** Recurso que produce un terreno; el oro deja elegir, así que no tiene uno fijo. */
export function recursoDeTerreno(terreno: TipoTerreno): Recurso | null {
  return (RECURSOS as readonly string[]).includes(terreno) ? (terreno as Recurso) : null;
}

/** El agua no tiene vértices ni aristas propios: no se puede construir sobre ella. */
export function esTerrenoJugable(terreno: TipoTerreno): boolean {
  return terreno !== 'agua';
}

export function esFichaValida(ficha: number): boolean {
  return Number.isInteger(ficha) && ficha >= 2 && ficha <= 12 && ficha !== 7;
}

/** Puntos de probabilidad de una ficha (los "puntitos": 6 y 8 tienen 5, 2 y 12 tienen 1). */
export function puntosProbabilidad(ficha: number): number {
  if (!esFichaValida(ficha)) {
    throw new Error(`Ficha numérica inválida: ${ficha}`);
  }
  return 6 - Math.abs(7 - ficha);
}

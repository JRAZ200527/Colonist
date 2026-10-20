/** Operaciones sobre manos de recursos. */

import { NOMBRES_TERRENO, RECURSOS, type Recurso } from '../terreno.js';
import type { ManoRecursos, RecursosParciales } from './tipos.js';

export function manoVacia(): ManoRecursos {
  return { madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 };
}

export function manoUniforme(cantidad: number): ManoRecursos {
  return { madera: cantidad, arcilla: cantidad, trigo: cantidad, oveja: cantidad, mineral: cantidad };
}

export function totalCartas(recursos: RecursosParciales): number {
  return RECURSOS.reduce((suma, r) => suma + (recursos[r] ?? 0), 0);
}

export function esVacia(recursos: RecursosParciales): boolean {
  return totalCartas(recursos) === 0;
}

/** Comprueba que todas las cantidades sean enteros no negativos y que solo haya recursos válidos. */
export function esCantidadValida(recursos: RecursosParciales): boolean {
  return Object.entries(recursos).every(
    ([clave, cantidad]) =>
      (RECURSOS as readonly string[]).includes(clave) && Number.isInteger(cantidad) && (cantidad as number) >= 0,
  );
}

export function tieneRecursos(mano: ManoRecursos, necesarios: RecursosParciales): boolean {
  return RECURSOS.every((r) => mano[r] >= (necesarios[r] ?? 0));
}

export function sumarA(mano: ManoRecursos, recursos: RecursosParciales): void {
  for (const r of RECURSOS) {
    mano[r] += recursos[r] ?? 0;
  }
}

export function restarA(mano: ManoRecursos, recursos: RecursosParciales): void {
  if (!tieneRecursos(mano, recursos)) {
    throw new Error('No hay recursos suficientes para restar');
  }
  for (const r of RECURSOS) {
    mano[r] -= recursos[r] ?? 0;
  }
}

/** Recursos con cantidad mayor que 0, sin las claves a 0. */
export function soloPositivos(recursos: RecursosParciales): RecursosParciales {
  const resultado: RecursosParciales = {};
  for (const r of RECURSOS) {
    const cantidad = recursos[r] ?? 0;
    if (cantidad > 0) {
      resultado[r] = cantidad;
    }
  }
  return resultado;
}

/** Una carta por unidad, para robar al azar. */
export function listaDeCartas(mano: ManoRecursos): Recurso[] {
  return RECURSOS.flatMap((r) => Array<Recurso>(mano[r]).fill(r));
}

/** "2 Madera, 1 Trigo" */
export function describirRecursos(recursos: RecursosParciales): string {
  const partes = RECURSOS.filter((r) => (recursos[r] ?? 0) > 0).map((r) => `${recursos[r]} ${NOMBRES_TERRENO[r]}`);
  return partes.length > 0 ? partes.join(', ') : 'nada';
}

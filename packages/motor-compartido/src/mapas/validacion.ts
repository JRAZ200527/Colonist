/** Validación de mapas (generados o cargados desde el editor). */

import { GrafoTablero } from '../grafo.js';
import type { MapaJuego } from '../juego/tipos.js';
import { esTerrenoJugable, NOMBRES_TERRENO } from '../terreno.js';

/** Devuelve la lista de problemas del mapa en español (vacía si es válido). */
export function validarMapa(mapa: MapaJuego): string[] {
  let grafo: GrafoTablero;
  try {
    grafo = new GrafoTablero(mapa.hexagonos);
  } catch (error) {
    return [(error as Error).message];
  }

  const errores: string[] = [];
  const tierra = [...grafo.hexagonos.values()].filter((h) => h.esJugable);
  if (tierra.length === 0) {
    errores.push('El mapa no tiene ningún hexágono de tierra');
  }
  for (const h of tierra) {
    if (h.terreno === 'desierto' && h.ficha !== null) {
      errores.push(`El desierto ${h.id} no puede tener ficha numérica`);
    }
    if (h.terreno !== 'desierto' && h.ficha === null) {
      errores.push(`El hexágono ${h.id} (${NOMBRES_TERRENO[h.terreno]}) necesita una ficha numérica`);
    }
  }

  const esTierra = (clave: string) => {
    const h = grafo.hexagonos.get(clave);
    return h !== undefined && esTerrenoJugable(h.terreno);
  };
  const usados = new Set<string>();
  mapa.puertos.forEach((puerto, i) => {
    const nombre = `El puerto ${i + 1}`;
    const [a, b] = puerto.vertices;
    if (!grafo.vertices.has(a) || !grafo.vertices.has(b)) {
      errores.push(`${nombre} está en un vértice que no existe`);
      return;
    }
    if (grafo.aristaEntre(a, b) === undefined) {
      errores.push(`${nombre} debe estar entre dos vértices contiguos`);
    }
    for (const v of [a, b]) {
      if (grafo.vertice(v).hexagonos.every((c) => esTierra(c.clave()))) {
        errores.push(`${nombre} no está en la costa`);
        break;
      }
    }
    if (usados.has(a) || usados.has(b)) {
      errores.push(`${nombre} comparte un vértice con otro puerto`);
    }
    usados.add(a);
    usados.add(b);
  });
  return errores;
}

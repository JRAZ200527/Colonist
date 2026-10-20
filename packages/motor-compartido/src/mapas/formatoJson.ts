/**
 * Formato JSON de los mapas personalizados (editor de mapas).
 *
 * Los puertos se guardan como "hexágono de tierra + lado que mira al mar", más
 * fácil de leer y editar a mano que los ids de vértice:
 *
 * {
 *   "formato": "colonist-mapa",
 *   "version": 1,
 *   "nombre": "Mi mapa",
 *   "hexagonos": [{ "q": 0, "r": 0, "terreno": "desierto" }, { "q": 1, "r": 0, "terreno": "madera", "ficha": 8 }],
 *   "puertos": [{ "q": 1, "r": 0, "lado": 0, "tipo": "generico" }]
 * }
 */

import { CoordenadasCubicas } from '../coordenadas.js';
import { esquinasDeLado, idVerticeEsquina } from '../grafo.js';
import type { MapaJuego, Puerto, TipoPuerto } from '../juego/tipos.js';
import { esTerrenoJugable, RECURSOS, TIPOS_TERRENO, type TipoTerreno } from '../terreno.js';
import { validarMapa } from './validacion.js';

export const FORMATO_MAPA = 'colonist-mapa';
export const VERSION_FORMATO_MAPA = 1;

export interface HexagonoJson {
  q: number;
  r: number;
  terreno: TipoTerreno;
  ficha?: number | null;
}

export interface PuertoJson {
  q: number;
  r: number;
  lado: number;
  tipo: TipoPuerto;
}

export interface MapaJson {
  formato: typeof FORMATO_MAPA;
  version: typeof VERSION_FORMATO_MAPA;
  nombre: string;
  hexagonos: HexagonoJson[];
  puertos: PuertoJson[];
}

export class ErrorMapa extends Error {
  readonly problemas: readonly string[];

  constructor(problemas: readonly string[]) {
    super(`Mapa inválido:\n- ${problemas.join('\n- ')}`);
    this.name = 'ErrorMapa';
    this.problemas = problemas;
  }
}

function verticesDeLado(q: number, r: number, lado: number): [string, string] {
  const hexagono = CoordenadasCubicas.desdeAxiales(q, r);
  const [a, b] = esquinasDeLado(lado);
  return [idVerticeEsquina(hexagono, a), idVerticeEsquina(hexagono, b)];
}

export function exportarMapa(mapa: MapaJuego, nombre: string): MapaJson {
  const tierra = mapa.hexagonos.filter((h) => esTerrenoJugable(h.terreno));
  const esTierra = new Set(tierra.map((h) => `${h.coordenadas.q},${h.coordenadas.r}`));

  const puertos = mapa.puertos.map((puerto): PuertoJson => {
    for (const { coordenadas: { q, r } } of tierra) {
      for (let lado = 0; lado < 6; lado++) {
        const [a, b] = verticesDeLado(q, r, lado);
        const vecino = CoordenadasCubicas.desdeAxiales(q, r).vecino(lado);
        const coincide = puerto.vertices.includes(a) && puerto.vertices.includes(b);
        if (coincide && !esTierra.has(vecino.clave())) {
          return { q, r, lado, tipo: puerto.tipo };
        }
      }
    }
    throw new Error('Hay un puerto que no está en ningún lado de la costa');
  });

  return {
    formato: FORMATO_MAPA,
    version: VERSION_FORMATO_MAPA,
    nombre,
    hexagonos: mapa.hexagonos.map((h) => ({
      q: h.coordenadas.q,
      r: h.coordenadas.r,
      terreno: h.terreno,
      ...(h.ficha != null ? { ficha: h.ficha } : {}),
    })),
    puertos,
  };
}

export function mapaATextoJson(mapa: MapaJuego, nombre: string): string {
  return JSON.stringify(exportarMapa(mapa, nombre), null, 2);
}

const esEntero = (valor: unknown): valor is number => Number.isInteger(valor);
const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Convierte un objeto JSON en un mapa válido o lanza `ErrorMapa` con todos los problemas. */
export function importarMapa(datos: unknown): MapaJuego & { nombre: string } {
  if (!esObjeto(datos) || datos.formato !== FORMATO_MAPA) {
    throw new ErrorMapa([`El archivo no es un mapa (falta "formato": "${FORMATO_MAPA}")`]);
  }
  if (datos.version !== VERSION_FORMATO_MAPA) {
    throw new ErrorMapa([`Versión de mapa no compatible: ${String(datos.version)}`]);
  }
  if (!Array.isArray(datos.hexagonos) || !Array.isArray(datos.puertos)) {
    throw new ErrorMapa(['El mapa debe tener las listas "hexagonos" y "puertos"']);
  }

  const problemas: string[] = [];
  const hexagonos = datos.hexagonos.flatMap((h: unknown, i) => {
    const donde = `Hexágono ${i + 1}`;
    if (!esObjeto(h) || !esEntero(h.q) || !esEntero(h.r)) {
      problemas.push(`${donde}: "q" y "r" deben ser números enteros`);
      return [];
    }
    if (!(TIPOS_TERRENO as readonly unknown[]).includes(h.terreno)) {
      problemas.push(`${donde}: terreno desconocido "${String(h.terreno)}"`);
      return [];
    }
    if (h.ficha !== undefined && h.ficha !== null && !esEntero(h.ficha)) {
      problemas.push(`${donde}: la ficha debe ser un número entero`);
      return [];
    }
    return [{ coordenadas: { q: h.q, r: h.r }, terreno: h.terreno as TipoTerreno, ficha: (h.ficha as number | undefined) ?? null }];
  });

  const tierra = new Set(
    hexagonos.filter((h) => esTerrenoJugable(h.terreno)).map((h) => `${h.coordenadas.q},${h.coordenadas.r}`),
  );
  const tiposPuerto: readonly unknown[] = [...RECURSOS, 'generico'];
  const puertos = datos.puertos.flatMap((p: unknown, i): Puerto[] => {
    const donde = `Puerto ${i + 1}`;
    if (!esObjeto(p) || !esEntero(p.q) || !esEntero(p.r) || !esEntero(p.lado) || p.lado < 0 || p.lado > 5) {
      problemas.push(`${donde}: "q", "r" deben ser enteros y "lado" un número de 0 a 5`);
      return [];
    }
    if (!tiposPuerto.includes(p.tipo)) {
      problemas.push(`${donde}: tipo desconocido "${String(p.tipo)}"`);
      return [];
    }
    if (!tierra.has(`${p.q},${p.r}`)) {
      problemas.push(`${donde}: debe estar en un hexágono de tierra`);
      return [];
    }
    if (tierra.has(CoordenadasCubicas.desdeAxiales(p.q, p.r).vecino(p.lado).clave())) {
      problemas.push(`${donde}: el lado ${p.lado} no da al mar`);
      return [];
    }
    return [{ tipo: p.tipo as TipoPuerto, vertices: verticesDeLado(p.q, p.r, p.lado) }];
  });

  const mapa: MapaJuego = { hexagonos, puertos };
  if (problemas.length === 0) {
    problemas.push(...validarMapa(mapa));
  }
  if (problemas.length > 0) {
    throw new ErrorMapa(problemas);
  }
  return { ...mapa, nombre: typeof datos.nombre === 'string' ? datos.nombre : 'Mapa personalizado' };
}

export function importarMapaJson(texto: string): MapaJuego & { nombre: string } {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorMapa(['El archivo no es un JSON válido']);
  }
  return importarMapa(datos);
}

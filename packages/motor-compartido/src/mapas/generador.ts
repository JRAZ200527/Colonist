/**
 * Generador de mapas a partir de una plantilla.
 *
 * - Modo equilibrado (torneo): nunca pone 6 y 8 juntos, y de muchos candidatos
 *   elige el que mejor reparte las probabilidades entre recursos, evita terrenos
 *   iguales y números repetidos contiguos, y no concentra demasiada producción
 *   en un mismo vértice. Los puertos se reparten a intervalos regulares por la
 *   costa, alternando genéricos y específicos.
 * - Modo aleatorio puro: terrenos, fichas y puertos mezclados sin restricciones.
 *
 * Es determinista: la misma semilla produce el mismo mapa.
 */

import { CoordenadasCubicas, formaHexagonal } from '../coordenadas.js';
import { esquinasDeLado, idVerticeEsquina, type DefinicionHexagono, type IdVertice } from '../grafo.js';
import { GeneradorAleatorio } from '../juego/aleatorio.js';
import type { MapaJuego, Puerto, TipoPuerto } from '../juego/tipos.js';
import { hexAPixel } from '../pixeles.js';
import { puntosProbabilidad, recursoDeTerreno, TIPOS_TERRENO, type TipoTerreno } from '../terreno.js';
import { PLANTILLAS, validarPlantilla, type IdPlantilla, type PlantillaMapa } from './plantillas.js';

export type ModoMapa = 'equilibrado' | 'aleatorio';

export interface OpcionesGeneradorMapa {
  plantilla: IdPlantilla | PlantillaMapa;
  modo?: ModoMapa;
  semilla?: number;
}

/** Cuántos mapas candidatos se comparan en modo equilibrado. */
const CANDIDATOS_EQUILIBRADO = 60;
const INTENTOS_FICHAS_ROJAS = 100;

interface Casilla {
  readonly coordenadas: CoordenadasCubicas;
  terreno: TipoTerreno;
  ficha: number | null;
}

const esRoja = (ficha: number | null): boolean => ficha === 6 || ficha === 8;

export function generarMapa(opciones: OpcionesGeneradorMapa): MapaJuego {
  const plantilla = typeof opciones.plantilla === 'string' ? PLANTILLAS[opciones.plantilla] : opciones.plantilla;
  if (!plantilla) {
    throw new Error(`No existe la plantilla de mapa "${String(opciones.plantilla)}"`);
  }
  validarPlantilla(plantilla);
  const modo = opciones.modo ?? 'equilibrado';
  const rng = new GeneradorAleatorio(opciones.semilla ?? Math.floor(Math.random() * 2 ** 32));
  const vecinos = calcularVecinos(plantilla.forma);

  let mejor: { casillas: Casilla[]; puntuacion: number } | null = null;
  const candidatos = modo === 'equilibrado' ? CANDIDATOS_EQUILIBRADO : 1;
  for (let i = 0; i < candidatos; i++) {
    const casillas = repartirTerrenos(plantilla, rng);
    const conFichas =
      modo === 'equilibrado'
        ? repartirFichasEquilibradas(casillas, plantilla.fichas, vecinos, rng)
        : repartirFichasAleatorias(casillas, plantilla.fichas, rng);
    if (!conFichas) {
      continue;
    }
    const puntuacion = modo === 'equilibrado' ? puntuar(casillas, vecinos) : 0;
    if (!mejor || puntuacion < mejor.puntuacion) {
      mejor = { casillas, puntuacion };
    }
  }
  if (!mejor) {
    throw new Error(`No se pudo generar un mapa equilibrado con la plantilla "${plantilla.nombre}"`);
  }

  const hexagonos: DefinicionHexagono[] = [
    ...mejor.casillas.map((c) => ({ coordenadas: c.coordenadas.aAxiales(), terreno: c.terreno, ficha: c.ficha })),
    ...calcularAgua(plantilla).map((c) => ({ coordenadas: c.aAxiales(), terreno: 'agua' as const, ficha: null })),
  ];
  const puertos = colocarPuertos(plantilla.forma, plantilla.puertos, modo, rng);
  return { hexagonos, puertos };
}

/** Índices de los vecinos de tierra de cada casilla de la forma. */
function calcularVecinos(forma: readonly CoordenadasCubicas[]): number[][] {
  const indice = new Map(forma.map((c, i) => [c.clave(), i]));
  return forma.map((c) =>
    c
      .vecinos()
      .map((v) => indice.get(v.clave()))
      .filter((i): i is number => i !== undefined),
  );
}

function repartirTerrenos(plantilla: PlantillaMapa, rng: GeneradorAleatorio): Casilla[] {
  const pendientes = { ...plantilla.terrenos };
  const fijos = new Map<string, TipoTerreno>();
  for (const fijo of plantilla.fijos ?? []) {
    fijos.set(CoordenadasCubicas.desdeAxiales(fijo.q, fijo.r).clave(), fijo.terreno);
    pendientes[fijo.terreno] = (pendientes[fijo.terreno] ?? 0) - 1;
  }
  const bolsa = rng.barajar(TIPOS_TERRENO.flatMap((t) => Array<TipoTerreno>(Math.max(0, pendientes[t] ?? 0)).fill(t)));
  return plantilla.forma.map((coordenadas) => ({
    coordenadas,
    terreno: fijos.get(coordenadas.clave()) ?? bolsa.pop()!,
    ficha: null,
  }));
}

function productivas(casillas: Casilla[]): number[] {
  return casillas.flatMap((c, i) => (c.terreno === 'desierto' || c.terreno === 'agua' ? [] : [i]));
}

function repartirFichasAleatorias(casillas: Casilla[], fichas: readonly number[], rng: GeneradorAleatorio): boolean {
  const bolsa = rng.barajar(fichas);
  for (const i of productivas(casillas)) {
    casillas[i]!.ficha = bolsa.pop()!;
  }
  return true;
}

/** Coloca primero los 6 y 8 sin que se toquen; después el resto al azar. */
function repartirFichasEquilibradas(
  casillas: Casilla[],
  fichas: readonly number[],
  vecinos: number[][],
  rng: GeneradorAleatorio,
): boolean {
  const indices = productivas(casillas);
  const rojas = fichas.filter(esRoja);
  const resto = fichas.filter((f) => !esRoja(f));

  for (let intento = 0; intento < INTENTOS_FICHAS_ROJAS; intento++) {
    const asignadas = new Map<number, number>();
    let correcto = true;
    for (const roja of rojas) {
      const hueco = rng
        .barajar(indices)
        .find((i) => !asignadas.has(i) && !vecinos[i]!.some((v) => esRoja(asignadas.get(v) ?? null)));
      if (hueco === undefined) {
        correcto = false;
        break;
      }
      asignadas.set(hueco, roja);
    }
    if (!correcto) {
      continue;
    }
    const libres = rng.barajar(indices.filter((i) => !asignadas.has(i)));
    resto.forEach((ficha, k) => asignadas.set(libres[k]!, ficha));
    for (const [i, ficha] of asignadas) {
      casillas[i]!.ficha = ficha;
    }
    return true;
  }
  return false;
}

/** Penalización de un mapa: cuanto más baja, más equilibrado. */
function puntuar(casillas: Casilla[], vecinos: number[][]): number {
  let penalizacion = 0;

  // Terrenos iguales y números iguales contiguos.
  casillas.forEach((casilla, i) => {
    for (const j of vecinos[i]!) {
      if (j <= i) {
        continue;
      }
      const otra = casillas[j]!;
      if (casilla.terreno === otra.terreno && recursoDeTerreno(casilla.terreno) !== null) {
        penalizacion += 1;
      }
      if (casilla.ficha !== null && casilla.ficha === otra.ficha) {
        penalizacion += 3;
      }
    }
  });

  // Reparto de probabilidades: cada recurso debería tener una media de puntos parecida.
  const puntos = (c: Casilla) => (c.ficha === null ? 0 : puntosProbabilidad(c.ficha));
  const conRecurso = casillas.filter((c) => recursoDeTerreno(c.terreno) !== null);
  const mediaGlobal = conRecurso.reduce((s, c) => s + puntos(c), 0) / Math.max(1, conRecurso.length);
  const porRecurso = new Map<string, { suma: number; cantidad: number }>();
  for (const c of conRecurso) {
    const datos = porRecurso.get(c.terreno) ?? { suma: 0, cantidad: 0 };
    datos.suma += puntos(c);
    datos.cantidad++;
    porRecurso.set(c.terreno, datos);
  }
  for (const { suma, cantidad } of porRecurso.values()) {
    const desviacion = suma / cantidad - mediaGlobal;
    penalizacion += 4 * desviacion * desviacion * cantidad;
  }

  // Vértices con demasiada producción (más de 11 puntos entre sus 3 hexágonos).
  const porClave = new Map(casillas.map((c) => [c.coordenadas.clave(), c]));
  const vistos = new Set<IdVertice>();
  for (const casilla of casillas) {
    for (let esquina = 0; esquina < 6; esquina++) {
      const id = idVerticeEsquina(casilla.coordenadas, esquina);
      if (vistos.has(id)) {
        continue;
      }
      vistos.add(id);
      const total = [casilla.coordenadas, casilla.coordenadas.vecino(esquina), casilla.coordenadas.vecino(esquina + 1)]
        .map((c) => porClave.get(c.clave()))
        .reduce((s, c) => s + (c ? puntos(c) : 0), 0);
      if (total > 11) {
        penalizacion += 2 * (total - 11);
      }
    }
  }
  return penalizacion;
}

/** Agua alrededor de la tierra (y entre islas si la plantilla lo pide). */
function calcularAgua(plantilla: PlantillaMapa): CoordenadasCubicas[] {
  const tierra = new Set(plantilla.forma.map((c) => c.clave()));
  const agua = new Map<string, CoordenadasCubicas>();
  const anadir = (c: CoordenadasCubicas) => {
    if (!tierra.has(c.clave())) {
      agua.set(c.clave(), c);
    }
  };
  if (plantilla.rellenarAgua) {
    const radio = Math.max(...plantilla.forma.map((c) => c.longitud()));
    formaHexagonal(radio).forEach(anadir);
  }
  for (const c of plantilla.forma) {
    c.vecinos().forEach(anadir);
  }
  return [...agua.values()];
}

/** Ordena los tipos alternando específicos y genéricos para no amontonar los iguales. */
function intercalarPuertos(tipos: readonly TipoPuerto[], rng: GeneradorAleatorio): TipoPuerto[] {
  const especificos = rng.barajar(tipos.filter((t) => t !== 'generico'));
  const genericos = tipos.filter((t) => t === 'generico');
  const resultado: TipoPuerto[] = [];
  while (especificos.length > 0 || genericos.length > 0) {
    if (especificos.length > 0) {
      resultado.push(especificos.pop()!);
    }
    if (genericos.length > 0) {
      resultado.push(genericos.pop()!);
    }
  }
  return resultado;
}

/**
 * Reparte los puertos por los lados de la costa ordenados por ángulo alrededor
 * del centro del tablero, a intervalos regulares y sin que dos puertos compartan vértice.
 */
function colocarPuertos(
  tierra: readonly CoordenadasCubicas[],
  tipos: readonly TipoPuerto[],
  modo: ModoMapa,
  rng: GeneradorAleatorio,
): Puerto[] {
  if (tipos.length === 0) {
    return [];
  }
  const esTierra = new Set(tierra.map((c) => c.clave()));
  const centros = tierra.map((c) => hexAPixel(c, 1));
  const centro = {
    x: centros.reduce((s, p) => s + p.x, 0) / centros.length,
    y: centros.reduce((s, p) => s + p.y, 0) / centros.length,
  };

  const costa: { hexagono: CoordenadasCubicas; lado: number; angulo: number }[] = [];
  for (const hexagono of tierra) {
    for (let lado = 0; lado < 6; lado++) {
      const vecino = hexagono.vecino(lado);
      if (esTierra.has(vecino.clave())) {
        continue;
      }
      const a = hexAPixel(hexagono, 1);
      const b = hexAPixel(vecino, 1);
      costa.push({ hexagono, lado, angulo: Math.atan2((a.y + b.y) / 2 - centro.y, (a.x + b.x) / 2 - centro.x) });
    }
  }
  costa.sort((a, b) => a.angulo - b.angulo || a.hexagono.q - b.hexagono.q || a.hexagono.r - b.hexagono.r);

  const orden = modo === 'equilibrado' ? intercalarPuertos(tipos, rng) : rng.barajar(tipos);
  const paso = costa.length / orden.length;
  const desfase = rng.siguiente() * paso;
  const usados = new Set<IdVertice>();
  const puertos: Puerto[] = [];

  orden.forEach((tipo, i) => {
    const inicio = Math.floor(modo === 'equilibrado' ? desfase + i * paso : rng.entero(costa.length));
    for (let k = 0; k < costa.length; k++) {
      const lado = costa[(inicio + k) % costa.length]!;
      const [e1, e2] = esquinasDeLado(lado.lado);
      const vertices = [idVerticeEsquina(lado.hexagono, e1), idVerticeEsquina(lado.hexagono, e2)] as const;
      if (vertices.some((v) => usados.has(v))) {
        continue;
      }
      vertices.forEach((v) => usados.add(v));
      puertos.push({ tipo, vertices });
      return;
    }
    throw new Error('No hay suficiente costa para colocar todos los puertos');
  });
  return puertos;
}

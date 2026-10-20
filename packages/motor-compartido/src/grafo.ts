/**
 * Grafo topológico del tablero: hexágonos, vértices (intersecciones) y aristas (lados).
 *
 * Identificadores canónicos:
 * - Un vértice es la esquina compartida por 3 hexágonos (aunque alguno quede fuera
 *   del tablero), así que su id son esas 3 coordenadas ordenadas: "V:q,r|q,r|q,r".
 * - Una arista es el lado compartido por 2 hexágonos: "A:q,r|q,r".
 * Así, la misma esquina vista desde cualquiera de sus hexágonos produce el mismo id.
 *
 * El grafo solo describe la forma del mapa y no cambia durante la partida. Lo que sí
 * cambia (edificios, carreteras, ladrón) se guarda en el estado del juego, indexado
 * por estos ids, para que el estado sea serializable por WebSocket.
 */

import { CoordenadasCubicas, type CoordenadasAxiales, normalizarDireccion } from './coordenadas.js';
import { hexAPixel, type Punto } from './pixeles.js';
import { esFichaValida, esTerrenoJugable, puntosProbabilidad, type TipoTerreno } from './terreno.js';

export type IdHexagono = string;
export type IdVertice = string;
export type IdArista = string;

function compararCoordenadas(a: CoordenadasCubicas, b: CoordenadasCubicas): number {
  return a.q - b.q || a.r - b.r;
}

export function idHexagono(coordenadas: CoordenadasCubicas): IdHexagono {
  return coordenadas.clave();
}

export function idVertice(hexagonos: readonly CoordenadasCubicas[]): IdVertice {
  if (hexagonos.length !== 3) {
    throw new Error(`Un vértice se define con 3 hexágonos, no con ${hexagonos.length}`);
  }
  return 'V:' + [...hexagonos].sort(compararCoordenadas).map((h) => h.clave()).join('|');
}

export function idArista(a: CoordenadasCubicas, b: CoordenadasCubicas): IdArista {
  if (a.distancia(b) !== 1) {
    throw new Error(`Una arista separa dos hexágonos vecinos: ${a} y ${b} no lo son`);
  }
  return 'A:' + [a, b].sort(compararCoordenadas).map((h) => h.clave()).join('|');
}

/** Vértice en la esquina `esquina` del hexágono (entre las direcciones esquina y esquina + 1). */
export function idVerticeEsquina(hexagono: CoordenadasCubicas, esquina: number): IdVertice {
  return idVertice([hexagono, hexagono.vecino(esquina), hexagono.vecino(esquina + 1)]);
}

/** Arista del lado `lado` del hexágono (la que lo separa del vecino en esa dirección). */
export function idAristaLado(hexagono: CoordenadasCubicas, lado: number): IdArista {
  return idArista(hexagono, hexagono.vecino(lado));
}

/** Las dos esquinas que delimitan un lado: la (lado - 1) y la (lado). */
export function esquinasDeLado(lado: number): [number, number] {
  return [normalizarDireccion(lado - 1), normalizarDireccion(lado)];
}

export interface DefinicionHexagono {
  readonly coordenadas: CoordenadasAxiales;
  readonly terreno: TipoTerreno;
  readonly ficha?: number | null;
}

export class Hexagono {
  readonly id: IdHexagono;
  readonly coordenadas: CoordenadasCubicas;
  readonly terreno: TipoTerreno;
  readonly ficha: number | null;
  /** Vértices del grafo en sus esquinas, en orden de esquina (siempre 6 si es jugable). */
  readonly vertices: readonly IdVertice[];
  /** Aristas del grafo en sus lados, en orden de lado (siempre 6 si es jugable). */
  readonly aristas: readonly IdArista[];

  constructor(datos: {
    coordenadas: CoordenadasCubicas;
    terreno: TipoTerreno;
    ficha: number | null;
    vertices: readonly IdVertice[];
    aristas: readonly IdArista[];
  }) {
    this.id = idHexagono(datos.coordenadas);
    this.coordenadas = datos.coordenadas;
    this.terreno = datos.terreno;
    this.ficha = datos.ficha;
    this.vertices = Object.freeze([...datos.vertices]);
    this.aristas = Object.freeze([...datos.aristas]);
  }

  get esJugable(): boolean {
    return esTerrenoJugable(this.terreno);
  }

  get puntos(): number {
    return this.ficha === null ? 0 : puntosProbabilidad(this.ficha);
  }
}

export class Vertice {
  readonly id: IdVertice;
  /** Los 3 hexágonos que se tocan en este vértice (alguno puede estar fuera del tablero). */
  readonly hexagonos: readonly CoordenadasCubicas[];
  /** Los hexágonos de esos 3 que existen en el tablero (de tierra o de agua). */
  readonly hexagonosEnTablero: readonly IdHexagono[];
  readonly aristas: readonly IdArista[];
  readonly adyacentes: readonly IdVertice[];
  /** Toca algún hexágono de tierra: solo ahí se puede construir un poblado. */
  readonly enTierra: boolean;

  constructor(datos: {
    id: IdVertice;
    hexagonos: readonly CoordenadasCubicas[];
    hexagonosEnTablero: readonly IdHexagono[];
    aristas: readonly IdArista[];
    adyacentes: readonly IdVertice[];
    enTierra: boolean;
  }) {
    this.id = datos.id;
    this.enTierra = datos.enTierra;
    this.hexagonos = Object.freeze([...datos.hexagonos]);
    this.hexagonosEnTablero = Object.freeze([...datos.hexagonosEnTablero]);
    this.aristas = Object.freeze([...datos.aristas]);
    this.adyacentes = Object.freeze([...datos.adyacentes]);
  }
}

export class Arista {
  readonly id: IdArista;
  readonly hexagonos: readonly [CoordenadasCubicas, CoordenadasCubicas];
  readonly hexagonosEnTablero: readonly IdHexagono[];
  readonly vertices: readonly [IdVertice, IdVertice];
  /** Toca algún hexágono de tierra: se puede construir una carretera. */
  readonly enTierra: boolean;
  /** Toca el mar (agua o fuera del tablero): se puede construir un barco (Navegantes). */
  readonly enMar: boolean;

  constructor(datos: {
    id: IdArista;
    hexagonos: readonly [CoordenadasCubicas, CoordenadasCubicas];
    hexagonosEnTablero: readonly IdHexagono[];
    vertices: readonly [IdVertice, IdVertice];
    enTierra: boolean;
    enMar: boolean;
  }) {
    this.id = datos.id;
    this.enTierra = datos.enTierra;
    this.enMar = datos.enMar;
    this.hexagonos = Object.freeze([datos.hexagonos[0], datos.hexagonos[1]] as const);
    this.hexagonosEnTablero = Object.freeze([...datos.hexagonosEnTablero]);
    this.vertices = Object.freeze([datos.vertices[0], datos.vertices[1]] as const);
  }
}

function obtener<K, V>(mapa: ReadonlyMap<K, V>, clave: K, descripcion: string): V {
  const valor = mapa.get(clave);
  if (valor === undefined) {
    throw new Error(`No existe ${descripcion} ${String(clave)}`);
  }
  return valor;
}

export class GrafoTablero {
  readonly hexagonos: ReadonlyMap<IdHexagono, Hexagono>;
  readonly vertices: ReadonlyMap<IdVertice, Vertice>;
  readonly aristas: ReadonlyMap<IdArista, Arista>;

  /**
   * Con `incluirMar` (módulo Navegantes) también el agua tiene vértices y aristas,
   * para que los barcos puedan navegar entre islas.
   */
  constructor(definiciones: readonly DefinicionHexagono[], opciones: { incluirMar?: boolean } = {}) {
    const datosHexagonos = new Map<
      IdHexagono,
      { coordenadas: CoordenadasCubicas; terreno: TipoTerreno; ficha: number | null }
    >();
    for (const definicion of definiciones) {
      const coordenadas = CoordenadasCubicas.desdeAxiales(definicion.coordenadas.q, definicion.coordenadas.r);
      const id = idHexagono(coordenadas);
      if (datosHexagonos.has(id)) {
        throw new Error(`Hexágono duplicado en ${id}`);
      }
      const ficha = definicion.ficha ?? null;
      if (ficha !== null && !esFichaValida(ficha)) {
        throw new Error(`Ficha numérica inválida ${ficha} en el hexágono ${id}`);
      }
      if (ficha !== null && !esTerrenoJugable(definicion.terreno)) {
        throw new Error(`El hexágono de agua ${id} no puede tener ficha numérica`);
      }
      datosHexagonos.set(id, { coordenadas, terreno: definicion.terreno, ficha });
    }

    const datosVertices = new Map<
      IdVertice,
      { hexagonos: CoordenadasCubicas[]; aristas: Set<IdArista>; adyacentes: Set<IdVertice> }
    >();
    const datosAristas = new Map<
      IdArista,
      { hexagonos: [CoordenadasCubicas, CoordenadasCubicas]; vertices: [IdVertice, IdVertice] }
    >();

    // Sin Navegantes, solo los hexágonos jugables generan vértices y aristas.
    for (const { coordenadas, terreno } of datosHexagonos.values()) {
      if (!esTerrenoJugable(terreno) && !opciones.incluirMar) {
        continue;
      }
      for (let esquina = 0; esquina < 6; esquina++) {
        const id = idVerticeEsquina(coordenadas, esquina);
        if (!datosVertices.has(id)) {
          datosVertices.set(id, {
            hexagonos: [coordenadas, coordenadas.vecino(esquina), coordenadas.vecino(esquina + 1)],
            aristas: new Set(),
            adyacentes: new Set(),
          });
        }
      }
      for (let lado = 0; lado < 6; lado++) {
        const id = idAristaLado(coordenadas, lado);
        if (datosAristas.has(id)) {
          continue;
        }
        const [esquinaA, esquinaB] = esquinasDeLado(lado);
        const verticeA = idVerticeEsquina(coordenadas, esquinaA);
        const verticeB = idVerticeEsquina(coordenadas, esquinaB);
        datosAristas.set(id, { hexagonos: [coordenadas, coordenadas.vecino(lado)], vertices: [verticeA, verticeB] });
        const datosA = obtener(datosVertices, verticeA, 'el vértice');
        const datosB = obtener(datosVertices, verticeB, 'el vértice');
        datosA.aristas.add(id);
        datosB.aristas.add(id);
        datosA.adyacentes.add(verticeB);
        datosB.adyacentes.add(verticeA);
      }
    }

    const enTablero = (coordenadas: readonly CoordenadasCubicas[]): IdHexagono[] =>
      coordenadas.map(idHexagono).filter((id) => datosHexagonos.has(id));
    const esTierra = (c: CoordenadasCubicas): boolean => {
      const datos = datosHexagonos.get(idHexagono(c));
      return datos !== undefined && esTerrenoJugable(datos.terreno);
    };

    const vertices = new Map<IdVertice, Vertice>();
    for (const [id, datos] of datosVertices) {
      vertices.set(
        id,
        new Vertice({
          id,
          hexagonos: datos.hexagonos,
          hexagonosEnTablero: enTablero(datos.hexagonos),
          aristas: [...datos.aristas],
          adyacentes: [...datos.adyacentes],
          enTierra: datos.hexagonos.some(esTierra),
        }),
      );
    }

    const aristas = new Map<IdArista, Arista>();
    for (const [id, datos] of datosAristas) {
      aristas.set(
        id,
        new Arista({
          id,
          hexagonos: datos.hexagonos,
          hexagonosEnTablero: enTablero(datos.hexagonos),
          vertices: datos.vertices,
          enTierra: datos.hexagonos.some(esTierra),
          enMar: !datos.hexagonos.every(esTierra),
        }),
      );
    }

    const hexagonos = new Map<IdHexagono, Hexagono>();
    for (const [id, datos] of datosHexagonos) {
      const indices = [0, 1, 2, 3, 4, 5];
      hexagonos.set(
        id,
        new Hexagono({
          ...datos,
          vertices: indices.map((i) => idVerticeEsquina(datos.coordenadas, i)).filter((v) => vertices.has(v)),
          aristas: indices.map((i) => idAristaLado(datos.coordenadas, i)).filter((a) => aristas.has(a)),
        }),
      );
    }

    this.hexagonos = hexagonos;
    this.vertices = vertices;
    this.aristas = aristas;
  }

  /** Crea un tablero en el que todos los hexágonos tienen el mismo terreno y ninguna ficha. */
  static desdeCoordenadas(coordenadas: Iterable<CoordenadasCubicas>, terreno: TipoTerreno = 'desierto'): GrafoTablero {
    return new GrafoTablero([...coordenadas].map((c) => ({ coordenadas: c.aAxiales(), terreno })));
  }

  hexagono(id: IdHexagono): Hexagono {
    return obtener(this.hexagonos, id, 'el hexágono');
  }

  hexagonoEn(coordenadas: CoordenadasCubicas): Hexagono | undefined {
    return this.hexagonos.get(idHexagono(coordenadas));
  }

  vertice(id: IdVertice): Vertice {
    return obtener(this.vertices, id, 'el vértice');
  }

  arista(id: IdArista): Arista {
    return obtener(this.aristas, id, 'la arista');
  }

  verticesAdyacentes(id: IdVertice): readonly IdVertice[] {
    return this.vertice(id).adyacentes;
  }

  aristasDeVertice(id: IdVertice): readonly IdArista[] {
    return this.vertice(id).aristas;
  }

  hexagonosDeVertice(id: IdVertice): Hexagono[] {
    return this.vertice(id).hexagonosEnTablero.map((h) => this.hexagono(h));
  }

  /** Aristas que comparten un extremo con la arista dada (sin incluirla). */
  aristasAdyacentes(id: IdArista): IdArista[] {
    const [a, b] = this.arista(id).vertices;
    const resultado = new Set([...this.aristasDeVertice(a), ...this.aristasDeVertice(b)]);
    resultado.delete(id);
    return [...resultado];
  }

  /** Arista que une dos vértices, si son adyacentes. */
  aristaEntre(verticeA: IdVertice, verticeB: IdVertice): IdArista | undefined {
    return this.aristasDeVertice(verticeA).find((a) => this.arista(a).vertices.includes(verticeB));
  }

  /**
   * Regla de la distancia: no se puede construir en un vértice ocupado ni en uno
   * contiguo a otro ocupado (debe haber al menos 2 aristas entre poblados).
   */
  cumpleReglaDistancia(
    id: IdVertice,
    ocupados: ReadonlySet<IdVertice> | ((vertice: IdVertice) => boolean),
  ): boolean {
    const estaOcupado = typeof ocupados === 'function' ? ocupados : (v: IdVertice) => ocupados.has(v);
    return !estaOcupado(id) && !this.verticesAdyacentes(id).some(estaOcupado);
  }

  centroHexagono(id: IdHexagono, tamano: number): Punto {
    return hexAPixel(this.hexagono(id).coordenadas, tamano);
  }

  /** Posición en pantalla de un vértice: el baricentro de los centros de sus 3 hexágonos. */
  posicionVertice(id: IdVertice, tamano: number): Punto {
    const centros = this.vertice(id).hexagonos.map((h) => hexAPixel(h, tamano));
    return {
      x: centros.reduce((suma, p) => suma + p.x, 0) / 3,
      y: centros.reduce((suma, p) => suma + p.y, 0) / 3,
    };
  }

  /** Posición en pantalla del punto medio de una arista. */
  posicionArista(id: IdArista, tamano: number): Punto {
    const [a, b] = this.arista(id).vertices.map((v) => this.posicionVertice(v, tamano)) as [Punto, Punto];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}

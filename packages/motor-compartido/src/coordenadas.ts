/**
 * Matemática de hexágonos con coordenadas cúbicas (x, y, z), donde x + y + z = 0.
 *
 * Equivalencia con coordenadas axiales (q, r): q = x, r = z, y = -q - r.
 * Se usa la orientación "punta arriba" (pointy-top), igual que el tablero de Colonist,
 * con el eje Y de pantalla creciendo hacia abajo.
 *
 * Referencia: https://www.redblobgames.com/grids/hexagons/
 */

export interface CoordenadasAxiales {
  readonly q: number;
  readonly r: number;
}

/** Evita el -0 de JavaScript para que las claves y las comparaciones sean estables. */
function normalizarCero(n: number): number {
  return n === 0 ? 0 : n;
}

export class CoordenadasCubicas {
  readonly x: number;
  readonly y: number;
  readonly z: number;

  constructor(x: number, y: number, z: number) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new Error(`Las coordenadas cúbicas deben ser enteras: (${x}, ${y}, ${z})`);
    }
    if (x + y + z !== 0) {
      throw new Error(`Coordenadas cúbicas inválidas (${x}, ${y}, ${z}): x + y + z debe ser 0`);
    }
    this.x = normalizarCero(x);
    this.y = normalizarCero(y);
    this.z = normalizarCero(z);
  }

  static desdeAxiales(q: number, r: number): CoordenadasCubicas {
    return new CoordenadasCubicas(q, -q - r, r);
  }

  /** Reconstruye unas coordenadas a partir de su clave "q,r". */
  static desdeClave(clave: string): CoordenadasCubicas {
    const coincidencia = /^(-?\d+),(-?\d+)$/.exec(clave);
    if (!coincidencia) {
      throw new Error(`Clave de coordenadas inválida: "${clave}"`);
    }
    return CoordenadasCubicas.desdeAxiales(Number(coincidencia[1]), Number(coincidencia[2]));
  }

  get q(): number {
    return this.x;
  }

  get r(): number {
    return this.z;
  }

  aAxiales(): CoordenadasAxiales {
    return { q: this.q, r: this.r };
  }

  /** Clave única y estable, apta para usar en Map/Set y para serializar: "q,r". */
  clave(): string {
    return `${this.q},${this.r}`;
  }

  igual(otra: CoordenadasCubicas): boolean {
    return this.x === otra.x && this.y === otra.y && this.z === otra.z;
  }

  sumar(otra: CoordenadasCubicas): CoordenadasCubicas {
    return new CoordenadasCubicas(this.x + otra.x, this.y + otra.y, this.z + otra.z);
  }

  restar(otra: CoordenadasCubicas): CoordenadasCubicas {
    return new CoordenadasCubicas(this.x - otra.x, this.y - otra.y, this.z - otra.z);
  }

  escalar(factor: number): CoordenadasCubicas {
    return new CoordenadasCubicas(this.x * factor, this.y * factor, this.z * factor);
  }

  /** Hexágono vecino en la dirección indicada (0 = este, en sentido antihorario). */
  vecino(indiceDireccion: number): CoordenadasCubicas {
    return this.sumar(direccion(indiceDireccion));
  }

  vecinos(): CoordenadasCubicas[] {
    return DIRECCIONES.map((d) => this.sumar(d));
  }

  /** Número de pasos entre dos hexágonos. */
  distancia(otra: CoordenadasCubicas): number {
    return (Math.abs(this.x - otra.x) + Math.abs(this.y - otra.y) + Math.abs(this.z - otra.z)) / 2;
  }

  /** Distancia al origen. */
  longitud(): number {
    return this.distancia(ORIGEN);
  }

  /**
   * Rota en múltiplos de 60° alrededor de `centro`.
   * Pasos positivos giran en sentido antihorario (la dirección i pasa a ser la i + pasos).
   */
  rotar(pasos: number, centro: CoordenadasCubicas = ORIGEN): CoordenadasCubicas {
    const giros = normalizarDireccion(pasos);
    let relativa = this.restar(centro);
    for (let i = 0; i < giros; i++) {
      relativa = new CoordenadasCubicas(-relativa.y, -relativa.z, -relativa.x);
    }
    return relativa.sumar(centro);
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`;
  }
}

export const ORIGEN = new CoordenadasCubicas(0, 0, 0);

/** Las 6 direcciones en orden antihorario empezando por el este. */
export const DIRECCIONES: readonly CoordenadasCubicas[] = Object.freeze([
  new CoordenadasCubicas(1, -1, 0), // este
  new CoordenadasCubicas(1, 0, -1), // noreste
  new CoordenadasCubicas(0, 1, -1), // noroeste
  new CoordenadasCubicas(-1, 1, 0), // oeste
  new CoordenadasCubicas(-1, 0, 1), // suroeste
  new CoordenadasCubicas(0, -1, 1), // sureste
]);

export const NOMBRES_DIRECCIONES = [
  'este',
  'noreste',
  'noroeste',
  'oeste',
  'suroeste',
  'sureste',
] as const;

/** Lleva cualquier índice entero al rango 0..5. */
export function normalizarDireccion(indice: number): number {
  if (!Number.isInteger(indice)) {
    throw new Error(`El índice de dirección debe ser entero: ${indice}`);
  }
  return ((indice % 6) + 6) % 6;
}

export function direccion(indice: number): CoordenadasCubicas {
  return DIRECCIONES[normalizarDireccion(indice)]!;
}

/** Redondea coordenadas cúbicas fraccionarias al hexágono más cercano. */
export function redondearCubicas(x: number, y: number, z: number): CoordenadasCubicas {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return new CoordenadasCubicas(rx, ry, rz);
}

function validarRadio(radio: number): void {
  if (!Number.isInteger(radio) || radio < 0) {
    throw new Error(`El radio debe ser un entero no negativo: ${radio}`);
  }
}

/** Hexágonos a distancia exacta `radio` de `centro` (6 · radio hexágonos). */
export function anillo(centro: CoordenadasCubicas, radio: number): CoordenadasCubicas[] {
  validarRadio(radio);
  if (radio === 0) {
    return [centro];
  }
  const resultado: CoordenadasCubicas[] = [];
  let actual = centro.sumar(direccion(4).escalar(radio));
  for (let lado = 0; lado < 6; lado++) {
    for (let paso = 0; paso < radio; paso++) {
      resultado.push(actual);
      actual = actual.vecino(lado);
    }
  }
  return resultado;
}

/** Todos los hexágonos a distancia ≤ `radio`, del centro hacia fuera. */
export function espiral(centro: CoordenadasCubicas, radio: number): CoordenadasCubicas[] {
  validarRadio(radio);
  const resultado: CoordenadasCubicas[] = [];
  for (let r = 0; r <= radio; r++) {
    resultado.push(...anillo(centro, r));
  }
  return resultado;
}

/** Tablero hexagonal centrado en el origen (radio 2 = tablero clásico de 19 hexágonos). */
export function formaHexagonal(radio: number): CoordenadasCubicas[] {
  return espiral(ORIGEN, radio);
}

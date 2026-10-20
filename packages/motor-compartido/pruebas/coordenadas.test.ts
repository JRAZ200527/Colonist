import { describe, expect, it } from 'vitest';
import {
  anillo,
  CoordenadasCubicas,
  DIRECCIONES,
  direccion,
  espiral,
  formaHexagonal,
  normalizarDireccion,
  ORIGEN,
  redondearCubicas,
} from '../src/index.js';

const axial = CoordenadasCubicas.desdeAxiales;

describe('CoordenadasCubicas', () => {
  it('rechaza coordenadas cuya suma no es 0', () => {
    expect(() => new CoordenadasCubicas(1, 1, 0)).toThrow(/x \+ y \+ z debe ser 0/);
  });

  it('rechaza coordenadas no enteras', () => {
    expect(() => new CoordenadasCubicas(0.5, -0.5, 0)).toThrow(/enteras/);
  });

  it('convierte de axiales a cúbicas y de vuelta', () => {
    const c = axial(2, -3);
    expect([c.x, c.y, c.z]).toEqual([2, 1, -3]);
    expect(c.aAxiales()).toEqual({ q: 2, r: -3 });
  });

  it('normaliza el -0 para que las claves sean estables', () => {
    const c = new CoordenadasCubicas(-0, 0, -0);
    expect(c.clave()).toBe('0,0');
    expect(Object.is(c.x, -0)).toBe(false);
  });

  it('reconstruye desde su clave', () => {
    for (const c of formaHexagonal(3)) {
      expect(CoordenadasCubicas.desdeClave(c.clave()).igual(c)).toBe(true);
    }
    expect(() => CoordenadasCubicas.desdeClave('1;2')).toThrow(/Clave de coordenadas inválida/);
  });

  it('suma, resta y escala', () => {
    const a = axial(1, 2);
    const b = axial(-3, 1);
    expect(a.sumar(b).aAxiales()).toEqual({ q: -2, r: 3 });
    expect(a.restar(b).aAxiales()).toEqual({ q: 4, r: 1 });
    expect(a.escalar(3).aAxiales()).toEqual({ q: 3, r: 6 });
  });

  it('calcula distancias', () => {
    expect(ORIGEN.distancia(axial(3, -1))).toBe(3);
    expect(axial(-2, 1).distancia(axial(2, -1))).toBe(4);
    expect(axial(1, 1).longitud()).toBe(2);
  });

  it('la distancia es simétrica y cumple la desigualdad triangular', () => {
    const hexagonos = formaHexagonal(2);
    for (const a of hexagonos) {
      for (const b of hexagonos) {
        expect(a.distancia(b)).toBe(b.distancia(a));
        for (const c of hexagonos) {
          expect(a.distancia(c)).toBeLessThanOrEqual(a.distancia(b) + b.distancia(c));
        }
      }
    }
  });
});

describe('Direcciones y vecinos', () => {
  it('hay 6 direcciones distintas de longitud 1', () => {
    expect(DIRECCIONES).toHaveLength(6);
    expect(new Set(DIRECCIONES.map((d) => d.clave())).size).toBe(6);
    for (const d of DIRECCIONES) {
      expect(d.longitud()).toBe(1);
    }
  });

  it('el este es (q + 1) y el noreste es (q + 1, r - 1) en punta arriba', () => {
    expect(direccion(0).aAxiales()).toEqual({ q: 1, r: 0 });
    expect(direccion(1).aAxiales()).toEqual({ q: 1, r: -1 });
    expect(direccion(5).aAxiales()).toEqual({ q: 0, r: 1 });
  });

  it('normaliza índices fuera de rango', () => {
    expect(normalizarDireccion(6)).toBe(0);
    expect(normalizarDireccion(-1)).toBe(5);
    expect(normalizarDireccion(13)).toBe(1);
    expect(() => normalizarDireccion(1.5)).toThrow();
  });

  it('ir en una dirección y volver en la opuesta deja en el mismo hexágono', () => {
    const c = axial(2, -1);
    for (let i = 0; i < 6; i++) {
      expect(c.vecino(i).vecino(i + 3).igual(c)).toBe(true);
    }
  });

  it('todos los vecinos están a distancia 1', () => {
    const c = axial(-1, 2);
    const vecinos = c.vecinos();
    expect(vecinos).toHaveLength(6);
    for (const v of vecinos) {
      expect(c.distancia(v)).toBe(1);
    }
  });
});

describe('Rotación', () => {
  it('rotar una dirección k pasos da la dirección i + k', () => {
    for (let i = 0; i < 6; i++) {
      for (let k = -6; k <= 12; k++) {
        expect(direccion(i).rotar(k).igual(direccion(i + k))).toBe(true);
      }
    }
  });

  it('6 pasos son la identidad y la rotación conserva la distancia al centro', () => {
    const centro = axial(1, -1);
    for (const c of formaHexagonal(3)) {
      expect(c.rotar(6).igual(c)).toBe(true);
      expect(c.rotar(2, centro).distancia(centro)).toBe(c.distancia(centro));
    }
  });

  it('rotar k y luego -k devuelve al punto original', () => {
    const c = axial(3, -1);
    expect(c.rotar(4).rotar(-4).igual(c)).toBe(true);
  });
});

describe('Redondeo', () => {
  it('redondea coordenadas fraccionarias al hexágono más cercano', () => {
    expect(redondearCubicas(0.1, -0.05, -0.05).igual(ORIGEN)).toBe(true);
    expect(redondearCubicas(0.9, -0.6, -0.3).igual(axial(1, 0))).toBe(true);
    expect(redondearCubicas(2.2, -1.1, -1.1).igual(axial(2, -1))).toBe(true);
  });
});

describe('Anillos y espirales', () => {
  it('el anillo de radio 0 es solo el centro', () => {
    const c = axial(1, 1);
    expect(anillo(c, 0)).toEqual([c]);
  });

  it('el anillo de radio r tiene 6·r hexágonos distintos, todos a distancia r', () => {
    const centro = axial(-1, 2);
    for (let r = 1; r <= 5; r++) {
      const hexagonos = anillo(centro, r);
      expect(hexagonos).toHaveLength(6 * r);
      expect(new Set(hexagonos.map((h) => h.clave())).size).toBe(6 * r);
      for (const h of hexagonos) {
        expect(h.distancia(centro)).toBe(r);
      }
    }
  });

  it('cada hexágono del anillo es vecino del siguiente', () => {
    const hexagonos = anillo(ORIGEN, 3);
    for (let i = 0; i < hexagonos.length; i++) {
      const siguiente = hexagonos[(i + 1) % hexagonos.length]!;
      expect(hexagonos[i]!.distancia(siguiente)).toBe(1);
    }
  });

  it('la espiral de radio 2 es el tablero clásico de 19 hexágonos', () => {
    const tablero = formaHexagonal(2);
    expect(tablero).toHaveLength(19);
    expect(tablero[0]!.igual(ORIGEN)).toBe(true);
    expect(new Set(tablero.map((h) => h.clave())).size).toBe(19);
    expect(espiral(ORIGEN, 3)).toHaveLength(37);
  });

  it('rechaza radios negativos o fraccionarios', () => {
    expect(() => anillo(ORIGEN, -1)).toThrow(/radio/);
    expect(() => espiral(ORIGEN, 1.5)).toThrow(/radio/);
  });
});

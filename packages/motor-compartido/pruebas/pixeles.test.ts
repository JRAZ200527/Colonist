import { describe, expect, it } from 'vitest';
import {
  CoordenadasCubicas,
  esquinaHexagono,
  esquinasHexagono,
  formaHexagonal,
  hexAPixel,
  ORIGEN,
  pixelAHex,
} from '../src/index.js';

const TAMANO = 50;
const RAIZ_3 = Math.sqrt(3);
const axial = CoordenadasCubicas.desdeAxiales;

describe('Conversión hexágono ⇄ píxel', () => {
  it('el origen está en el punto de origen de la pantalla', () => {
    expect(hexAPixel(ORIGEN, TAMANO)).toEqual({ x: 0, y: 0 });
    expect(hexAPixel(ORIGEN, TAMANO, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it('coloca los vecinos según la orientación punta arriba', () => {
    const este = hexAPixel(axial(1, 0), TAMANO);
    expect(este.x).toBeCloseTo(RAIZ_3 * TAMANO);
    expect(este.y).toBeCloseTo(0);

    const sureste = hexAPixel(axial(0, 1), TAMANO);
    expect(sureste.x).toBeCloseTo((RAIZ_3 / 2) * TAMANO);
    expect(sureste.y).toBeCloseTo(1.5 * TAMANO);
  });

  it('pixelAHex invierte a hexAPixel', () => {
    const origen = { x: 400, y: 300 };
    for (const c of formaHexagonal(4)) {
      expect(pixelAHex(hexAPixel(c, TAMANO, origen), TAMANO, origen).igual(c)).toBe(true);
    }
  });

  it('un punto cerca de una esquina, pero dentro del hexágono, pertenece a ese hexágono', () => {
    const centro = hexAPixel(ORIGEN, TAMANO);
    for (let i = 0; i < 6; i++) {
      const esquina = esquinaHexagono(centro, TAMANO, i);
      const casiEsquina = { x: esquina.x * 0.9, y: esquina.y * 0.9 };
      expect(pixelAHex(casiEsquina, TAMANO).igual(ORIGEN)).toBe(true);
    }
  });
});

describe('Esquinas', () => {
  it('las 6 esquinas están a distancia `tamano` del centro', () => {
    const centro = { x: 7, y: -3 };
    const esquinas = esquinasHexagono(centro, TAMANO);
    expect(esquinas).toHaveLength(6);
    for (const e of esquinas) {
      expect(Math.hypot(e.x - centro.x, e.y - centro.y)).toBeCloseTo(TAMANO);
    }
  });

  it('la esquina 0 es la superior derecha', () => {
    const esquina = esquinaHexagono({ x: 0, y: 0 }, TAMANO, 0);
    expect(esquina.x).toBeGreaterThan(0);
    expect(esquina.y).toBeLessThan(0);
  });

  it('la esquina i es el baricentro del hexágono y sus vecinos i e i + 1', () => {
    const hexagono = axial(1, -2);
    for (let i = 0; i < 6; i++) {
      const esquina = esquinaHexagono(hexAPixel(hexagono, TAMANO), TAMANO, i);
      const centros = [hexagono, hexagono.vecino(i), hexagono.vecino(i + 1)].map((h) => hexAPixel(h, TAMANO));
      expect(esquina.x).toBeCloseTo(centros.reduce((s, p) => s + p.x, 0) / 3);
      expect(esquina.y).toBeCloseTo(centros.reduce((s, p) => s + p.y, 0) / 3);
    }
  });
});

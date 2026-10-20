import { describe, expect, it } from 'vitest';
import {
  anillo,
  CoordenadasCubicas,
  esquinaHexagono,
  formaHexagonal,
  GrafoTablero,
  hexAPixel,
  idArista,
  idAristaLado,
  idVertice,
  idVerticeEsquina,
  ORIGEN,
  puntosProbabilidad,
  type IdVertice,
} from '../src/index.js';

const axial = CoordenadasCubicas.desdeAxiales;
const TAMANO = 40;

function tableroClasico(): GrafoTablero {
  return GrafoTablero.desdeCoordenadas(formaHexagonal(2), 'trigo');
}

function contarPorGrado(grafo: GrafoTablero): Record<number, number> {
  const conteo: Record<number, number> = {};
  for (const v of grafo.vertices.values()) {
    conteo[v.adyacentes.length] = (conteo[v.adyacentes.length] ?? 0) + 1;
  }
  return conteo;
}

describe('Identificadores canónicos', () => {
  it('la misma esquina vista desde sus 3 hexágonos tiene el mismo id', () => {
    const h = axial(0, 0);
    const desdeOrigen = idVerticeEsquina(h, 0); // entre este (0) y noreste (1)
    const desdeEste = idVerticeEsquina(h.vecino(0), 2); // el origen está al oeste (3) del este
    const desdeNoreste = idVerticeEsquina(h.vecino(1), 4);
    expect(desdeEste).toBe(desdeOrigen);
    expect(desdeNoreste).toBe(desdeOrigen);
  });

  it('el mismo lado visto desde sus 2 hexágonos tiene el mismo id', () => {
    const h = axial(1, -1);
    for (let lado = 0; lado < 6; lado++) {
      expect(idAristaLado(h.vecino(lado), lado + 3)).toBe(idAristaLado(h, lado));
    }
  });

  it('el orden de los hexágonos no cambia el id', () => {
    const [a, b, c] = [ORIGEN, ORIGEN.vecino(0), ORIGEN.vecino(1)];
    expect(idVertice([a, b, c])).toBe(idVertice([c, a, b]));
    expect(idArista(a, b)).toBe(idArista(b, a));
  });

  it('rechaza definiciones geométricamente imposibles', () => {
    expect(() => idVertice([ORIGEN, ORIGEN.vecino(0)])).toThrow();
    expect(() => idArista(ORIGEN, axial(2, 0))).toThrow(/vecinos/);
  });
});

describe('GrafoTablero: un solo hexágono', () => {
  const grafo = GrafoTablero.desdeCoordenadas([ORIGEN], 'madera');

  it('tiene 6 vértices y 6 aristas', () => {
    expect(grafo.vertices.size).toBe(6);
    expect(grafo.aristas.size).toBe(6);
  });

  it('cada vértice tiene 2 vecinos y 2 aristas', () => {
    for (const v of grafo.vertices.values()) {
      expect(v.adyacentes).toHaveLength(2);
      expect(v.aristas).toHaveLength(2);
      expect(v.hexagonosEnTablero).toEqual(['0,0']);
    }
  });
});

describe('GrafoTablero: tablero clásico de 19 hexágonos', () => {
  const grafo = tableroClasico();

  it('tiene 54 vértices y 72 aristas', () => {
    expect(grafo.hexagonos.size).toBe(19);
    expect(grafo.vertices.size).toBe(54);
    expect(grafo.aristas.size).toBe(72);
  });

  it('cumple la fórmula de Euler (V − A + C = 1)', () => {
    expect(grafo.vertices.size - grafo.aristas.size + grafo.hexagonos.size).toBe(1);
  });

  it('tiene 18 vértices de grado 2 (costa) y 36 de grado 3', () => {
    expect(contarPorGrado(grafo)).toEqual({ 2: 18, 3: 36 });
  });

  it('24 vértices interiores tocan 3 hexágonos', () => {
    const interiores = [...grafo.vertices.values()].filter((v) => v.hexagonosEnTablero.length === 3);
    expect(interiores).toHaveLength(24);
  });

  it('cada hexágono tiene sus 6 vértices y 6 aristas en orden de esquina y lado', () => {
    for (const h of grafo.hexagonos.values()) {
      expect(h.vertices).toEqual([0, 1, 2, 3, 4, 5].map((i) => idVerticeEsquina(h.coordenadas, i)));
      expect(h.aristas).toEqual([0, 1, 2, 3, 4, 5].map((i) => idAristaLado(h.coordenadas, i)));
    }
  });

  it('los extremos de cada arista son vértices adyacentes distintos', () => {
    for (const arista of grafo.aristas.values()) {
      const [a, b] = arista.vertices;
      expect(a).not.toBe(b);
      expect(grafo.verticesAdyacentes(a)).toContain(b);
      expect(grafo.aristaEntre(a, b)).toBe(arista.id);
      expect(grafo.aristaEntre(b, a)).toBe(arista.id);
    }
  });

  it('la adyacencia de vértices es simétrica', () => {
    for (const v of grafo.vertices.values()) {
      for (const otro of v.adyacentes) {
        expect(grafo.verticesAdyacentes(otro)).toContain(v.id);
      }
    }
  });

  it('una arista interior tiene 4 aristas adyacentes y una de esquina de la costa tiene 2', () => {
    const interior = idAristaLado(ORIGEN, 0);
    expect(grafo.aristasAdyacentes(interior)).toHaveLength(4);
    expect(grafo.aristasAdyacentes(interior)).not.toContain(interior);

    // Lado exterior de un hexágono de la esquina del tablero, con ambos extremos de grado 2.
    const esquinaTablero = axial(2, 0);
    const exterior = idAristaLado(esquinaTablero, 0);
    expect(grafo.aristasAdyacentes(exterior)).toHaveLength(2);
  });

  it('hexagonosDeVertice devuelve los hexágonos del tablero que tocan el vértice', () => {
    const interior = idVerticeEsquina(ORIGEN, 0);
    expect(grafo.hexagonosDeVertice(interior)).toHaveLength(3);
    const costa = idVerticeEsquina(axial(2, 0), 0);
    expect(grafo.hexagonosDeVertice(costa).length).toBeLessThan(3);
  });

  it('las posiciones en pantalla coinciden con las esquinas dibujadas', () => {
    for (const h of grafo.hexagonos.values()) {
      const centro = hexAPixel(h.coordenadas, TAMANO);
      h.vertices.forEach((v, i) => {
        const posicion = grafo.posicionVertice(v, TAMANO);
        const esquina = esquinaHexagono(centro, TAMANO, i);
        expect(posicion.x).toBeCloseTo(esquina.x);
        expect(posicion.y).toBeCloseTo(esquina.y);
      });
    }
  });

  it('el punto medio de una arista está a medio camino de sus extremos', () => {
    const arista = grafo.arista(idAristaLado(ORIGEN, 2));
    const [a, b] = arista.vertices.map((v) => grafo.posicionVertice(v, TAMANO));
    const medio = grafo.posicionArista(arista.id, TAMANO);
    expect(medio.x).toBeCloseTo((a!.x + b!.x) / 2);
    expect(medio.y).toBeCloseTo((a!.y + b!.y) / 2);
  });

  it('lanza un error claro al pedir elementos inexistentes', () => {
    expect(() => grafo.vertice('V:no-existe')).toThrow(/No existe el vértice/);
    expect(() => grafo.arista('A:no-existe')).toThrow(/No existe la arista/);
    expect(() => grafo.hexagono('9,9')).toThrow(/No existe el hexágono/);
    expect(grafo.hexagonoEn(axial(9, 9))).toBeUndefined();
  });
});

describe('Regla de la distancia', () => {
  const grafo = tableroClasico();
  const centro = idVerticeEsquina(ORIGEN, 0);

  it('se puede construir en un tablero vacío', () => {
    expect(grafo.cumpleReglaDistancia(centro, new Set())).toBe(true);
  });

  it('no se puede construir en un vértice ocupado', () => {
    expect(grafo.cumpleReglaDistancia(centro, new Set([centro]))).toBe(false);
  });

  it('no se puede construir junto a un poblado', () => {
    for (const vecino of grafo.verticesAdyacentes(centro)) {
      expect(grafo.cumpleReglaDistancia(vecino, new Set([centro]))).toBe(false);
    }
  });

  it('sí se puede construir a 2 aristas de distancia', () => {
    const aDosAristas = new Set<IdVertice>();
    for (const vecino of grafo.verticesAdyacentes(centro)) {
      for (const segundo of grafo.verticesAdyacentes(vecino)) {
        if (segundo !== centro) {
          aDosAristas.add(segundo);
        }
      }
    }
    expect(aDosAristas.size).toBe(6);
    for (const v of aDosAristas) {
      expect(grafo.cumpleReglaDistancia(v, new Set([centro]))).toBe(true);
    }
  });

  it('acepta una función para consultar la ocupación', () => {
    expect(grafo.cumpleReglaDistancia(centro, (v) => v === centro)).toBe(false);
    expect(grafo.cumpleReglaDistancia(centro, () => false)).toBe(true);
  });
});

describe('Hexágonos de agua', () => {
  const definiciones = [
    ...formaHexagonal(2).map((c) => ({ coordenadas: c.aAxiales(), terreno: 'oveja' as const })),
    ...anillo(ORIGEN, 3).map((c) => ({ coordenadas: c.aAxiales(), terreno: 'agua' as const })),
  ];
  const grafo = new GrafoTablero(definiciones);

  it('no crean vértices ni aristas nuevos', () => {
    expect(grafo.hexagonos.size).toBe(37);
    expect(grafo.vertices.size).toBe(54);
    expect(grafo.aristas.size).toBe(72);
  });

  it('los de las esquinas tocan 2 vértices de costa y los de los lados 3', () => {
    const agua = [...grafo.hexagonos.values()].filter((h) => !h.esJugable);
    const conteo = agua.map((h) => h.vertices.length).sort();
    expect(conteo.filter((n) => n === 2)).toHaveLength(6);
    expect(conteo.filter((n) => n === 3)).toHaveLength(12);
  });

  it('los vértices de la costa saben qué hexágonos de agua tocan', () => {
    const costa = idVerticeEsquina(axial(2, 0), 0);
    expect(grafo.vertice(costa).hexagonosEnTablero).toHaveLength(3);
  });
});

describe('Validación de definiciones', () => {
  it('rechaza hexágonos duplicados', () => {
    expect(
      () =>
        new GrafoTablero([
          { coordenadas: { q: 0, r: 0 }, terreno: 'madera' },
          { coordenadas: { q: 0, r: 0 }, terreno: 'trigo' },
        ]),
    ).toThrow(/duplicado/);
  });

  it('rechaza fichas inválidas', () => {
    expect(() => new GrafoTablero([{ coordenadas: { q: 0, r: 0 }, terreno: 'madera', ficha: 7 }])).toThrow(
      /Ficha numérica inválida/,
    );
    expect(() => new GrafoTablero([{ coordenadas: { q: 0, r: 0 }, terreno: 'madera', ficha: 13 }])).toThrow();
  });

  it('rechaza fichas en el agua', () => {
    expect(() => new GrafoTablero([{ coordenadas: { q: 0, r: 0 }, terreno: 'agua', ficha: 8 }])).toThrow(/agua/);
  });

  it('guarda terreno, ficha y puntos de probabilidad', () => {
    const grafo = new GrafoTablero([{ coordenadas: { q: 0, r: 0 }, terreno: 'mineral', ficha: 8 }]);
    const h = grafo.hexagono('0,0');
    expect(h.terreno).toBe('mineral');
    expect(h.ficha).toBe(8);
    expect(h.puntos).toBe(5);
  });
});

describe('Puntos de probabilidad', () => {
  it('coinciden con las combinaciones de 2 dados', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(puntosProbabilidad)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
  });

  it('el 7 no es una ficha', () => {
    expect(() => puntosProbabilidad(7)).toThrow();
  });
});

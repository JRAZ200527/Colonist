import { describe, expect, it } from 'vitest';
import {
  CoordenadasCubicas,
  ErrorMapa,
  exportarMapa,
  formaHexagonal,
  formaPorFilas,
  generarMapa,
  GrafoTablero,
  IDS_PLANTILLA,
  importarMapa,
  importarMapaJson,
  mapaATextoJson,
  PLANTILLAS,
  puntosDeVictoria,
  validarMapa,
  validarPlantilla,
  type MapaJuego,
  type PlantillaMapa,
} from '../src/index.js';
import { jugarPartida } from './simulador.js';

const SEMILLAS = Array.from({ length: 25 }, (_, i) => i + 1);

const tierraDe = (mapa: MapaJuego) => mapa.hexagonos.filter((h) => h.terreno !== 'agua');
const cubicas = (h: MapaJuego['hexagonos'][number]) => CoordenadasCubicas.desdeAxiales(h.coordenadas.q, h.coordenadas.r);

function contar<T>(valores: readonly T[]): Map<T, number> {
  const conteo = new Map<T, number>();
  for (const v of valores) {
    conteo.set(v, (conteo.get(v) ?? 0) + 1);
  }
  return conteo;
}

function rojasAdyacentes(mapa: MapaJuego): number {
  const rojas = tierraDe(mapa).filter((h) => h.ficha === 6 || h.ficha === 8);
  let pares = 0;
  for (let i = 0; i < rojas.length; i++) {
    for (let j = i + 1; j < rojas.length; j++) {
      if (cubicas(rojas[i]!).distancia(cubicas(rojas[j]!)) === 1) {
        pares++;
      }
    }
  }
  return pares;
}

/** Número de islas (componentes conexas de tierra). */
function contarIslas(mapa: MapaJuego): number {
  const pendientes = new Set(tierraDe(mapa).map((h) => cubicas(h).clave()));
  let islas = 0;
  while (pendientes.size > 0) {
    islas++;
    const pila = [CoordenadasCubicas.desdeClave(pendientes.values().next().value!)];
    while (pila.length > 0) {
      const actual = pila.pop()!;
      if (!pendientes.delete(actual.clave())) {
        continue;
      }
      pila.push(...actual.vecinos().filter((v) => pendientes.has(v.clave())));
    }
  }
  return islas;
}

describe('Formas de tablero', () => {
  it('las filas 3-4-5-4-3 forman el tablero clásico de radio 2', () => {
    const porFilas = new Set(formaPorFilas([3, 4, 5, 4, 3]).map((c) => c.clave()));
    expect(porFilas).toEqual(new Set(formaHexagonal(2).map((c) => c.clave())));
  });

  it('el tablero de 5-6 jugadores tiene filas 3-4-5-6-5-4-3', () => {
    const forma = PLANTILLAS.expansion56.forma;
    expect(forma).toHaveLength(30);
    const filas = [...contar(forma.map((c) => c.r))].sort(([a], [b]) => a - b).map(([, n]) => n);
    expect(filas).toEqual([3, 4, 5, 6, 5, 4, 3]);
  });

  it('rechaza filas que no se pueden centrar', () => {
    expect(() => formaPorFilas([3, 4])).toThrow(/impar/);
    expect(() => formaPorFilas([3, 3, 3])).toThrow(/centrar/);
  });
});

describe('Plantillas', () => {
  it.each(IDS_PLANTILLA)('la plantilla %s es coherente', (id) => {
    const plantilla = PLANTILLAS[id];
    expect(() => validarPlantilla(plantilla)).not.toThrow();
    expect(plantilla.id).toBe(id);
    expect(plantilla.nombre.length).toBeGreaterThan(0);
    expect(plantilla.jugadores.minimo).toBeLessThanOrEqual(plantilla.jugadores.maximo);
  });

  it('detecta plantillas incoherentes', () => {
    const mala: PlantillaMapa = { ...PLANTILLAS.clasico, terrenos: { madera: 3 } };
    expect(() => validarPlantilla(mala)).toThrow(/3 terrenos para 19 hexágonos/);
    const pocasFichas: PlantillaMapa = { ...PLANTILLAS.clasico, fichas: [6, 8] };
    expect(() => validarPlantilla(pocasFichas)).toThrow(/2 fichas para 18/);
  });

  it('el duelo 1 contra 1 se juega a 15 puntos', () => {
    expect(PLANTILLAS.duelo.puntosVictoria).toBe(15);
    expect(PLANTILLAS.duelo.jugadores).toEqual({ minimo: 2, maximo: 2 });
  });
});

describe('Generador de mapas', () => {
  for (const id of IDS_PLANTILLA) {
    const plantilla = PLANTILLAS[id];

    it(`${id}: los mapas son válidos y respetan terrenos, fichas y puertos`, () => {
      for (const modo of ['equilibrado', 'aleatorio'] as const) {
        for (const semilla of SEMILLAS.slice(0, 5)) {
          const mapa = generarMapa({ plantilla: id, modo, semilla });
          expect(validarMapa(mapa), `${modo} ${semilla}`).toEqual([]);

          const tierra = tierraDe(mapa);
          expect(tierra).toHaveLength(plantilla.forma.length);
          expect(contar(tierra.map((h) => h.terreno))).toEqual(
            new Map(Object.entries(plantilla.terrenos).filter(([, n]) => n! > 0)),
          );
          const fichas = tierra.flatMap((h) => (h.ficha === null || h.ficha === undefined ? [] : [h.ficha]));
          expect(fichas.sort((a, b) => a - b)).toEqual([...plantilla.fichas].sort((a, b) => a - b));
          expect(contar(mapa.puertos.map((p) => p.tipo))).toEqual(contar(plantilla.puertos));
        }
      }
    });

    it(`${id}: el agua rodea toda la tierra`, () => {
      const mapa = generarMapa({ plantilla: id, semilla: 1 });
      const claves = new Set(mapa.hexagonos.map((h) => cubicas(h).clave()));
      for (const h of tierraDe(mapa)) {
        for (const vecino of cubicas(h).vecinos()) {
          expect(claves.has(vecino.clave())).toBe(true);
        }
      }
    });

    it(`${id}: en modo equilibrado nunca hay 6 y 8 juntos`, () => {
      for (const semilla of SEMILLAS) {
        expect(rojasAdyacentes(generarMapa({ plantilla: id, modo: 'equilibrado', semilla })), `semilla ${semilla}`).toBe(0);
      }
    });
  }

  it('en modo aleatorio puro los 6 y 8 pueden quedar juntos', () => {
    const conRojasJuntas = SEMILLAS.filter((semilla) => rojasAdyacentes(generarMapa({ plantilla: 'clasico', modo: 'aleatorio', semilla })) > 0);
    expect(conRojasJuntas.length).toBeGreaterThan(0);
  });

  it('es determinista: misma semilla, mismo mapa', () => {
    expect(generarMapa({ plantilla: 'clasico', semilla: 9 })).toEqual(generarMapa({ plantilla: 'clasico', semilla: 9 }));
    expect(generarMapa({ plantilla: 'clasico', semilla: 9 })).not.toEqual(generarMapa({ plantilla: 'clasico', semilla: 10 }));
  });

  it('el modo equilibrado reparte mejor las probabilidades por recurso que el aleatorio', () => {
    // Diferencia entre la media de puntos del recurso más favorecido y la del menos favorecido.
    const desequilibrio = (mapa: MapaJuego) => {
      const medias = new Map<string, number[]>();
      for (const h of tierraDe(mapa)) {
        if (h.ficha != null) {
          medias.set(h.terreno, [...(medias.get(h.terreno) ?? []), 6 - Math.abs(7 - h.ficha)]);
        }
      }
      const valores = [...medias.values()].map((p) => p.reduce((a, b) => a + b, 0) / p.length);
      return Math.max(...valores) - Math.min(...valores);
    };
    const media = (modo: 'equilibrado' | 'aleatorio') =>
      SEMILLAS.reduce((s, semilla) => s + desequilibrio(generarMapa({ plantilla: 'clasico', modo, semilla })), 0) / SEMILLAS.length;
    expect(media('equilibrado')).toBeLessThan(media('aleatorio'));
  });

  it('los puertos quedan repartidos por la costa', () => {
    for (const semilla of SEMILLAS.slice(0, 10)) {
      const mapa = generarMapa({ plantilla: 'clasico', semilla });
      const grafo = new GrafoTablero(mapa.hexagonos);
      // Ángulo de cada puerto alrededor del centro: el mayor hueco entre puertos
      // consecutivos no debería superar mucho 360° / 9 = 40°.
      const angulos = mapa.puertos
        .map((p) => {
          const a = grafo.posicionVertice(p.vertices[0], 1);
          const b = grafo.posicionVertice(p.vertices[1], 1);
          return (Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2) * 180) / Math.PI;
        })
        .sort((x, y) => x - y);
      const huecos = angulos.map((a, i) => (i === 0 ? a + 360 - angulos.at(-1)! : a - angulos[i - 1]!));
      expect(Math.max(...huecos), `semilla ${semilla}`).toBeLessThan(75);
    }
  });

  it('el volcán está en el centro', () => {
    for (const semilla of SEMILLAS.slice(0, 5)) {
      const centro = generarMapa({ plantilla: 'volcan', semilla }).hexagonos.find((h) => h.coordenadas.q === 0 && h.coordenadas.r === 0);
      expect(centro?.terreno).toBe('desierto');
    }
  });

  it('el archipiélago tiene 3 islas separadas por agua', () => {
    const mapa = generarMapa({ plantilla: 'archipielago', semilla: 1 });
    expect(contarIslas(mapa)).toBe(3);
    expect(contarIslas(generarMapa({ plantilla: 'clasico', semilla: 1 }))).toBe(1);
  });

  it('acepta plantillas personalizadas', () => {
    const mini: PlantillaMapa = {
      id: 'mini',
      nombre: 'Mini',
      descripcion: 'Prueba',
      jugadores: { minimo: 2, maximo: 2 },
      puntosVictoria: 5,
      forma: formaHexagonal(1),
      terrenos: { madera: 2, arcilla: 1, trigo: 1, oveja: 1, mineral: 1, desierto: 1 },
      fichas: [4, 5, 6, 8, 9, 10],
      puertos: ['generico', 'madera'],
    };
    const mapa = generarMapa({ plantilla: mini, semilla: 3 });
    expect(validarMapa(mapa)).toEqual([]);
    expect(rojasAdyacentes(mapa)).toBe(0);
  });
});

describe('Formato JSON del editor de mapas', () => {
  const mapa = generarMapa({ plantilla: 'clasico', semilla: 5 });

  it('exportar e importar devuelve el mismo mapa', () => {
    const texto = mapaATextoJson(mapa, 'Mi mapa');
    const importado = importarMapaJson(texto);
    expect(importado.nombre).toBe('Mi mapa');
    expect(importado.hexagonos).toEqual(mapa.hexagonos.map((h) => ({ ...h, ficha: h.ficha ?? null })));
    expect(new Set(importado.puertos.map((p) => `${p.tipo}:${[...p.vertices].sort().join()}`))).toEqual(
      new Set(mapa.puertos.map((p) => `${p.tipo}:${[...p.vertices].sort().join()}`)),
    );
  });

  it('guarda los puertos como hexágono y lado', () => {
    const json = exportarMapa(mapa, 'x');
    expect(json.formato).toBe('colonist-mapa');
    expect(json.puertos).toHaveLength(9);
    for (const p of json.puertos) {
      expect(p.lado).toBeGreaterThanOrEqual(0);
      expect(p.lado).toBeLessThanOrEqual(5);
    }
  });

  function problemas(datos: unknown): readonly string[] {
    try {
      importarMapa(datos);
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorMapa);
      return (error as ErrorMapa).problemas;
    }
    throw new Error('Se esperaba un mapa inválido');
  }

  const base = () => exportarMapa(mapa, 'Base');

  it('rechaza archivos que no son mapas', () => {
    expect(() => importarMapaJson('{no es json')).toThrow(/JSON válido/);
    expect(problemas({ hola: 1 })).toEqual([expect.stringMatching(/no es un mapa/)]);
    expect(problemas({ ...base(), version: 99 })).toEqual([expect.stringMatching(/Versión/)]);
  });

  it('informa de cada problema en español', () => {
    const json = base();
    json.hexagonos[0] = { q: 0, r: 0, terreno: 'lava' as never };
    json.hexagonos[1] = { ...json.hexagonos[1]!, q: 0.5 };
    json.puertos[0] = { ...json.puertos[0]!, tipo: 'oro' as never };
    // Los puertos de los hexágonos descartados también se señalan, por eso no es la lista exacta.
    expect(problemas(json)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Hexágono 1: terreno desconocido "lava"/),
        expect.stringMatching(/Hexágono 2: "q" y "r" deben ser números enteros/),
        expect.stringMatching(/Puerto 1: tipo desconocido "oro"/),
      ]),
    );
  });

  it('valida fichas, duplicados y puertos', () => {
    const conSiete = base();
    const indice = conSiete.hexagonos.findIndex((h) => h.ficha !== undefined);
    conSiete.hexagonos[indice] = { ...conSiete.hexagonos[indice]!, ficha: 7 };
    expect(problemas(conSiete)[0]).toMatch(/Ficha numérica inválida 7/);

    const duplicado = base();
    duplicado.hexagonos.push({ ...duplicado.hexagonos[0]! });
    expect(problemas(duplicado)[0]).toMatch(/duplicado/);

    const interior = base();
    interior.puertos[0] = { q: 0, r: 0, lado: 0, tipo: 'generico' };
    expect(problemas(interior)[0]).toMatch(/no da al mar/);

    const repetido = base();
    repetido.puertos.push({ ...repetido.puertos[0]! });
    expect(problemas(repetido)).toContainEqual(expect.stringMatching(/comparte un vértice/));

    const sinFicha = base();
    const productivo = sinFicha.hexagonos.findIndex((h) => h.ficha !== undefined);
    delete sinFicha.hexagonos[productivo]!.ficha;
    expect(problemas(sinFicha)[0]).toMatch(/necesita una ficha/);
  });
});

describe('Partidas en mapas generados', () => {
  it('6 jugadores terminan una partida en el mapa de expansión', () => {
    const mapa = generarMapa({ plantilla: 'expansion56', semilla: 2 });
    const { estado } = jugarPartida(6, 2, { mapa });
    expect(estado.fase.tipo).toBe('finalizada');
  });

  it('el duelo 1 contra 1 termina a 15 puntos', () => {
    const mapa = generarMapa({ plantilla: 'duelo', semilla: 4 });
    const { estado } = jugarPartida(2, 4, { mapa, configuracion: { puntosVictoria: PLANTILLAS.duelo.puntosVictoria } });
    if (estado.fase.tipo !== 'finalizada') {
      throw new Error('La partida no terminó');
    }
    expect(puntosDeVictoria(estado, estado.fase.ganador)).toBeGreaterThanOrEqual(15);
  });

  it.each(['bosqueNegro', 'tierrasAltas', 'diamante', 'volcan'] as const)('se puede jugar completa en %s', (id) => {
    const { estado } = jugarPartida(4, 3, { mapa: generarMapa({ plantilla: id, semilla: 3 }) });
    expect(estado.fase.tipo).toBe('finalizada');
  });
});

import { describe, expect, it } from 'vitest';
import {
  aplicarAccion,
  aristasValidasCarreteraInicial,
  CoordenadasCubicas,
  crearMapaClasicoFijo,
  crearPartida,
  describirEvento,
  GrafoTablero,
  grafoDe,
  idVerticeEsquina,
  RECURSOS,
  totalCartas,
  verticesValidosPoblado,
  type EstadoJuego,
} from '../src/index.js';
import {
  aplicar,
  aplicarConEventos,
  colocacionAutomatica,
  error,
  idActual,
  nuevaPartida,
  partidaEnAcciones,
  tirarHasta,
} from './ayudantes.js';

const axial = CoordenadasCubicas.desdeAxiales;

describe('Mapa clásico fijo', () => {
  const mapa = crearMapaClasicoFijo();
  const grafo = new GrafoTablero(mapa.hexagonos);

  it('tiene 19 hexágonos con el reparto oficial de terrenos y fichas', () => {
    const contar = (t: string) => mapa.hexagonos.filter((h) => h.terreno === t).length;
    expect(mapa.hexagonos).toHaveLength(19);
    expect([contar('madera'), contar('oveja'), contar('trigo'), contar('arcilla'), contar('mineral'), contar('desierto')]).toEqual([
      4, 4, 4, 3, 3, 1,
    ]);
    const fichas = mapa.hexagonos.map((h) => h.ficha).filter((f) => f !== null).sort((a, b) => a! - b!);
    expect(fichas).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  });

  it('no tiene 6 ni 8 adyacentes', () => {
    const rojos = [...grafo.hexagonos.values()].filter((h) => h.ficha === 6 || h.ficha === 8);
    for (const a of rojos) {
      for (const b of rojos) {
        expect(a.coordenadas.distancia(b.coordenadas)).not.toBe(1);
      }
    }
  });

  it('tiene 9 puertos (4 genéricos y 1 de cada recurso) en vértices de la costa sin compartir vértices', () => {
    expect(mapa.puertos).toHaveLength(9);
    expect(mapa.puertos.filter((p) => p.tipo === 'generico')).toHaveLength(4);
    for (const r of RECURSOS) {
      expect(mapa.puertos.filter((p) => p.tipo === r)).toHaveLength(1);
    }
    const vertices = mapa.puertos.flatMap((p) => p.vertices);
    expect(new Set(vertices).size).toBe(18);
    for (const v of vertices) {
      expect(grafo.vertice(v).hexagonosEnTablero.length).toBeLessThan(3);
    }
    for (const p of mapa.puertos) {
      expect(grafo.aristaEntre(p.vertices[0], p.vertices[1])).toBeDefined();
    }
  });
});

describe('Creación de la partida', () => {
  const estado = nuevaPartida(4, 42);

  it('prepara la banca, el mazo, las piezas y el ladrón', () => {
    expect(estado.banca).toEqual({ madera: 19, arcilla: 19, trigo: 19, oveja: 19, mineral: 19 });
    expect(estado.mazoDesarrollo).toHaveLength(25);
    const contar = (t: string) => estado.mazoDesarrollo.filter((c) => c === t).length;
    expect([contar('caballero'), contar('puntoVictoria'), contar('construccionCarreteras'), contar('abundancia'), contar('monopolio')]).toEqual([
      14, 5, 2, 2, 2,
    ]);
    expect(estado.tablero.ladron).toBe('0,0');
    for (const j of estado.jugadores) {
      expect(j.piezas).toEqual({ carreteras: 15, poblados: 5, ciudades: 4 });
      expect(totalCartas(j.recursos)).toBe(0);
    }
    expect(new Set(estado.jugadores.map((j) => j.color)).size).toBe(4);
    expect(estado.fase).toEqual({ tipo: 'colocacionInicial', paso: 'poblado', indice: 0, ultimoPoblado: null });
  });

  it('es reproducible con la misma semilla', () => {
    expect(nuevaPartida(4, 42)).toEqual(estado);
    expect(nuevaPartida(4, 43).mazoDesarrollo).not.toEqual(estado.mazoDesarrollo);
  });

  it('valida jugadores, colores y puntos de victoria', () => {
    const jugadores = (ids: string[]) => ids.map((id) => ({ id, nombre: id }));
    expect(() => nuevaPartida(1)).toThrow(/entre 2 y 6/);
    expect(() => crearPartida({ jugadores: jugadores(['a', 'b', 'c', 'd', 'e', 'f', 'g']) })).toThrow(/entre 2 y 6/);
    expect(() => crearPartida({ jugadores: jugadores(['a', 'a']) })).toThrow(/únicos/);
    expect(() =>
      crearPartida({
        jugadores: [
          { id: 'a', nombre: 'A', color: 'rojo' },
          { id: 'b', nombre: 'B', color: 'rojo' },
        ],
      }),
    ).toThrow(/color distinto/);
    expect(() => crearPartida({ jugadores: jugadores(['a', 'b']), configuracion: { puntosVictoria: 2 } })).toThrow(
      /puntos de victoria/,
    );
  });

  it('prepara la baraja de dados equilibrados', () => {
    const equilibrada = nuevaPartida(3, 1, { modoDados: 'equilibrado' });
    expect(equilibrada.barajaDados).toHaveLength(36);
    expect(nuevaPartida(3).barajaDados).toHaveLength(0);
  });
});

describe('Colocación inicial en serpiente', () => {
  it('sigue el orden 1 → N y N → 1', () => {
    let estado = nuevaPartida(3);
    const orden: string[] = [];
    while (estado.fase.tipo === 'colocacionInicial') {
      const fase = estado.fase;
      const jugador = idActual(estado);
      if (fase.paso === 'poblado') {
        orden.push(jugador);
        const vertice = verticesValidosPoblado(estado, jugador, true)[0]!;
        estado = aplicar(estado, { tipo: 'colocarPobladoInicial', jugador, vertice });
      } else {
        const arista = aristasValidasCarreteraInicial(estado, fase.ultimoPoblado!)[0]!;
        estado = aplicar(estado, { tipo: 'colocarCarreteraInicial', jugador, arista });
      }
    }
    expect(orden).toEqual(['j0', 'j1', 'j2', 'j2', 'j1', 'j0']);
  });

  it('el segundo poblado da un recurso por cada hexágono adyacente', () => {
    // Esquina 0 de (0, 1): toca (0, 1) Madera, (1, 1) Arcilla y (1, 0) Oveja.
    const objetivo = idVerticeEsquina(axial(0, 1), 0);
    const primeros = [
      idVerticeEsquina(axial(-2, 2), 3),
      idVerticeEsquina(axial(2, -2), 1),
      idVerticeEsquina(axial(-2, 0), 2),
    ];
    let estado = nuevaPartida(3);
    for (const vertice of primeros) {
      const jugador = idActual(estado);
      estado = aplicar(estado, { tipo: 'colocarPobladoInicial', jugador, vertice });
      expect(totalCartas(estado.jugadores.find((j) => j.id === jugador)!.recursos)).toBe(0);
      const arista = aristasValidasCarreteraInicial(estado, vertice)[0]!;
      estado = aplicar(estado, { tipo: 'colocarCarreteraInicial', jugador, arista });
    }
    expect(idActual(estado)).toBe('j2');
    const { estado: despues, eventos } = aplicarConEventos(estado, {
      tipo: 'colocarPobladoInicial',
      jugador: 'j2',
      vertice: objetivo,
    });
    expect(despues.jugadores[2]!.recursos).toEqual({ madera: 1, arcilla: 1, trigo: 0, oveja: 1, mineral: 0 });
    expect(despues.banca.madera).toBe(18);
    expect(eventos).toContainEqual({ tipo: 'recursosIniciales', jugador: 'j2', recursos: { madera: 1, arcilla: 1, oveja: 1 } });
  });

  it('rechaza colocaciones inválidas', () => {
    const estado = nuevaPartida(3);
    const vertice = idVerticeEsquina(axial(0, 0), 0);
    expect(error(estado, { tipo: 'colocarPobladoInicial', jugador: 'j1', vertice })).toBe('No es tu turno');
    expect(error(estado, { tipo: 'colocarCarreteraInicial', jugador: 'j0', arista: 'A:0,0|1,0' })).toMatch(
      /Primero debes colocar un poblado/,
    );
    const conPoblado = aplicar(estado, { tipo: 'colocarPobladoInicial', jugador: 'j0', vertice });
    expect(error(conPoblado, { tipo: 'colocarPobladoInicial', jugador: 'j0', vertice })).toMatch(/carretera/);

    const lejana = [...grafoDe(conPoblado).aristas.keys()].find(
      (a) => !grafoDe(conPoblado).arista(a).vertices.includes(vertice),
    )!;
    expect(error(conPoblado, { tipo: 'colocarCarreteraInicial', jugador: 'j0', arista: lejana })).toMatch(
      /debe salir del poblado/,
    );

    const arista = aristasValidasCarreteraInicial(conPoblado, vertice)[0]!;
    const turnoDeJ1 = aplicar(conPoblado, { tipo: 'colocarCarreteraInicial', jugador: 'j0', arista });
    const vecino = grafoDe(estado).verticesAdyacentes(vertice)[0]!;
    expect(error(turnoDeJ1, { tipo: 'colocarPobladoInicial', jugador: 'j1', vertice: vecino })).toMatch(/2 aristas/);
  });

  it('al terminar empieza el turno 1 del primer jugador', () => {
    const estado = colocacionAutomatica(nuevaPartida(4));
    expect(estado.fase).toEqual({ tipo: 'tirarDados' });
    expect(estado.turno).toEqual({ numero: 1, jugadorActual: 0, dados: null, haJugadoCartaDesarrollo: false });
    for (const j of estado.jugadores) {
      expect(j.piezas).toEqual({ carreteras: 13, poblados: 3, ciudades: 4 });
    }
    expect(Object.keys(estado.tablero.edificios)).toHaveLength(8);
    expect(Object.keys(estado.tablero.carreteras)).toHaveLength(8);
  });
});

describe('Turnos', () => {
  it('hay que tirar los dados antes de terminar el turno', () => {
    const estado = colocacionAutomatica(nuevaPartida(3));
    expect(error(estado, { tipo: 'finalizarTurno', jugador: 'j0' })).toMatch(/tirar los dados/);
    expect(error(estado, { tipo: 'construirCarretera', jugador: 'j0', arista: 'x' })).toMatch(/tirar los dados/);
  });

  it('finalizar el turno pasa al siguiente jugador', () => {
    const estado = partidaEnAcciones(3);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'finalizarTurno', jugador: 'j0' });
    expect(despues.turno).toEqual({ numero: 2, jugadorActual: 1, dados: null, haJugadoCartaDesarrollo: false });
    expect(despues.fase).toEqual({ tipo: 'tirarDados' });
    expect(eventos).toEqual([{ tipo: 'turnoIniciado', jugador: 'j1', numero: 2 }]);

    let vuelta = despues;
    for (const jugador of ['j1', 'j2']) {
      vuelta = tirarHasta(vuelta, (s) => s !== 7);
      vuelta = aplicar(vuelta, { tipo: 'finalizarTurno', jugador });
    }
    expect(idActual(vuelta)).toBe('j0');
  });

  it('no modifica el estado original', () => {
    const estado = partidaEnAcciones(3);
    const copia = JSON.parse(JSON.stringify(estado));
    aplicar(estado, { tipo: 'finalizarTurno', jugador: 'j0' });
    expect(JSON.parse(JSON.stringify(estado))).toEqual(copia);
  });
});

describe('Determinismo y serialización', () => {
  it('la misma semilla y las mismas acciones dan el mismo estado', () => {
    const a = tirarHasta(colocacionAutomatica(nuevaPartida(3, 7)), () => true);
    const b = tirarHasta(colocacionAutomatica(nuevaPartida(3, 7)), () => true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('el estado sobrevive a JSON y se puede seguir jugando', () => {
    const estado = colocacionAutomatica(nuevaPartida(3));
    const transportado: EstadoJuego = JSON.parse(JSON.stringify(estado));
    expect(transportado).toEqual(estado);
    const tirada = aplicarAccion(transportado, { tipo: 'tirarDados', jugador: 'j0' });
    expect(tirada.ok).toBe(true);
  });
});

describe('Registro en español', () => {
  const estado = nuevaPartida(3);

  it('oculta la carta robada a los demás jugadores', () => {
    const robo = { tipo: 'robo', jugador: 'j0', victima: 'j1', recurso: 'trigo' } as const;
    expect(describirEvento(robo, estado, { observador: 'j2' })).toBe('Ana robó una carta a Beto');
    expect(describirEvento(robo, estado, { observador: 'j1' })).toBe('Ana robó 1 Trigo a Beto');
  });

  it('describe tiradas, comercio y victoria', () => {
    expect(describirEvento({ tipo: 'dadosTirados', jugador: 'j1', dados: [3, 5] }, estado)).toBe('Beto sacó 8 (3 y 5)');
    expect(
      describirEvento({ tipo: 'comercioBanca', jugador: 'j0', entrega: { madera: 4 }, recibe: { mineral: 1 } }, estado),
    ).toBe('Ana cambió 4 Madera por 1 Mineral con la banca');
    expect(describirEvento({ tipo: 'victoria', jugador: 'j2', puntos: 10 }, estado)).toBe(
      '¡Carla ganó la partida con 10 puntos!',
    );
    expect(
      describirEvento({ tipo: 'tituloCambiado', titulo: 'granRuta', jugador: null, anterior: 'j0' }, estado),
    ).toBe('Ana perdió la Gran Ruta Comercial');
  });
});

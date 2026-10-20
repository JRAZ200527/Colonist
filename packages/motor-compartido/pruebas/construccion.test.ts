import { describe, expect, it } from 'vitest';
import {
  aristasValidasCarretera,
  grafoDe,
  idVerticeEsquina,
  ORIGEN,
  puntosDeVictoria,
  verticesValidosPoblado,
  type EstadoJuego,
  type IdVertice,
} from '../src/index.js';
import { aplicar, aplicarConEventos, conRecursos, error, modificar, partidaEnAcciones } from './ayudantes.js';

/** Camino A — B — C alrededor del hexágono central, con un poblado de j0 en A y carretera A-B. */
function escenario() {
  const base = partidaEnAcciones(3);
  const grafo = grafoDe(base);
  const a: IdVertice = idVerticeEsquina(ORIGEN, 0);
  const b: IdVertice = idVerticeEsquina(ORIGEN, 1);
  const c: IdVertice = idVerticeEsquina(ORIGEN, 2);
  const ab = grafo.aristaEntre(a, b)!;
  const bc = grafo.aristaEntre(b, c)!;
  const estado = modificar(base, (e) => {
    e.tablero.edificios[a] = { tipo: 'poblado', jugador: 'j0' };
    e.tablero.carreteras[ab] = 'j0';
  });
  return { estado, grafo, a, b, c, ab, bc };
}

const MUCHOS = { madera: 5, arcilla: 5, trigo: 5, oveja: 5, mineral: 5 };

describe('Carreteras', () => {
  it('se construyen conectadas y cuestan 1 Madera y 1 Arcilla', () => {
    const { estado, bc } = escenario();
    const conCartas = conRecursos(estado, 'j0', { madera: 1, arcilla: 1, trigo: 1 });
    const { estado: despues, eventos } = aplicarConEventos(conCartas, { tipo: 'construirCarretera', jugador: 'j0', arista: bc });
    expect(despues.tablero.carreteras[bc]).toBe('j0');
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 0, arcilla: 0, trigo: 1, oveja: 0, mineral: 0 });
    expect(despues.jugadores[0]!.piezas.carreteras).toBe(14);
    expect(despues.banca.madera).toBe(19);
    expect(eventos).toEqual([{ tipo: 'carreteraConstruida', jugador: 'j0', arista: bc, gratis: false }]);
  });

  it('rechaza carreteras sueltas, ocupadas o sin recursos', () => {
    const { estado, grafo, ab, bc, a } = escenario();
    const conCartas = conRecursos(estado, 'j0', MUCHOS);
    const suelta = [...grafo.aristas.keys()].find((x) => !aristasValidasCarretera(conCartas, 'j0').includes(x) && x !== ab)!;
    expect(error(conCartas, { tipo: 'construirCarretera', jugador: 'j0', arista: suelta })).toMatch(/conectada/);
    expect(error(conCartas, { tipo: 'construirCarretera', jugador: 'j0', arista: ab })).toMatch(/libre/);
    expect(error(estado, { tipo: 'construirCarretera', jugador: 'j0', arista: bc })).toBe('No tienes suficientes recursos');
    expect(aristasValidasCarretera(conCartas, 'j0')).toHaveLength(4);
    expect(grafo.aristasDeVertice(a)).toContain(ab);
  });

  it('un edificio rival corta la conexión', () => {
    const { estado, b, bc } = escenario();
    const bloqueado = modificar(conRecursos(estado, 'j0', MUCHOS), (e) => {
      e.tablero.edificios[b] = { tipo: 'poblado', jugador: 'j1' };
    });
    expect(error(bloqueado, { tipo: 'construirCarretera', jugador: 'j0', arista: bc })).toMatch(/conectada/);
  });

  it('sin piezas no se puede construir', () => {
    const { estado, bc } = escenario();
    const sinPiezas = modificar(conRecursos(estado, 'j0', MUCHOS), (e) => {
      e.jugadores[0]!.piezas.carreteras = 0;
    });
    expect(error(sinPiezas, { tipo: 'construirCarretera', jugador: 'j0', arista: bc })).toBe('No te quedan carreteras');
  });

  it('solo el jugador en turno construye', () => {
    const { estado, bc } = escenario();
    expect(error(conRecursos(estado, 'j1', MUCHOS), { tipo: 'construirCarretera', jugador: 'j1', arista: bc })).toBe(
      'No es tu turno',
    );
  });
});

describe('Poblados', () => {
  function conCamino(): ReturnType<typeof escenario> & { estado: EstadoJuego } {
    const datos = escenario();
    const estado = modificar(conRecursos(datos.estado, 'j0', MUCHOS), (e) => {
      e.tablero.carreteras[datos.bc] = 'j0';
    });
    return { ...datos, estado };
  }

  it('se construyen junto a una carretera propia y respetando la distancia', () => {
    const { estado, c } = conCamino();
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'construirPoblado', jugador: 'j0', vertice: c });
    expect(despues.tablero.edificios[c]).toEqual({ tipo: 'poblado', jugador: 'j0' });
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 4, arcilla: 4, trigo: 4, oveja: 4, mineral: 5 });
    expect(despues.jugadores[0]!.piezas.poblados).toBe(4);
    expect(eventos).toContainEqual({ tipo: 'pobladoColocado', jugador: 'j0', vertice: c, inicial: false });
    expect(puntosDeVictoria(despues, 'j0')).toBe(2);
  });

  it('no se puede construir junto a otro poblado ni lejos de las carreteras', () => {
    const { estado, b, grafo, c } = conCamino();
    expect(error(estado, { tipo: 'construirPoblado', jugador: 'j0', vertice: b })).toMatch(/2 aristas/);
    const lejos = [...grafo.vertices.keys()].find(
      (v) => grafo.cumpleReglaDistancia(v, new Set(Object.keys(estado.tablero.edificios))) && v !== c,
    )!;
    expect(verticesValidosPoblado(estado, 'j0')).toEqual([c]);
    expect(error(estado, { tipo: 'construirPoblado', jugador: 'j0', vertice: lejos })).toMatch(/carretera tuya/);
  });

  it('sin piezas no se puede construir', () => {
    const { estado, c } = conCamino();
    const sinPiezas = modificar(estado, (e) => {
      e.jugadores[0]!.piezas.poblados = 0;
    });
    expect(error(sinPiezas, { tipo: 'construirPoblado', jugador: 'j0', vertice: c })).toBe('No te quedan poblados');
  });
});

describe('Ciudades', () => {
  it('mejoran un poblado propio por 2 Trigo y 3 Mineral y devuelven la pieza de poblado', () => {
    const { estado, a } = escenario();
    const conCartas = conRecursos(estado, 'j0', { trigo: 2, mineral: 3 });
    const despues = aplicar(conCartas, { tipo: 'construirCiudad', jugador: 'j0', vertice: a });
    expect(despues.tablero.edificios[a]).toEqual({ tipo: 'ciudad', jugador: 'j0' });
    expect(despues.jugadores[0]!.piezas).toEqual({ carreteras: 15, poblados: 6, ciudades: 3 });
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 });
    expect(puntosDeVictoria(despues, 'j0')).toBe(2);
  });

  it('no se puede mejorar un vértice vacío, una ciudad ni un poblado rival', () => {
    const { estado, a, c } = escenario();
    const conCartas = conRecursos(estado, 'j0', MUCHOS);
    expect(error(conCartas, { tipo: 'construirCiudad', jugador: 'j0', vertice: c })).toMatch(/tus poblados/);
    const ciudad = aplicar(conCartas, { tipo: 'construirCiudad', jugador: 'j0', vertice: a });
    expect(error(ciudad, { tipo: 'construirCiudad', jugador: 'j0', vertice: a })).toMatch(/tus poblados/);
    const rival = modificar(conCartas, (e) => {
      e.tablero.edificios[c] = { tipo: 'poblado', jugador: 'j1' };
    });
    expect(error(rival, { tipo: 'construirCiudad', jugador: 'j0', vertice: c })).toMatch(/tus poblados/);
  });

  it('sin recursos o sin piezas no se puede construir', () => {
    const { estado, a } = escenario();
    expect(error(estado, { tipo: 'construirCiudad', jugador: 'j0', vertice: a })).toBe('No tienes suficientes recursos');
    const sinPiezas = modificar(conRecursos(estado, 'j0', MUCHOS), (e) => {
      e.jugadores[0]!.piezas.ciudades = 0;
    });
    expect(error(sinPiezas, { tipo: 'construirCiudad', jugador: 'j0', vertice: a })).toBe('No te quedan ciudades');
  });
});

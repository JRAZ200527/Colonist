import { describe, expect, it } from 'vitest';
import {
  cartasJugables,
  grafoDe,
  idVerticeEsquina,
  ORIGEN,
  puntosDeVictoria,
  type EstadoJuego,
  type TipoCartaDesarrollo,
} from '../src/index.js';
import { aplicar, aplicarConEventos, conRecursos, error, modificar, partidaEnAcciones } from './ayudantes.js';

/** Partida en el turno 2 de j0 con las cartas dadas, compradas en el turno 1. */
function conCartas(tipos: TipoCartaDesarrollo[], fase: 'tirarDados' | 'acciones' = 'acciones'): EstadoJuego {
  return modificar(partidaEnAcciones(3), (e) => {
    e.turno.numero = 2;
    e.fase = { tipo: fase };
    e.jugadores[0]!.cartasDesarrollo = tipos.map((tipo) => ({ tipo, turnoCompra: 1 }));
  });
}

describe('Comprar cartas de desarrollo', () => {
  it('cuesta 1 Trigo, 1 Oveja y 1 Mineral y se roba del mazo', () => {
    const estado = conRecursos(partidaEnAcciones(3), 'j0', { trigo: 1, oveja: 1, mineral: 1 });
    const carta = estado.mazoDesarrollo.at(-1)!;
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' });
    expect(despues.mazoDesarrollo).toHaveLength(24);
    expect(despues.jugadores[0]!.cartasDesarrollo).toEqual([{ tipo: carta, turnoCompra: 1 }]);
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 });
    expect(eventos).toEqual([{ tipo: 'cartaDesarrolloComprada', jugador: 'j0', carta }]);
  });

  it('no se puede comprar con el mazo vacío ni sin recursos', () => {
    const estado = partidaEnAcciones(3);
    expect(error(estado, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' })).toBe('No tienes suficientes recursos');
    const vacio = modificar(conRecursos(estado, 'j0', { trigo: 1, oveja: 1, mineral: 1 }), (e) => {
      e.mazoDesarrollo = [];
    });
    expect(error(vacio, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' })).toBe('No quedan cartas de desarrollo');
  });

  it('no se puede jugar el mismo turno en que se compra', () => {
    const estado = modificar(conRecursos(partidaEnAcciones(3), 'j0', { trigo: 1, oveja: 1, mineral: 1 }), (e) => {
      e.mazoDesarrollo = ['caballero'];
    });
    const despues = aplicar(estado, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' });
    expect(cartasJugables(despues, 'j0')).toEqual([]);
    expect(error(despues, { tipo: 'jugarCaballero', jugador: 'j0' })).toMatch(/mismo turno/);
  });

  it('solo se puede jugar una carta por turno', () => {
    const estado = conCartas(['monopolio', 'abundancia']);
    const despues = aplicar(estado, { tipo: 'jugarMonopolio', jugador: 'j0', recurso: 'trigo' });
    expect(cartasJugables(despues, 'j0')).toEqual([]);
    expect(error(despues, { tipo: 'jugarAbundancia', jugador: 'j0', recursos: ['trigo', 'oveja'] })).toMatch(
      /una carta de desarrollo por turno/,
    );
  });

  it('no se puede jugar una carta que no se tiene', () => {
    expect(error(conCartas([]), { tipo: 'jugarMonopolio', jugador: 'j0', recurso: 'trigo' })).toMatch(
      /ninguna carta de Monopolio/,
    );
  });
});

describe('Caballero y Mayor Ejército', () => {
  it('antes de tirar los dados mueve el ladrón y vuelve a la fase de tirar', () => {
    let estado = conCartas(['caballero'], 'tirarDados');
    expect(cartasJugables(estado, 'j0')).toEqual(['caballero']);
    estado = aplicar(estado, { tipo: 'jugarCaballero', jugador: 'j0' });
    expect(estado.fase).toEqual({ tipo: 'moverLadron', volverA: 'tirarDados' });
    expect(estado.jugadores[0]!.caballerosJugados).toBe(1);
    estado = aplicar(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: '1,0' });
    expect(estado.fase).toEqual({ tipo: 'tirarDados' });
  });

  it('el tercer caballero da el Mayor Ejército (2 puntos)', () => {
    const estado = modificar(conCartas(['caballero']), (e) => {
      e.jugadores[0]!.caballerosJugados = 2;
    });
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'jugarCaballero', jugador: 'j0' });
    expect(despues.titulos.mayorEjercito).toBe('j0');
    expect(puntosDeVictoria(despues, 'j0')).toBe(2);
    expect(eventos).toContainEqual({ tipo: 'tituloCambiado', titulo: 'mayorEjercito', jugador: 'j0', anterior: null });
  });

  it('para quitar el título hay que superar al titular, no empatarlo', () => {
    const base = modificar(conCartas(['caballero']), (e) => {
      e.titulos.mayorEjercito = 'j1';
      e.jugadores[1]!.caballerosJugados = 3;
      e.jugadores[0]!.caballerosJugados = 2;
    });
    expect(aplicar(base, { tipo: 'jugarCaballero', jugador: 'j0' }).titulos.mayorEjercito).toBe('j1');
    const supera = modificar(base, (e) => {
      e.jugadores[0]!.caballerosJugados = 3;
    });
    expect(aplicar(supera, { tipo: 'jugarCaballero', jugador: 'j0' }).titulos.mayorEjercito).toBe('j0');
  });
});

describe('Otras cartas', () => {
  it('Monopolio se lleva todas las cartas de un recurso de los rivales', () => {
    let estado = conCartas(['monopolio']);
    estado = conRecursos(estado, 'j0', { trigo: 1 });
    estado = conRecursos(estado, 'j1', { trigo: 3, oveja: 1 });
    estado = conRecursos(estado, 'j2', { trigo: 2 });
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'jugarMonopolio', jugador: 'j0', recurso: 'trigo' });
    expect(despues.jugadores.map((j) => j.recursos.trigo)).toEqual([6, 0, 0]);
    expect(despues.jugadores[1]!.recursos.oveja).toBe(1);
    expect(eventos).toContainEqual({ tipo: 'monopolio', jugador: 'j0', recurso: 'trigo', cantidad: 5 });
  });

  it('Abundancia da 2 recursos de la banca', () => {
    const despues = aplicar(conCartas(['abundancia']), { tipo: 'jugarAbundancia', jugador: 'j0', recursos: ['mineral', 'mineral'] });
    expect(despues.jugadores[0]!.recursos.mineral).toBe(2);
    expect(despues.banca.mineral).toBe(17);
  });

  it('Abundancia falla si la banca no tiene esos recursos', () => {
    const estado = modificar(conCartas(['abundancia']), (e) => {
      e.banca.mineral = 1;
    });
    expect(error(estado, { tipo: 'jugarAbundancia', jugador: 'j0', recursos: ['mineral', 'mineral'] })).toMatch(/banca/);
  });

  it('Construcción de Carreteras coloca 2 carreteras gratis', () => {
    const vertice = idVerticeEsquina(ORIGEN, 0);
    let estado = modificar(conCartas(['construccionCarreteras']), (e) => {
      e.tablero.edificios[vertice] = { tipo: 'poblado', jugador: 'j0' };
    });
    const grafo = grafoDe(estado);
    estado = aplicar(estado, { tipo: 'jugarConstruccionCarreteras', jugador: 'j0' });
    expect(estado.fase).toEqual({ tipo: 'construccionCarreteras', restantes: 2, volverA: 'acciones' });
    expect(error(estado, { tipo: 'finalizarTurno', jugador: 'j0' })).toMatch(/Construcción de Carreteras/);

    const [primera] = grafo.aristasDeVertice(vertice);
    estado = aplicar(estado, { tipo: 'construirCarretera', jugador: 'j0', arista: primera! });
    expect(estado.fase).toEqual({ tipo: 'construccionCarreteras', restantes: 1, volverA: 'acciones' });
    const [, segunda] = grafo.aristasDeVertice(vertice);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'construirCarretera', jugador: 'j0', arista: segunda! });
    expect(despues.fase).toEqual({ tipo: 'acciones' });
    expect(despues.jugadores[0]!.piezas.carreteras).toBe(13);
    expect(despues.banca).toEqual({ madera: 19, arcilla: 19, trigo: 19, oveja: 19, mineral: 19 });
    expect(eventos).toContainEqual({ tipo: 'carreteraConstruida', jugador: 'j0', arista: segunda, gratis: true });
  });

  it('Construcción de Carreteras termina antes si no quedan piezas', () => {
    const vertice = idVerticeEsquina(ORIGEN, 0);
    const estado = modificar(conCartas(['construccionCarreteras']), (e) => {
      e.tablero.edificios[vertice] = { tipo: 'poblado', jugador: 'j0' };
      e.jugadores[0]!.piezas.carreteras = 1;
    });
    const jugada = aplicar(estado, { tipo: 'jugarConstruccionCarreteras', jugador: 'j0' });
    expect(jugada.fase).toEqual({ tipo: 'construccionCarreteras', restantes: 1, volverA: 'acciones' });
    const arista = grafoDe(estado).aristasDeVertice(vertice)[0]!;
    expect(aplicar(jugada, { tipo: 'construirCarretera', jugador: 'j0', arista }).fase).toEqual({ tipo: 'acciones' });
  });

  it('las cartas de Punto de Victoria cuentan, pero los rivales no las ven', () => {
    const estado = conCartas(['puntoVictoria', 'puntoVictoria']);
    expect(puntosDeVictoria(estado, 'j0')).toBe(2);
    expect(puntosDeVictoria(estado, 'j0', false)).toBe(0);
    expect(cartasJugables(estado, 'j0')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { tasasComercio, type EstadoJuego } from '../src/index.js';
import { aplicar, aplicarConEventos, conRecursos, error, modificar, partidaEnAcciones } from './ayudantes.js';

describe('Comercio con la banca', () => {
  const base = conRecursos(partidaEnAcciones(3), 'j0', { madera: 8, arcilla: 3, oveja: 2 });

  /** Poblado de j0 en el puerto indicado (0 = genérico, 1 = Arcilla en el mapa clásico fijo). */
  function conPuerto(estado: EstadoJuego, indicePuerto: number): EstadoJuego {
    return modificar(estado, (e) => {
      e.tablero.edificios[e.tablero.puertos[indicePuerto]!.vertices[0]] = { tipo: 'poblado', jugador: 'j0' };
    });
  }

  it('cambia 4:1 sin puertos, varias cartas a la vez', () => {
    expect(tasasComercio(base, 'j0')).toEqual({ madera: 4, arcilla: 4, trigo: 4, oveja: 4, mineral: 4 });
    const { estado, eventos } = aplicarConEventos(base, {
      tipo: 'comerciarConBanca',
      jugador: 'j0',
      entrega: { madera: 8 },
      recibe: { trigo: 1, mineral: 1 },
    });
    expect(estado.jugadores[0]!.recursos).toEqual({ madera: 0, arcilla: 3, trigo: 1, oveja: 2, mineral: 1 });
    expect(estado.banca.madera).toBe(19);
    expect(estado.banca.trigo).toBe(18);
    expect(eventos).toEqual([
      { tipo: 'comercioBanca', jugador: 'j0', entrega: { madera: 8 }, recibe: { trigo: 1, mineral: 1 } },
    ]);
  });

  it('el puerto genérico permite 3:1', () => {
    const estado = conPuerto(base, 0);
    expect(tasasComercio(estado, 'j0').arcilla).toBe(3);
    const despues = aplicar(estado, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: { arcilla: 3 }, recibe: { trigo: 1 } });
    expect(despues.jugadores[0]!.recursos.trigo).toBe(1);
    expect(error(base, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: { arcilla: 3 }, recibe: { trigo: 1 } })).toMatch(
      /Arcilla se cambia a 4:1/,
    );
  });

  it('el puerto específico permite 2:1 solo con su recurso', () => {
    const estado = conPuerto(base, 1);
    expect(tasasComercio(estado, 'j0')).toEqual({ madera: 4, arcilla: 2, trigo: 4, oveja: 4, mineral: 4 });
    const despues = aplicar(estado, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: { arcilla: 2 }, recibe: { oveja: 1 } });
    expect(despues.jugadores[0]!.recursos.oveja).toBe(3);
  });

  it('el puerto es de quien tiene el edificio, no de los demás', () => {
    const estado = conPuerto(base, 1);
    expect(tasasComercio(estado, 'j1').arcilla).toBe(4);
  });

  it('rechaza cambios mal planteados', () => {
    const cambio = (entrega: object, recibe: object) =>
      error(base, { tipo: 'comerciarConBanca', jugador: 'j0', entrega, recibe });
    expect(cambio({ madera: 4 }, { madera: 1 })).toMatch(/mismo recurso/);
    expect(cambio({ madera: 4 }, { trigo: 2 })).toMatch(/no corresponde/);
    expect(cambio({ madera: 4 }, {})).toMatch(/no corresponde/);
    expect(cambio({ madera: -4 }, { trigo: 1 })).toMatch(/inválidas/);
    expect(cambio({ oveja: 4 }, { trigo: 1 })).toBe('No tienes suficientes recursos');
    const sinTrigo = modificar(base, (e) => {
      e.banca.trigo = 0;
    });
    expect(error(sinTrigo, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: { madera: 4 }, recibe: { trigo: 1 } })).toMatch(
      /banca/,
    );
  });
});

describe('Comercio entre jugadores', () => {
  function base(): EstadoJuego {
    let estado = partidaEnAcciones(3);
    estado = conRecursos(estado, 'j0', { madera: 2, oveja: 1 });
    estado = conRecursos(estado, 'j1', { trigo: 2 });
    estado = conRecursos(estado, 'j2', { mineral: 1, trigo: 1 });
    return estado;
  }

  it('el jugador en turno propone, otro acepta y se confirma el intercambio', () => {
    let estado = aplicar(base(), { tipo: 'proponerOferta', jugador: 'j0', ofrece: { madera: 1 }, pide: { trigo: 1 } });
    expect(estado.ofertas).toEqual([
      { id: 1, autor: 'j0', destinatario: null, ofrece: { madera: 1 }, pide: { trigo: 1 }, aceptadaPor: [], rechazadaPor: [] },
    ]);
    estado = aplicar(estado, { tipo: 'responderOferta', jugador: 'j1', idOferta: 1, acepta: true });
    estado = aplicar(estado, { tipo: 'responderOferta', jugador: 'j2', idOferta: 1, acepta: false });
    expect(estado.ofertas[0]!.aceptadaPor).toEqual(['j1']);
    expect(estado.ofertas[0]!.rechazadaPor).toEqual(['j2']);

    expect(error(estado, { tipo: 'confirmarOferta', jugador: 'j0', idOferta: 1, con: 'j2' })).toMatch(/no ha aceptado/);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'confirmarOferta', jugador: 'j0', idOferta: 1, con: 'j1' });
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 1, arcilla: 0, trigo: 1, oveja: 1, mineral: 0 });
    expect(despues.jugadores[1]!.recursos).toEqual({ madera: 1, arcilla: 0, trigo: 1, oveja: 0, mineral: 0 });
    expect(despues.ofertas).toEqual([]);
    expect(eventos).toEqual([
      { tipo: 'comercioJugadores', de: 'j0', con: 'j1', entrega: { madera: 1 }, recibe: { trigo: 1 } },
    ]);
  });

  it('los demás jugadores pueden hacer contraofertas al jugador en turno', () => {
    let estado = aplicar(base(), { tipo: 'proponerOferta', jugador: 'j0', ofrece: { madera: 1 }, pide: { trigo: 1 } });
    estado = aplicar(estado, { tipo: 'proponerOferta', jugador: 'j2', ofrece: { mineral: 1 }, pide: { madera: 2 } });
    const contraoferta = estado.ofertas[1]!;
    expect(contraoferta.destinatario).toBe('j0');
    expect(error(estado, { tipo: 'responderOferta', jugador: 'j1', idOferta: contraoferta.id, acepta: true })).toMatch(
      /no va dirigida a ti/,
    );
    expect(error(estado, { tipo: 'confirmarOferta', jugador: 'j2', idOferta: contraoferta.id, con: 'j0' })).toBe(
      'No es tu turno',
    );
    const despues = aplicar(estado, { tipo: 'confirmarOferta', jugador: 'j0', idOferta: contraoferta.id, con: 'j2' });
    expect(despues.jugadores[0]!.recursos).toEqual({ madera: 0, arcilla: 0, trigo: 0, oveja: 1, mineral: 1 });
    expect(despues.jugadores[2]!.recursos).toEqual({ madera: 2, arcilla: 0, trigo: 1, oveja: 0, mineral: 0 });
  });

  it('valida las cartas al proponer, aceptar y confirmar', () => {
    const estado = base();
    expect(error(estado, { tipo: 'proponerOferta', jugador: 'j0', ofrece: { mineral: 1 }, pide: { trigo: 1 } })).toMatch(
      /No tienes las cartas que ofreces/,
    );
    expect(error(estado, { tipo: 'proponerOferta', jugador: 'j0', ofrece: { madera: 1 }, pide: {} })).toMatch(/al menos una carta/);
    expect(error(estado, { tipo: 'proponerOferta', jugador: 'j0', ofrece: { madera: 1 }, pide: { madera: 1 } })).toMatch(
      /mismo recurso/,
    );
    const conOferta = aplicar(estado, { tipo: 'proponerOferta', jugador: 'j0', ofrece: { oveja: 1 }, pide: { mineral: 1 } });
    expect(error(conOferta, { tipo: 'responderOferta', jugador: 'j1', idOferta: 1, acepta: true })).toMatch(
      /No tienes las cartas que pide/,
    );
    expect(error(conOferta, { tipo: 'responderOferta', jugador: 'j0', idOferta: 1, acepta: true })).toMatch(/propia oferta/);

    // j2 acepta y luego pierde la carta antes de la confirmación.
    let aceptada = aplicar(conOferta, { tipo: 'responderOferta', jugador: 'j2', idOferta: 1, acepta: true });
    aceptada = conRecursos(aceptada, 'j2', { trigo: 1 });
    expect(error(aceptada, { tipo: 'confirmarOferta', jugador: 'j0', idOferta: 1, con: 'j2' })).toMatch(
      /otro jugador ya no tiene/,
    );
  });

  it('solo el autor retira su oferta y al terminar el turno se borran todas', () => {
    let estado = aplicar(base(), { tipo: 'proponerOferta', jugador: 'j0', ofrece: { madera: 1 }, pide: { trigo: 1 } });
    expect(error(estado, { tipo: 'retirarOferta', jugador: 'j1', idOferta: 1 })).toMatch(/Solo el autor/);
    expect(aplicar(estado, { tipo: 'retirarOferta', jugador: 'j0', idOferta: 1 }).ofertas).toEqual([]);
    estado = aplicar(estado, { tipo: 'finalizarTurno', jugador: 'j0' });
    expect(estado.ofertas).toEqual([]);
    expect(error(estado, { tipo: 'responderOferta', jugador: 'j1', idOferta: 1, acepta: true })).toMatch(/tirar los dados/);
  });
});

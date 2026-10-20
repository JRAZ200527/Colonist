import { describe, expect, it } from 'vitest';
import {
  calcularProduccion,
  CoordenadasCubicas,
  grafoDe,
  idVerticeEsquina,
  totalCartas,
  type EstadoJuego,
} from '../src/index.js';
import {
  aplicar,
  aplicarConEventos,
  colocacionAutomatica,
  conRecursos,
  error,
  modificar,
  nuevaPartida,
  partidaEnAcciones,
  tirarHasta,
} from './ayudantes.js';

const axial = CoordenadasCubicas.desdeAxiales;

// (2, 0) es Mineral con un 8 y (-2, 0) es Madera con otro 8.
const MINERAL_8 = '2,0';
const MADERA_8 = '-2,0';

function conEdificios(estado: EstadoJuego): EstadoJuego {
  return modificar(estado, (e) => {
    e.tablero.edificios[idVerticeEsquina(axial(2, 0), 0)] = { tipo: 'poblado', jugador: 'j0' };
    e.tablero.edificios[idVerticeEsquina(axial(2, 0), 2)] = { tipo: 'ciudad', jugador: 'j1' };
    e.tablero.edificios[idVerticeEsquina(axial(-2, 0), 3)] = { tipo: 'poblado', jugador: 'j2' };
  });
}

describe('Producción de recursos', () => {
  const estado = conEdificios(partidaEnAcciones(3));

  it('los poblados reciben 1 carta y las ciudades 2', () => {
    const reparto = calcularProduccion(estado, 8);
    expect(reparto.j0!.mineral).toBe(1);
    expect(reparto.j1!.mineral).toBe(2);
    expect(reparto.j2!.madera).toBe(1);
  });

  it('el hexágono con el ladrón no produce', () => {
    const conLadron = modificar(estado, (e) => {
      e.tablero.ladron = MINERAL_8;
    });
    const reparto = calcularProduccion(conLadron, 8);
    expect(reparto.j0!.mineral).toBe(0);
    expect(reparto.j1!.mineral).toBe(0);
    expect(reparto.j2!.madera).toBe(1);
  });

  it('si la banca no alcanza para todos, nadie recibe ese recurso', () => {
    const escasez = modificar(estado, (e) => {
      e.banca.mineral = 2;
    });
    const reparto = calcularProduccion(escasez, 8);
    expect(reparto.j0!.mineral).toBe(0);
    expect(reparto.j1!.mineral).toBe(0);
    expect(reparto.j2!.madera).toBe(1);
  });

  it('si solo hay un beneficiario, se lleva lo que quede en la banca', () => {
    const escasez = modificar(estado, (e) => {
      e.banca.mineral = 1;
      delete e.tablero.edificios[idVerticeEsquina(axial(2, 0), 0)];
    });
    expect(calcularProduccion(escasez, 8).j1!.mineral).toBe(1);
  });

  it('tirar los dados reparte los recursos y pasa a la fase de acciones', () => {
    const listo = modificar(conEdificios(partidaEnAcciones(3)), (e) => {
      e.fase = { tipo: 'tirarDados' };
      e.turno.dados = null;
    });
    const despues = tirarHasta(listo, (s) => s === 8);
    expect(despues.fase).toEqual({ tipo: 'acciones' });
    expect(despues.jugadores[0]!.recursos.mineral).toBe(1);
    expect(despues.jugadores[1]!.recursos.mineral).toBe(2);
    expect(despues.jugadores[2]!.recursos.madera).toBe(1);
    expect(despues.banca.mineral).toBe(16);
  });

  it('los dados equilibrados salen de una baraja de 36 combinaciones', () => {
    let estado = colocacionAutomatica(nuevaPartida(2, 3, { modoDados: 'equilibrado' }));
    const sumas: number[] = [];
    for (let i = 0; i < 31; i++) {
      estado = aplicar(estado, { tipo: 'tirarDados', jugador: estado.jugadores[estado.turno.jugadorActual]!.id });
      sumas.push(estado.turno.dados![0] + estado.turno.dados![1]);
      estado = modificar(estado, (e) => {
        e.fase = { tipo: 'tirarDados' };
      });
    }
    // Antes de volver a barajar (con 5 cartas restantes) salen 31 tiradas sin repetir combinación.
    expect(estado.barajaDados).toHaveLength(5);
    expect(sumas.filter((s) => s === 7).length).toBeLessThanOrEqual(6);
    expect(sumas.filter((s) => s === 2).length).toBeLessThanOrEqual(1);
  });
});

describe('Tirada de 7 y ladrón', () => {
  function preparadoPara7(): EstadoJuego {
    let estado = modificar(partidaEnAcciones(3), (e) => {
      e.fase = { tipo: 'tirarDados' };
      e.turno.dados = null;
    });
    estado = conRecursos(estado, 'j0', { madera: 2, trigo: 1 });
    estado = conRecursos(estado, 'j1', { madera: 4, arcilla: 3, oveja: 3 });
    estado = conRecursos(estado, 'j2', { mineral: 8 });
    return estado;
  }

  it('quien tiene más de 7 cartas descarta la mitad (redondeando hacia abajo)', () => {
    const estado = tirarHasta(preparadoPara7(), (s) => s === 7);
    expect(estado.fase).toEqual({ tipo: 'descartar', pendientes: { j1: 5, j2: 4 } });
  });

  it('valida el descarte y después hay que mover el ladrón', () => {
    let estado = tirarHasta(preparadoPara7(), (s) => s === 7);
    expect(error(estado, { tipo: 'descartar', jugador: 'j0', recursos: { madera: 1 } })).toBe('No tienes que descartar');
    expect(error(estado, { tipo: 'descartar', jugador: 'j1', recursos: { madera: 4 } })).toMatch(/exactamente 5/);
    expect(error(estado, { tipo: 'descartar', jugador: 'j2', recursos: { trigo: 4 } })).toMatch(/suficientes recursos/);
    expect(error(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: MINERAL_8 })).toMatch(/descarte/);

    estado = aplicar(estado, { tipo: 'descartar', jugador: 'j2', recursos: { mineral: 4 } });
    expect(estado.fase).toEqual({ tipo: 'descartar', pendientes: { j1: 5 } });
    estado = aplicar(estado, { tipo: 'descartar', jugador: 'j1', recursos: { madera: 2, arcilla: 3 } });
    expect(estado.fase).toEqual({ tipo: 'moverLadron', volverA: 'acciones' });
    expect(totalCartas(estado.jugadores[1]!.recursos)).toBe(5);
    expect(estado.banca.mineral).toBe(19 - 4);
  });

  it('sin descartes pendientes se pasa directamente a mover el ladrón', () => {
    let estado = modificar(partidaEnAcciones(3), (e) => {
      e.fase = { tipo: 'tirarDados' };
    });
    estado = tirarHasta(estado, (s) => s === 7);
    expect(estado.fase).toEqual({ tipo: 'moverLadron', volverA: 'acciones' });
  });

  it('el ladrón debe moverse a otro hexágono de tierra', () => {
    const estado = modificar(partidaEnAcciones(3), (e) => {
      e.fase = { tipo: 'moverLadron', volverA: 'acciones' };
    });
    expect(error(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: '0,0' })).toMatch(/otro hexágono/);
    expect(error(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: '9,9' })).toMatch(/otro hexágono/);
    expect(error(estado, { tipo: 'moverLadron', jugador: 'j1', hexagono: MINERAL_8 })).toBe('No es tu turno');
  });

  it('con una sola víctima posible roba automáticamente', () => {
    let estado = modificar(conEdificios(partidaEnAcciones(3)), (e) => {
      e.fase = { tipo: 'moverLadron', volverA: 'acciones' };
    });
    estado = conRecursos(estado, 'j2', { oveja: 1 });
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: MADERA_8 });
    expect(despues.tablero.ladron).toBe(MADERA_8);
    expect(despues.fase).toEqual({ tipo: 'acciones' });
    expect(despues.jugadores[0]!.recursos.oveja).toBe(1);
    expect(despues.jugadores[2]!.recursos.oveja).toBe(0);
    expect(eventos).toContainEqual({ tipo: 'robo', jugador: 'j0', victima: 'j2', recurso: 'oveja' });
  });

  it('no se roba a jugadores sin cartas ni a uno mismo', () => {
    const estado = modificar(conEdificios(partidaEnAcciones(3)), (e) => {
      e.fase = { tipo: 'moverLadron', volverA: 'acciones' };
    });
    // En el Mineral 8 están j0 (el ladrón) y j1, que no tiene cartas.
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'moverLadron', jugador: 'j0', hexagono: MINERAL_8 });
    expect(despues.fase).toEqual({ tipo: 'acciones' });
    expect(eventos.some((e) => e.tipo === 'robo')).toBe(false);
  });

  it('con varias víctimas hay que elegir a quién robar', () => {
    let estado = modificar(conEdificios(partidaEnAcciones(3)), (e) => {
      e.fase = { tipo: 'moverLadron', volverA: 'acciones' };
      e.turno.jugadorActual = 2;
    });
    estado = conRecursos(estado, 'j0', { trigo: 2 });
    estado = conRecursos(estado, 'j1', { arcilla: 1 });
    estado = aplicar(estado, { tipo: 'moverLadron', jugador: 'j2', hexagono: MINERAL_8 });
    expect(estado.fase).toEqual({ tipo: 'robar', victimas: ['j0', 'j1'], volverA: 'acciones' });
    expect(error(estado, { tipo: 'robar', jugador: 'j2', victima: 'j2' })).toMatch(/No puedes robar/);
    estado = aplicar(estado, { tipo: 'robar', jugador: 'j2', victima: 'j1' });
    expect(estado.jugadores[2]!.recursos.arcilla).toBe(1);
    expect(estado.fase).toEqual({ tipo: 'acciones' });
  });

  it('los vértices del hexágono del ladrón se obtienen del grafo', () => {
    const estado = partidaEnAcciones(3);
    expect(grafoDe(estado).hexagono(MINERAL_8).vertices).toHaveLength(6);
  });
});

import {
  aplicarAccion,
  crearPartida,
  idVerticeEsquina,
  ORIGEN,
  verticesValidosPoblado,
  vistaParaJugador,
  type EstadoJuego,
  type EventoVisible,
  type VistaPartida,
  type VistaSala,
} from '@colonist/motor-compartido';
import { describe, expect, it } from 'vitest';
import {
  accionesDisponibles,
  calcularObjetivos,
  cartasJugables,
  instruccion,
  modoEfectivo,
} from '../src/estado/derivados.js';
import { DATOS_INICIALES, procesarMensaje, type DatosServidor } from '../src/estado/mensajes.js';

function partida(): EstadoJuego {
  return crearPartida({
    jugadores: [
      { id: 'ana', nombre: 'Ana' },
      { id: 'beto', nombre: 'Beto' },
    ],
    semilla: 1,
  });
}

function aplicar(estado: EstadoJuego, accion: Parameters<typeof aplicarAccion>[1]): EstadoJuego {
  const r = aplicarAccion(estado, accion);
  if (!r.ok) {
    throw new Error(r.error);
  }
  return r.estado;
}

/** Partida en la fase de acciones del turno 2 de Ana, con la mano indicada. */
function enAcciones(recursos: Partial<EstadoJuego['jugadores'][number]['recursos']> = {}): EstadoJuego {
  const estado = structuredClone(partida());
  estado.fase = { tipo: 'acciones' };
  estado.turno = { numero: 2, jugadorActual: 0, dados: [2, 3], haJugadoCartaDesarrollo: false };
  Object.assign(estado.jugadores[0]!.recursos, recursos);
  return estado;
}

const SALA: VistaSala = {
  id: 's1',
  nombre: 'Mesa',
  anfitrion: 'ana',
  configuracion: {
    plantilla: 'clasico',
    modoMapa: 'equilibrado',
    modoDados: 'aleatorio',
    puntosVictoria: 10,
    maxJugadores: 4,
    privada: false,
    ciudadesYCaballeros: false,
  },
  asientos: [],
  estado: 'jugando',
};

describe('Procesamiento de mensajes del servidor', () => {
  const vista = vistaParaJugador(partida(), 'ana');

  it('guarda la identidad al recibir la bienvenida', () => {
    expect(procesarMensaje(DATOS_INICIALES, { tipo: 'bienvenida', token: 't', idJugador: 'ana', nombre: 'Ana', reconectado: false })).toEqual({
      yo: { idJugador: 'ana', nombre: 'Ana' },
    });
  });

  it('acumula los eventos de la partida y los reemplaza con el registro completo', () => {
    let datos: DatosServidor = { ...DATOS_INICIALES, sala: SALA };
    const evento = { tipo: 'pobladoColocado', jugador: 'ana', vertice: 'v', inicial: true } as const;
    datos = { ...datos, ...procesarMensaje(datos, { tipo: 'partida', vista, eventos: [evento], registroCompleto: false }) };
    datos = { ...datos, ...procesarMensaje(datos, { tipo: 'partida', vista, eventos: [evento], registroCompleto: false }) };
    expect(datos.registro).toHaveLength(2);
    datos = { ...datos, ...procesarMensaje(datos, { tipo: 'partida', vista, eventos: [evento], registroCompleto: true }) };
    expect(datos.registro).toHaveLength(1);
  });

  it('cuenta las tiradas para poder animar dos tiradas iguales seguidas', () => {
    let datos: DatosServidor = DATOS_INICIALES;
    const tirada: EventoVisible = { tipo: 'dadosTirados', jugador: 'ana', dados: [3, 3] };
    datos = { ...datos, ...procesarMensaje(datos, { tipo: 'partida', vista, eventos: [tirada], registroCompleto: false }) };
    datos = { ...datos, ...procesarMensaje(datos, { tipo: 'partida', vista, eventos: [tirada], registroCompleto: false }) };
    expect(datos.ultimaTirada).toEqual({ dados: [3, 3], jugador: 'ana', numero: 2 });
  });

  it('al salir de la sala olvida la partida, y los errores se muestran como avisos', () => {
    const datos: DatosServidor = { ...DATOS_INICIALES, sala: SALA, partida: vista, registro: [] };
    expect(procesarMensaje(datos, { tipo: 'sala', sala: null })).toMatchObject({ sala: null, partida: null });
    const conError = procesarMensaje(datos, { tipo: 'error', mensaje: 'No es tu turno' });
    expect(conError.avisos).toEqual([expect.objectContaining({ texto: 'No es tu turno', tipo: 'error' })]);
  });

  it('cambiar a otra sala borra el chat y la partida anteriores', () => {
    const datos: DatosServidor = {
      ...DATOS_INICIALES,
      sala: SALA,
      partida: vista,
      chat: [{ de: 'ana', nombre: 'Ana', texto: 'hola', hora: 1 }],
    };
    expect(procesarMensaje(datos, { tipo: 'sala', sala: { ...SALA, id: 'otra' } })).toMatchObject({ partida: null, chat: [] });
    expect(procesarMensaje(datos, { tipo: 'sala', sala: { ...SALA, nombre: 'Renombrada' } })).toEqual({
      sala: { ...SALA, nombre: 'Renombrada' },
    });
  });
});

describe('Datos derivados para la interfaz', () => {
  it('en la colocación inicial el modo lo impone la fase y se marcan los vértices válidos', () => {
    const estado = partida();
    const vista = vistaParaJugador(estado, 'ana');
    expect(modoEfectivo(vista, 'ana', 'ninguno')).toBe('poblado');
    expect(modoEfectivo(vista, 'beto', 'ninguno')).toBe('ninguno');
    const objetivos = calcularObjetivos(vista, 'ana', 'poblado');
    expect(objetivos.vertices.size).toBe(verticesValidosPoblado(estado, 'ana', true).length);
    expect(instruccion(vista, 'ana')).toMatch(/Coloca un poblado/);
    expect(instruccion(vista, 'beto')).toMatch(/Ana está colocando su poblado/);
  });

  it('tras el poblado inicial solo se ofrecen las carreteras que salen de él', () => {
    const vertice = idVerticeEsquina(ORIGEN, 0);
    const estado = aplicar(partida(), { tipo: 'colocarPobladoInicial', jugador: 'ana', vertice });
    const vista = vistaParaJugador(estado, 'ana');
    expect(modoEfectivo(vista, 'ana', 'ninguno')).toBe('carretera');
    expect(calcularObjetivos(vista, 'ana', 'carretera').aristas.size).toBe(3);
  });

  it('activa las acciones según lo que el jugador puede pagar', () => {
    const vista = vistaParaJugador(enAcciones({ madera: 1, arcilla: 1 }), 'ana');
    expect(accionesDisponibles(vista, 'ana')).toEqual({
      tirarDados: false,
      carretera: true,
      poblado: false,
      ciudad: false,
      cartaDesarrollo: false,
      barco: false,
      moverBarco: false,
      comerciar: true,
      finalizarTurno: true,
      pasarConstruccion: false,
    });
    expect(accionesDisponibles(vista, 'beto').finalizarTurno).toBe(false);
  });

  it('solo se pueden jugar cartas compradas en turnos anteriores', () => {
    const estado = enAcciones();
    estado.jugadores[0]!.cartasDesarrollo = [
      { tipo: 'caballero', turnoCompra: 1 },
      { tipo: 'monopolio', turnoCompra: 2 },
      { tipo: 'puntoVictoria', turnoCompra: 1 },
    ];
    const vista: VistaPartida = vistaParaJugador(estado, 'ana');
    expect([...cartasJugables(vista, 'ana')]).toEqual(['caballero']);
    expect([...cartasJugables(vistaParaJugador(estado, 'beto'), 'beto')]).toEqual([]);
  });

  it('con un 7 indica a quién le toca descartar', () => {
    const estado = enAcciones();
    estado.fase = { tipo: 'descartar', pendientes: { beto: 4 } };
    expect(instruccion(vistaParaJugador(estado, 'beto'), 'beto')).toBe('Ha salido un 7: descarta 4 cartas');
    expect(instruccion(vistaParaJugador(estado, 'ana'), 'ana')).toMatch(/esperando/);
  });
});

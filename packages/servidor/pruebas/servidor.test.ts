import { verticesValidosPoblado, type VistaPartida } from '@colonist/motor-compartido';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAplicacion } from '../src/aplicacion.js';
import { RepositorioMemoria } from '../src/persistencia/repositorio.js';
import type { GestorSalas } from '../src/salas/gestorSalas.js';
import { ClientePrueba, esperarHasta } from './clientePrueba.js';

let url: string;
let cerrar: () => Promise<void>;
let salas: GestorSalas;
let repositorio: RepositorioMemoria;
const clientes: ClientePrueba[] = [];

async function arrancar(opciones: { graciaReconexionMs?: number; intervaloLatidoMs?: number } = {}) {
  repositorio = new RepositorioMemoria();
  const app = await crearAplicacion({
    repositorio,
    registros: false,
    retardoBotsMs: 0,
    graciaReconexionMs: opciones.graciaReconexionMs ?? 5_000,
    intervaloLatidoMs: opciones.intervaloLatidoMs ?? 25_000,
    montecarlo: { presupuestoMs: 5, simulaciones: 1, profundidad: 10 },
  });
  await app.servidor.listen({ port: 0, host: '127.0.0.1' });
  const direccion = app.servidor.server.address();
  if (!direccion || typeof direccion === 'string') {
    throw new Error('Sin dirección');
  }
  url = `ws://127.0.0.1:${direccion.port}/ws`;
  salas = app.salas;
  cerrar = () => app.servidor.close();
}

async function entrar(nombre: string, token?: string) {
  const resultado = await ClientePrueba.entrar(url, nombre, token);
  clientes.push(resultado.cliente);
  return resultado;
}

const enTurno = (vista: VistaPartida) => vista.jugadores[vista.turno.jugadorActual]!.id;

afterEach(async () => {
  await Promise.all(clientes.splice(0).map((c) => c.cerrar()));
  await cerrar();
});

describe('Conexión e identificación', () => {
  beforeEach(() => arrancar());

  it('da la bienvenida con un token de sesión y responde a los pings', async () => {
    const { cliente, bienvenida } = await entrar('Ana');
    expect(bienvenida.nombre).toBe('Ana');
    expect(bienvenida.token).toMatch(/^[0-9a-f]{48}$/);
    expect(bienvenida.reconectado).toBe(false);
    cliente.enviar({ tipo: 'ping', t: 123 });
    expect(await cliente.esperar('pong')).toEqual({ tipo: 'pong', t: 123 });
  });

  it('rechaza mensajes inválidos y acciones sin identificarse', async () => {
    const cliente = await ClientePrueba.conectar(url);
    clientes.push(cliente);
    cliente.socket.send('no es json');
    expect((await cliente.esperar('error')).mensaje).toBe('Mensaje con formato inválido');
    cliente.enviar({ tipo: 'inventado' });
    expect((await cliente.esperar('error')).mensaje).toBe('Mensaje no válido');
    cliente.enviar({ tipo: 'listarSalas' });
    expect((await cliente.esperar('error')).mensaje).toMatch(/identificarte/);
    cliente.enviar({ tipo: 'hola', nombre: 'x'.repeat(30) });
    expect((await cliente.esperar('error')).mensaje).toMatch(/24 caracteres/);
  });

  it('el mismo token recupera la identidad', async () => {
    const { cliente, bienvenida } = await entrar('Ana');
    await cliente.cerrar();
    const { bienvenida: otra } = await entrar('Otro nombre', bienvenida.token);
    expect(otra.reconectado).toBe(true);
    expect(otra.idJugador).toBe(bienvenida.idJugador);
    expect(otra.nombre).toBe('Ana');
  });
});

describe('Salas', () => {
  beforeEach(() => arrancar());

  it('crear, listar, unirse, añadir bots y empezar', async () => {
    const { cliente: ana, bienvenida: datosAna } = await entrar('Ana');
    const { cliente: beto } = await entrar('Beto');

    ana.enviar({ tipo: 'crearSala', nombre: 'Mesa 1' });
    const { sala } = await ana.esperar('sala');
    expect(sala).toMatchObject({ nombre: 'Mesa 1', anfitrion: datosAna.idJugador, estado: 'esperando' });

    beto.enviar({ tipo: 'listarSalas' });
    const { salas: lista } = await beto.esperar('salas');
    expect(lista).toEqual([expect.objectContaining({ id: sala!.id, jugadores: 1, maxJugadores: 4 })]);

    beto.enviar({ tipo: 'unirseSala', idSala: sala!.id });
    await ana.esperar('sala', (m) => m.sala?.asientos.length === 2);

    beto.enviar({ tipo: 'anadirBot', nivel: 'facil' });
    expect((await beto.esperar('error')).mensaje).toBe('Solo el anfitrión puede hacer eso');
    beto.enviar({ tipo: 'iniciarPartida' });
    expect((await beto.esperar('error')).mensaje).toBe('Solo el anfitrión puede hacer eso');

    ana.enviar({ tipo: 'anadirBot', nivel: 'medio' });
    const conBot = await ana.esperar('sala', (m) => m.sala?.asientos.length === 3);
    expect(conBot.sala!.asientos[2]).toMatchObject({ tipo: 'bot', nivelBot: 'medio', nombre: 'Alfonso (bot Medio)' });

    ana.enviar({ tipo: 'iniciarPartida' });
    const partidaAna = await ana.esperar('partida');
    const partidaBeto = await beto.esperar('partida');
    expect(partidaAna.registroCompleto).toBe(true);
    expect(partidaAna.vista.jugadores).toHaveLength(3);
    expect((await ana.esperar('sala', (m) => m.sala?.estado === 'jugando')).sala!.estado).toBe('jugando');

    // Cada uno ve su mano, pero no la de los demás; nadie ve el mazo ni la semilla.
    for (const { vista } of [partidaAna, partidaBeto]) {
      for (const j of vista.jugadores) {
        expect(j.recursos === null).toBe(j.id !== vista.observador);
        expect(j.cartasDesarrollo === null).toBe(j.id !== vista.observador);
      }
      expect(vista).not.toHaveProperty('semilla');
      expect(vista).not.toHaveProperty('mazoDesarrollo');
      expect(vista.cartasEnMazo).toBe(25);
    }

    // Ya no se puede entrar.
    const { cliente: carla } = await entrar('Carla');
    carla.enviar({ tipo: 'unirseSala', idSala: sala!.id });
    expect((await carla.esperar('error')).mensaje).toBe('La partida ya ha empezado');
  });

  it('valida el número de jugadores del mapa', async () => {
    const { cliente: ana } = await entrar('Ana');
    ana.enviar({ tipo: 'crearSala', nombre: 'Duelo', configuracion: { plantilla: 'duelo' } });
    const { sala } = await ana.esperar('sala');
    expect(sala!.configuracion).toMatchObject({ plantilla: 'duelo', puntosVictoria: 15, maxJugadores: 2 });
    ana.enviar({ tipo: 'iniciarPartida' });
    expect((await ana.esperar('error')).mensaje).toMatch(/para 2–2 jugadores/);
  });

  it('el anfitrión pasa a otro jugador si se va, y la sala se cierra cuando no queda nadie', async () => {
    const { cliente: ana } = await entrar('Ana');
    const { cliente: beto, bienvenida: datosBeto } = await entrar('Beto');
    ana.enviar({ tipo: 'crearSala', nombre: 'Mesa' });
    const { sala } = await ana.esperar('sala');
    beto.enviar({ tipo: 'unirseSala', idSala: sala!.id });
    await beto.esperar('sala', (m) => m.sala?.asientos.length === 2);
    ana.enviar({ tipo: 'salirSala' });
    const tras = await beto.esperar('sala', (m) => m.sala?.asientos.length === 1);
    expect(tras.sala!.anfitrion).toBe(datosBeto.idJugador);
    beto.enviar({ tipo: 'salirSala' });
    await esperarHasta(() => salas.cantidad === 0);
  });
});

describe('Partida en el servidor', () => {
  beforeEach(() => arrancar());

  async function partidaDeDos() {
    const ana = await entrar('Ana');
    const beto = await entrar('Beto');
    ana.cliente.enviar({ tipo: 'crearSala', nombre: 'Mesa' });
    const { sala } = await ana.cliente.esperar('sala');
    beto.cliente.enviar({ tipo: 'unirseSala', idSala: sala!.id });
    await ana.cliente.esperar('sala', (m) => m.sala?.asientos.length === 2);
    ana.cliente.enviar({ tipo: 'iniciarPartida' });
    const { vista } = await ana.cliente.esperar('partida');
    await beto.cliente.esperar('partida');
    const turnoDeAna = enTurno(vista) === ana.bienvenida.idJugador;
    return { sala: salas.obtener(sala!.id)!, actual: turnoDeAna ? ana : beto, otro: turnoDeAna ? beto : ana };
  }

  it('valida las acciones y las difunde a todos', async () => {
    const { sala, actual, otro } = await partidaDeDos();
    const vertice = verticesValidosPoblado(sala.partida!, actual.bienvenida.idJugador, true)[0]!;

    otro.cliente.enviar({ tipo: 'accion', accion: { tipo: 'colocarPobladoInicial', vertice } });
    expect((await otro.cliente.esperar('error')).mensaje).toBe('No es tu turno');

    actual.cliente.enviar({ tipo: 'accion', accion: { tipo: 'colocarPobladoInicial', vertice } });
    const recibido = await otro.cliente.esperar('partida', (m) => m.eventos.length > 0);
    expect(recibido.registroCompleto).toBe(false);
    expect(recibido.eventos).toEqual([
      { tipo: 'pobladoColocado', jugador: actual.bienvenida.idJugador, vertice, inicial: true },
    ]);
    expect(recibido.vista.tablero.edificios[vertice]).toEqual({ tipo: 'poblado', jugador: actual.bienvenida.idJugador });
  });

  it('no se puede actuar en nombre de otro jugador', async () => {
    const { sala, actual, otro } = await partidaDeDos();
    const vertice = verticesValidosPoblado(sala.partida!, actual.bienvenida.idJugador, true)[0]!;
    // El campo `jugador` se ignora: el servidor usa el de la sesión.
    otro.cliente.enviar({
      tipo: 'accion',
      accion: { tipo: 'colocarPobladoInicial', vertice, jugador: actual.bienvenida.idJugador },
    });
    expect((await otro.cliente.esperar('error')).mensaje).toBe('No es tu turno');
    expect(sala.partida!.tablero.edificios[vertice]).toBeUndefined();
  });

  it('el chat llega a todos los de la sala', async () => {
    const { actual, otro } = await partidaDeDos();
    actual.cliente.enviar({ tipo: 'chat', texto: '¡Hola!' });
    expect(await otro.cliente.esperar('chat')).toMatchObject({ nombre: actual.bienvenida.nombre, texto: '¡Hola!' });
  });

  it('al reconectar con el token se recupera el asiento y la partida completa', async () => {
    const { sala, actual, otro } = await partidaDeDos();
    const vertice = verticesValidosPoblado(sala.partida!, actual.bienvenida.idJugador, true)[0]!;
    actual.cliente.enviar({ tipo: 'accion', accion: { tipo: 'colocarPobladoInicial', vertice } });
    await otro.cliente.esperar('partida', (m) => m.eventos.length > 0);

    await actual.cliente.cerrar();
    const desconectado = await otro.cliente.esperar('sala', (m) =>
      m.sala!.asientos.some((a) => a.idJugador === actual.bienvenida.idJugador && !a.conectado),
    );
    expect(desconectado.sala!.estado).toBe('jugando');

    const vuelta = await entrar('Ana', actual.bienvenida.token);
    expect(vuelta.bienvenida.reconectado).toBe(true);
    const partida = await vuelta.cliente.esperar('partida');
    expect(partida.registroCompleto).toBe(true);
    expect(partida.eventos).toContainEqual(expect.objectContaining({ tipo: 'pobladoColocado', vertice }));
    expect(partida.vista.observador).toBe(actual.bienvenida.idJugador);
    await otro.cliente.esperar('sala', (m) =>
      m.sala!.asientos.every((a) => a.conectado),
    );

    // Puede seguir jugando donde lo dejó.
    const fase = sala.partida!.fase;
    expect(fase).toMatchObject({ tipo: 'colocacionInicial', paso: 'carretera' });
  });
});

describe('Latido y desconexiones', () => {
  it('cierra las conexiones que no responden al ping', async () => {
    await arrancar({ intervaloLatidoMs: 100 });
    const mudo = await ClientePrueba.conectar(url, { autoPong: false });
    clientes.push(mudo);
    const cerrado = new Promise<void>((resolver) => mudo.socket.once('close', () => resolver()));
    await cerrado;

    // Un cliente normal sigue conectado tras varios latidos.
    const { cliente } = await entrar('Ana');
    await new Promise((r) => setTimeout(r, 450));
    cliente.enviar({ tipo: 'ping', t: 1 });
    expect((await cliente.esperar('pong')).t).toBe(1);
  });

  it('un bot sustituye al jugador desconectado y la partida termina y se guarda', { timeout: 120_000 }, async () => {
    await arrancar({ graciaReconexionMs: 50 });
    const { cliente: ana } = await entrar('Ana');
    ana.enviar({ tipo: 'crearSala', nombre: 'Contra bots' });
    const { sala } = await ana.esperar('sala');
    for (const nivel of ['facil', 'medio', 'dificil'] as const) {
      ana.enviar({ tipo: 'anadirBot', nivel });
    }
    await ana.esperar('sala', (m) => m.sala?.asientos.length === 4);
    ana.enviar({ tipo: 'iniciarPartida' });
    await ana.esperar('partida');
    const instancia = salas.obtener(sala!.id)!;

    await ana.cerrar();
    await esperarHasta(() => repositorio.partidas.length === 1, 110_000, 100);

    const resultado = repositorio.partidas[0]!;
    expect(resultado.jugadores).toHaveLength(4);
    expect(resultado.jugadores.filter((j) => j.ganador)).toHaveLength(1);
    expect(resultado.jugadores.filter((j) => !j.esBot).map((j) => j.nombre)).toEqual(['Ana']);
    expect(instancia.estado).toBe('terminada');
    // Nadie quedaba conectado: la sala se cierra sola.
    expect(salas.obtener(sala!.id)).toBeUndefined();
    const ranking = await repositorio.ranking(10);
    expect(ranking).toEqual([expect.objectContaining({ nombre: 'Ana', partidasJugadas: 1 })]);
  });
});

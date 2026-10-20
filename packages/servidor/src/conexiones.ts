/**
 * Conexiones WebSocket: identificación con token, latido (heartbeat) y enrutado
 * de mensajes a las salas.
 *
 * Latido: cada `intervaloLatidoMs` (25 s por defecto) el servidor envía un ping de
 * WebSocket a cada cliente; el navegador responde con un pong automáticamente. Si
 * un cliente no ha respondido desde el ping anterior, se da la conexión por muerta.
 * Además, el cliente envía su propio `{ tipo: 'ping' }`. Con tráfico cada 25 s,
 * el proxy de Render (que corta a los ~100 s sin actividad) mantiene la conexión.
 */

import type { MensajeCliente, MensajeServidor } from '@colonist/motor-compartido';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { leerMensaje } from './mensajes.js';
import type { Repositorio } from './persistencia/repositorio.js';
import type { GestorSalas } from './salas/gestorSalas.js';
import type { GestorSesiones, Sesion } from './sesiones.js';

export interface ContextoConexiones {
  sesiones: GestorSesiones;
  salas: GestorSalas;
  repositorio: Repositorio;
  log: FastifyBaseLogger;
}

const vivos = new WeakMap<WebSocket, boolean>();

/** Arranca el latido sobre un conjunto de sockets; devuelve la función para pararlo. */
export function iniciarLatido(sockets: () => Iterable<WebSocket>, intervaloMs: number): () => void {
  const temporizador = setInterval(() => {
    for (const socket of sockets()) {
      if (vivos.get(socket) === false) {
        socket.terminate();
        continue;
      }
      vivos.set(socket, false);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, intervaloMs);
  return () => clearInterval(temporizador);
}

function enviar(socket: WebSocket, mensaje: MensajeServidor): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(mensaje));
  }
}

export function manejarConexion(socket: WebSocket, ctx: ContextoConexiones): void {
  let sesion: Sesion | null = null;
  vivos.set(socket, true);
  socket.on('pong', () => vivos.set(socket, true));

  socket.on('message', (datos, esBinario) => {
    vivos.set(socket, true);
    if (esBinario) {
      enviar(socket, { tipo: 'error', mensaje: 'Solo se aceptan mensajes de texto' });
      return;
    }
    const lectura = leerMensaje(datos.toString());
    if (!lectura.ok) {
      enviar(socket, { tipo: 'error', mensaje: lectura.error });
      return;
    }
    try {
      sesion = procesar(socket, sesion, lectura.mensaje, ctx);
    } catch (error) {
      ctx.log.error({ err: error }, 'Error al procesar un mensaje');
      enviar(socket, { tipo: 'error', mensaje: 'Error interno del servidor' });
    }
  });

  socket.on('close', () => {
    if (sesion && sesion.socket === socket) {
      sesion.socket = null;
      sesion.desconectadaDesde = Date.now();
      if (sesion.idSala) {
        ctx.salas.obtener(sesion.idSala)?.marcarDesconectado(sesion.idJugador);
      }
    }
  });
}

/** Procesa un mensaje y devuelve la sesión asociada al socket (puede cambiar con `hola`). */
function procesar(socket: WebSocket, sesion: Sesion | null, mensaje: MensajeCliente, ctx: ContextoConexiones): Sesion | null {
  if (mensaje.tipo === 'ping') {
    enviar(socket, { tipo: 'pong', t: mensaje.t });
    return sesion;
  }

  if (mensaje.tipo === 'hola') {
    const existente = mensaje.token ? ctx.sesiones.porTokenSesion(mensaje.token) : undefined;
    const actual = existente ?? ctx.sesiones.crear(mensaje.nombre);
    if (actual.socket && actual.socket !== socket) {
      // La misma sesión abierta en otra pestaña o una conexión antigua: se queda la nueva.
      enviar(actual.socket, { tipo: 'error', mensaje: 'Tu sesión se ha abierto en otra ventana' });
      actual.socket.close(4000, 'Sesión reemplazada');
    }
    actual.socket = socket;
    actual.desconectadaDesde = null;
    enviar(socket, {
      tipo: 'bienvenida',
      token: actual.token,
      idJugador: actual.idJugador,
      nombre: actual.nombre,
      reconectado: existente !== undefined,
    });
    if (actual.idSala) {
      const sala = ctx.salas.obtener(actual.idSala);
      if (sala?.tieneJugador(actual.idJugador)) {
        sala.unir(actual.idJugador, actual.nombre);
      } else {
        actual.idSala = null;
        enviar(socket, { tipo: 'sala', sala: null });
      }
    }
    return actual;
  }

  if (!sesion) {
    enviar(socket, { tipo: 'error', mensaje: 'Primero tienes que identificarte' });
    return sesion;
  }
  const responderError = (error: string | null) => {
    if (error) {
      enviar(socket, { tipo: 'error', mensaje: error });
    }
  };
  const salaActual = sesion.idSala ? ctx.salas.obtener(sesion.idSala) : undefined;

  switch (mensaje.tipo) {
    case 'listarSalas':
      enviar(socket, { tipo: 'salas', salas: ctx.salas.listar() });
      break;

    case 'crearSala': {
      salaActual?.salir(sesion.idJugador);
      const sala = ctx.salas.crear(mensaje.nombre, sesion, mensaje.configuracion ?? {});
      sesion.idSala = sala.id;
      enviar(socket, { tipo: 'sala', sala: sala.vista() });
      break;
    }

    case 'unirseSala': {
      const sala = ctx.salas.obtener(mensaje.idSala);
      if (!sala) {
        responderError('Esa sala no existe');
        break;
      }
      if (salaActual && salaActual !== sala) {
        salaActual.salir(sesion.idJugador);
      }
      const error = sala.unir(sesion.idJugador, sesion.nombre);
      if (error) {
        sesion.idSala = null;
        responderError(error);
      } else {
        sesion.idSala = sala.id;
      }
      break;
    }

    case 'salirSala':
      salaActual?.salir(sesion.idJugador);
      sesion.idSala = null;
      enviar(socket, { tipo: 'sala', sala: null });
      break;

    case 'anadirBot':
      responderError(salaActual ? salaActual.anadirBot(sesion.idJugador, mensaje.nivel) : 'No estás en ninguna sala');
      break;

    case 'quitarAsiento': {
      const error = salaActual ? salaActual.quitarAsiento(sesion.idJugador, mensaje.idJugador) : 'No estás en ninguna sala';
      if (!error) {
        const expulsado = ctx.sesiones.porIdJugador(mensaje.idJugador);
        if (expulsado) {
          expulsado.idSala = null;
        }
      }
      responderError(error);
      break;
    }

    case 'cambiarConfiguracion':
      responderError(salaActual ? salaActual.configurar(sesion.idJugador, mensaje.configuracion) : 'No estás en ninguna sala');
      break;

    case 'iniciarPartida':
      responderError(salaActual ? salaActual.iniciar(sesion.idJugador) : 'No estás en ninguna sala');
      break;

    case 'accion':
      responderError(salaActual ? salaActual.accion(sesion.idJugador, mensaje.accion) : 'No estás en ninguna partida');
      break;

    case 'chat':
      if (salaActual) {
        salaActual.chat(sesion.idJugador, mensaje.texto);
      } else {
        responderError('No estás en ninguna sala');
      }
      break;

    case 'pedirRanking':
      ctx.repositorio
        .ranking(20)
        .then((jugadores) => enviar(socket, { tipo: 'ranking', jugadores }))
        .catch((error) => {
          ctx.log.error({ err: error }, 'No se pudo leer el ranking');
          enviar(socket, { tipo: 'error', mensaje: 'No se pudo cargar el ranking' });
        });
      break;
  }
  return sesion;
}

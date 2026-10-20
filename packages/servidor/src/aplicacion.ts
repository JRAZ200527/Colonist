/** Construcción del servidor (separada de index.ts para poder probarlo). */

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { OpcionesMontecarlo } from '@colonist/bots';
import { INTERVALO_LATIDO_MS, RUTA_WEBSOCKET } from '@colonist/motor-compartido';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { iniciarLatido, manejarConexion } from './conexiones.js';
import { origenPermitido } from './cors.js';
import { RepositorioMemoria, type Repositorio } from './persistencia/repositorio.js';
import { GestorSalas } from './salas/gestorSalas.js';
import { GestorSesiones } from './sesiones.js';

export interface OpcionesAplicacion {
  repositorio?: Repositorio;
  origenesExtra?: ReadonlySet<string>;
  intervaloLatidoMs?: number;
  graciaReconexionMs?: number;
  retardoBotsMs?: number;
  montecarlo?: Partial<OpcionesMontecarlo>;
  registros?: boolean;
}

/** Sesiones desconectadas y fuera de una sala se olvidan tras 2 horas. */
const CADUCIDAD_SESION_MS = 2 * 60 * 60 * 1000;

export async function crearAplicacion(opciones: OpcionesAplicacion = {}): Promise<{
  servidor: FastifyInstance;
  sesiones: GestorSesiones;
  salas: GestorSalas;
}> {
  const servidor = Fastify({ logger: opciones.registros ?? true });
  const repositorio = opciones.repositorio ?? new RepositorioMemoria();
  const sesiones = new GestorSesiones();
  const salas = new GestorSalas({
    enviar: (id, mensaje) => sesiones.enviar(id, mensaje),
    repositorio,
    retardoBotsMs: opciones.retardoBotsMs ?? 700,
    graciaReconexionMs: opciones.graciaReconexionMs ?? 60_000,
    montecarlo: opciones.montecarlo,
    registrarError: (mensaje, error) => servidor.log.error({ err: error }, mensaje),
  });

  await servidor.register(cors, {
    origin: (origen, responder) => responder(null, origenPermitido(origen, opciones.origenesExtra)),
  });
  await servidor.register(websocket, { options: { maxPayload: 64 * 1024 } });

  servidor.get('/salud', async () => ({
    estado: 'ok',
    servicio: 'colonist-servidor',
    baseDatos: repositorio.descripcion,
    salas: salas.cantidad,
    sesiones: sesiones.cantidad,
    marcaTiempo: Date.now(),
  }));
  servidor.get('/api/salas', async () => salas.listar());
  servidor.get('/api/ranking', async () => repositorio.ranking(50));

  servidor.get(RUTA_WEBSOCKET, { websocket: true }, (socket) => {
    manejarConexion(socket, { sesiones, salas, repositorio, log: servidor.log });
  });

  const detenerLatido = iniciarLatido(
    () => servidor.websocketServer.clients as Set<WebSocket>,
    opciones.intervaloLatidoMs ?? INTERVALO_LATIDO_MS,
  );
  const limpieza = setInterval(() => sesiones.limpiar(CADUCIDAD_SESION_MS), 10 * 60 * 1000);
  limpieza.unref();

  servidor.addHook('onClose', async () => {
    detenerLatido();
    clearInterval(limpieza);
    salas.cerrarTodas();
    await repositorio.cerrar();
  });

  return { servidor, sesiones, salas };
}

/**
 * La conexión del cliente web (packages/cliente/src/red/conexion.ts) contra el
 * servidor real, usando el WebSocket nativo de Node como el de un navegador.
 */

import type { MensajeServidor } from '@colonist/motor-compartido';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConexionJuego, type AlmacenToken, type EstadoConexion } from '../../cliente/src/red/conexion.js';
import { crearAplicacion } from '../src/aplicacion.js';
import { esperarHasta } from './clientePrueba.js';

let url: string;
let cerrarServidor: () => Promise<void>;
const conexiones: ConexionJuego[] = [];

beforeEach(async () => {
  const app = await crearAplicacion({ registros: false, retardoBotsMs: 0 });
  await app.servidor.listen({ port: 0, host: '127.0.0.1' });
  const direccion = app.servidor.server.address();
  if (!direccion || typeof direccion === 'string') {
    throw new Error('Sin dirección');
  }
  url = `ws://127.0.0.1:${direccion.port}/ws`;
  cerrarServidor = () => app.servidor.close();
});

afterEach(async () => {
  conexiones.splice(0).forEach((c) => c.cerrar());
  await cerrarServidor();
});

function nuevaConexion(opciones: { intervaloLatidoMs?: number } = {}) {
  let guardado: string | null = null;
  const almacen: AlmacenToken = { leer: () => guardado, guardar: (t) => (guardado = t) };
  const conexion = new ConexionJuego({ url, nombre: 'Ana', almacen, esperaMinimaMs: 20, ...opciones });
  const mensajes: MensajeServidor[] = [];
  const estados: EstadoConexion[] = [];
  conexion.alMensaje((m) => mensajes.push(m));
  conexion.alCambiarEstado((e) => estados.push(e));
  conexiones.push(conexion);
  return { conexion, mensajes, estados };
}

describe('Conexión del cliente', () => {
  it('se identifica y guarda el token de sesión', async () => {
    const { conexion, mensajes } = nuevaConexion();
    conexion.conectar();
    await esperarHasta(() => conexion.estado === 'conectado');
    const bienvenida = mensajes.find((m) => m.tipo === 'bienvenida');
    expect(bienvenida).toBeDefined();
    expect(conexion.token).toBe(bienvenida?.tipo === 'bienvenida' ? bienvenida.token : null);
  });

  it('tras un corte reconecta sola con el mismo token y recupera la sala', async () => {
    const { conexion, mensajes, estados } = nuevaConexion();
    conexion.conectar();
    await esperarHasta(() => conexion.estado === 'conectado');
    const token = conexion.token;
    conexion.enviar({ tipo: 'crearSala', nombre: 'Mesa' });
    await esperarHasta(() => mensajes.some((m) => m.tipo === 'sala' && m.sala !== null));
    mensajes.length = 0;

    conexion.simularCorte();
    await esperarHasta(() => estados.includes('reconectando'));
    await esperarHasta(() => conexion.estado === 'conectado');

    expect(conexion.token).toBe(token);
    const bienvenida = mensajes.find((m) => m.tipo === 'bienvenida');
    expect(bienvenida?.tipo === 'bienvenida' && bienvenida.reconectado).toBe(true);
    await esperarHasta(() => mensajes.some((m) => m.tipo === 'sala' && m.sala?.nombre === 'Mesa'));
  });

  it('guarda los mensajes enviados sin conexión y los envía al reconectar', async () => {
    const { conexion, mensajes } = nuevaConexion();
    conexion.enviar({ tipo: 'listarSalas' });
    conexion.conectar();
    await esperarHasta(() => mensajes.some((m) => m.tipo === 'salas'));
  });

  it('envía latidos periódicos', async () => {
    const { conexion, mensajes } = nuevaConexion({ intervaloLatidoMs: 50 });
    conexion.conectar();
    await esperarHasta(() => mensajes.filter((m) => m.tipo === 'pong').length >= 3, 2000);
    expect(conexion.estado).toBe('conectado');
  });

  it('cerrar() no reconecta', async () => {
    const { conexion, estados } = nuevaConexion();
    conexion.conectar();
    await esperarHasta(() => conexion.estado === 'conectado');
    conexion.cerrar();
    await new Promise((r) => setTimeout(r, 150));
    expect(conexion.estado).toBe('cerrado');
    expect(estados).not.toContain('reconectando');
  });
});

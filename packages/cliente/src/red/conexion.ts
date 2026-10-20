/**
 * Conexión del cliente con el servidor de juego.
 *
 * - Se identifica con `hola` y guarda el `token_sesion` que devuelve el servidor.
 * - Envía un latido (`ping`) cada 25 s para que Render no cierre la conexión, y si
 *   no recibe nada durante dos latidos da la conexión por perdida.
 * - Si la conexión se corta, reconecta sola en segundo plano con espera creciente
 *   (0,5 s, 1 s, 2 s… hasta 10 s) y el mismo token, así que el jugador recupera su
 *   asiento y la partida sin hacer nada.
 * - Los mensajes enviados mientras está desconectada se guardan y se envían al reconectar.
 */

import { INTERVALO_LATIDO_MS, type MensajeCliente, type MensajeServidor } from '@colonist/motor-compartido';

export type EstadoConexion = 'desconectado' | 'conectando' | 'conectado' | 'reconectando' | 'cerrado';

export interface AlmacenToken {
  leer(): string | null;
  guardar(token: string): void;
}

export interface OpcionesConexion {
  url: string;
  nombre: string;
  almacen?: AlmacenToken;
  intervaloLatidoMs?: number;
  esperaMinimaMs?: number;
  esperaMaximaMs?: number;
  /** Implementación de WebSocket (por defecto la del navegador o de Node). */
  WebSocket?: typeof WebSocket;
}

const CLAVE_TOKEN = 'colonist.token_sesion';

/** Guarda el token en localStorage si está disponible (si no, solo en memoria). */
export function almacenLocal(): AlmacenToken {
  let memoria: string | null = null;
  return {
    leer() {
      try {
        return globalThis.localStorage?.getItem(CLAVE_TOKEN) ?? memoria;
      } catch {
        return memoria;
      }
    },
    guardar(token) {
      memoria = token;
      try {
        globalThis.localStorage?.setItem(CLAVE_TOKEN, token);
      } catch {
        // Navegación privada o almacenamiento bloqueado: basta con la memoria.
      }
    },
  };
}

export class ConexionJuego {
  private readonly opciones: Required<Omit<OpcionesConexion, 'almacen' | 'WebSocket'>> & {
    almacen: AlmacenToken;
    WebSocket: typeof WebSocket;
  };
  private socket: WebSocket | null = null;
  private estadoActual: EstadoConexion = 'desconectado';
  private intentos = 0;
  private pendientes: MensajeCliente[] = [];
  private temporizadorLatido: ReturnType<typeof setInterval> | null = null;
  private temporizadorReconexion: ReturnType<typeof setTimeout> | null = null;
  private ultimoMensaje = 0;
  private readonly oyentesMensaje = new Set<(mensaje: MensajeServidor) => void>();
  private readonly oyentesEstado = new Set<(estado: EstadoConexion) => void>();

  constructor(opciones: OpcionesConexion) {
    const WebSocketImpl = opciones.WebSocket ?? globalThis.WebSocket;
    if (!WebSocketImpl) {
      throw new Error('Este entorno no tiene WebSocket');
    }
    this.opciones = {
      intervaloLatidoMs: INTERVALO_LATIDO_MS,
      esperaMinimaMs: 500,
      esperaMaximaMs: 10_000,
      almacen: almacenLocal(),
      ...opciones,
      WebSocket: WebSocketImpl,
    } as typeof this.opciones;
  }

  get estado(): EstadoConexion {
    return this.estadoActual;
  }

  get token(): string | null {
    return this.opciones.almacen.leer();
  }

  conectar(): void {
    if (this.estadoActual === 'conectado' || this.estadoActual === 'conectando') {
      return;
    }
    this.abrir(this.estadoActual === 'reconectando' ? 'reconectando' : 'conectando');
  }

  /** Cierra la conexión a propósito (no reconecta). */
  cerrar(): void {
    this.cambiarEstado('cerrado');
    this.limpiarTemporizadores();
    this.socket?.close(1000, 'Cierre del cliente');
    this.socket = null;
  }

  enviar(mensaje: MensajeCliente): void {
    if (this.socket && this.estadoActual === 'conectado' && this.socket.readyState === this.opciones.WebSocket.OPEN) {
      this.socket.send(JSON.stringify(mensaje));
    } else if (mensaje.tipo !== 'ping' && mensaje.tipo !== 'hola') {
      this.pendientes.push(mensaje);
    }
  }

  alMensaje(oyente: (mensaje: MensajeServidor) => void): () => void {
    this.oyentesMensaje.add(oyente);
    return () => this.oyentesMensaje.delete(oyente);
  }

  alCambiarEstado(oyente: (estado: EstadoConexion) => void): () => void {
    this.oyentesEstado.add(oyente);
    return () => this.oyentesEstado.delete(oyente);
  }

  /** Corta la conexión como si fallara la red (para pruebas): debe reconectar sola. */
  simularCorte(): void {
    this.socket?.close(4001, 'Corte simulado');
  }

  private abrir(estado: 'conectando' | 'reconectando'): void {
    this.cambiarEstado(estado);
    const socket = new this.opciones.WebSocket(this.opciones.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.ultimoMensaje = Date.now();
      const token = this.opciones.almacen.leer();
      socket.send(JSON.stringify({ tipo: 'hola', nombre: this.opciones.nombre, ...(token ? { token } : {}) } satisfies MensajeCliente));
      this.iniciarLatido();
    });

    socket.addEventListener('message', (evento) => {
      if (this.socket !== socket) {
        return;
      }
      this.ultimoMensaje = Date.now();
      let mensaje: MensajeServidor;
      try {
        mensaje = JSON.parse(String(evento.data)) as MensajeServidor;
      } catch {
        return;
      }
      if (mensaje.tipo === 'bienvenida') {
        this.opciones.almacen.guardar(mensaje.token);
        this.intentos = 0;
        this.cambiarEstado('conectado');
        const pendientes = this.pendientes;
        this.pendientes = [];
        pendientes.forEach((m) => this.enviar(m));
      }
      this.oyentesMensaje.forEach((oyente) => oyente(mensaje));
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.limpiarTemporizadores();
      if (this.estadoActual !== 'cerrado') {
        this.programarReconexion();
      }
    });

    // Los errores siempre van seguidos de 'close', que se encarga de reconectar.
    socket.addEventListener('error', () => undefined);
  }

  private iniciarLatido(): void {
    this.limpiarLatido();
    this.temporizadorLatido = setInterval(() => {
      // Sin noticias del servidor durante dos latidos: la conexión está muerta aunque no se haya cerrado.
      if (Date.now() - this.ultimoMensaje > 2 * this.opciones.intervaloLatidoMs) {
        this.socket?.close(4002, 'Sin latido');
        return;
      }
      this.enviar({ tipo: 'ping', t: Date.now() });
    }, this.opciones.intervaloLatidoMs);
  }

  private programarReconexion(): void {
    this.cambiarEstado('reconectando');
    const base = Math.min(this.opciones.esperaMaximaMs, this.opciones.esperaMinimaMs * 2 ** this.intentos);
    const espera = base * (0.8 + Math.random() * 0.4);
    this.intentos++;
    this.temporizadorReconexion = setTimeout(() => {
      this.temporizadorReconexion = null;
      if (this.estadoActual === 'reconectando') {
        this.abrir('reconectando');
      }
    }, espera);
  }

  private limpiarLatido(): void {
    if (this.temporizadorLatido) {
      clearInterval(this.temporizadorLatido);
      this.temporizadorLatido = null;
    }
  }

  private limpiarTemporizadores(): void {
    this.limpiarLatido();
    if (this.temporizadorReconexion) {
      clearTimeout(this.temporizadorReconexion);
      this.temporizadorReconexion = null;
    }
  }

  private cambiarEstado(estado: EstadoConexion): void {
    if (this.estadoActual !== estado) {
      this.estadoActual = estado;
      this.oyentesEstado.forEach((oyente) => oyente(estado));
    }
  }
}

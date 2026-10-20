/**
 * Sesiones de jugador. Cada cliente recibe un `token_sesion` aleatorio en la
 * bienvenida; si la conexión se corta y vuelve con el mismo token, recupera su
 * identidad y su asiento sin perder la partida.
 */

import { randomBytes } from 'node:crypto';
import type { IdJugador, MensajeServidor } from '@colonist/motor-compartido';
import type { WebSocket } from 'ws';

export interface Sesion {
  readonly token: string;
  readonly idJugador: IdJugador;
  readonly nombre: string;
  socket: WebSocket | null;
  idSala: string | null;
  /** Momento de la última desconexión (para limpiar sesiones abandonadas). */
  desconectadaDesde: number | null;
}

export class GestorSesiones {
  private readonly porToken = new Map<string, Sesion>();
  private readonly porJugador = new Map<IdJugador, Sesion>();

  crear(nombre: string): Sesion {
    const sesion: Sesion = {
      token: randomBytes(24).toString('hex'),
      idJugador: `u_${randomBytes(6).toString('hex')}`,
      nombre,
      socket: null,
      idSala: null,
      desconectadaDesde: null,
    };
    this.porToken.set(sesion.token, sesion);
    this.porJugador.set(sesion.idJugador, sesion);
    return sesion;
  }

  porTokenSesion(token: string): Sesion | undefined {
    return this.porToken.get(token);
  }

  porIdJugador(id: IdJugador): Sesion | undefined {
    return this.porJugador.get(id);
  }

  /** Envía un mensaje a un jugador si está conectado (si no, se ignora). */
  enviar(id: IdJugador, mensaje: MensajeServidor): void {
    const socket = this.porJugador.get(id)?.socket;
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(mensaje));
    }
  }

  /** Borra las sesiones desconectadas hace más de `antiguedadMs` que no están en ninguna sala. */
  limpiar(antiguedadMs: number, ahora = Date.now()): void {
    for (const sesion of this.porToken.values()) {
      if (
        sesion.socket === null &&
        sesion.idSala === null &&
        sesion.desconectadaDesde !== null &&
        ahora - sesion.desconectadaDesde > antiguedadMs
      ) {
        this.porToken.delete(sesion.token);
        this.porJugador.delete(sesion.idJugador);
      }
    }
  }

  get cantidad(): number {
    return this.porToken.size;
  }
}

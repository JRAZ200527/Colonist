/** Cliente WebSocket mínimo para las pruebas de integración. */

import type { MensajeCliente, MensajeServidor } from '@colonist/motor-compartido';
import WebSocket from 'ws';

type DeTipo<T extends MensajeServidor['tipo']> = Extract<MensajeServidor, { tipo: T }>;

export class ClientePrueba {
  readonly socket: WebSocket;
  private recibidos: MensajeServidor[] = [];
  private oyentes = new Set<() => void>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (datos) => {
      this.recibidos.push(JSON.parse(datos.toString()) as MensajeServidor);
      this.oyentes.forEach((o) => o());
    });
  }

  static conectar(url: string, opciones: WebSocket.ClientOptions = {}): Promise<ClientePrueba> {
    return new Promise((resolver, rechazar) => {
      const socket = new WebSocket(url, opciones);
      socket.once('open', () => resolver(new ClientePrueba(socket)));
      socket.once('error', rechazar);
    });
  }

  /** Se conecta e identifica; devuelve la bienvenida. */
  static async entrar(url: string, nombre: string, token?: string) {
    const cliente = await ClientePrueba.conectar(url);
    cliente.enviar({ tipo: 'hola', nombre, ...(token ? { token } : {}) });
    const bienvenida = await cliente.esperar('bienvenida');
    return { cliente, bienvenida };
  }

  enviar(mensaje: MensajeCliente | Record<string, unknown>): void {
    this.socket.send(JSON.stringify(mensaje));
  }

  /** Espera (y consume) el primer mensaje del tipo indicado que cumpla la condición. */
  esperar<T extends MensajeServidor['tipo']>(
    tipo: T,
    condicion: (m: DeTipo<T>) => boolean = () => true,
    tiempoMs = 5000,
  ): Promise<DeTipo<T>> {
    return new Promise((resolver, rechazar) => {
      const buscar = () => {
        const indice = this.recibidos.findIndex((m) => m.tipo === tipo && condicion(m as DeTipo<T>));
        if (indice === -1) {
          return false;
        }
        const [mensaje] = this.recibidos.splice(indice, 1);
        this.oyentes.delete(buscar);
        clearTimeout(limite);
        resolver(mensaje as DeTipo<T>);
        return true;
      };
      const limite = setTimeout(() => {
        this.oyentes.delete(buscar);
        rechazar(new Error(`No llegó ningún mensaje "${tipo}" en ${tiempoMs} ms`));
      }, tiempoMs);
      if (!buscar()) {
        this.oyentes.add(buscar);
      }
    });
  }

  /** Último mensaje de un tipo recibido hasta ahora (sin consumirlo). */
  ultimo<T extends MensajeServidor['tipo']>(tipo: T): DeTipo<T> | undefined {
    return this.recibidos.filter((m) => m.tipo === tipo).at(-1) as DeTipo<T> | undefined;
  }

  descartarRecibidos(): void {
    this.recibidos = [];
  }

  cerrar(): Promise<void> {
    return new Promise((resolver) => {
      if (this.socket.readyState === WebSocket.CLOSED) {
        resolver();
        return;
      }
      this.socket.once('close', () => resolver());
      this.socket.close();
    });
  }
}

export function esperarHasta(condicion: () => boolean, tiempoMs = 5000, cadaMs = 20): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();
    const comprobar = () => {
      if (condicion()) {
        resolver();
      } else if (Date.now() - inicio > tiempoMs) {
        rechazar(new Error(`La condición no se cumplió en ${tiempoMs} ms`));
      } else {
        setTimeout(comprobar, cadaMs);
      }
    };
    comprobar();
  });
}

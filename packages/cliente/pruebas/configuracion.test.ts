import { describe, expect, it } from 'vitest';
import { resolverUrlsServidor } from '../src/configuracion.js';

describe('resolverUrlsServidor', () => {
  it('usa el servidor local si no hay valor', () => {
    expect(resolverUrlsServidor(undefined)).toEqual({ http: 'http://localhost:3000', ws: 'ws://localhost:3000/ws' });
    expect(resolverUrlsServidor('  ')).toEqual({ http: 'http://localhost:3000', ws: 'ws://localhost:3000/ws' });
  });

  it('acepta URLs completas ws, wss, http y https', () => {
    expect(resolverUrlsServidor('ws://localhost:4000')).toEqual({ http: 'http://localhost:4000', ws: 'ws://localhost:4000/ws' });
    expect(resolverUrlsServidor('wss://juego.onrender.com/ws')).toEqual({
      http: 'https://juego.onrender.com',
      ws: 'wss://juego.onrender.com/ws',
    });
    expect(resolverUrlsServidor('https://juego.onrender.com').ws).toBe('wss://juego.onrender.com/ws');
  });

  it('completa el nombre de servicio de Render', () => {
    expect(resolverUrlsServidor('colonist-servidor-ab12')).toEqual({
      http: 'https://colonist-servidor-ab12.onrender.com',
      ws: 'wss://colonist-servidor-ab12.onrender.com/ws',
    });
  });

  it('usa HTTPS para hosts sin protocolo y HTTP para localhost', () => {
    expect(resolverUrlsServidor('catan.ejemplo.com').http).toBe('https://catan.ejemplo.com');
    expect(resolverUrlsServidor('localhost:3000').http).toBe('http://localhost:3000');
  });
});

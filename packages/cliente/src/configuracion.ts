/**
 * URLs del servidor a partir de VITE_WS_URL. Acepta:
 * - una URL completa: "wss://colonist-servidor.onrender.com" o "http://localhost:3000";
 * - un host: "colonist-servidor.onrender.com";
 * - el nombre de servicio que Render inyecta desde render.yaml: "colonist-servidor"
 *   (se completa con ".onrender.com").
 * Sin valor, se usa el servidor local en el puerto 3000.
 */

export interface UrlsServidor {
  readonly http: string;
  readonly ws: string;
}

export function resolverUrlsServidor(valor: string | undefined): UrlsServidor {
  let base = (valor ?? '').trim();
  if (!base) {
    base = 'http://localhost:3000';
  } else if (!/^[a-z]+:\/\//i.test(base)) {
    const esLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
    const host = esLocal || base.includes('.') ? base : `${base}.onrender.com`;
    base = `${esLocal ? 'http' : 'https'}://${host}`;
  }
  const url = new URL(base);
  const segura = url.protocol === 'https:' || url.protocol === 'wss:';
  return {
    http: `${segura ? 'https' : 'http'}://${url.host}`,
    ws: `${segura ? 'wss' : 'ws'}://${url.host}/ws`,
  };
}

export const URLS_SERVIDOR = resolverUrlsServidor(import.meta.env.VITE_WS_URL);

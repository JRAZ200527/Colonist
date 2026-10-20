/**
 * Orígenes permitidos por CORS: subdominios de Render (*.onrender.com, solo HTTPS),
 * localhost para desarrollo y los que se añadan en CORS_ORIGENES_EXTRA
 * (lista separada por comas, por ejemplo un dominio propio).
 */

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function leerOrigenesExtra(valor: string | undefined): Set<string> {
  const origenes = new Set<string>();
  for (const parte of (valor ?? '').split(',')) {
    const texto = parte.trim();
    if (!texto) {
      continue;
    }
    try {
      origenes.add(new URL(texto).origin);
    } catch {
      // Se ignoran entradas mal escritas para no tumbar el servidor al arrancar.
    }
  }
  return origenes;
}

export function origenPermitido(origen: string | undefined, extras: ReadonlySet<string> = new Set()): boolean {
  // Sin cabecera Origin: peticiones del mismo origen, curl o el health check de Render.
  if (!origen) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(origen);
  } catch {
    return false;
  }
  if (extras.has(url.origin) || HOSTS_LOCALES.has(url.hostname)) {
    return true;
  }
  return url.protocol === 'https:' && url.hostname.endsWith('.onrender.com');
}

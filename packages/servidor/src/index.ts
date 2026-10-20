/** Punto de entrada del servidor de juego. */

import { crearAplicacion } from './aplicacion.js';
import { leerOrigenesExtra } from './cors.js';
import { RepositorioMemoria, type Repositorio } from './persistencia/repositorio.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env (como en Render): se usan las variables del entorno.
}

async function crearRepositorio(): Promise<Repositorio> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return new RepositorioMemoria();
  }
  const { RepositorioPrisma } = await import('./persistencia/prisma.js');
  return new RepositorioPrisma(url);
}

const repositorio = await crearRepositorio();
const { servidor } = await crearAplicacion({
  repositorio,
  origenesExtra: leerOrigenesExtra(process.env.CORS_ORIGENES_EXTRA),
});

// Render asigna el puerto en la variable PORT.
const puerto = Number(process.env.PORT ?? 3000);
await servidor.listen({ port: puerto, host: '0.0.0.0' });
servidor.log.info(`Almacenamiento: ${repositorio.descripcion}`);

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, () => {
    servidor.log.info(`Recibida ${senal}, cerrando el servidor…`);
    servidor.close().finally(() => process.exit(0));
  });
}

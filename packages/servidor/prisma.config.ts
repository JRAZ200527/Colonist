import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env (como en Render): se usan las variables del entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migraciones',
  },
  datasource: {
    // Vacía solo al generar el cliente sin base de datos (por ejemplo, durante la compilación).
    url: process.env.DATABASE_URL ?? '',
  },
});

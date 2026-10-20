/**
 * Prueba del repositorio sobre PostgreSQL real. Solo se ejecuta si existe la
 * variable DATABASE_URL_PRUEBAS (por ejemplo, el Postgres local de `prisma dev`);
 * borra las tablas de esa base de datos.
 */

import { describe, expect, it } from 'vitest';
import { RepositorioPrisma } from '../src/persistencia/prisma.js';

const url = process.env.DATABASE_URL_PRUEBAS;

describe.skipIf(!url)('Repositorio PostgreSQL (Prisma)', () => {
  it('guarda partidas y calcula el ranking', async () => {
    const repo = new RepositorioPrisma(url!);
    const prisma = (repo as unknown as { prisma: { $executeRawUnsafe(sql: string): Promise<number> } }).prisma;
    await prisma.$executeRawUnsafe('TRUNCATE "Participacion", "Partida", "Usuario" CASCADE');
    try {
      await repo.registrarPartida({
        plantilla: 'clasico',
        turnos: 50,
        jugadores: [
          { nombre: 'Ana', esBot: false, puntos: 10, ganador: true },
          { nombre: 'Beto', esBot: false, puntos: 7, ganador: false },
          { nombre: 'Bot', esBot: true, puntos: 6, ganador: false },
        ],
      });
      await repo.registrarPartida({
        plantilla: 'clasico',
        turnos: 45,
        jugadores: [
          { nombre: 'Beto', esBot: false, puntos: 10, ganador: true },
          { nombre: 'Ana', esBot: false, puntos: 9, ganador: false },
        ],
      });
      const ranking = await repo.ranking(10);
      expect(ranking.map((r) => [r.nombre, r.partidasJugadas, r.partidasGanadas])).toEqual(
        expect.arrayContaining([
          ['Ana', 2, 1],
          ['Beto', 2, 1],
        ]),
      );
      expect(ranking).toHaveLength(2);
      expect(ranking.reduce((s, r) => s + r.elo, 0)).toBeGreaterThanOrEqual(2398);
    } finally {
      await repo.cerrar();
    }
  });
});

/** Repositorio sobre PostgreSQL (Render) con Prisma. */

import { PrismaPg } from '@prisma/adapter-pg';
import type { EntradaRanking } from '@colonist/motor-compartido';
import { PrismaClient } from '../generado/prisma/client.js';
import { calcularNuevosElo } from './elo.js';
import { participantesHumanos, type Repositorio, type ResultadoPartida } from './repositorio.js';

export class RepositorioPrisma implements Repositorio {
  readonly descripcion = 'PostgreSQL (Prisma)';
  private readonly prisma: PrismaClient;

  constructor(urlBaseDatos: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBaseDatos }) });
  }

  async registrarPartida(resultado: ResultadoPartida): Promise<void> {
    const humanos = participantesHumanos(resultado);
    const ganador = resultado.jugadores.find((j) => j.ganador)?.nombre ?? '';

    await this.prisma.$transaction(async (tx) => {
      const usuarios = await Promise.all(
        humanos.map((h) => tx.usuario.upsert({ where: { nombre: h.nombre }, create: { nombre: h.nombre }, update: {} })),
      );
      const nuevos = calcularNuevosElo(
        humanos.map((h, i) => ({ id: usuarios[i]!.id, elo: usuarios[i]!.elo, posicion: h.posicion })),
      );
      const partida = await tx.partida.create({
        data: {
          plantilla: resultado.plantilla,
          numeroJugadores: resultado.jugadores.length,
          turnos: resultado.turnos,
          ganadorNombre: ganador,
        },
      });
      for (const [i, h] of humanos.entries()) {
        const usuario = usuarios[i]!;
        const eloDespues = nuevos.get(usuario.id)!;
        await tx.usuario.update({
          where: { id: usuario.id },
          data: {
            elo: eloDespues,
            partidasJugadas: { increment: 1 },
            partidasGanadas: { increment: h.ganador ? 1 : 0 },
          },
        });
        await tx.participacion.create({
          data: {
            partidaId: partida.id,
            usuarioId: usuario.id,
            puntos: h.puntos,
            posicion: h.posicion,
            eloAntes: usuario.elo,
            eloDespues,
          },
        });
      }
    });
  }

  async ranking(limite: number): Promise<EntradaRanking[]> {
    const usuarios = await this.prisma.usuario.findMany({
      orderBy: [{ elo: 'desc' }, { partidasGanadas: 'desc' }],
      take: limite,
    });
    return usuarios.map((u) => ({
      nombre: u.nombre,
      elo: u.elo,
      partidasJugadas: u.partidasJugadas,
      partidasGanadas: u.partidasGanadas,
    }));
  }

  async cerrar(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

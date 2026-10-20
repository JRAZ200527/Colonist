/**
 * Elo para partidas de varios jugadores: cada pareja de jugadores cuenta como un
 * enfrentamiento (gana quien queda por delante) y el cambio se reparte entre
 * los n − 1 rivales.
 */

export const ELO_INICIAL = 1200;
const FACTOR_K = 32;

export interface ParticipanteElo {
  id: string;
  elo: number;
  /** 1 = primero. Empates con la misma posición. */
  posicion: number;
}

export function calcularNuevosElo(participantes: readonly ParticipanteElo[]): Map<string, number> {
  const resultado = new Map(participantes.map((p) => [p.id, p.elo]));
  const n = participantes.length;
  if (n < 2) {
    return resultado;
  }
  for (const a of participantes) {
    let cambio = 0;
    for (const b of participantes) {
      if (a === b) {
        continue;
      }
      const esperado = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
      const real = a.posicion < b.posicion ? 1 : a.posicion === b.posicion ? 0.5 : 0;
      cambio += (FACTOR_K * (real - esperado)) / (n - 1);
    }
    resultado.set(a.id, Math.round(a.elo + cambio));
  }
  return resultado;
}

/** Posiciones a partir de los puntos (más puntos, mejor posición; el ganador siempre primero). */
export function posicionesPorPuntos<T extends { puntos: number; ganador: boolean }>(jugadores: readonly T[]): number[] {
  const clave = (j: T) => (j.ganador ? Infinity : j.puntos);
  return jugadores.map((j) => 1 + jugadores.filter((otro) => clave(otro) > clave(j)).length);
}

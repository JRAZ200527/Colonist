/** Partidas completas jugadas por el jugador automático de `simulador.ts`. */

import { describe, expect, it } from 'vitest';
import { jugadorEnTurno, puntosDeVictoria } from '../src/index.js';
import { jugarPartida } from './simulador.js';

describe('Partidas simuladas completas', () => {
  for (const [jugadores, semilla] of [
    [2, 1],
    [3, 2],
    [4, 3],
    [4, 4],
    [5, 5],
    [6, 6],
  ] as const) {
    it(`${jugadores} jugadores (semilla ${semilla}) terminan con un ganador válido`, () => {
      const { estado, eventos } = jugarPartida(jugadores, semilla);
      if (estado.fase.tipo !== 'finalizada') {
        throw new Error('La partida no terminó');
      }
      const ganador = estado.fase.ganador;
      expect(puntosDeVictoria(estado, ganador)).toBeGreaterThanOrEqual(10);
      expect(jugadorEnTurno(estado).id).toBe(ganador);
      // Ningún otro jugador llegó a 10 puntos antes.
      const victorias = eventos.filter((e) => e.tipo === 'victoria');
      expect(victorias).toEqual([{ tipo: 'victoria', jugador: ganador, puntos: puntosDeVictoria(estado, ganador) }]);
      // Se produjeron recursos, se tiró el 7 y se movió el ladrón.
      expect(eventos.some((e) => e.tipo === 'produccion')).toBe(true);
      expect(eventos.some((e) => e.tipo === 'ladronMovido')).toBe(true);
    });
  }

  it('la misma semilla reproduce exactamente la misma partida', () => {
    const a = jugarPartida(4, 11);
    const b = jugarPartida(4, 11);
    expect(a.acciones).toBe(b.acciones);
    expect(JSON.stringify(a.estado)).toBe(JSON.stringify(b.estado));
  });

  it('cubre comercio, cartas de desarrollo y títulos en varias partidas', () => {
    const tipos = new Set<string>();
    const titulos = new Set<string>();
    for (let semilla = 20; semilla < 26; semilla++) {
      for (const e of jugarPartida(4, semilla).eventos) {
        tipos.add(e.tipo);
        if (e.tipo === 'tituloCambiado') {
          titulos.add(e.titulo);
        }
      }
    }
    for (const tipo of [
      'comercioBanca',
      'cartaDesarrolloComprada',
      'cartaDesarrolloJugada',
      'descarte',
      'robo',
      'ciudadConstruida',
    ]) {
      expect(tipos, tipo).toContain(tipo);
    }
    expect(titulos).toContain('granRuta');
    expect(titulos).toContain('mayorEjercito');
  });
});

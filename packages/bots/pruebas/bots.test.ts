import {
  aplicarAccion,
  clonarEstado,
  crearPartida,
  GeneradorAleatorio,
  generarMapa,
  RECURSOS,
  type EstadoJuego,
  type IdJugador,
  type NivelBot,
} from '@colonist/motor-compartido';
import { describe, expect, it } from 'vitest';
import { decidirAccionBot, determinizar, jugadoresQueDebenActuar } from '../src/index.js';

const MONTECARLO_RAPIDO = { presupuestoMs: 10, simulaciones: 2, profundidad: 30 };

/** Juega una partida completa solo con bots y devuelve el ganador. */
function jugarEntreBots(niveles: NivelBot[], semilla: number): { ganador: IdJugador; estado: EstadoJuego; acciones: number } {
  let estado = crearPartida({
    jugadores: niveles.map((nivel, i) => ({ id: `${nivel}_${i}`, nombre: `${nivel} ${i}` })),
    semilla,
    mapa: generarMapa({ plantilla: 'clasico', semilla }),
  });
  const nivelDe = (id: IdJugador) => niveles[Number(id.split('_')[1])]!;
  let acciones = 0;
  while (estado.fase.tipo !== 'finalizada') {
    if (++acciones > 6000) {
      throw new Error(`La partida ${semilla} no terminó`);
    }
    const actor = jugadoresQueDebenActuar(estado)[0]!;
    const accion = decidirAccionBot(estado, actor, nivelDe(actor), { semilla: semilla * 100_000 + acciones, montecarlo: MONTECARLO_RAPIDO });
    if (!accion) {
      throw new Error(`El bot ${actor} no supo qué hacer en la fase ${estado.fase.tipo}`);
    }
    const resultado = aplicarAccion(estado, accion);
    if (!resultado.ok) {
      throw new Error(`El bot ${actor} hizo una acción ilegal (${accion.tipo}): ${resultado.error}`);
    }
    estado = resultado.estado;
  }
  return { ganador: estado.fase.ganador, estado, acciones };
}

describe('Bots', () => {
  it.each(['facil', 'medio', 'dificil'] as const)('cuatro bots de nivel %s terminan una partida sin acciones ilegales', (nivel) => {
    const { estado } = jugarEntreBots([nivel, nivel, nivel, nivel], 3);
    expect(estado.fase.tipo).toBe('finalizada');
  });

  it('el bot Medio gana más que el Fácil', { timeout: 60_000 }, () => {
    let victoriasMedio = 0;
    const partidas = 8;
    for (let semilla = 1; semilla <= partidas; semilla++) {
      const niveles: NivelBot[] = semilla % 2 === 0 ? ['medio', 'facil', 'medio', 'facil'] : ['facil', 'medio', 'facil', 'medio'];
      const { ganador } = jugarEntreBots(niveles, semilla);
      if (ganador.startsWith('medio')) {
        victoriasMedio++;
      }
    }
    expect(victoriasMedio).toBeGreaterThan(partidas / 2);
  });

  it('juegan partidas de 5 jugadores con fase especial y de Navegantes en el Archipiélago', { timeout: 60_000 }, () => {
    const cinco = jugarEntreBots(['medio', 'facil', 'medio', 'facil', 'dificil'], 9);
    expect(cinco.estado.configuracion.faseEspecialConstruccion).toBe(true);

    let estado = crearPartida({
      jugadores: ['medio', 'medio', 'dificil'].map((nivel, i) => ({ id: `${nivel}_${i}`, nombre: `Bot ${i}` })),
      semilla: 4,
      configuracion: { navegantes: true, puntosVictoria: 12 },
      mapa: generarMapa({ plantilla: 'archipielago', semilla: 4 }),
    });
    let barcos = 0;
    for (let paso = 0; estado.fase.tipo !== 'finalizada'; paso++) {
      if (paso > 8000) {
        throw new Error('La partida de Navegantes no terminó');
      }
      const actor = jugadoresQueDebenActuar(estado)[0]!;
      const accion = decidirAccionBot(estado, actor, actor.startsWith('dificil') ? 'dificil' : 'medio', {
        semilla: paso,
        montecarlo: MONTECARLO_RAPIDO,
      })!;
      const resultado = aplicarAccion(estado, accion);
      if (!resultado.ok) {
        throw new Error(`Acción ilegal (${accion.tipo}): ${resultado.error}`);
      }
      barcos += resultado.eventos.filter((e) => e.tipo === 'barcoConstruido').length;
      estado = resultado.estado;
    }
    expect(barcos).toBeGreaterThan(0);
  });

  it('juegan partidas completas de Ciudades y Caballeros', { timeout: 60_000 }, () => {
    for (const semilla of [1, 2]) {
      let estado = crearPartida({
        jugadores: ['medio', 'facil', 'dificil'].map((nivel, i) => ({ id: `${nivel}_${i}`, nombre: `Bot ${i}` })),
        semilla,
        configuracion: { ciudadesYCaballeros: true },
        mapa: generarMapa({ plantilla: 'clasico', semilla }),
      });
      const tipos = new Set<string>();
      for (let paso = 0; estado.fase.tipo !== 'finalizada'; paso++) {
        if (paso > 10_000) {
          throw new Error(`La partida de Ciudades y Caballeros ${semilla} no terminó`);
        }
        const actor = jugadoresQueDebenActuar(estado)[0]!;
        const nivel = actor.split('_')[0] as NivelBot;
        const accion = decidirAccionBot(estado, actor, nivel, { semilla: semilla * 100_000 + paso, montecarlo: MONTECARLO_RAPIDO })!;
        const resultado = aplicarAccion(estado, accion);
        if (!resultado.ok) {
          throw new Error(`Acción ilegal (${accion.tipo}): ${resultado.error}`);
        }
        resultado.eventos.forEach((e) => tipos.add(e.tipo));
        estado = resultado.estado;
      }
      expect(tipos).toContain('ciudadMejorada');
      expect(tipos).toContain('caballeroConstruido');
      expect(tipos).toContain('ataqueBarbaro');
    }
  });

  it('solo decide cuando le toca (o tiene ofertas que responder)', () => {
    const estado = crearPartida({ jugadores: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }], semilla: 1 });
    expect(decidirAccionBot(estado, 'b', 'medio', { semilla: 1 })).toBeNull();
    expect(decidirAccionBot(estado, 'a', 'medio', { semilla: 1 })?.tipo).toBe('colocarPobladoInicial');
  });

  it('responde a las ofertas de los humanos', () => {
    let estado = crearPartida({ jugadores: [{ id: 'humano', nombre: 'H' }, { id: 'bot', nombre: 'B' }], semilla: 1 });
    estado = clonarEstado(estado);
    estado.fase = { tipo: 'acciones' };
    estado.turno = { numero: 1, jugadorActual: 0, dados: [3, 4], haJugadoCartaDesarrollo: false };
    estado.jugadores[0]!.recursos.madera = 3;
    estado.jugadores[1]!.recursos.trigo = 3;
    const conOferta = aplicarAccion(estado, { tipo: 'proponerOferta', jugador: 'humano', ofrece: { madera: 1 }, pide: { trigo: 1 } });
    if (!conOferta.ok) {
      throw new Error(conOferta.error);
    }
    const respuesta = decidirAccionBot(conOferta.estado, 'bot', 'medio', { semilla: 1 });
    expect(respuesta).toMatchObject({ tipo: 'responderOferta', jugador: 'bot', idOferta: 1 });
  });

  it('la determinización conserva lo que el bot sabe y baraja lo que no', () => {
    const base = jugarEntreBots(['medio', 'medio', 'medio'], 5).estado;
    const rng = new GeneradorAleatorio(1);
    const copia = determinizar(base, 'medio_0', rng);
    expect(copia.jugadores[0]).toEqual(base.jugadores[0]);
    for (let i = 1; i < base.jugadores.length; i++) {
      const total = (e: EstadoJuego) => RECURSOS.reduce((s, r) => s + e.jugadores[i]!.recursos[r], 0);
      expect(total(copia)).toBe(total(base));
      expect(copia.jugadores[i]!.cartasDesarrollo).toHaveLength(base.jugadores[i]!.cartasDesarrollo.length);
    }
    for (const r of RECURSOS) {
      const suma = (e: EstadoJuego) => e.jugadores.reduce((s, j) => s + j.recursos[r], 0) + e.banca[r];
      expect(suma(copia)).toBe(19);
    }
    expect(copia.mazoDesarrollo).toHaveLength(base.mazoDesarrollo.length);
    expect(copia.tablero).toEqual(base.tablero);
  });
});

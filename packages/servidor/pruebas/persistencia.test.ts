import { describe, expect, it } from 'vitest';
import { calcularNuevosElo, ELO_INICIAL, posicionesPorPuntos } from '../src/persistencia/elo.js';
import { RepositorioMemoria } from '../src/persistencia/repositorio.js';
import { leerMensaje } from '../src/mensajes.js';

describe('Elo', () => {
  it('el ganador sube, el perdedor baja y la suma se conserva', () => {
    const nuevos = calcularNuevosElo([
      { id: 'a', elo: 1200, posicion: 1 },
      { id: 'b', elo: 1200, posicion: 2 },
    ]);
    expect(nuevos.get('a')).toBe(1216);
    expect(nuevos.get('b')).toBe(1184);
  });

  it('ganar a alguien mucho mejor da más puntos', () => {
    const sorpresa = calcularNuevosElo([
      { id: 'a', elo: 1000, posicion: 1 },
      { id: 'b', elo: 1600, posicion: 2 },
    ]);
    expect(sorpresa.get('a')! - 1000).toBeGreaterThan(16);
  });

  it('en partidas de varios jugadores el cambio se reparte entre los rivales', () => {
    const nuevos = calcularNuevosElo([
      { id: 'a', elo: 1200, posicion: 1 },
      { id: 'b', elo: 1200, posicion: 2 },
      { id: 'c', elo: 1200, posicion: 3 },
      { id: 'd', elo: 1200, posicion: 4 },
    ]);
    expect([...nuevos.values()]).toEqual([1216, 1205, 1195, 1184]);
  });

  it('con un solo humano no cambia nada', () => {
    expect(calcularNuevosElo([{ id: 'a', elo: 1300, posicion: 1 }]).get('a')).toBe(1300);
  });

  it('las posiciones se calculan por puntos con el ganador primero', () => {
    expect(
      posicionesPorPuntos([
        { puntos: 7, ganador: false },
        { puntos: 10, ganador: true },
        { puntos: 7, ganador: false },
        { puntos: 3, ganador: false },
      ]),
    ).toEqual([2, 1, 2, 4]);
  });
});

describe('Repositorio en memoria', () => {
  it('registra partidas, ignora a los bots y ordena el ranking por Elo', async () => {
    const repo = new RepositorioMemoria();
    await repo.registrarPartida({
      plantilla: 'clasico',
      turnos: 40,
      jugadores: [
        { nombre: 'Ana', esBot: false, puntos: 10, ganador: true },
        { nombre: 'Beto', esBot: false, puntos: 6, ganador: false },
        { nombre: 'Bot', esBot: true, puntos: 8, ganador: false },
      ],
    });
    const ranking = await repo.ranking(10);
    expect(ranking.map((r) => r.nombre)).toEqual(['Ana', 'Beto']);
    expect(ranking[0]).toEqual({ nombre: 'Ana', elo: ELO_INICIAL + 16, partidasJugadas: 1, partidasGanadas: 1 });
    expect(ranking[1]).toEqual({ nombre: 'Beto', elo: ELO_INICIAL - 16, partidasJugadas: 1, partidasGanadas: 0 });
  });
});

describe('Validación de mensajes', () => {
  it('acepta mensajes bien formados', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', nombre: '  Ana  ' }))).toEqual({
      ok: true,
      mensaje: { tipo: 'hola', nombre: 'Ana' },
    });
    expect(
      leerMensaje(JSON.stringify({ tipo: 'accion', accion: { tipo: 'comerciarConBanca', entrega: { madera: 4 }, recibe: { trigo: 1 } } })).ok,
    ).toBe(true);
  });

  it('rechaza recursos inventados, cantidades negativas y acciones desconocidas', () => {
    const accion = (a: object) => leerMensaje(JSON.stringify({ tipo: 'accion', accion: a })).ok;
    expect(accion({ tipo: 'comerciarConBanca', entrega: { oro: 4 }, recibe: { trigo: 1 } })).toBe(false);
    expect(accion({ tipo: 'descartar', recursos: { madera: -1 } })).toBe(false);
    expect(accion({ tipo: 'hacerTrampa' })).toBe(false);
    expect(accion({ tipo: 'jugarAbundancia', recursos: ['madera'] })).toBe(false);
  });

  it('elimina el campo jugador de las acciones', () => {
    const lectura = leerMensaje(JSON.stringify({ tipo: 'accion', accion: { tipo: 'tirarDados', jugador: 'otro' } }));
    expect(lectura).toEqual({ ok: true, mensaje: { tipo: 'accion', accion: { tipo: 'tirarDados' } } });
  });
});

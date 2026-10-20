/** Utilidades compartidas por las pruebas del juego. */

import {
  aplicarAccion,
  aristasValidasCarreteraInicial,
  clonarEstado,
  crearPartida,
  jugadorEnTurno,
  manoVacia,
  RECURSOS,
  verticesValidosPoblado,
  type AccionJuego,
  type ConfiguracionPartida,
  type EstadoJuego,
  type EventoJuego,
  type IdJugador,
  type MapaJuego,
  type RecursosParciales,
} from '../src/index.js';

export const NOMBRES = ['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fede'];

export function nuevaPartida(
  numeroJugadores = 3,
  semilla = 1,
  configuracion: Partial<ConfiguracionPartida> = {},
  mapa?: MapaJuego,
): EstadoJuego {
  return crearPartida({
    jugadores: NOMBRES.slice(0, numeroJugadores).map((nombre, i) => ({ id: `j${i}`, nombre })),
    semilla,
    configuracion,
    ...(mapa ? { mapa } : {}),
  });
}

export function aplicarConEventos(
  estado: EstadoJuego,
  accion: AccionJuego,
): { estado: EstadoJuego; eventos: readonly EventoJuego[] } {
  const resultado = aplicarAccion(estado, accion);
  if (!resultado.ok) {
    throw new Error(`Acción ${accion.tipo} de ${accion.jugador} rechazada: ${resultado.error}`);
  }
  return resultado;
}

export function aplicar(estado: EstadoJuego, accion: AccionJuego): EstadoJuego {
  return aplicarConEventos(estado, accion).estado;
}

/** Devuelve el mensaje de error de una acción que debe ser rechazada. */
export function error(estado: EstadoJuego, accion: AccionJuego): string {
  const resultado = aplicarAccion(estado, accion);
  if (resultado.ok) {
    throw new Error(`Se esperaba que la acción ${accion.tipo} fuera rechazada`);
  }
  return resultado.error;
}

export function idActual(estado: EstadoJuego): IdJugador {
  return jugadorEnTurno(estado).id;
}

/** Copia del estado modificada por `cambio` (para preparar escenarios concretos). */
export function modificar(estado: EstadoJuego, cambio: (e: EstadoJuego) => void): EstadoJuego {
  const copia = clonarEstado(estado);
  cambio(copia);
  return copia;
}

/** Fija la mano exacta de un jugador, moviendo las cartas desde o hacia la banca. */
export function conRecursos(estado: EstadoJuego, id: IdJugador, recursos: RecursosParciales): EstadoJuego {
  return modificar(estado, (e) => {
    const jugador = e.jugadores.find((j) => j.id === id)!;
    const nueva = { ...manoVacia(), ...recursos };
    for (const r of RECURSOS) {
      e.banca[r] += jugador.recursos[r] - nueva[r];
    }
    jugador.recursos = nueva;
  });
}

/** Partida lista para jugar (fase de acciones, turno 1 de j0) con el tablero vacío. */
export function partidaEnAcciones(numeroJugadores = 3, semilla = 1): EstadoJuego {
  return modificar(nuevaPartida(numeroJugadores, semilla), (e) => {
    e.turno = { numero: 1, jugadorActual: 0, dados: [3, 4], haJugadoCartaDesarrollo: false };
    e.fase = { tipo: 'acciones' };
  });
}

/** Coloca automáticamente los poblados y carreteras iniciales en las primeras posiciones válidas. */
export function colocacionAutomatica(estado: EstadoJuego): EstadoJuego {
  let actual = estado;
  while (actual.fase.tipo === 'colocacionInicial') {
    const jugador = idActual(actual);
    if (actual.fase.paso === 'poblado') {
      const vertice = verticesValidosPoblado(actual, jugador, true)[0]!;
      actual = aplicar(actual, { tipo: 'colocarPobladoInicial', jugador, vertice });
    } else {
      const arista = aristasValidasCarreteraInicial(actual, actual.fase.ultimoPoblado!)[0]!;
      actual = aplicar(actual, { tipo: 'colocarCarreteraInicial', jugador, arista });
    }
  }
  return actual;
}

/** Tira los dados probando semillas hasta que la suma cumpla la condición. */
export function tirarHasta(estado: EstadoJuego, condicion: (suma: number) => boolean): EstadoJuego {
  for (let semilla = 1; semilla < 10_000; semilla++) {
    const resultado = aplicarAccion({ ...estado, semilla }, { tipo: 'tirarDados', jugador: idActual(estado) });
    if (resultado.ok) {
      const [a, b] = resultado.estado.turno.dados!;
      if (condicion(a + b)) {
        return resultado.estado;
      }
    }
  }
  throw new Error('No se encontró ninguna tirada que cumpla la condición');
}

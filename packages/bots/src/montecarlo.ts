/**
 * Bot Difícil: búsqueda Monte Carlo con determinización (MCTS de un nivel).
 *
 * Para cada jugada candidata se simulan varias continuaciones de la partida.
 * Como el bot no puede ver la información oculta, antes de cada simulación se
 * "determiniza" el estado: se reparten al azar las cartas de los rivales (manteniendo
 * cuántas tiene cada uno), se baraja el mazo y se cambia la semilla del azar.
 * Las simulaciones las juega la política Medio y la posición final se puntúa con
 * `evaluarPosicion`. Gana la candidata con mejor media dentro del presupuesto de tiempo.
 */

import {
  aplicarAccion,
  clonarEstado,
  COSTES,
  GeneradorAleatorio,
  jugadorEnTurno,
  LINEAS_MEJORA,
  MERCANCIAS,
  RECURSOS,
  type Mercancia,
  tieneRecursos,
  verticesValidosCiudad,
  verticesValidosPoblado,
  type AccionJuego,
  type EstadoJuego,
  type IdJugador,
  type Recurso,
} from '@colonist/motor-compartido';
import { evaluarPosicion, mejorBarcoHaciaPoblado, mejorCarreteraHaciaPoblado, puntuarVertice } from './heuristicas.js';
import { decidirConReglas } from './politica.js';

export interface OpcionesMontecarlo {
  /** Tiempo máximo de búsqueda por decisión. */
  presupuestoMs: number;
  /** Simulaciones máximas por candidata. */
  simulaciones: number;
  /** Acciones simuladas como máximo en cada continuación. */
  profundidad: number;
}

export const OPCIONES_MONTECARLO_POR_DEFECTO: OpcionesMontecarlo = {
  presupuestoMs: 300,
  simulaciones: 12,
  profundidad: 120,
};

/** Copia del estado en la que la información que `id` no conoce se reparte al azar. */
export function determinizar(estado: EstadoJuego, id: IdJugador, rng: GeneradorAleatorio): EstadoJuego {
  const copia = clonarEstado(estado);
  const rivales = copia.jugadores.filter((j) => j.id !== id);

  const cartas: Recurso[] = rng.barajar(rivales.flatMap((j) => RECURSOS.flatMap((r) => Array<Recurso>(j.recursos[r]).fill(r))));
  for (const rival of rivales) {
    const total = RECURSOS.reduce((s, r) => s + rival.recursos[r], 0);
    rival.recursos = { madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 };
    for (const carta of cartas.splice(0, total)) {
      rival.recursos[carta]++;
    }
  }

  const desconocidas = rng.barajar([...copia.mazoDesarrollo, ...rivales.flatMap((j) => j.cartasDesarrollo.map((c) => c.tipo))]);
  for (const rival of rivales) {
    rival.cartasDesarrollo = rival.cartasDesarrollo.map((c) => ({ ...c, tipo: desconocidas.pop()! }));
  }
  copia.mazoDesarrollo = desconocidas;

  // Ciudades y Caballeros: mercancías y cartas de progreso de los rivales, y el orden de los mazos.
  if (copia.cyc) {
    const mercancias = rng.barajar(rivales.flatMap((j) => MERCANCIAS.flatMap((m) => Array<Mercancia>(j.cyc!.mercancias[m]).fill(m))));
    const progreso = rng.barajar(rivales.flatMap((j) => j.cyc!.cartasProgreso));
    for (const rival of rivales) {
      const datos = rival.cyc!;
      const totalMercancias = MERCANCIAS.reduce((s, m) => s + datos.mercancias[m], 0);
      datos.mercancias = { papel: 0, tela: 0, moneda: 0 };
      for (const m of mercancias.splice(0, totalMercancias)) {
        datos.mercancias[m]++;
      }
      datos.cartasProgreso = progreso.splice(0, datos.cartasProgreso.length);
    }
    for (const linea of LINEAS_MEJORA) {
      copia.cyc.mazos[linea] = rng.barajar(copia.cyc.mazos[linea]);
    }
  }
  copia.barajaDados = rng.barajar(copia.barajaDados);
  copia.semilla = rng.entero(2 ** 31);
  return copia;
}

/** Jugadas candidatas que vale la pena comparar en la fase de acciones. */
function candidatas(estado: EstadoJuego, id: IdJugador, base: AccionJuego): AccionJuego[] {
  const j = estado.jugadores.find((x) => x.id === id)!;
  const lista: AccionJuego[] = [base];
  const anadir = (a: AccionJuego) => {
    if (!lista.some((x) => JSON.stringify(x) === JSON.stringify(a))) {
      lista.push(a);
    }
  };
  if (j.piezas.ciudades > 0 && tieneRecursos(j.recursos, COSTES.ciudad)) {
    for (const vertice of verticesValidosCiudad(estado, id).slice(0, 2)) {
      anadir({ tipo: 'construirCiudad', jugador: id, vertice });
    }
  }
  if (j.piezas.poblados > 0 && tieneRecursos(j.recursos, COSTES.poblado)) {
    const mejores = verticesValidosPoblado(estado, id)
      .sort((a, b) => puntuarVertice(estado, id, b) - puntuarVertice(estado, id, a))
      .slice(0, 3);
    for (const vertice of mejores) {
      anadir({ tipo: 'construirPoblado', jugador: id, vertice });
    }
  }
  if (j.piezas.carreteras > 0 && tieneRecursos(j.recursos, COSTES.carretera)) {
    const camino = mejorCarreteraHaciaPoblado(estado, id);
    if (camino) {
      anadir({ tipo: 'construirCarretera', jugador: id, arista: camino.arista });
    }
  }
  if ((j.piezas.barcos ?? 0) > 0 && tieneRecursos(j.recursos, COSTES.barco)) {
    const ruta = mejorBarcoHaciaPoblado(estado, id);
    if (ruta) {
      anadir({ tipo: 'construirBarco', jugador: id, arista: ruta.arista });
    }
  }
  if (estado.mazoDesarrollo.length > 0 && tieneRecursos(j.recursos, COSTES.cartaDesarrollo)) {
    anadir({ tipo: 'comprarCartaDesarrollo', jugador: id });
  }
  anadir({ tipo: 'finalizarTurno', jugador: id });
  return lista;
}

/** Juega la partida con la política Medio hasta la profundidad dada y puntúa el resultado. */
function simular(estado: EstadoJuego, id: IdJugador, profundidad: number, rng: GeneradorAleatorio): number {
  let actual = estado;
  const turnoFinal = estado.turno.numero + estado.jugadores.length;
  for (let paso = 0; paso < profundidad && actual.fase.tipo !== 'finalizada' && actual.turno.numero <= turnoFinal; paso++) {
    const fase = actual.fase;
    const actor =
      fase.tipo === 'descartar' || fase.tipo === 'elegirOro'
        ? Object.keys(fase.pendientes)[0]!
        : fase.tipo === 'construccionEspecial'
          ? fase.pendientes[0]!
          : jugadorEnTurno(actual).id;
    const accion = decidirConReglas(actual, actor, 'medio', rng);
    if (!accion) {
      break;
    }
    const resultado = aplicarAccion(actual, accion);
    if (!resultado.ok) {
      break;
    }
    actual = resultado.estado;
  }
  return evaluarPosicion(actual, id);
}

export function decidirConMontecarlo(
  estado: EstadoJuego,
  id: IdJugador,
  rng: GeneradorAleatorio,
  opciones: OpcionesMontecarlo = OPCIONES_MONTECARLO_POR_DEFECTO,
): AccionJuego | null {
  const base = decidirConReglas(estado, id, 'medio', rng);
  // Solo merece la pena pensar en las decisiones de construcción del propio turno.
  if (!base || estado.fase.tipo !== 'acciones' || jugadorEnTurno(estado).id !== id || estado.ofertas.length > 0) {
    return base;
  }
  const lista = candidatas(estado, id, base);
  if (lista.length < 2) {
    return base;
  }

  const sumas = lista.map(() => 0);
  const cuentas = lista.map(() => 0);
  const limite = Date.now() + opciones.presupuestoMs;
  for (let ronda = 0; ronda < opciones.simulaciones && Date.now() < limite; ronda++) {
    lista.forEach((accion, i) => {
      if (Date.now() >= limite && ronda > 0) {
        return;
      }
      const inicial = determinizar(estado, id, rng);
      const resultado = aplicarAccion(inicial, accion);
      if (!resultado.ok) {
        sumas[i] = -Infinity;
        cuentas[i] = 1;
        return;
      }
      sumas[i]! += simular(resultado.estado, id, opciones.profundidad, rng);
      cuentas[i]!++;
    });
  }

  let mejor = 0;
  let mejorMedia = -Infinity;
  lista.forEach((_, i) => {
    const media = cuentas[i]! > 0 ? sumas[i]! / cuentas[i]! : -Infinity;
    if (media > mejorMedia) {
      mejorMedia = media;
      mejor = i;
    }
  });
  return lista[mejor]!;
}

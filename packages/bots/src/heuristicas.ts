/** Valoraciones heurísticas del tablero que comparten todos los niveles de bot. */

import {
  COSTES,
  grafoDe,
  longitudRutaMasLarga,
  puntosDeVictoria,
  puntosProbabilidad,
  RECURSOS,
  recursoDeTerreno,
  type EstadoJuego,
  type IdArista,
  type IdHexagono,
  type IdJugador,
  type IdVertice,
  type Recurso,
  type RecursosParciales,
} from '@colonist/motor-compartido';

export type Objetivo = 'ciudad' | 'poblado' | 'carretera' | 'barco' | 'cartaDesarrollo';

/** Puntos de probabilidad que produce un jugador por recurso (ciudades cuentan doble; el ladrón anula). */
export function produccionPorRecurso(estado: EstadoJuego, id: IdJugador): Record<Recurso, number> {
  const produccion: Record<Recurso, number> = { madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 };
  const grafo = grafoDe(estado);
  for (const [vertice, edificio] of Object.entries(estado.tablero.edificios)) {
    if (edificio.jugador !== id) {
      continue;
    }
    for (const h of grafo.hexagonosDeVertice(vertice)) {
      const recurso = recursoDeTerreno(h.terreno);
      if (recurso !== null && h.ficha !== null && h.id !== estado.tablero.ladron) {
        produccion[recurso] += puntosProbabilidad(h.ficha) * (edificio.tipo === 'ciudad' ? 2 : 1);
      }
    }
  }
  return produccion;
}

/** Cuántos hexágonos hay de cada recurso: los escasos valen más. */
function escasez(estado: EstadoJuego): Record<Recurso, number> {
  const conteo: Record<Recurso, number> = { madera: 0, arcilla: 0, trigo: 0, oveja: 0, mineral: 0 };
  for (const h of grafoDe(estado).hexagonos.values()) {
    const recurso = recursoDeTerreno(h.terreno);
    if (recurso !== null) {
      conteo[recurso]++;
    }
  }
  const total = RECURSOS.reduce((s, r) => s + conteo[r], 0) / RECURSOS.length;
  const peso = {} as Record<Recurso, number>;
  for (const r of RECURSOS) {
    peso[r] = conteo[r] === 0 ? 1.5 : Math.min(1.5, Math.max(0.8, total / conteo[r]));
  }
  return peso;
}

/** Valor de construir un poblado en un vértice para un jugador. */
export function puntuarVertice(estado: EstadoJuego, id: IdJugador, vertice: IdVertice): number {
  const grafo = grafoDe(estado);
  const actual = produccionPorRecurso(estado, id);
  const pesos = escasez(estado);
  let valor = 0;
  const recursosNuevos = new Set<Recurso>();
  for (const h of grafo.hexagonosDeVertice(vertice)) {
    const recurso = recursoDeTerreno(h.terreno);
    if (recurso === null || h.ficha === null) {
      continue;
    }
    const puntos = puntosProbabilidad(h.ficha) * (h.id === estado.tablero.ladron ? 0.4 : 1);
    valor += puntos * pesos[recurso];
    if (actual[recurso] === 0) {
      recursosNuevos.add(recurso);
    }
  }
  valor += recursosNuevos.size * 1.5;

  for (const puerto of estado.tablero.puertos) {
    if (!puerto.vertices.includes(vertice)) {
      continue;
    }
    if (puerto.tipo === 'generico') {
      valor += 1.5;
    } else {
      valor += actual[puerto.tipo] >= 5 ? 3 : 0.8;
    }
  }
  return valor;
}

/** Cartas que faltan para pagar un coste. */
export function faltantes(mano: RecursosParciales, coste: RecursosParciales): RecursosParciales {
  const falta: RecursosParciales = {};
  for (const r of RECURSOS) {
    const n = (coste[r] ?? 0) - (mano[r] ?? 0);
    if (n > 0) {
      falta[r] = n;
    }
  }
  return falta;
}

export function totalFaltante(mano: RecursosParciales, coste: RecursosParciales): number {
  return RECURSOS.reduce((s, r) => s + Math.max(0, (coste[r] ?? 0) - (mano[r] ?? 0)), 0);
}

export const COSTE_OBJETIVO: Readonly<Record<Objetivo, RecursosParciales>> = COSTES;

export function mejorCarreteraHaciaPoblado(
  estado: EstadoJuego,
  id: IdJugador,
): { arista: IdArista; vertice: IdVertice; valor: number } | null {
  return mejorTramoHaciaPoblado(estado, id, 'carretera', 3);
}

/** Navegantes: primer barco del camino por mar hacia el mejor sitio para un poblado (hasta 5 barcos). */
export function mejorBarcoHaciaPoblado(
  estado: EstadoJuego,
  id: IdJugador,
): { arista: IdArista; vertice: IdVertice; valor: number } | null {
  return estado.tablero.barcos ? mejorTramoHaciaPoblado(estado, id, 'barco', 5) : null;
}

/**
 * Busca, a través de aristas libres (de tierra para carreteras, de mar para barcos),
 * el mejor vértice donde se podrá construir un poblado y devuelve la primera
 * arista del camino.
 */
function mejorTramoHaciaPoblado(
  estado: EstadoJuego,
  id: IdJugador,
  tipo: 'carretera' | 'barco',
  maximo: number,
): { arista: IdArista; vertice: IdVertice; valor: number } | null {
  const grafo = grafoDe(estado);
  const { carreteras, edificios } = estado.tablero;
  const barcos = estado.tablero.barcos ?? {};
  const pirata = estado.tablero.pirata;
  const propias = tipo === 'carretera' ? carreteras : barcos;
  const ocupado = (v: IdVertice) => edificios[v] !== undefined;
  const rival = (v: IdVertice) => edificios[v] !== undefined && edificios[v]!.jugador !== id;
  const transitable = (a: IdArista) => {
    const arista = grafo.arista(a);
    if (carreteras[a] !== undefined || barcos[a] !== undefined) {
      return false;
    }
    if (tipo === 'carretera') {
      return arista.enTierra;
    }
    return arista.enMar && !arista.hexagonos.some((c) => c.clave() === pirata);
  };

  const origenes = new Set<IdVertice>();
  for (const [arista, dueno] of Object.entries(propias)) {
    if (dueno === id) {
      grafo.arista(arista).vertices.forEach((v) => origenes.add(v));
    }
  }
  for (const [v, e] of Object.entries(edificios)) {
    if (e.jugador === id) {
      origenes.add(v);
    }
  }

  let mejor: { arista: IdArista; vertice: IdVertice; valor: number } | null = null;
  const visitados = new Set<IdVertice>([...origenes]);
  let frontera: { vertice: IdVertice; primera: IdArista | null; profundidad: number }[] = [...origenes]
    .filter((v) => !rival(v))
    .map((vertice) => ({ vertice, primera: null, profundidad: 0 }));

  while (frontera.length > 0) {
    const siguiente: typeof frontera = [];
    for (const nodo of frontera) {
      if (nodo.profundidad >= maximo) {
        continue;
      }
      for (const arista of grafo.aristasDeVertice(nodo.vertice)) {
        if (!transitable(arista)) {
          continue;
        }
        const [a, b] = grafo.arista(arista).vertices;
        const otro = a === nodo.vertice ? b : a;
        if (visitados.has(otro) || rival(otro)) {
          continue;
        }
        visitados.add(otro);
        const primera = nodo.primera ?? arista;
        const profundidad = nodo.profundidad + 1;
        if (grafo.vertice(otro).enTierra && !ocupado(otro) && grafo.cumpleReglaDistancia(otro, ocupado)) {
          const valor = puntuarVertice(estado, id, otro) - 2.5 * profundidad;
          if (!mejor || valor > mejor.valor) {
            mejor = { arista: primera, vertice: otro, valor };
          }
        }
        siguiente.push({ vertice: otro, primera, profundidad });
      }
    }
    frontera = siguiente;
  }
  return mejor;
}

/** Valor de dejar el ladrón en un hexágono: cuánto perjudica a los rivales (sobre todo al líder). */
export function puntuarLadron(estado: EstadoJuego, id: IdJugador, hexagono: IdHexagono): number {
  const grafo = grafoDe(estado);
  const h = grafo.hexagono(hexagono);
  const puntos = h.ficha === null ? 0 : puntosProbabilidad(h.ficha);
  let valor = 0;
  for (const v of h.vertices) {
    const edificio = estado.tablero.edificios[v];
    if (!edificio) {
      continue;
    }
    const multiplicador = edificio.tipo === 'ciudad' ? 2 : 1;
    if (edificio.jugador === id) {
      valor -= 3 * puntos * multiplicador;
    } else {
      const lider = 1 + puntosDeVictoria(estado, edificio.jugador, false) / estado.configuracion.puntosVictoria;
      valor += puntos * multiplicador * lider;
    }
  }
  return valor;
}

/** Valor global de una posición para un jugador (lo usa la búsqueda Monte Carlo). */
export function evaluarPosicion(estado: EstadoJuego, id: IdJugador): number {
  if (estado.fase.tipo === 'finalizada') {
    return estado.fase.ganador === id ? 10_000 : -10_000;
  }
  const valorDe = (jugador: IdJugador, ocultos: boolean) => {
    const datos = estado.jugadores.find((j) => j.id === jugador)!;
    const produccion = produccionPorRecurso(estado, jugador);
    const diversidad = RECURSOS.filter((r) => produccion[r] > 0).length;
    const cartas = RECURSOS.reduce((s, r) => s + datos.recursos[r], 0);
    return (
      100 * puntosDeVictoria(estado, jugador, ocultos) +
      5 * RECURSOS.reduce((s, r) => s + produccion[r], 0) +
      6 * diversidad +
      2 * Math.min(cartas, 7) -
      (cartas > 7 ? 2 * (cartas - 7) : 0) +
      8 * datos.cartasDesarrollo.length +
      6 * datos.caballerosJugados +
      4 * Math.min(longitudRutaMasLarga(estado, jugador), 8)
    );
  };
  const propio = valorDe(id, true);
  const rivales = estado.jugadores.filter((j) => j.id !== id).map((j) => valorDe(j.id, false));
  return propio - 0.6 * Math.max(0, ...rivales);
}

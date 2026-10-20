/**
 * Consultas puras sobre el estado: qué se puede construir y dónde, puntos,
 * tasas de comercio, Gran Ruta Comercial y producción. No modifican el estado;
 * las usan el reductor, la interfaz (para iluminar posiciones válidas) y los bots.
 */

import { GrafoTablero, type DefinicionHexagono, type IdArista, type IdHexagono, type IdVertice } from '../grafo.js';
import { esTerrenoJugable, RECURSOS, recursoDeTerreno, type Recurso } from '../terreno.js';
import { manoVacia, totalCartas } from './recursos.js';
import {
  LONGITUD_MINIMA_GRAN_RUTA,
  MERCANCIA_DE_TERRENO,
  PUNTOS_METROPOLIS,
  PUNTOS_POR_TITULO,
  type EstadoJuego,
  type EstadoJugador,
  type IdJugador,
  type ManoRecursos,
  type TipoCartaDesarrollo,
} from './tipos.js';

/** Cualquier objeto con tablero: la partida completa o la vista de un jugador. */
export type ConTablero = Pick<EstadoJuego, 'tablero'>;

const grafosEnCache = new WeakMap<readonly DefinicionHexagono[], GrafoTablero>();
const grafosConMarEnCache = new WeakMap<readonly DefinicionHexagono[], GrafoTablero>();

/** ¿Se juega con el módulo Navegantes? */
export function conNavegantes(estado: ConTablero): boolean {
  return estado.tablero.barcos !== undefined;
}

/** Grafo del tablero de la partida (se construye una vez por mapa y se reutiliza). */
export function grafoDe(estado: ConTablero): GrafoTablero {
  const hexagonos = estado.tablero.hexagonos;
  const incluirMar = conNavegantes(estado);
  const cache = incluirMar ? grafosConMarEnCache : grafosEnCache;
  let grafo = cache.get(hexagonos);
  if (!grafo) {
    grafo = new GrafoTablero(hexagonos, { incluirMar });
    cache.set(hexagonos, grafo);
  }
  return grafo;
}

/** Jugador que coloca en la posición `indice` del orden en serpiente 1 → N, N → 1. */
export function ordenSerpiente(indice: number, numeroJugadores: number): number {
  return indice < numeroJugadores ? indice : 2 * numeroJugadores - 1 - indice;
}

export function buscarJugador(estado: EstadoJuego, id: IdJugador): EstadoJugador | undefined {
  return estado.jugadores.find((j) => j.id === id);
}

export function jugadorEnTurno(estado: EstadoJuego): EstadoJugador {
  return estado.jugadores[estado.turno.jugadorActual]!;
}

/**
 * Puntos de victoria. Con `incluirOcultos` cuenta también las cartas de Punto de
 * Victoria, que los rivales no ven.
 */
export function puntosDeVictoria(estado: EstadoJuego, id: IdJugador, incluirOcultos = true): number {
  let puntos = 0;
  for (const edificio of Object.values(estado.tablero.edificios)) {
    if (edificio.jugador === id) {
      puntos += edificio.tipo === 'ciudad' ? 2 : 1;
    }
  }
  if (estado.titulos.granRuta === id) {
    puntos += PUNTOS_POR_TITULO;
  }
  if (estado.titulos.mayorEjercito === id) {
    puntos += PUNTOS_POR_TITULO;
  }
  const jugador = buscarJugador(estado, id);
  if (incluirOcultos) {
    puntos += jugador?.cartasDesarrollo.filter((c) => c.tipo === 'puntoVictoria').length ?? 0;
  }
  // Ciudades y Caballeros: metrópolis, Defensor de Catán, cartas de puntos y mercader.
  if (estado.cyc && jugador?.cyc) {
    for (const vertice of Object.values(estado.cyc.metropolis)) {
      if (vertice !== null && estado.tablero.edificios[vertice]?.jugador === id) {
        puntos += PUNTOS_METROPOLIS;
      }
    }
    puntos += jugador.cyc.puntosDefensor + jugador.cyc.puntosProgreso;
    if (estado.cyc.mercader?.jugador === id) {
      puntos += 1;
    }
  }
  return puntos;
}

function tieneCarreteraEn(estado: ConTablero, grafo: GrafoTablero, vertice: IdVertice, id: IdJugador): boolean {
  return grafo.aristasDeVertice(vertice).some((a) => estado.tablero.carreteras[a] === id);
}

function tieneBarcoEn(estado: ConTablero, grafo: GrafoTablero, vertice: IdVertice, id: IdJugador, salvo?: IdArista): boolean {
  const barcos = estado.tablero.barcos;
  return barcos !== undefined && grafo.aristasDeVertice(vertice).some((a) => a !== salvo && barcos[a] === id);
}

function aristaOcupada(estado: ConTablero, arista: IdArista): boolean {
  return estado.tablero.carreteras[arista] !== undefined || estado.tablero.barcos?.[arista] !== undefined;
}

export function esVerticeValidoPoblado(
  estado: ConTablero,
  id: IdJugador,
  vertice: IdVertice,
  inicial: boolean,
): boolean {
  const grafo = grafoDe(estado);
  if (!grafo.vertices.has(vertice) || !grafo.vertice(vertice).enTierra || estado.tablero.caballeros?.[vertice]) {
    return false;
  }
  const edificios = estado.tablero.edificios;
  if (!grafo.cumpleReglaDistancia(vertice, (v) => edificios[v] !== undefined)) {
    return false;
  }
  return inicial || tieneCarreteraEn(estado, grafo, vertice, id) || tieneBarcoEn(estado, grafo, vertice, id);
}

export function verticesValidosPoblado(estado: ConTablero, id: IdJugador, inicial = false): IdVertice[] {
  return [...grafoDe(estado).vertices.keys()].filter((v) => esVerticeValidoPoblado(estado, id, v, inicial));
}

/**
 * Una carretera debe tocar un edificio propio o continuar una carretera propia,
 * pero no puede continuar a través de un vértice con un edificio rival.
 */
export function esAristaValidaCarretera(estado: ConTablero, id: IdJugador, arista: IdArista): boolean {
  const grafo = grafoDe(estado);
  if (!grafo.aristas.has(arista) || !grafo.arista(arista).enTierra || aristaOcupada(estado, arista)) {
    return false;
  }
  return grafo.arista(arista).vertices.some((v) => {
    const edificio = estado.tablero.edificios[v];
    if (edificio) {
      return edificio.jugador === id;
    }
    // Ciudades y Caballeros: un caballero rival también corta el camino.
    const caballero = estado.tablero.caballeros?.[v];
    if (caballero && caballero.jugador !== id) {
      return false;
    }
    return tieneCarreteraEn(estado, grafo, v, id);
  });
}

export function aristasValidasCarretera(estado: ConTablero, id: IdJugador): IdArista[] {
  return [...grafoDe(estado).aristas.keys()].filter((a) => esAristaValidaCarretera(estado, id, a));
}

/** En la colocación inicial la carretera debe salir del poblado recién colocado. */
export function aristasValidasCarreteraInicial(estado: ConTablero, vertice: IdVertice): IdArista[] {
  const grafo = grafoDe(estado);
  return grafo.aristasDeVertice(vertice).filter((a) => grafo.arista(a).enTierra && !aristaOcupada(estado, a));
}

// ───────────── Navegantes ─────────────

/** ¿La arista bordea el hexágono donde está el barco pirata? */
function juntoAlPirata(estado: ConTablero, grafo: GrafoTablero, arista: IdArista): boolean {
  const pirata = estado.tablero.pirata;
  return pirata != null && grafo.arista(arista).hexagonos.some((c) => c.clave() === pirata);
}

/**
 * Un barco va en una arista que da al mar y debe salir de un edificio propio o
 * continuar una línea de barcos propia (no de una carretera). No se puede
 * construir junto al barco pirata.
 */
export function esAristaValidaBarco(estado: ConTablero, id: IdJugador, arista: IdArista, salvo?: IdArista): boolean {
  if (!conNavegantes(estado)) {
    return false;
  }
  const grafo = grafoDe(estado);
  if (!grafo.aristas.has(arista) || !grafo.arista(arista).enMar || aristaOcupada(estado, arista)) {
    return false;
  }
  if (juntoAlPirata(estado, grafo, arista)) {
    return false;
  }
  return grafo.arista(arista).vertices.some((v) => {
    const edificio = estado.tablero.edificios[v];
    if (edificio) {
      return edificio.jugador === id;
    }
    return tieneBarcoEn(estado, grafo, v, id, salvo);
  });
}

export function aristasValidasBarco(estado: ConTablero, id: IdJugador): IdArista[] {
  return [...grafoDe(estado).aristas.keys()].filter((a) => esAristaValidaBarco(estado, id, a));
}

export function aristasValidasBarcoInicial(estado: ConTablero, vertice: IdVertice): IdArista[] {
  if (!conNavegantes(estado)) {
    return [];
  }
  const grafo = grafoDe(estado);
  return grafo
    .aristasDeVertice(vertice)
    .filter((a) => grafo.arista(a).enMar && !aristaOcupada(estado, a) && !juntoAlPirata(estado, grafo, a));
}

/**
 * Barcos que se pueden mover este turno: los del final de una línea abierta (un
 * extremo sin edificio propio ni otro barco propio), que no se construyeron este
 * turno y que no están junto al pirata. Solo uno por turno.
 */
export function barcosMovibles(estado: Pick<EstadoJuego, 'tablero' | 'turno'>, id: IdJugador): IdArista[] {
  const barcos = estado.tablero.barcos;
  if (!barcos || estado.turno.barcoMovido) {
    return [];
  }
  const grafo = grafoDe(estado);
  const nuevos = new Set(estado.turno.barcosNuevos ?? []);
  return Object.keys(barcos).filter((arista) => {
    if (barcos[arista] !== id || nuevos.has(arista) || juntoAlPirata(estado, grafo, arista)) {
      return false;
    }
    return grafo.arista(arista).vertices.some(
      (v) => estado.tablero.edificios[v]?.jugador !== id && !tieneBarcoEn(estado, grafo, v, id, arista),
    );
  });
}

/** Dónde puede ir un barco que se mueve (como si ya no estuviera en `desde`). */
export function destinosBarco(estado: ConTablero, id: IdJugador, desde: IdArista): IdArista[] {
  const barcos = estado.tablero.barcos;
  if (!barcos) {
    return [];
  }
  const sinBarco: ConTablero = { tablero: { ...estado.tablero, barcos: { ...barcos } } };
  delete sinBarco.tablero.barcos![desde];
  return aristasValidasBarco(sinBarco, id).filter((a) => a !== desde);
}

/** Hexágonos de agua a los que se puede mover el pirata. */
export function hexagonosValidosPirata(estado: ConTablero): IdHexagono[] {
  if (!conNavegantes(estado)) {
    return [];
  }
  return [...grafoDe(estado).hexagonos.values()]
    .filter((h) => !esTerrenoJugable(h.terreno) && h.id !== estado.tablero.pirata)
    .map((h) => h.id);
}

/** Rivales con barcos junto al hexágono del pirata y al menos una carta. */
export function victimasPirata(estado: EstadoJuego, hexagono: IdHexagono, ladron: IdJugador): IdJugador[] {
  const barcos = estado.tablero.barcos ?? {};
  const victimas = new Set<IdJugador>();
  for (const a of grafoDe(estado).hexagono(hexagono).aristas) {
    const dueno = barcos[a];
    if (dueno !== undefined && dueno !== ladron) {
      victimas.add(dueno);
    }
  }
  return estado.jugadores.filter((j) => victimas.has(j.id) && totalCartas(j.recursos) > 0).map((j) => j.id);
}

/** Cartas a elegir por los campos de oro con una tirada (1 por poblado, 2 por ciudad). */
export function calcularOro(estado: EstadoJuego, suma: number): Record<IdJugador, number> {
  const oro: Record<IdJugador, number> = {};
  for (const h of grafoDe(estado).hexagonos.values()) {
    if (h.terreno !== 'oro' || h.ficha !== suma || h.id === estado.tablero.ladron) {
      continue;
    }
    for (const v of h.vertices) {
      const edificio = estado.tablero.edificios[v];
      if (edificio) {
        oro[edificio.jugador] = (oro[edificio.jugador] ?? 0) + (edificio.tipo === 'ciudad' ? 2 : 1);
      }
    }
  }
  return oro;
}

export function verticesValidosCiudad(estado: ConTablero, id: IdJugador): IdVertice[] {
  return Object.entries(estado.tablero.edificios)
    .filter(([, e]) => e.jugador === id && e.tipo === 'poblado')
    .map(([v]) => v);
}

/** Hexágonos a los que se puede mover el ladrón: cualquiera de tierra salvo donde ya está. */
export function hexagonosValidosLadron(estado: ConTablero): IdHexagono[] {
  return [...grafoDe(estado).hexagonos.values()]
    .filter((h) => esTerrenoJugable(h.terreno) && h.id !== estado.tablero.ladron)
    .map((h) => h.id);
}

/** Rivales con edificios junto al hexágono y al menos una carta. */
export function victimasRobo(estado: EstadoJuego, hexagono: IdHexagono, ladron: IdJugador): IdJugador[] {
  const victimas = new Set<IdJugador>();
  for (const v of grafoDe(estado).hexagono(hexagono).vertices) {
    const edificio = estado.tablero.edificios[v];
    if (edificio && edificio.jugador !== ladron) {
      victimas.add(edificio.jugador);
    }
  }
  return estado.jugadores
    .filter((j) => victimas.has(j.id) && totalCartas(j.recursos) > 0)
    .map((j) => j.id);
}

/** Cartas que se entregan a la banca por cada carta recibida: 4, 3 con puerto genérico, 2 con puerto específico. */
export function tasasComercio(estado: ConTablero, id: IdJugador): Record<Recurso, number> {
  const tasas: Record<Recurso, number> = { madera: 4, arcilla: 4, trigo: 4, oveja: 4, mineral: 4 };
  for (const puerto of estado.tablero.puertos) {
    const tieneAcceso = puerto.vertices.some((v) => estado.tablero.edificios[v]?.jugador === id);
    if (!tieneAcceso) {
      continue;
    }
    if (puerto.tipo === 'generico') {
      for (const r of RECURSOS) {
        tasas[r] = Math.min(tasas[r], 3);
      }
    } else {
      tasas[puerto.tipo] = 2;
    }
  }
  return tasas;
}

/**
 * Longitud de la ruta comercial más larga de un jugador, sin repetir tramos.
 * Un edificio rival corta la ruta en ese vértice. Con Navegantes cuentan también
 * los barcos, pero solo se pasa de carretera a barco (o al revés) a través de un
 * edificio propio.
 */
export function longitudRutaMasLarga(estado: ConTablero, id: IdJugador): number {
  const grafo = grafoDe(estado);
  const { carreteras, edificios } = estado.tablero;
  const barcos = estado.tablero.barcos ?? {};
  const tipoDe = (a: IdArista): 'carretera' | 'barco' | null =>
    carreteras[a] === id ? 'carretera' : barcos[a] === id ? 'barco' : null;
  const propias = [...Object.keys(carreteras), ...Object.keys(barcos)].filter((a) => tipoDe(a) !== null);
  const usadas = new Set<IdArista>();
  let mejor = 0;

  const explorar = (vertice: IdVertice, longitud: number, tipoAnterior: 'carretera' | 'barco'): void => {
    mejor = Math.max(mejor, longitud);
    const edificio = edificios[vertice];
    const caballero = estado.tablero.caballeros?.[vertice];
    if ((edificio && edificio.jugador !== id) || (caballero && caballero.jugador !== id)) {
      return;
    }
    const edificioPropio = edificio?.jugador === id;
    for (const arista of grafo.aristasDeVertice(vertice)) {
      const tipo = tipoDe(arista);
      if (usadas.has(arista) || tipo === null || (tipo !== tipoAnterior && !edificioPropio)) {
        continue;
      }
      const [a, b] = grafo.arista(arista).vertices;
      usadas.add(arista);
      explorar(a === vertice ? b : a, longitud + 1, tipo);
      usadas.delete(arista);
    }
  };

  for (const arista of propias) {
    const tipo = tipoDe(arista)!;
    const [a, b] = grafo.arista(arista).vertices;
    usadas.add(arista);
    explorar(a, 1, tipo);
    explorar(b, 1, tipo);
    usadas.delete(arista);
  }
  return mejor;
}

/**
 * Quién debe tener la Gran Ruta Comercial. El titular la conserva mientras siga
 * empatado en cabeza; si la pierde y hay empate entre otros, nadie la tiene.
 */
export function calcularTitularGranRuta(estado: EstadoJuego): IdJugador | null {
  const longitudes = new Map(estado.jugadores.map((j) => [j.id, longitudRutaMasLarga(estado, j.id)]));
  const maxima = Math.max(...longitudes.values());
  if (maxima < LONGITUD_MINIMA_GRAN_RUTA) {
    return null;
  }
  const titular = estado.titulos.granRuta;
  if (titular !== null && longitudes.get(titular) === maxima) {
    return titular;
  }
  const candidatos = [...longitudes].filter(([, l]) => l === maxima).map(([id]) => id);
  return candidatos.length === 1 ? candidatos[0]! : null;
}

/**
 * Recursos que produce una tirada (≠ 7), aplicando la regla de escasez de la banca:
 * si no alcanza para todos, nadie recibe ese recurso, salvo que solo lo reciba un
 * jugador, que se lleva lo que quede.
 */
export function calcularProduccion(estado: EstadoJuego, suma: number): Record<IdJugador, ManoRecursos> {
  const grafo = grafoDe(estado);
  const pedido = new Map<IdJugador, ManoRecursos>(estado.jugadores.map((j) => [j.id, manoVacia()]));
  for (const hexagono of grafo.hexagonos.values()) {
    if (hexagono.ficha !== suma || hexagono.id === estado.tablero.ladron) {
      continue;
    }
    const recurso = recursoDeTerreno(hexagono.terreno);
    if (recurso === null) {
      continue;
    }
    // Con Ciudades y Caballeros, las ciudades en bosque, pasto y montaña dan 1 recurso y 1 mercancía.
    const multiplicadorCiudad = estado.configuracion.ciudadesYCaballeros && MERCANCIA_DE_TERRENO[hexagono.terreno] ? 1 : 2;
    for (const v of hexagono.vertices) {
      const edificio = estado.tablero.edificios[v];
      if (edificio) {
        pedido.get(edificio.jugador)![recurso] += edificio.tipo === 'ciudad' ? multiplicadorCiudad : 1;
      }
    }
  }

  const reparto: Record<IdJugador, ManoRecursos> = {};
  for (const id of pedido.keys()) {
    reparto[id] = manoVacia();
  }
  for (const r of RECURSOS) {
    const beneficiarios = [...pedido].filter(([, mano]) => mano[r] > 0);
    const total = beneficiarios.reduce((suma, [, mano]) => suma + mano[r], 0);
    if (total === 0) {
      continue;
    }
    if (total <= estado.banca[r]) {
      for (const [id, mano] of beneficiarios) {
        reparto[id]![r] = mano[r];
      }
    } else if (beneficiarios.length === 1) {
      reparto[beneficiarios[0]![0]]![r] = estado.banca[r];
    }
  }
  return reparto;
}

/** Cartas de desarrollo que el jugador puede jugar ahora mismo. */
export function cartasJugables(estado: EstadoJuego, id: IdJugador): TipoCartaDesarrollo[] {
  const jugador = buscarJugador(estado, id);
  const fase = estado.fase.tipo;
  if (
    !jugador ||
    jugadorEnTurno(estado).id !== id ||
    estado.turno.haJugadoCartaDesarrollo ||
    (fase !== 'tirarDados' && fase !== 'acciones')
  ) {
    return [];
  }
  const tipos = jugador.cartasDesarrollo
    .filter((c) => c.tipo !== 'puntoVictoria' && c.turnoCompra < estado.turno.numero)
    .map((c) => c.tipo);
  return [...new Set(tipos)];
}

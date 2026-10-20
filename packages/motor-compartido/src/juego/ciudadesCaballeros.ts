/**
 * Consultas del módulo Ciudades y Caballeros (puras: no modifican el estado).
 * Las usan el reductor, la interfaz y los bots.
 */

import type { IdArista, IdHexagono, IdVertice } from '../grafo.js';
import { esTerrenoJugable, RECURSOS, recursoDeTerreno, type Recurso } from '../terreno.js';
import { grafoDe, puntosDeVictoria, tasasComercio, type ConTablero } from './reglas.js';
import { totalCartas } from './recursos.js';
import {
  CARTAS_PROGRESO_DE_PUNTOS,
  LINEAS_MEJORA,
  MERCANCIA_DE_TERRENO,
  MERCANCIAS,
  NIVEL_BENEFICIO_MEJORA,
  type Caballero,
  type EstadoJuego,
  type EstadoJugador,
  type EstadoJugadorCyC,
  type IdJugador,
  type LineaMejora,
  type ManoMercancias,
  type Mercancia,
  type MercanciasParciales,
  type NivelCaballero,
  type TipoCartaProgreso,
} from './tipos.js';

/** ¿Se juega con Ciudades y Caballeros? (también sirve con la vista de un jugador). */
export function conCaballeros(estado: ConTablero): boolean {
  return estado.tablero.caballeros !== undefined;
}

export function mercanciasVacias(): ManoMercancias {
  return { papel: 0, tela: 0, moneda: 0 };
}

export function totalMercancias(mercancias: MercanciasParciales | null | undefined): number {
  return MERCANCIAS.reduce((s, m) => s + (mercancias?.[m] ?? 0), 0);
}

export function esMercanciaValida(mercancias: MercanciasParciales): boolean {
  return Object.entries(mercancias).every(
    ([clave, n]) => (MERCANCIAS as readonly string[]).includes(clave) && Number.isInteger(n) && (n as number) >= 0,
  );
}

export function tieneMercancias(mano: MercanciasParciales, necesarias: MercanciasParciales): boolean {
  return MERCANCIAS.every((m) => (mano[m] ?? 0) >= (necesarias[m] ?? 0));
}

/** Cartas en la mano que cuentan para el descarte: recursos y mercancías. */
export function cartasEnMano(j: Pick<EstadoJugador, 'recursos' | 'cyc'>): number {
  return totalCartas(j.recursos) + totalMercancias(j.cyc?.mercancias);
}

/** Con un 7 descarta quien supere este número de cartas (cada muralla suma 2). */
export function limiteDescarte(estado: EstadoJuego, id: IdJugador): number {
  const murallas = Object.values(estado.tablero.murallas ?? {}).filter((j) => j === id).length;
  return estado.configuracion.limiteDescarte + 2 * murallas;
}

export function caballerosDe(estado: ConTablero, id: IdJugador): [IdVertice, Caballero][] {
  return Object.entries(estado.tablero.caballeros ?? {}).filter(([, c]) => c.jugador === id);
}

/** ¿Hay en el vértice un edificio o caballero de otro jugador? (corta carreteras y rutas). */
export function bloqueadoParaJugador(estado: ConTablero, vertice: IdVertice, id: IdJugador): boolean {
  const edificio = estado.tablero.edificios[vertice];
  const caballero = estado.tablero.caballeros?.[vertice];
  return (edificio !== undefined && edificio.jugador !== id) || (caballero !== undefined && caballero.jugador !== id);
}

function libre(estado: ConTablero, vertice: IdVertice): boolean {
  return estado.tablero.edificios[vertice] === undefined && estado.tablero.caballeros?.[vertice] === undefined;
}

function tieneCarreteraPropia(estado: ConTablero, vertice: IdVertice, id: IdJugador): boolean {
  return grafoDe(estado)
    .aristasDeVertice(vertice)
    .some((a) => estado.tablero.carreteras[a] === id);
}

/** Vértices libres de tierra junto a una carretera propia: ahí se colocan los caballeros nuevos. */
export function verticesValidosCaballero(estado: ConTablero, id: IdJugador): IdVertice[] {
  if (!conCaballeros(estado)) {
    return [];
  }
  const grafo = grafoDe(estado);
  return [...grafo.vertices.values()]
    .filter((v) => v.enTierra && libre(estado, v.id) && tieneCarreteraPropia(estado, v.id, id))
    .map((v) => v.id);
}

/**
 * Vértices a los que se llega desde `desde` por carreteras propias. Se puede llegar
 * a un vértice con piezas rivales, pero no pasar a través de él.
 */
export function verticesConectados(estado: ConTablero, id: IdJugador, desde: IdVertice): Set<IdVertice> {
  const grafo = grafoDe(estado);
  const alcanzados = new Set<IdVertice>([desde]);
  const pendientes = [desde];
  while (pendientes.length > 0) {
    const v = pendientes.pop()!;
    if (v !== desde && bloqueadoParaJugador(estado, v, id)) {
      continue;
    }
    for (const a of grafo.aristasDeVertice(v)) {
      if (estado.tablero.carreteras[a] !== id) {
        continue;
      }
      const [x, y] = grafo.arista(a).vertices;
      const otro = x === v ? y : x;
      if (!alcanzados.has(otro)) {
        alcanzados.add(otro);
        pendientes.push(otro);
      }
    }
  }
  alcanzados.delete(desde);
  return alcanzados;
}

/** Destinos de un caballero que se mueve: vértices libres conectados, o con un caballero rival más débil (desplazarlo). */
export function destinosCaballero(estado: ConTablero, id: IdJugador, desde: IdVertice): IdVertice[] {
  const caballero = estado.tablero.caballeros?.[desde];
  if (!caballero || caballero.jugador !== id) {
    return [];
  }
  return [...verticesConectados(estado, id, desde)].filter((v) => {
    if (estado.tablero.edificios[v]) {
      return false;
    }
    const otro = estado.tablero.caballeros?.[v];
    return otro === undefined || (otro.jugador !== id && otro.nivel < caballero.nivel);
  });
}

type ConTurno = Pick<EstadoJuego, 'tablero' | 'turno'>;

export function caballerosActivables(estado: ConTablero, id: IdJugador): IdVertice[] {
  return caballerosDe(estado, id)
    .filter(([, c]) => !c.activo)
    .map(([v]) => v);
}

/** Caballeros que pueden ascender: un nivel por turno, y al nivel 3 solo con la Fortaleza (Política 3). */
export function caballerosAscendibles(
  estado: ConTurno & { jugadores: readonly { id: IdJugador; cyc?: Pick<EstadoJugadorCyC, 'mejoras' | 'caballeros'> | null }[] },
  id: IdJugador,
): IdVertice[] {
  const cyc = estado.jugadores.find((j) => j.id === id)?.cyc;
  if (!cyc) {
    return [];
  }
  return caballerosDe(estado, id)
    .filter(([, c]) => {
      if (c.nivel >= 3 || c.turnoAscenso === estado.turno.numero) {
        return false;
      }
      const siguiente = (c.nivel + 1) as NivelCaballero;
      if (siguiente === 3 && cyc.mejoras.politica < NIVEL_BENEFICIO_MEJORA) {
        return false;
      }
      return cyc.caballeros[siguiente] > 0;
    })
    .map(([v]) => v);
}

/** Caballeros activos que pueden hacer una acción este turno (no si se activaron este mismo turno). */
export function caballerosQuePuedenActuar(estado: ConTurno, id: IdJugador): IdVertice[] {
  const turno = estado.turno.numero;
  return caballerosDe(estado, id)
    .filter(([, c]) => c.activo && c.turnoActivado !== turno && c.turnoAccion !== turno)
    .map(([v]) => v);
}

export function caballerosJuntoAlLadron(estado: ConTurno, id: IdJugador): IdVertice[] {
  const junto = new Set(grafoDe(estado).hexagono(estado.tablero.ladron).vertices);
  return caballerosQuePuedenActuar(estado, id).filter((v) => junto.has(v));
}

export function ciudadesParaMuralla(estado: ConTablero, id: IdJugador): IdVertice[] {
  return Object.entries(estado.tablero.edificios)
    .filter(([v, e]) => e.jugador === id && e.tipo === 'ciudad' && estado.tablero.murallas?.[v] === undefined)
    .map(([v]) => v);
}

export function costeMejora(nivelActual: number, conGrua: boolean): number {
  return Math.max(0, nivelActual + 1 - (conGrua ? 1 : 0));
}

/** Fuerza de los bárbaros: una por cada ciudad del tablero. */
export function fuerzaBarbaros(estado: ConTablero): number {
  return Object.values(estado.tablero.edificios).filter((e) => e.tipo === 'ciudad').length;
}

/** Defensa de un jugador: la suma de los niveles de sus caballeros activos. */
export function defensaDe(estado: ConTablero, id: IdJugador): number {
  return caballerosDe(estado, id).reduce((s, [, c]) => s + (c.activo ? c.nivel : 0), 0);
}

/**
 * Tasas de cambio con la banca. Las mercancías se cambian 4:1 (3:1 con puerto
 * genérico) o 2:1 con la Casa de Comercio (Comercio 3). La Flota Comercial y el
 * Mercader dan 2:1 a un tipo concreto.
 */
export function tasasCyC(estado: EstadoJuego, id: IdJugador): { recursos: Record<Recurso, number>; mercancias: Record<Mercancia, number> } {
  const recursos = tasasComercio(estado, id);
  const generico = estado.tablero.puertos.some(
    (p) => p.tipo === 'generico' && p.vertices.some((v) => estado.tablero.edificios[v]?.jugador === id),
  );
  const cyc = estado.jugadores.find((j) => j.id === id)?.cyc;
  const tasaMercancia = (cyc?.mejoras.comercio ?? 0) >= NIVEL_BENEFICIO_MEJORA ? 2 : generico ? 3 : 4;
  const mercancias: Record<Mercancia, number> = { papel: tasaMercancia, tela: tasaMercancia, moneda: tasaMercancia };
  const flota = estado.turno.flota;
  if (flota) {
    if ((RECURSOS as readonly string[]).includes(flota)) {
      recursos[flota as Recurso] = 2;
    } else {
      mercancias[flota as Mercancia] = 2;
    }
  }
  const mercader = estado.cyc?.mercader;
  if (mercader?.jugador === id) {
    const recurso = recursoDeTerreno(grafoDe(estado).hexagono(mercader.hexagono).terreno);
    if (recurso) {
      recursos[recurso] = 2;
    }
  }
  return { recursos, mercancias };
}

/** Mercancías que produce una tirada (ciudades en bosque, pasto o montaña), con la regla de escasez. */
export function calcularMercancias(estado: EstadoJuego, suma: number): Record<IdJugador, ManoMercancias> {
  const pedido = new Map<IdJugador, ManoMercancias>(estado.jugadores.map((j) => [j.id, mercanciasVacias()]));
  for (const h of grafoDe(estado).hexagonos.values()) {
    const mercancia = MERCANCIA_DE_TERRENO[h.terreno];
    if (!mercancia || h.ficha !== suma || h.id === estado.tablero.ladron) {
      continue;
    }
    for (const v of h.vertices) {
      const edificio = estado.tablero.edificios[v];
      if (edificio?.tipo === 'ciudad') {
        pedido.get(edificio.jugador)![mercancia]++;
      }
    }
  }
  const banca = estado.cyc?.bancaMercancias ?? mercanciasVacias();
  const reparto: Record<IdJugador, ManoMercancias> = {};
  for (const id of pedido.keys()) {
    reparto[id] = mercanciasVacias();
  }
  for (const m of MERCANCIAS) {
    const beneficiarios = [...pedido].filter(([, mano]) => mano[m] > 0);
    const total = beneficiarios.reduce((s, [, mano]) => s + mano[m], 0);
    if (total === 0) {
      continue;
    }
    if (total <= banca[m]) {
      for (const [id, mano] of beneficiarios) {
        reparto[id]![m] = mano[m];
      }
    } else if (beneficiarios.length === 1) {
      reparto[beneficiarios[0]![0]]![m] = banca[m];
    }
  }
  return reparto;
}

export function cartasProgresoJugables(estado: EstadoJuego, id: IdJugador): TipoCartaProgreso[] {
  const j = estado.jugadores.find((x) => x.id === id);
  if (!j?.cyc || estado.jugadores[estado.turno.jugadorActual]?.id !== id) {
    return [];
  }
  const fase = estado.fase.tipo;
  return [...new Set(j.cyc.cartasProgreso)].filter((c) =>
    c === 'alquimista' ? fase === 'tirarDados' : fase === 'acciones' && opcionesProgreso(estado, id, c) !== null,
  );
}

export type OpcionesProgreso =
  | { necesita: 'nada' }
  | { necesita: 'dados' }
  | { necesita: 'recurso' }
  | { necesita: 'mercancia' }
  | { necesita: 'recursoOMercancia' }
  | { necesita: 'jugador'; opciones: IdJugador[] }
  | { necesita: 'vertices'; opciones: IdVertice[]; minimo: number; maximo: number }
  | { necesita: 'hexagonos'; opciones: IdHexagono[]; minimo: number; maximo: number }
  | { necesita: 'arista'; opciones: IdArista[] };

/** Rivales con más puntos visibles que el jugador. */
export function rivalesConMasPuntos(estado: EstadoJuego, id: IdJugador, incluirEmpate = false): IdJugador[] {
  const mios = puntosDeVictoria(estado, id, false);
  return estado.jugadores
    .filter((j) => j.id !== id)
    .filter((j) => {
      const suyos = puntosDeVictoria(estado, j.id, false);
      return incluirEmpate ? suyos >= mios : suyos > mios;
    })
    .map((j) => j.id);
}

/** Carreteras abiertas: el final de una ruta (un extremo sin otra carretera ni edificio del mismo dueño). */
export function carreterasAbiertas(estado: ConTablero): IdArista[] {
  const grafo = grafoDe(estado);
  const { carreteras, edificios } = estado.tablero;
  return Object.entries(carreteras)
    .filter(([arista, dueno]) =>
      grafo.arista(arista).vertices.some(
        (v) =>
          edificios[v]?.jugador !== dueno &&
          !grafo.aristasDeVertice(v).some((a) => a !== arista && carreteras[a] === dueno),
      ),
    )
    .map(([a]) => a);
}

/** Qué necesita una carta de progreso para jugarse, o null si ahora no tendría efecto. */
export function opcionesProgreso(estado: EstadoJuego, id: IdJugador, carta: TipoCartaProgreso): OpcionesProgreso | null {
  const grafo = grafoDe(estado);
  const cyc = estado.jugadores.find((j) => j.id === id)?.cyc;
  const rivales = estado.jugadores.filter((j) => j.id !== id);
  if (!cyc) {
    return null;
  }
  switch (carta) {
    case 'imprenta':
    case 'constitucion':
      return null;
    case 'alquimista':
      return { necesita: 'dados' };
    case 'inventor': {
      const opciones = [...grafo.hexagonos.values()]
        .filter((h) => h.ficha !== null && ![2, 12, 6, 8].includes(h.ficha))
        .map((h) => h.id);
      return opciones.length >= 2 ? { necesita: 'hexagonos', opciones, minimo: 2, maximo: 2 } : null;
    }
    case 'ingeniero': {
      const opciones = cyc.murallas > 0 ? ciudadesParaMuralla(estado, id) : [];
      return opciones.length > 0 ? { necesita: 'vertices', opciones, minimo: 1, maximo: 1 } : null;
    }
    case 'herreria': {
      const opciones = caballerosAscendibles(estado, id);
      return opciones.length > 0 ? { necesita: 'vertices', opciones, minimo: 1, maximo: 2 } : null;
    }
    case 'carreteras':
    case 'riego':
    case 'mineria':
    case 'grua':
    case 'senorDeLaGuerra':
    case 'saboteador':
    case 'boda':
      return { necesita: 'nada' };
    case 'medicina': {
      const opciones = Object.entries(estado.tablero.edificios)
        .filter(([, e]) => e.jugador === id && e.tipo === 'poblado')
        .map(([v]) => v);
      const j = estado.jugadores.find((x) => x.id === id)!;
      return opciones.length > 0 && j.piezas.ciudades > 0 ? { necesita: 'vertices', opciones, minimo: 1, maximo: 1 } : null;
    }
    case 'puertoComercial':
    case 'monopolioRecursos':
      return { necesita: 'recurso' };
    case 'monopolioMercancias':
      return { necesita: 'mercancia' };
    case 'flotaComercial':
      return { necesita: 'recursoOMercancia' };
    case 'mercader': {
      const opciones = [...grafo.hexagonos.values()]
        .filter(
          (h) => esTerrenoJugable(h.terreno) && recursoDeTerreno(h.terreno) !== null && h.vertices.some((v) => estado.tablero.edificios[v]?.jugador === id),
        )
        .map((h) => h.id);
      return opciones.length > 0 ? { necesita: 'hexagonos', opciones, minimo: 1, maximo: 1 } : null;
    }
    case 'comercianteMaestro': {
      const opciones = rivalesConMasPuntos(estado, id).filter((r) => cartasEnMano(estado.jugadores.find((j) => j.id === r)!) > 0);
      return opciones.length > 0 ? { necesita: 'jugador', opciones } : null;
    }
    case 'obispo': {
      const opciones = (estado.cyc?.ataques ?? 0) > 0
        ? [...grafo.hexagonos.values()].filter((h) => h.esJugable && h.id !== estado.tablero.ladron).map((h) => h.id)
        : [];
      return opciones.length > 0 ? { necesita: 'hexagonos', opciones, minimo: 1, maximo: 1 } : null;
    }
    case 'desertor': {
      const opciones = rivales.filter((r) => caballerosDe(estado, r.id).length > 0).map((r) => r.id);
      return opciones.length > 0 ? { necesita: 'jugador', opciones } : null;
    }
    case 'diplomatico': {
      const opciones = carreterasAbiertas(estado);
      return opciones.length > 0 ? { necesita: 'arista', opciones } : null;
    }
    case 'intriga': {
      const opciones = Object.entries(estado.tablero.caballeros ?? {})
        .filter(([v, c]) => c.jugador !== id && tieneCarreteraPropia(estado, v, id))
        .map(([v]) => v);
      return opciones.length > 0 ? { necesita: 'vertices', opciones, minimo: 1, maximo: 1 } : null;
    }
    case 'espia': {
      const opciones = rivales.filter((r) => (r.cyc?.cartasProgreso.length ?? 0) > 0).map((r) => r.id);
      return opciones.length > 0 && cyc.cartasProgreso.length <= 4 ? { necesita: 'jugador', opciones } : null;
    }
  }
}

/** ¿Es una carta de puntos (se juega sola al robarla)? */
export function esCartaDePuntos(carta: TipoCartaProgreso): boolean {
  return CARTAS_PROGRESO_DE_PUNTOS.includes(carta);
}

/** Línea de mejoras con la metrópolis en un vértice, si la hay. */
export function metropolisEn(estado: EstadoJuego, vertice: IdVertice): LineaMejora | null {
  return LINEAS_MEJORA.find((l) => estado.cyc?.metropolis[l] === vertice) ?? null;
}

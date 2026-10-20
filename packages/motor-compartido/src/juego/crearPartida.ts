/** Creación del estado inicial de una partida. */

import { CoordenadasCubicas } from '../coordenadas.js';
import { idHexagono } from '../grafo.js';
import { GeneradorAleatorio } from './aleatorio.js';
import { crearMapaClasicoFijo } from './mapaClasicoFijo.js';
import { manoUniforme, manoVacia } from './recursos.js';
import {
  BARCOS_POR_JUGADOR,
  CABALLEROS_POR_NIVEL,
  CARTAS_PROGRESO,
  COMPOSICION_PROGRESO,
  MERCANCIAS_EN_BANCA,
  MURALLAS_POR_JUGADOR,
  PUNTOS_VICTORIA_CYC,
  type LineaMejora,
  type TipoCartaProgreso,
  CARTAS_POR_RECURSO_EN_BANCA,
  COLORES_JUGADOR,
  COMPOSICION_MAZO_DESARROLLO,
  CONFIGURACION_POR_DEFECTO,
  MAX_JUGADORES,
  MIN_JUGADORES,
  PIEZAS_POR_JUGADOR,
  TIPOS_CARTA_DESARROLLO,
  type ColorJugador,
  type ConfiguracionPartida,
  type EstadoJuego,
  type IdJugador,
  type MapaJuego,
  type TipoCartaDesarrollo,
} from './tipos.js';

export interface OpcionesPartida {
  jugadores: readonly { id: IdJugador; nombre: string; color?: ColorJugador }[];
  /** Semilla del generador aleatorio; por defecto, una al azar. */
  semilla?: number;
  configuracion?: Partial<ConfiguracionPartida>;
  /** Mapa de la partida (por ejemplo, de `generarMapa`); por defecto, el clásico fijo. */
  mapa?: MapaJuego;
}

/** Las 36 combinaciones posibles de dos dados. */
export function barajaDadosCompleta(): [number, number][] {
  const baraja: [number, number][] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      baraja.push([a, b]);
    }
  }
  return baraja;
}

export function crearPartida(opciones: OpcionesPartida): EstadoJuego {
  const { jugadores } = opciones;
  if (jugadores.length < MIN_JUGADORES || jugadores.length > MAX_JUGADORES) {
    throw new Error(`Una partida necesita entre ${MIN_JUGADORES} y ${MAX_JUGADORES} jugadores`);
  }
  if (new Set(jugadores.map((j) => j.id)).size !== jugadores.length) {
    throw new Error('Los identificadores de los jugadores deben ser únicos');
  }
  const colores = jugadores.map((j, i) => j.color ?? COLORES_JUGADOR[i]!);
  if (new Set(colores).size !== colores.length) {
    throw new Error('Cada jugador debe tener un color distinto');
  }

  const configuracion: ConfiguracionPartida = {
    ...CONFIGURACION_POR_DEFECTO,
    // Con 5 o 6 jugadores se juega con la fase especial de construcción salvo que se diga lo contrario.
    faseEspecialConstruccion: jugadores.length >= 5,
    // Ciudades y Caballeros se juega a 13 puntos salvo que se diga otra cosa.
    ...(opciones.configuracion?.ciudadesYCaballeros && opciones.configuracion.puntosVictoria === undefined
      ? { puntosVictoria: PUNTOS_VICTORIA_CYC }
      : {}),
    ...opciones.configuracion,
  };
  const navegantes = configuracion.navegantes;
  const cyc = configuracion.ciudadesYCaballeros;
  if (!Number.isInteger(configuracion.puntosVictoria) || configuracion.puntosVictoria < 3) {
    throw new Error('Los puntos de victoria deben ser un entero de al menos 3');
  }

  const mapa = opciones.mapa ?? crearMapaClasicoFijo();
  const desierto = mapa.hexagonos.find((h) => h.terreno === 'desierto') ?? mapa.hexagonos.find((h) => h.terreno !== 'agua');
  if (!desierto) {
    throw new Error('El mapa no tiene ningún hexágono de tierra');
  }

  const rng = new GeneradorAleatorio(opciones.semilla ?? Math.floor(Math.random() * 2 ** 32));
  // Con Ciudades y Caballeros no hay cartas de desarrollo: hay cartas de progreso.
  const mazo = cyc
    ? []
    : rng.barajar(
        TIPOS_CARTA_DESARROLLO.flatMap((tipo) => Array<TipoCartaDesarrollo>(COMPOSICION_MAZO_DESARROLLO[tipo]).fill(tipo)),
      );
  const mazoProgreso = (linea: LineaMejora): TipoCartaProgreso[] =>
    rng.barajar(CARTAS_PROGRESO[linea].flatMap((carta) => Array<TipoCartaProgreso>(COMPOSICION_PROGRESO[carta]).fill(carta)));
  const barajaDados = configuracion.modoDados === 'equilibrado' ? rng.barajar(barajaDadosCompleta()) : [];

  return {
    version: 1,
    configuracion,
    jugadores: jugadores.map((j, i) => ({
      id: j.id,
      nombre: j.nombre,
      color: colores[i]!,
      recursos: manoVacia(),
      cartasDesarrollo: [],
      caballerosJugados: 0,
      piezas: navegantes ? { ...PIEZAS_POR_JUGADOR, barcos: BARCOS_POR_JUGADOR } : { ...PIEZAS_POR_JUGADOR },
      ...(cyc
        ? {
            cyc: {
              mercancias: { papel: 0, tela: 0, moneda: 0 },
              mejoras: { comercio: 0, politica: 0, ciencia: 0 },
              cartasProgreso: [],
              puntosDefensor: 0,
              puntosProgreso: 0,
              caballeros: { 1: CABALLEROS_POR_NIVEL, 2: CABALLEROS_POR_NIVEL, 3: CABALLEROS_POR_NIVEL },
              murallas: MURALLAS_POR_JUGADOR,
            },
          }
        : {}),
    })),
    tablero: {
      hexagonos: mapa.hexagonos,
      puertos: mapa.puertos,
      edificios: {},
      carreteras: {},
      ladron: idHexagono(CoordenadasCubicas.desdeAxiales(desierto.coordenadas.q, desierto.coordenadas.r)),
      ...(navegantes ? { barcos: {}, pirata: null } : {}),
      ...(cyc ? { caballeros: {}, murallas: {} } : {}),
    },
    banca: manoUniforme(CARTAS_POR_RECURSO_EN_BANCA),
    mazoDesarrollo: mazo,
    barajaDados,
    semilla: rng.semilla,
    turno: {
      numero: 0,
      jugadorActual: 0,
      dados: null,
      haJugadoCartaDesarrollo: false,
      ...(navegantes ? { barcoMovido: false, barcosNuevos: [] } : {}),
    },
    fase: { tipo: 'colocacionInicial', paso: 'poblado', indice: 0, ultimoPoblado: null },
    titulos: { granRuta: null, mayorEjercito: null },
    ofertas: [],
    siguienteIdOferta: 1,
    ...(cyc
      ? {
          cyc: {
            barbaros: 0,
            ataques: 0,
            mazos: { comercio: mazoProgreso('comercio'), politica: mazoProgreso('politica'), ciencia: mazoProgreso('ciencia') },
            bancaMercancias: { papel: MERCANCIAS_EN_BANCA, tela: MERCANCIAS_EN_BANCA, moneda: MERCANCIAS_EN_BANCA },
            metropolis: { comercio: null, politica: null, ciencia: null },
            ultimoDadoEvento: null,
            mercader: null,
          },
        }
      : {}),
  };
}

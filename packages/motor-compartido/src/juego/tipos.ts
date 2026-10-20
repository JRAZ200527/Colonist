/**
 * Tipos del estado de la partida y de las acciones.
 *
 * Todo el estado es JSON plano (sin clases ni Map) para poder enviarlo por WebSocket,
 * guardarlo en la base de datos y reproducirlo de forma determinista.
 */

import type { DefinicionHexagono, IdArista, IdHexagono, IdVertice } from '../grafo.js';
import type { Recurso, TipoTerreno } from '../terreno.js';

export type IdJugador = string;

export const COLORES_JUGADOR = ['rojo', 'azul', 'naranja', 'blanco', 'verde', 'marron'] as const;
export type ColorJugador = (typeof COLORES_JUGADOR)[number];

export type ManoRecursos = Record<Recurso, number>;
export type RecursosParciales = Partial<Record<Recurso, number>>;

export const TIPOS_CARTA_DESARROLLO = [
  'caballero',
  'puntoVictoria',
  'construccionCarreteras',
  'abundancia',
  'monopolio',
] as const;
export type TipoCartaDesarrollo = (typeof TIPOS_CARTA_DESARROLLO)[number];

export const NOMBRES_CARTA_DESARROLLO: Readonly<Record<TipoCartaDesarrollo, string>> = {
  caballero: 'Caballero',
  puntoVictoria: 'Punto de Victoria',
  construccionCarreteras: 'Construcción de Carreteras',
  abundancia: 'Abundancia',
  monopolio: 'Monopolio',
};

export const COMPOSICION_MAZO_DESARROLLO: Readonly<Record<TipoCartaDesarrollo, number>> = {
  caballero: 14,
  puntoVictoria: 5,
  construccionCarreteras: 2,
  abundancia: 2,
  monopolio: 2,
};

export const COSTES = {
  carretera: { madera: 1, arcilla: 1 },
  poblado: { madera: 1, arcilla: 1, trigo: 1, oveja: 1 },
  ciudad: { trigo: 2, mineral: 3 },
  cartaDesarrollo: { trigo: 1, oveja: 1, mineral: 1 },
  /** Navegantes. */
  barco: { madera: 1, oveja: 1 },
} as const satisfies Record<string, RecursosParciales>;

export const PIEZAS_POR_JUGADOR = { carreteras: 15, poblados: 5, ciudades: 4 } as const;
export const BARCOS_POR_JUGADOR = 15;
export const CARTAS_POR_RECURSO_EN_BANCA = 19;
export const LONGITUD_MINIMA_GRAN_RUTA = 5;
export const CABALLEROS_MINIMOS_MAYOR_EJERCITO = 3;
export const PUNTOS_POR_TITULO = 2;
export const MIN_JUGADORES = 2;
export const MAX_JUGADORES = 6;

export interface CartaDesarrollo {
  readonly tipo: TipoCartaDesarrollo;
  /** Número de turno en que se compró: no se puede jugar ese mismo turno. */
  readonly turnoCompra: number;
}

export interface PiezasRestantes {
  carreteras: number;
  poblados: number;
  ciudades: number;
  /** Solo con Navegantes. */
  barcos?: number;
}

export interface EstadoJugador {
  readonly id: IdJugador;
  readonly nombre: string;
  readonly color: ColorJugador;
  recursos: ManoRecursos;
  cartasDesarrollo: CartaDesarrollo[];
  caballerosJugados: number;
  piezas: PiezasRestantes;
  /** Solo con Ciudades y Caballeros. */
  cyc?: EstadoJugadorCyC;
}

export type TipoPuerto = Recurso | 'generico';

export interface Puerto {
  readonly tipo: TipoPuerto;
  /** Los dos vértices de la costa que dan acceso al puerto. */
  readonly vertices: readonly [IdVertice, IdVertice];
}

/** Mapa completo de una partida: hexágonos (incluida el agua) y puertos. */
export interface MapaJuego {
  readonly hexagonos: readonly DefinicionHexagono[];
  readonly puertos: readonly Puerto[];
}

export interface Edificio {
  tipo: 'poblado' | 'ciudad';
  jugador: IdJugador;
}

export interface EstadoTablero {
  /** Forma del mapa: no cambia durante la partida. */
  readonly hexagonos: readonly DefinicionHexagono[];
  readonly puertos: readonly Puerto[];
  edificios: Record<IdVertice, Edificio>;
  carreteras: Record<IdArista, IdJugador>;
  ladron: IdHexagono;
  /** Navegantes: barcos por arista. Si existe, el módulo Navegantes está activo. */
  barcos?: Record<IdArista, IdJugador>;
  /** Navegantes: hexágono de agua con el barco pirata (null si aún no ha aparecido). */
  pirata?: IdHexagono | null;
  /** Ciudades y Caballeros: caballeros por vértice. */
  caballeros?: Record<IdVertice, Caballero>;
  /** Ciudades y Caballeros: murallas (bajo las ciudades) por vértice. */
  murallas?: Record<IdVertice, IdJugador>;
}

export type ModoDados = 'aleatorio' | 'equilibrado';

export interface ConfiguracionPartida {
  puntosVictoria: number;
  modoDados: ModoDados;
  /** Con más cartas que este límite hay que descartar la mitad al salir un 7. */
  limiteDescarte: number;
  /** Expansión 5–6 jugadores: tras cada turno, los demás pueden construir por orden. */
  faseEspecialConstruccion: boolean;
  /** Módulo Navegantes: barcos, barco pirata y campos de oro. */
  navegantes: boolean;
  /** Módulo Ciudades y Caballeros: mercancías, mejoras urbanas, caballeros y bárbaros. */
  ciudadesYCaballeros: boolean;
}

export const CONFIGURACION_POR_DEFECTO: Readonly<ConfiguracionPartida> = {
  puntosVictoria: 10,
  modoDados: 'aleatorio',
  limiteDescarte: 7,
  faseEspecialConstruccion: false,
  navegantes: false,
  ciudadesYCaballeros: false,
};

export interface OfertaComercio {
  readonly id: number;
  readonly autor: IdJugador;
  /** null: oferta del jugador en turno a todos; si no, contraoferta dirigida al jugador en turno. */
  readonly destinatario: IdJugador | null;
  readonly ofrece: RecursosParciales;
  readonly pide: RecursosParciales;
  aceptadaPor: IdJugador[];
  rechazadaPor: IdJugador[];
}

/** Fase a la que se vuelve tras mover el ladrón o usar Construcción de Carreteras. */
export type FaseRetorno = 'tirarDados' | 'acciones';

export type FaseJuego =
  | { tipo: 'colocacionInicial'; paso: 'poblado' | 'carretera'; indice: number; ultimoPoblado: IdVertice | null }
  | { tipo: 'tirarDados' }
  | { tipo: 'descartar'; pendientes: Record<IdJugador, number> }
  | { tipo: 'moverLadron'; volverA: FaseRetorno }
  | { tipo: 'robar'; victimas: IdJugador[]; volverA: FaseRetorno }
  | { tipo: 'acciones' }
  | { tipo: 'construccionCarreteras'; restantes: number; volverA: FaseRetorno }
  /** 5–6 jugadores: el primero de `pendientes` puede construir; después pasa al siguiente. */
  | { tipo: 'construccionEspecial'; pendientes: IdJugador[] }
  /** Navegantes: los jugadores eligen los recursos que les da un campo de oro. */
  | { tipo: 'elegirOro'; pendientes: Record<IdJugador, number> }
  | { tipo: 'finalizada'; ganador: IdJugador };

export type TipoFase = FaseJuego['tipo'];

export const NOMBRES_FASE: Readonly<Record<TipoFase, string>> = {
  colocacionInicial: 'colocación inicial',
  tirarDados: 'tirar los dados',
  descartar: 'descarte',
  moverLadron: 'mover el ladrón',
  robar: 'robar una carta',
  acciones: 'comercio y construcción',
  construccionCarreteras: 'Construcción de Carreteras',
  construccionEspecial: 'construcción especial',
  elegirOro: 'elegir recursos del oro',
  finalizada: 'partida terminada',
};

export interface EstadoTurno {
  /** 0 durante la colocación inicial; 1 en el primer turno con dados. */
  numero: number;
  /** Índice en `jugadores` del jugador en turno. */
  jugadorActual: number;
  dados: [number, number] | null;
  haJugadoCartaDesarrollo: boolean;
  /** Navegantes: ya se ha movido un barco este turno. */
  barcoMovido?: boolean;
  /** Navegantes: barcos construidos este turno (no se pueden mover hasta el siguiente). */
  barcosNuevos?: IdArista[];
  /** Ciudades y Caballeros: resultado elegido con el Alquimista para la próxima tirada. */
  alquimista?: [number, number] | null;
  /** Ciudades y Caballeros: Flota Comercial (cambio 2:1 de ese tipo durante el turno). */
  flota?: Recurso | Mercancia | null;
  /** Ciudades y Caballeros: Grúa (la próxima mejora urbana cuesta 1 mercancía menos). */
  grua?: boolean;
}

export interface EstadoJuego {
  readonly version: 1;
  configuracion: ConfiguracionPartida;
  /** En orden de turno. */
  jugadores: EstadoJugador[];
  tablero: EstadoTablero;
  banca: ManoRecursos;
  mazoDesarrollo: TipoCartaDesarrollo[];
  /** Baraja de los dados equilibrados (vacía en modo aleatorio). */
  barajaDados: [number, number][];
  /** Estado del generador aleatorio: hace la partida reproducible. */
  semilla: number;
  turno: EstadoTurno;
  fase: FaseJuego;
  titulos: { granRuta: IdJugador | null; mayorEjercito: IdJugador | null };
  ofertas: OfertaComercio[];
  siguienteIdOferta: number;
  /** Solo con Ciudades y Caballeros. */
  cyc?: EstadoCyC;
}

// ───────────── Ciudades y Caballeros ─────────────

export const MERCANCIAS = ['papel', 'tela', 'moneda'] as const;
export type Mercancia = (typeof MERCANCIAS)[number];
export type ManoMercancias = Record<Mercancia, number>;
export type MercanciasParciales = Partial<Record<Mercancia, number>>;

export const NOMBRES_MERCANCIA: Readonly<Record<Mercancia, string>> = { papel: 'Papel', tela: 'Tela', moneda: 'Moneda' };

/** Las ciudades en estos terrenos producen 1 recurso y 1 mercancía (en vez de 2 recursos). */
export const MERCANCIA_DE_TERRENO: Readonly<Partial<Record<TipoTerreno, Mercancia>>> = {
  madera: 'papel',
  oveja: 'tela',
  mineral: 'moneda',
};

export const LINEAS_MEJORA = ['comercio', 'politica', 'ciencia'] as const;
export type LineaMejora = (typeof LINEAS_MEJORA)[number];

export const NOMBRES_LINEA_MEJORA: Readonly<Record<LineaMejora, string>> = {
  comercio: 'Comercio',
  politica: 'Política',
  ciencia: 'Ciencia',
};

/** Cada línea de mejoras se paga con una mercancía. */
export const MERCANCIA_DE_LINEA: Readonly<Record<LineaMejora, Mercancia>> = {
  comercio: 'tela',
  politica: 'moneda',
  ciencia: 'papel',
};

export const NIVEL_MAXIMO_MEJORA = 5;
/** Nivel de la mejora que da su ventaja especial (Casa de Comercio, Fortaleza, Acueducto). */
export const NIVEL_BENEFICIO_MEJORA = 3;
export const NIVEL_METROPOLIS = 4;
export const PUNTOS_METROPOLIS = 2;
export const MERCANCIAS_EN_BANCA = 12;
export const CABALLEROS_POR_NIVEL = 2;
export const MURALLAS_POR_JUGADOR = 3;
export const POSICION_ATAQUE_BARBAROS = 7;
export const PUNTOS_VICTORIA_CYC = 13;
/** Cartas de progreso que se pueden tener en la mano (sin contar las de puntos, que se juegan al momento). */
export const LIMITE_CARTAS_PROGRESO = 4;

export const COSTES_CYC = {
  caballero: { oveja: 1, mineral: 1 },
  activarCaballero: { trigo: 1 },
  ascenderCaballero: { oveja: 1, mineral: 1 },
  muralla: { arcilla: 2 },
  medicina: { mineral: 2, trigo: 1 },
} as const satisfies Record<string, RecursosParciales>;

export type NivelCaballero = 1 | 2 | 3;
export const NOMBRES_NIVEL_CABALLERO: Readonly<Record<NivelCaballero, string>> = { 1: 'básico', 2: 'fuerte', 3: 'poderoso' };

export interface Caballero {
  jugador: IdJugador;
  nivel: NivelCaballero;
  activo: boolean;
  /** Turno en que se activó: no puede actuar ese mismo turno. */
  turnoActivado: number | null;
  /** Turno de su última acción (mover, desplazar, expulsar al ladrón): una por turno. */
  turnoAccion: number | null;
  /** Turno de su último ascenso: uno por turno. */
  turnoAscenso: number | null;
}

/** Cara del dado de evento: el barco bárbaro avanza o se abre la puerta de una línea de mejoras. */
export type CaraDadoEvento = 'barco' | LineaMejora;

export const CARTAS_PROGRESO = {
  ciencia: ['alquimista', 'inventor', 'ingeniero', 'herreria', 'imprenta', 'carreteras', 'riego', 'mineria', 'medicina', 'grua'],
  comercio: ['puertoComercial', 'mercader', 'flotaComercial', 'monopolioRecursos', 'monopolioMercancias', 'comercianteMaestro'],
  politica: ['obispo', 'constitucion', 'desertor', 'diplomatico', 'intriga', 'saboteador', 'espia', 'senorDeLaGuerra', 'boda'],
} as const;
export type TipoCartaProgreso = (typeof CARTAS_PROGRESO)[LineaMejora][number];

/** Cuántas copias hay de cada carta en su mazo (18 por mazo, como en el juego original). */
export const COMPOSICION_PROGRESO: Readonly<Record<TipoCartaProgreso, number>> = {
  alquimista: 2, inventor: 2, ingeniero: 1, herreria: 2, imprenta: 1, carreteras: 2, riego: 2, mineria: 2, medicina: 2, grua: 2,
  puertoComercial: 2, mercader: 6, flotaComercial: 2, monopolioRecursos: 4, monopolioMercancias: 2, comercianteMaestro: 2,
  obispo: 2, constitucion: 1, desertor: 2, diplomatico: 2, intriga: 2, saboteador: 2, espia: 3, senorDeLaGuerra: 2, boda: 2,
};

/** Cartas que dan 1 punto y se juegan al robarlas. */
export const CARTAS_PROGRESO_DE_PUNTOS: readonly TipoCartaProgreso[] = ['imprenta', 'constitucion'];

export const NOMBRES_CARTA_PROGRESO: Readonly<Record<TipoCartaProgreso, string>> = {
  alquimista: 'Alquimista',
  inventor: 'Inventor',
  ingeniero: 'Ingeniero',
  herreria: 'Herrería',
  imprenta: 'Imprenta',
  carreteras: 'Construcción de Carreteras',
  riego: 'Riego',
  mineria: 'Minería',
  medicina: 'Medicina',
  grua: 'Grúa',
  puertoComercial: 'Puerto Comercial',
  mercader: 'Mercader',
  flotaComercial: 'Flota Comercial',
  monopolioRecursos: 'Monopolio de Recursos',
  monopolioMercancias: 'Monopolio de Mercancías',
  comercianteMaestro: 'Comerciante Maestro',
  obispo: 'Obispo',
  constitucion: 'Constitución',
  desertor: 'Desertor',
  diplomatico: 'Diplomático',
  intriga: 'Intriga',
  saboteador: 'Saboteador',
  espia: 'Espía',
  senorDeLaGuerra: 'Señor de la Guerra',
  boda: 'Boda',
};

export const DESCRIPCION_CARTA_PROGRESO: Readonly<Record<TipoCartaProgreso, string>> = {
  alquimista: 'Antes de tirar, elige el resultado de los dos dados.',
  inventor: 'Intercambia dos fichas numéricas (no 2, 12, 6 ni 8).',
  ingeniero: 'Construye gratis una muralla en una de tus ciudades.',
  herreria: 'Asciende gratis hasta 2 caballeros.',
  imprenta: '1 punto de victoria.',
  carreteras: 'Construye 2 carreteras (o barcos) gratis.',
  riego: 'Recibe 2 de Trigo por cada campo junto a tus edificios.',
  mineria: 'Recibe 2 de Mineral por cada montaña junto a tus edificios.',
  medicina: 'Convierte un poblado en ciudad por 2 de Mineral y 1 de Trigo.',
  grua: 'Tu próxima mejora urbana de este turno cuesta 1 mercancía menos.',
  puertoComercial: 'Da 1 recurso a cada rival y recibe 1 mercancía de cada uno.',
  mercader: 'Coloca el mercader junto a tus edificios: cambias ese recurso 2:1 y vale 1 punto.',
  flotaComercial: 'Durante este turno, cambia un recurso o mercancía a 2:1 con la banca.',
  monopolioRecursos: 'Cada rival te da hasta 2 cartas del recurso que elijas.',
  monopolioMercancias: 'Cada rival te da 1 carta de la mercancía que elijas.',
  comercianteMaestro: 'Toma 2 cartas al azar de un rival con más puntos que tú.',
  obispo: 'Mueve el ladrón y roba 1 carta a cada jugador junto a él.',
  constitucion: '1 punto de victoria.',
  desertor: 'Un rival retira su caballero más débil y tú colocas uno del mismo nivel.',
  diplomatico: 'Retira una carretera abierta (el final de una ruta).',
  intriga: 'Desplaza un caballero rival que esté en tu red de carreteras.',
  saboteador: 'Los rivales con tantos o más puntos que tú descartan la mitad de sus cartas.',
  espia: 'Roba una carta de progreso al azar a un rival.',
  senorDeLaGuerra: 'Activa gratis todos tus caballeros.',
  boda: 'Cada rival con más puntos que tú te da 2 cartas.',
};

export interface EstadoJugadorCyC {
  mercancias: ManoMercancias;
  mejoras: Record<LineaMejora, number>;
  cartasProgreso: TipoCartaProgreso[];
  /** Puntos por cartas de Defensor de Catán. */
  puntosDefensor: number;
  /** Puntos por cartas de progreso de puntos (Imprenta, Constitución). */
  puntosProgreso: number;
  /** Caballeros que quedan por colocar de cada nivel. */
  caballeros: Record<NivelCaballero, number>;
  murallas: number;
}

export interface EstadoCyC {
  /** Posición del barco bárbaro (0 a 7; al llegar a 7 atacan). */
  barbaros: number;
  /** Ataques ya ocurridos: el ladrón no se mueve hasta el primero. */
  ataques: number;
  mazos: Record<LineaMejora, TipoCartaProgreso[]>;
  bancaMercancias: ManoMercancias;
  /** Ciudad con la metrópolis de cada línea. */
  metropolis: Record<LineaMejora, IdVertice | null>;
  ultimoDadoEvento: CaraDadoEvento | null;
  mercader: { hexagono: IdHexagono; jugador: IdJugador } | null;
}

/** Parámetros de una carta de progreso (cada carta usa los suyos). */
export interface ParametrosProgreso {
  readonly recurso?: Recurso;
  readonly mercancia?: Mercancia;
  readonly jugadorObjetivo?: IdJugador;
  readonly vertices?: readonly IdVertice[];
  readonly hexagonos?: readonly IdHexagono[];
  readonly arista?: IdArista;
  readonly dados?: readonly [number, number];
}

export type AccionJuego = { readonly jugador: IdJugador } & (
  | { readonly tipo: 'colocarPobladoInicial'; readonly vertice: IdVertice }
  | { readonly tipo: 'colocarCarreteraInicial'; readonly arista: IdArista }
  | { readonly tipo: 'tirarDados' }
  | { readonly tipo: 'descartar'; readonly recursos: RecursosParciales; readonly mercancias?: MercanciasParciales }
  | { readonly tipo: 'moverLadron'; readonly hexagono: IdHexagono }
  | { readonly tipo: 'robar'; readonly victima: IdJugador }
  | { readonly tipo: 'construirCarretera'; readonly arista: IdArista }
  | { readonly tipo: 'construirPoblado'; readonly vertice: IdVertice }
  | { readonly tipo: 'construirCiudad'; readonly vertice: IdVertice }
  | { readonly tipo: 'comprarCartaDesarrollo' }
  | { readonly tipo: 'jugarCaballero' }
  | { readonly tipo: 'jugarConstruccionCarreteras' }
  | { readonly tipo: 'jugarAbundancia'; readonly recursos: readonly [Recurso, Recurso] }
  | { readonly tipo: 'jugarMonopolio'; readonly recurso: Recurso }
  | {
      readonly tipo: 'comerciarConBanca';
      readonly entrega: RecursosParciales;
      readonly recibe: RecursosParciales;
      readonly entregaMercancias?: MercanciasParciales;
      readonly recibeMercancias?: MercanciasParciales;
    }
  | { readonly tipo: 'proponerOferta'; readonly ofrece: RecursosParciales; readonly pide: RecursosParciales }
  | { readonly tipo: 'responderOferta'; readonly idOferta: number; readonly acepta: boolean }
  | { readonly tipo: 'confirmarOferta'; readonly idOferta: number; readonly con: IdJugador }
  | { readonly tipo: 'retirarOferta'; readonly idOferta: number }
  | { readonly tipo: 'finalizarTurno' }
  | { readonly tipo: 'terminarConstruccionEspecial' }
  | { readonly tipo: 'colocarBarcoInicial'; readonly arista: IdArista }
  | { readonly tipo: 'construirBarco'; readonly arista: IdArista }
  | { readonly tipo: 'moverBarco'; readonly desde: IdArista; readonly hasta: IdArista }
  | { readonly tipo: 'moverPirata'; readonly hexagono: IdHexagono }
  | { readonly tipo: 'elegirOro'; readonly recursos: RecursosParciales }
  | { readonly tipo: 'construirCaballero'; readonly vertice: IdVertice }
  | { readonly tipo: 'activarCaballero'; readonly vertice: IdVertice }
  | { readonly tipo: 'ascenderCaballero'; readonly vertice: IdVertice }
  | { readonly tipo: 'moverCaballero'; readonly desde: IdVertice; readonly hasta: IdVertice }
  | { readonly tipo: 'expulsarLadron'; readonly vertice: IdVertice }
  | { readonly tipo: 'construirMuralla'; readonly vertice: IdVertice }
  | { readonly tipo: 'mejorarCiudad'; readonly linea: LineaMejora }
  | ({ readonly tipo: 'jugarProgreso'; readonly carta: TipoCartaProgreso } & ParametrosProgreso)
);

export type TipoAccion = AccionJuego['tipo'];

export type TituloEspecial = 'granRuta' | 'mayorEjercito';

/** Lo que ocurre al aplicar una acción; alimenta el registro de la partida. */
export type EventoJuego =
  | { tipo: 'pobladoColocado'; jugador: IdJugador; vertice: IdVertice; inicial: boolean }
  | { tipo: 'carreteraConstruida'; jugador: IdJugador; arista: IdArista; gratis: boolean }
  | { tipo: 'ciudadConstruida'; jugador: IdJugador; vertice: IdVertice }
  | { tipo: 'recursosIniciales'; jugador: IdJugador; recursos: RecursosParciales }
  | { tipo: 'dadosTirados'; jugador: IdJugador; dados: [number, number] }
  | { tipo: 'produccion'; reparto: Record<IdJugador, RecursosParciales>; mercancias?: Record<IdJugador, MercanciasParciales> }
  | { tipo: 'descarte'; jugador: IdJugador; recursos: RecursosParciales }
  | { tipo: 'ladronMovido'; jugador: IdJugador; hexagono: IdHexagono }
  | { tipo: 'robo'; jugador: IdJugador; victima: IdJugador; recurso: Recurso }
  | { tipo: 'cartaDesarrolloComprada'; jugador: IdJugador; carta: TipoCartaDesarrollo }
  | { tipo: 'cartaDesarrolloJugada'; jugador: IdJugador; carta: TipoCartaDesarrollo }
  | { tipo: 'abundancia'; jugador: IdJugador; recursos: RecursosParciales }
  | { tipo: 'monopolio'; jugador: IdJugador; recurso: Recurso; cantidad: number }
  | { tipo: 'comercioBanca'; jugador: IdJugador; entrega: RecursosParciales; recibe: RecursosParciales }
  | { tipo: 'ofertaPropuesta'; oferta: OfertaComercio }
  | { tipo: 'ofertaRespondida'; jugador: IdJugador; idOferta: number; acepta: boolean }
  | { tipo: 'ofertaRetirada'; jugador: IdJugador; idOferta: number }
  | {
      tipo: 'comercioJugadores';
      /** `de` entrega `entrega` a `con` y recibe `recibe`. */
      de: IdJugador;
      con: IdJugador;
      entrega: RecursosParciales;
      recibe: RecursosParciales;
    }
  | { tipo: 'tituloCambiado'; titulo: TituloEspecial; jugador: IdJugador | null; anterior: IdJugador | null }
  | { tipo: 'turnoIniciado'; jugador: IdJugador; numero: number }
  | { tipo: 'construccionEspecial'; jugador: IdJugador }
  | { tipo: 'barcoConstruido'; jugador: IdJugador; arista: IdArista; gratis: boolean }
  | { tipo: 'barcoMovido'; jugador: IdJugador; desde: IdArista; hasta: IdArista }
  | { tipo: 'pirataMovido'; jugador: IdJugador; hexagono: IdHexagono }
  | { tipo: 'oroElegido'; jugador: IdJugador; recursos: RecursosParciales }
  | { tipo: 'dadoEvento'; cara: CaraDadoEvento }
  | { tipo: 'barbarosAvanzan'; posicion: number }
  | {
      tipo: 'ataqueBarbaro';
      fuerza: number;
      defensa: number;
      ganador: 'catan' | 'barbaros';
      /** Si gana Catán: quién recibe el Defensor de Catán (o carta de progreso si hay empate). */
      defensores: IdJugador[];
      /** Si ganan los bárbaros: ciudades que pasan a ser poblados. */
      saqueos: { jugador: IdJugador; vertice: IdVertice }[];
    }
  | { tipo: 'caballeroConstruido'; jugador: IdJugador; vertice: IdVertice }
  | { tipo: 'caballeroActivado'; jugador: IdJugador; vertice: IdVertice }
  | { tipo: 'caballeroAscendido'; jugador: IdJugador; vertice: IdVertice; nivel: NivelCaballero }
  | {
      tipo: 'caballeroMovido';
      jugador: IdJugador;
      desde: IdVertice;
      hasta: IdVertice;
      /** Caballero rival desplazado, y adónde fue (null: retirado). */
      desplazado: { jugador: IdJugador; a: IdVertice | null } | null;
    }
  | { tipo: 'caballeroRetirado'; jugador: IdJugador; vertice: IdVertice }
  | { tipo: 'murallaConstruida'; jugador: IdJugador; vertice: IdVertice }
  | { tipo: 'ciudadMejorada'; jugador: IdJugador; linea: LineaMejora; nivel: number }
  | { tipo: 'metropolis'; jugador: IdJugador; linea: LineaMejora; vertice: IdVertice; anterior: IdJugador | null }
  | { tipo: 'cartaProgresoRobada'; jugador: IdJugador; linea: LineaMejora; carta: TipoCartaProgreso }
  | { tipo: 'cartaProgresoJugada'; jugador: IdJugador; carta: TipoCartaProgreso }
  | { tipo: 'cartaProgresoPerdida'; jugador: IdJugador; victima: IdJugador; carta: TipoCartaProgreso }
  | { tipo: 'cartasTomadas'; jugador: IdJugador; de: IdJugador; recursos: RecursosParciales; mercancias: MercanciasParciales }
  | { tipo: 'carreteraRetirada'; jugador: IdJugador; arista: IdArista }
  | { tipo: 'fichasIntercambiadas'; jugador: IdJugador; hexagonos: [IdHexagono, IdHexagono] }
  | { tipo: 'mercaderColocado'; jugador: IdJugador; hexagono: IdHexagono }
  | { tipo: 'victoria'; jugador: IdJugador; puntos: number };

import { describe, expect, it } from 'vitest';
import {
  aplicarAccion,
  aristasValidasCarretera,
  CoordenadasCubicas,
  destinosCaballero,
  grafoDe,
  idVerticeEsquina,
  limiteDescarte,
  opcionesProgreso,
  ORIGEN,
  puntosDeVictoria,
  tasasCyC,
  verticesValidosCaballero,
  vistaParaJugador,
  eventoParaJugador,
  type Caballero,
  type EstadoJuego,
  type EventoJuego,
  type IdVertice,
  type TipoCartaProgreso,
} from '../src/index.js';
import { aplicar, aplicarConEventos, colocacionAutomatica, conRecursos, error, modificar, nuevaPartida } from './ayudantes.js';
import { jugarPartida } from './simulador.js';

const axial = CoordenadasCubicas.desdeAxiales;

/** Partida de Ciudades y Caballeros en la fase de acciones del turno 2 de j0. */
function partidaCyC(): EstadoJuego {
  return modificar(nuevaPartida(3, 1, { ciudadesYCaballeros: true }), (e) => {
    e.turno = { numero: 2, jugadorActual: 0, dados: [2, 3], haJugadoCartaDesarrollo: false };
    e.fase = { tipo: 'acciones' };
  });
}

function caballero(jugador: string, nivel: 1 | 2 | 3, activo = false): Caballero {
  return { jugador, nivel, activo, turnoActivado: null, turnoAccion: null, turnoAscenso: null };
}

/** Tira probando semillas hasta que los eventos cumplan la condición. */
function tirarHasta(estado: EstadoJuego, condicion: (eventos: readonly EventoJuego[], despues: EstadoJuego) => boolean) {
  for (let semilla = 1; semilla < 20_000; semilla++) {
    const r = aplicarAccion({ ...estado, semilla }, { tipo: 'tirarDados', jugador: estado.jugadores[estado.turno.jugadorActual]!.id });
    if (r.ok && condicion(r.eventos, r.estado)) {
      return r;
    }
  }
  throw new Error('No se encontró una tirada así');
}

// Vértices alrededor del hexágono central: A-B-C consecutivos.
const A: IdVertice = idVerticeEsquina(ORIGEN, 0);
const B: IdVertice = idVerticeEsquina(ORIGEN, 1);
const C: IdVertice = idVerticeEsquina(ORIGEN, 2);
const D: IdVertice = idVerticeEsquina(ORIGEN, 3);

describe('Preparación de Ciudades y Caballeros', () => {
  const estado = nuevaPartida(3, 1, { ciudadesYCaballeros: true });

  it('se juega a 13 puntos, sin cartas de desarrollo y con tres mazos de progreso de 18', () => {
    expect(estado.configuracion.puntosVictoria).toBe(13);
    expect(estado.mazoDesarrollo).toEqual([]);
    expect(estado.cyc!.mazos.comercio).toHaveLength(18);
    expect(estado.cyc!.mazos.politica).toHaveLength(18);
    expect(estado.cyc!.mazos.ciencia).toHaveLength(18);
    expect(estado.cyc!.bancaMercancias).toEqual({ papel: 12, tela: 12, moneda: 12 });
    expect(estado.jugadores[0]!.cyc).toMatchObject({ caballeros: { 1: 2, 2: 2, 3: 2 }, murallas: 3, mejoras: { comercio: 0, politica: 0, ciencia: 0 } });
    expect(nuevaPartida(3, 1, { ciudadesYCaballeros: true, puntosVictoria: 15 }).configuracion.puntosVictoria).toBe(15);
  });

  it('la segunda pieza de la colocación inicial es una ciudad', () => {
    const tras = colocacionAutomatica(estado);
    for (const j of tras.jugadores) {
      const suyos = Object.values(tras.tablero.edificios).filter((e) => e.jugador === j.id);
      expect(suyos.map((e) => e.tipo).sort()).toEqual(['ciudad', 'poblado']);
      expect(j.piezas).toMatchObject({ poblados: 4, ciudades: 3 });
    }
  });

  it('no se pueden comprar cartas de desarrollo', () => {
    const estado2 = conRecursos(partidaCyC(), 'j0', { trigo: 1, oveja: 1, mineral: 1 });
    expect(error(estado2, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' })).toMatch(/no hay cartas de desarrollo/);
  });
});

describe('Producción con mercancías', () => {
  it('una ciudad en bosque da 1 Madera y 1 Papel; en campo, 2 de Trigo', () => {
    // En el mapa clásico fijo (0,1) es Madera con un 4 y (1,-1) Trigo con un 6.
    const enBosque = idVerticeEsquina(axial(0, 1), 4);
    const enCampo = idVerticeEsquina(axial(1, -1), 1);
    let estado = modificar(partidaCyC(), (e) => {
      e.tablero.edificios[enBosque] = { tipo: 'ciudad', jugador: 'j0' };
      e.tablero.edificios[enCampo] = { tipo: 'ciudad', jugador: 'j1' };
      e.fase = { tipo: 'tirarDados' };
    });
    const madera = tirarHasta(estado, (_, d) => d.turno.dados![0] + d.turno.dados![1] === 4);
    expect(madera.estado.jugadores[0]!.recursos.madera).toBe(1);
    expect(madera.estado.jugadores[0]!.cyc!.mercancias.papel).toBe(1);
    expect(madera.estado.cyc!.bancaMercancias.papel).toBe(11);
    estado = modificar(estado, () => undefined);
    const trigo = tirarHasta(estado, (_, d) => d.turno.dados![0] + d.turno.dados![1] === 6);
    expect(trigo.estado.jugadores[1]!.recursos.trigo).toBe(2);
    expect(trigo.estado.jugadores[1]!.cyc!.mercancias).toEqual({ papel: 0, tela: 0, moneda: 0 });
  });
});

describe('Dado de evento y bárbaros', () => {
  function conBarbarosA6(cambio: (e: EstadoJuego) => void): EstadoJuego {
    return modificar(partidaCyC(), (e) => {
      e.fase = { tipo: 'tirarDados' };
      e.cyc!.barbaros = 6;
      cambio(e);
    });
  }
  const conAtaque = (eventos: readonly EventoJuego[]) => eventos.some((x) => x.tipo === 'ataqueBarbaro');

  it('si Catán resiste, el mejor defensor recibe el Defensor de Catán (1 punto)', () => {
    const estado = conBarbarosA6((e) => {
      e.tablero.edificios[A] = { tipo: 'ciudad', jugador: 'j0' };
      e.tablero.caballeros![C] = caballero('j1', 2, true);
    });
    const { estado: despues, eventos } = tirarHasta(estado, conAtaque);
    const ataque = eventos.find((x) => x.tipo === 'ataqueBarbaro');
    expect(ataque).toMatchObject({ fuerza: 1, defensa: 2, ganador: 'catan', defensores: ['j1'] });
    expect(despues.jugadores[1]!.cyc!.puntosDefensor).toBe(1);
    expect(puntosDeVictoria(despues, 'j1')).toBe(1);
    expect(despues.tablero.caballeros![C]!.activo).toBe(false);
    expect(despues.cyc!.barbaros).toBe(0);
    expect(despues.cyc!.ataques).toBe(1);
  });

  it('si ganan los bárbaros, quien menos defendió pierde una ciudad (salvo metrópolis) y su muralla', () => {
    const estado = conBarbarosA6((e) => {
      e.tablero.edificios[A] = { tipo: 'ciudad', jugador: 'j0' };
      e.tablero.murallas![A] = 'j0';
      e.jugadores[0]!.cyc!.murallas = 2;
      e.tablero.edificios[C] = { tipo: 'ciudad', jugador: 'j1' };
      e.cyc!.metropolis.ciencia = C;
    });
    const { estado: despues, eventos } = tirarHasta(estado, conAtaque);
    expect(eventos.find((x) => x.tipo === 'ataqueBarbaro')).toMatchObject({ ganador: 'barbaros', saqueos: [{ jugador: 'j0', vertice: A }] });
    expect(despues.tablero.edificios[A]).toEqual({ tipo: 'poblado', jugador: 'j0' });
    expect(despues.tablero.murallas![A]).toBeUndefined();
    expect(despues.jugadores[0]!.cyc!.murallas).toBe(3);
    // La metrópolis de j1 está protegida.
    expect(despues.tablero.edificios[C]).toEqual({ tipo: 'ciudad', jugador: 'j1' });
  });

  it('las puertas del dado de evento dan cartas de progreso según el nivel de mejora', () => {
    const estado = modificar(partidaCyC(), (e) => {
      e.fase = { tipo: 'tirarDados' };
      e.jugadores[1]!.cyc!.mejoras.ciencia = 2;
    });
    const { estado: despues, eventos } = tirarHasta(
      estado,
      (ev, d) => ev.some((x) => x.tipo === 'dadoEvento' && x.cara === 'ciencia') && d.turno.dados![1] <= 3,
    );
    const robadas = eventos.filter((x) => x.tipo === 'cartaProgresoRobada');
    expect(robadas.map((x) => x.jugador)).toEqual(['j1']);
    const j1 = despues.jugadores[1]!.cyc!;
    expect(j1.cartasProgreso.length + j1.puntosProgreso).toBe(1);
  });

  it('antes del primer ataque, con un 7 no se mueve el ladrón', () => {
    const estado = modificar(partidaCyC(), (e) => {
      e.fase = { tipo: 'tirarDados' };
    });
    const { estado: despues } = tirarHasta(estado, (_, d) => d.turno.dados![0] + d.turno.dados![1] === 7 && d.cyc!.barbaros < 7);
    expect(despues.fase).toEqual({ tipo: 'acciones' });
  });
});

describe('Caballeros', () => {
  function conRed(): EstadoJuego {
    const grafo = grafoDe(partidaCyC());
    return conRecursos(
      modificar(partidaCyC(), (e) => {
        e.tablero.edificios[A] = { tipo: 'poblado', jugador: 'j0' };
        e.tablero.carreteras[grafo.aristaEntre(A, B)!] = 'j0';
        e.tablero.carreteras[grafo.aristaEntre(B, C)!] = 'j0';
        e.tablero.carreteras[grafo.aristaEntre(C, D)!] = 'j0';
      }),
      'j0',
      { oveja: 5, mineral: 5, trigo: 5, arcilla: 4 },
    );
  }

  it('se reclutan junto a una carretera propia por 1 Oveja y 1 Mineral', () => {
    const estado = conRed();
    expect(verticesValidosCaballero(estado, 'j0')).toEqual(expect.arrayContaining([B, C, D]));
    expect(verticesValidosCaballero(estado, 'j0')).not.toContain(A);
    const despues = aplicar(estado, { tipo: 'construirCaballero', jugador: 'j0', vertice: B });
    expect(despues.tablero.caballeros![B]).toMatchObject({ jugador: 'j0', nivel: 1, activo: false });
    expect(despues.jugadores[0]!.cyc!.caballeros[1]).toBe(1);
    expect(despues.jugadores[0]!.recursos).toMatchObject({ oveja: 4, mineral: 4 });
  });

  it('se activan con Trigo y no pueden actuar el mismo turno', () => {
    let estado = aplicar(conRed(), { tipo: 'construirCaballero', jugador: 'j0', vertice: B });
    estado = aplicar(estado, { tipo: 'activarCaballero', jugador: 'j0', vertice: B });
    expect(estado.tablero.caballeros![B]!.activo).toBe(true);
    expect(error(estado, { tipo: 'moverCaballero', jugador: 'j0', desde: B, hasta: D })).toMatch(/no haber actuado ni haberse activado/);
    const siguienteTurno = modificar(estado, (e) => {
      e.turno.numero = 3;
    });
    const movido = aplicar(siguienteTurno, { tipo: 'moverCaballero', jugador: 'j0', desde: B, hasta: D });
    expect(movido.tablero.caballeros![D]).toMatchObject({ activo: false, turnoAccion: 3 });
    expect(movido.tablero.caballeros![B]).toBeUndefined();
  });

  it('para ascender al nivel 3 hace falta la Fortaleza (Política 3), y solo un ascenso por turno', () => {
    let estado = modificar(conRed(), (e) => {
      e.tablero.caballeros![B] = caballero('j0', 2);
      e.jugadores[0]!.cyc!.caballeros = { 1: 2, 2: 1, 3: 2 };
    });
    expect(error(estado, { tipo: 'ascenderCaballero', jugador: 'j0', vertice: B })).toMatch(/Fortaleza/);
    estado = modificar(estado, (e) => {
      e.jugadores[0]!.cyc!.mejoras.politica = 3;
    });
    estado = aplicar(estado, { tipo: 'ascenderCaballero', jugador: 'j0', vertice: B });
    expect(estado.tablero.caballeros![B]!.nivel).toBe(3);
    expect(estado.jugadores[0]!.cyc!.caballeros).toEqual({ 1: 2, 2: 2, 3: 1 });
  });

  it('un caballero desplaza a uno rival más débil, que se recoloca en su red', () => {
    const grafo = grafoDe(partidaCyC());
    const estado = modificar(conRed(), (e) => {
      e.tablero.caballeros![B] = caballero('j0', 2, true);
      e.tablero.caballeros![D] = caballero('j1', 1, true);
      // Red de j1 junto a D para que el caballero desplazado tenga adónde ir.
      const salida = grafo.aristasDeVertice(D).find((a) => !Object.keys(e.tablero.carreteras).includes(a))!;
      e.tablero.carreteras[salida] = 'j1';
    });
    expect(destinosCaballero(estado, 'j0', B)).toContain(D);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'moverCaballero', jugador: 'j0', desde: B, hasta: D });
    expect(despues.tablero.caballeros![D]!.jugador).toBe('j0');
    const movido = eventos.find((x) => x.tipo === 'caballeroMovido');
    expect(movido).toMatchObject({ desplazado: { jugador: 'j1' } });
    const destino = movido?.tipo === 'caballeroMovido' ? movido.desplazado?.a : null;
    expect(destino).not.toBeNull();
    expect(despues.tablero.caballeros![destino!]!.jugador).toBe('j1');
  });

  it('un caballero rival corta tus carreteras', () => {
    const grafo = grafoDe(partidaCyC());
    const base = modificar(conRed(), (e) => {
      e.tablero.caballeros![D] = caballero('j1', 1);
    });
    const masAlla = grafo.aristasDeVertice(D).find((a) => base.tablero.carreteras[a] === undefined)!;
    expect(aristasValidasCarretera(base, 'j0')).not.toContain(masAlla);
  });

  it('con un caballero activo junto al ladrón se le puede expulsar (tras el primer ataque)', () => {
    const ladronEn = grafoDe(partidaCyC()).hexagono('0,0').vertices;
    let estado = modificar(conRed(), (e) => {
      e.tablero.caballeros![B] = caballero('j0', 1, true);
      e.tablero.ladron = '0,0';
    });
    expect(ladronEn).toContain(B);
    expect(error(estado, { tipo: 'expulsarLadron', jugador: 'j0', vertice: B })).toMatch(/primer ataque/);
    estado = modificar(estado, (e) => {
      e.cyc!.ataques = 1;
    });
    const despues = aplicar(estado, { tipo: 'expulsarLadron', jugador: 'j0', vertice: B });
    expect(despues.fase).toEqual({ tipo: 'moverLadron', volverA: 'acciones' });
    expect(despues.tablero.caballeros![B]!.activo).toBe(false);
  });
});

describe('Mejoras urbanas, metrópolis y murallas', () => {
  function conCiudad(): EstadoJuego {
    return modificar(partidaCyC(), (e) => {
      e.tablero.edificios[A] = { tipo: 'ciudad', jugador: 'j0' };
      e.tablero.edificios[C] = { tipo: 'ciudad', jugador: 'j1' };
      e.jugadores[0]!.cyc!.mercancias = { papel: 15, tela: 3, moneda: 0 };
      e.jugadores[1]!.cyc!.mercancias = { papel: 15, tela: 0, moneda: 0 };
      e.cyc!.bancaMercancias = { papel: 0, tela: 9, moneda: 12 };
    });
  }

  it('cada nivel cuesta tantas mercancías como el nivel nuevo', () => {
    let estado = conCiudad();
    estado = aplicar(estado, { tipo: 'mejorarCiudad', jugador: 'j0', linea: 'ciencia' });
    estado = aplicar(estado, { tipo: 'mejorarCiudad', jugador: 'j0', linea: 'ciencia' });
    expect(estado.jugadores[0]!.cyc!.mejoras.ciencia).toBe(2);
    expect(estado.jugadores[0]!.cyc!.mercancias.papel).toBe(15 - 1 - 2);
    expect(error(estado, { tipo: 'mejorarCiudad', jugador: 'j0', linea: 'politica' })).toMatch(/mercancías/);
  });

  it('hace falta una ciudad', () => {
    const estado = modificar(conCiudad(), (e) => {
      delete e.tablero.edificios[A];
    });
    expect(error(estado, { tipo: 'mejorarCiudad', jugador: 'j0', linea: 'ciencia' })).toMatch(/al menos una ciudad/);
  });

  it('el nivel 4 da la metrópolis (2 puntos) y un nivel 5 de otro jugador la arrebata', () => {
    let estado = modificar(conCiudad(), (e) => {
      e.jugadores[0]!.cyc!.mejoras.ciencia = 3;
      e.jugadores[1]!.cyc!.mejoras.ciencia = 4;
      e.jugadores[1]!.cyc!.mercancias.papel = 15;
    });
    const { estado: conMetropolis, eventos } = aplicarConEventos(estado, { tipo: 'mejorarCiudad', jugador: 'j0', linea: 'ciencia' });
    expect(eventos).toContainEqual({ tipo: 'metropolis', jugador: 'j0', linea: 'ciencia', vertice: A, anterior: null });
    expect(puntosDeVictoria(conMetropolis, 'j0')).toBe(4);

    estado = modificar(conMetropolis, (e) => {
      e.turno.jugadorActual = 1;
    });
    const arrebatada = aplicar(estado, { tipo: 'mejorarCiudad', jugador: 'j1', linea: 'ciencia' });
    expect(arrebatada.cyc!.metropolis.ciencia).toBe(C);
    expect(puntosDeVictoria(arrebatada, 'j0')).toBe(2);
    expect(puntosDeVictoria(arrebatada, 'j1')).toBe(4);
  });

  it('la muralla cuesta 2 de Arcilla y sube en 2 el límite de descarte', () => {
    let estado = conRecursos(conCiudad(), 'j0', { arcilla: 2 });
    expect(limiteDescarte(estado, 'j0')).toBe(7);
    estado = aplicar(estado, { tipo: 'construirMuralla', jugador: 'j0', vertice: A });
    expect(estado.tablero.murallas![A]).toBe('j0');
    expect(limiteDescarte(estado, 'j0')).toBe(9);
    expect(error(conRecursos(estado, 'j0', { arcilla: 2 }), { tipo: 'construirMuralla', jugador: 'j0', vertice: A })).toMatch(/aún no tenga/);
  });

  it('la Casa de Comercio (Comercio 3) cambia mercancías 2:1', () => {
    let estado = conCiudad();
    expect(tasasCyC(estado, 'j0').mercancias.papel).toBe(4);
    estado = modificar(estado, (e) => {
      e.jugadores[0]!.cyc!.mejoras.comercio = 3;
    });
    expect(tasasCyC(estado, 'j0').mercancias.papel).toBe(2);
    const despues = aplicar(estado, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: {}, recibe: { trigo: 1 }, entregaMercancias: { papel: 2 } });
    expect(despues.jugadores[0]!.recursos.trigo).toBe(1);
    expect(despues.jugadores[0]!.cyc!.mercancias.papel).toBe(13);
  });
});

describe('Cartas de progreso', () => {
  function conCarta(carta: TipoCartaProgreso) {
    return modificar(partidaCyC(), (e) => {
      e.jugadores[0]!.cyc!.cartasProgreso = [carta];
      e.cyc!.mazos.ciencia = e.cyc!.mazos.ciencia.filter((c) => c !== carta);
    });
  }

  it('Riego da 2 de Trigo por cada campo junto a tus edificios', () => {
    // En el mapa fijo, la esquina 1 de (1,-1) toca dos campos: (1,-1) y (1,-2).
    const estado = modificar(conCarta('riego'), (e) => {
      e.tablero.edificios[idVerticeEsquina(axial(1, -1), 1)] = { tipo: 'poblado', jugador: 'j0' };
    });
    const despues = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'riego' });
    expect(despues.jugadores[0]!.recursos.trigo).toBe(4);
    expect(despues.jugadores[0]!.cyc!.cartasProgreso).toEqual([]);
  });

  it('Monopolio de Recursos toma hasta 2 cartas de cada rival', () => {
    let estado = modificar(partidaCyC(), (e) => {
      e.jugadores[0]!.cyc!.cartasProgreso = ['monopolioRecursos'];
    });
    estado = conRecursos(estado, 'j1', { trigo: 5 });
    estado = conRecursos(estado, 'j2', { trigo: 1 });
    const despues = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'monopolioRecursos', recurso: 'trigo' });
    expect(despues.jugadores.map((j) => j.recursos.trigo)).toEqual([3, 3, 0]);
  });

  it('el Alquimista se juega antes de tirar y fija los dados', () => {
    const estado = modificar(conCarta('alquimista'), (e) => {
      e.fase = { tipo: 'tirarDados' };
    });
    expect(error(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'alquimista', dados: [7, 1] })).toMatch(/de 1 a 6/);
    const preparada = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'alquimista', dados: [5, 3] });
    const tirada = aplicar(preparada, { tipo: 'tirarDados', jugador: 'j0' });
    expect(tirada.turno.dados).toEqual([5, 3]);
  });

  it('el Inventor intercambia dos fichas numéricas', () => {
    const estado = conCarta('inventor');
    const opciones = opcionesProgreso(estado, 'j0', 'inventor');
    expect(opciones?.necesita).toBe('hexagonos');
    const [a, b] = opciones?.necesita === 'hexagonos' ? opciones.opciones : [];
    const fichaDe = (e: EstadoJuego, id: string) => grafoDe(e).hexagono(id).ficha;
    const despues = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'inventor', hexagonos: [a!, b!] });
    expect(fichaDe(despues, a!)).toBe(fichaDe(estado, b!));
    expect(fichaDe(despues, b!)).toBe(fichaDe(estado, a!));
  });

  it('el Mercader da 1 punto y cambio 2:1 de ese recurso', () => {
    const vertice = idVerticeEsquina(axial(1, -1), 1);
    const estado = modificar(partidaCyC(), (e) => {
      e.jugadores[0]!.cyc!.cartasProgreso = ['mercader'];
      e.tablero.edificios[vertice] = { tipo: 'poblado', jugador: 'j0' };
    });
    const despues = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'mercader', hexagonos: ['1,-1'] });
    expect(puntosDeVictoria(despues, 'j0')).toBe(2);
    expect(tasasCyC(despues, 'j0').recursos.trigo).toBe(2);
  });

  it('el Señor de la Guerra activa todos tus caballeros gratis', () => {
    const estado = modificar(partidaCyC(), (e) => {
      e.jugadores[0]!.cyc!.cartasProgreso = ['senorDeLaGuerra'];
      e.tablero.caballeros![B] = caballero('j0', 1);
      e.tablero.caballeros![D] = caballero('j0', 2);
    });
    const despues = aplicar(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'senorDeLaGuerra' });
    expect(Object.values(despues.tablero.caballeros!).every((c) => c.activo)).toBe(true);
  });

  it('el Espía roba una carta de progreso, que los demás no ven', () => {
    const estado = modificar(partidaCyC(), (e) => {
      e.jugadores[0]!.cyc!.cartasProgreso = ['espia'];
      e.jugadores[1]!.cyc!.cartasProgreso = ['boda'];
    });
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'espia', jugadorObjetivo: 'j1' });
    expect(despues.jugadores[0]!.cyc!.cartasProgreso).toEqual(['boda']);
    const robo = eventos.find((x) => x.tipo === 'cartaProgresoPerdida')!;
    expect(eventoParaJugador(robo, 'j2')).toMatchObject({ carta: null });
    expect(eventoParaJugador(robo, 'j1')).toMatchObject({ carta: 'boda' });
  });

  it('no se puede jugar una carta sin efecto ni una que no se tiene', () => {
    const estado = conCarta('ingeniero');
    expect(error(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'ingeniero', vertices: [A] })).toMatch(/ningún efecto/);
    expect(error(estado, { tipo: 'jugarProgreso', jugador: 'j0', carta: 'boda' })).toMatch(/No tienes esa carta/);
  });
});

describe('Vista y partida completa', () => {
  it('la vista oculta mercancías, cartas de progreso y mazos de los rivales', () => {
    const estado = modificar(partidaCyC(), (e) => {
      e.jugadores[1]!.cyc!.cartasProgreso = ['boda'];
      e.jugadores[1]!.cyc!.mercancias.tela = 2;
    });
    const vista = vistaParaJugador(estado, 'j0');
    expect(vista.jugadores[1]!.cyc).toMatchObject({ cartasProgreso: null, totalCartasProgreso: 1, mercancias: null, totalMercancias: 2 });
    expect(vista.cyc).not.toHaveProperty('mazos');
    expect(vista.cyc!.cartasEnMazos).toEqual({ comercio: 18, politica: 18, ciencia: 18 });
  });

  it.each([1, 2, 3])('una partida simulada completa termina (semilla %i)', (semilla) => {
    const { estado, eventos } = jugarPartida(4, semilla, { configuracion: { ciudadesYCaballeros: true } });
    expect(estado.fase.tipo).toBe('finalizada');
    expect(eventos.some((e) => e.tipo === 'ataqueBarbaro')).toBe(true);
    expect(eventos.some((e) => e.tipo === 'cartaProgresoJugada')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  aristasValidasBarco,
  aristasValidasCarretera,
  barcosMovibles,
  CoordenadasCubicas,
  crearPartida,
  destinosBarco,
  formaHexagonal,
  generarMapa,
  grafoDe,
  idArista,
  idAristaLado,
  idVerticeEsquina,
  longitudRutaMasLarga,
  PLANTILLAS,
  verticesValidosPoblado,
  type DefinicionHexagono,
  type EstadoJuego,
  type IdArista,
  type IdVertice,
  type MapaJuego,
} from '../src/index.js';
import { aplicar, aplicarConEventos, conRecursos, error, modificar, nuevaPartida, partidaEnAcciones, tirarHasta } from './ayudantes.js';
import { jugarPartida } from './simulador.js';

const axial = CoordenadasCubicas.desdeAxiales;

// ───────────── Fase especial de construcción (5–6 jugadores) ─────────────

describe('Fase especial de construcción', () => {
  it('se activa sola con 5 o 6 jugadores y se puede desactivar', () => {
    expect(nuevaPartida(4).configuracion.faseEspecialConstruccion).toBe(false);
    expect(nuevaPartida(5).configuracion.faseEspecialConstruccion).toBe(true);
    expect(nuevaPartida(6, 1, { faseEspecialConstruccion: false }).configuracion.faseEspecialConstruccion).toBe(false);
  });

  it('tras el turno, los demás construyen por orden y después sigue el siguiente turno', () => {
    let estado = partidaEnAcciones(5);
    const { estado: tras, eventos } = aplicarConEventos(estado, { tipo: 'finalizarTurno', jugador: 'j0' });
    expect(tras.fase).toEqual({ tipo: 'construccionEspecial', pendientes: ['j1', 'j2', 'j3', 'j4'] });
    expect(eventos).toEqual([{ tipo: 'construccionEspecial', jugador: 'j1' }]);
    expect(tras.turno.jugadorActual).toBe(0);

    estado = tras;
    expect(error(estado, { tipo: 'terminarConstruccionEspecial', jugador: 'j2' })).toMatch(/construcción especial/);
    for (const jugador of ['j1', 'j2', 'j3']) {
      estado = aplicar(estado, { tipo: 'terminarConstruccionEspecial', jugador });
    }
    const final = aplicarConEventos(estado, { tipo: 'terminarConstruccionEspecial', jugador: 'j4' });
    expect(final.estado.fase).toEqual({ tipo: 'tirarDados' });
    expect(final.estado.turno.jugadorActual).toBe(1);
    expect(final.eventos).toEqual([{ tipo: 'turnoIniciado', jugador: 'j1', numero: 2 }]);
  });

  it('se puede construir y comprar cartas, pero no comerciar, jugar cartas ni construir fuera de turno', () => {
    const vertice = idVerticeEsquina(axial(0, 0), 0);
    let estado = modificar(partidaEnAcciones(5), (e) => {
      e.tablero.edificios[vertice] = { tipo: 'poblado', jugador: 'j1' };
      e.jugadores[1]!.cartasDesarrollo = [{ tipo: 'monopolio', turnoCompra: 0 }];
    });
    estado = conRecursos(estado, 'j1', { madera: 5, arcilla: 1, trigo: 3, oveja: 1, mineral: 4 });
    estado = conRecursos(estado, 'j0', { madera: 1, arcilla: 1 });
    estado = aplicar(estado, { tipo: 'finalizarTurno', jugador: 'j0' });

    const arista = grafoDe(estado).aristasDeVertice(vertice)[0]!;
    expect(error(estado, { tipo: 'construirCarretera', jugador: 'j0', arista: idAristaLado(axial(2, 0), 0) })).toMatch(
      /construcción especial/,
    );
    // El comercio es solo para el jugador en turno, y él tampoco puede durante esta fase.
    expect(error(estado, { tipo: 'comerciarConBanca', jugador: 'j1', entrega: { madera: 4 }, recibe: { trigo: 1 } })).toBe(
      'No es tu turno',
    );
    expect(error(estado, { tipo: 'comerciarConBanca', jugador: 'j0', entrega: { madera: 1 }, recibe: { trigo: 1 } })).toMatch(
      /fase de construcción especial/,
    );
    expect(error(estado, { tipo: 'jugarMonopolio', jugador: 'j1', recurso: 'trigo' })).toBe('No es tu turno');

    estado = aplicar(estado, { tipo: 'construirCarretera', jugador: 'j1', arista });
    estado = aplicar(estado, { tipo: 'construirCiudad', jugador: 'j1', vertice });
    estado = aplicar(estado, { tipo: 'comprarCartaDesarrollo', jugador: 'j1' });
    expect(estado.tablero.carreteras[arista]).toBe('j1');
    expect(estado.tablero.edificios[vertice]).toEqual({ tipo: 'ciudad', jugador: 'j1' });
    expect(estado.jugadores[1]!.cartasDesarrollo).toHaveLength(2);
  });

  it('una partida de 6 jugadores con fase especial termina', () => {
    const { estado, eventos } = jugarPartida(6, 31);
    expect(estado.fase.tipo).toBe('finalizada');
    expect(eventos.some((e) => e.tipo === 'construccionEspecial')).toBe(true);
  });
});

// ───────────── Navegantes ─────────────

/** Isla A: madera (0,0) con un 6, oro (0,1) con un 5 y desierto (0,-1). Isla B: trigo (3,-1) con un 8. Agua alrededor. */
function mapaDosIslas(): MapaJuego {
  const tierra: DefinicionHexagono[] = [
    { coordenadas: { q: 0, r: 0 }, terreno: 'madera', ficha: 6 },
    { coordenadas: { q: 0, r: 1 }, terreno: 'oro', ficha: 5 },
    { coordenadas: { q: 0, r: -1 }, terreno: 'desierto', ficha: null },
    { coordenadas: { q: 3, r: -1 }, terreno: 'trigo', ficha: 8 },
  ];
  const ocupadas = new Set(tierra.map((h) => `${h.coordenadas.q},${h.coordenadas.r}`));
  const agua = formaHexagonal(5)
    .filter((c) => !ocupadas.has(c.clave()))
    .map((c) => ({ coordenadas: c.aAxiales(), terreno: 'agua' as const, ficha: null }));
  return { hexagonos: [...tierra, ...agua], puertos: [] };
}

function partidaNavegantes(): EstadoJuego {
  return modificar(nuevaPartida(3, 1, { navegantes: true }, mapaDosIslas()), (e) => {
    e.turno = { numero: 2, jugadorActual: 0, dados: [3, 4], haJugadoCartaDesarrollo: false, barcoMovido: false, barcosNuevos: [] };
    e.fase = { tipo: 'acciones' };
  });
}

// Esquina 0 de (0,0): toca la madera y dos hexágonos de agua.
const COSTA: IdVertice = idVerticeEsquina(axial(0, 0), 0);
// Arista entre los dos hexágonos de agua que tocan la esquina: solo mar.
const MAR_1: IdArista = idArista(axial(1, 0), axial(1, -1));

/** Otra arista de mar que continúa desde el extremo de MAR_1. */
function siguienteArista(estado: EstadoJuego, arista: IdArista, desde: IdVertice): { arista: IdArista; vertice: IdVertice } {
  const grafo = grafoDe(estado);
  const [a, b] = grafo.arista(arista).vertices;
  const extremo = a === desde ? b : a;
  const siguiente = grafo.aristasDeVertice(extremo).find((x) => x !== arista && grafo.arista(x).enMar && !grafo.arista(x).enTierra)!;
  const [c, d] = grafo.arista(siguiente).vertices;
  return { arista: siguiente, vertice: c === extremo ? d : c };
}

describe('Navegantes: tablero', () => {
  it('el mar también tiene vértices y aristas, pero los poblados solo van en tierra', () => {
    const estado = partidaNavegantes();
    const grafo = grafoDe(estado);
    const terrestres = [...grafo.vertices.values()].filter((v) => v.enTierra);
    expect(grafo.vertices.size).toBeGreaterThan(terrestres.length);
    const validos = verticesValidosPoblado(estado, 'j0', true);
    expect(validos.length).toBeGreaterThan(0);
    expect(validos.every((v) => grafo.vertice(v).enTierra)).toBe(true);
    expect(grafo.arista(MAR_1).enMar && !grafo.arista(MAR_1).enTierra).toBe(true);
  });

  it('cada jugador empieza con 15 barcos y sin pirata en el tablero', () => {
    const estado = partidaNavegantes();
    expect(estado.jugadores.every((j) => j.piezas.barcos === 15)).toBe(true);
    expect(estado.tablero.barcos).toEqual({});
    expect(estado.tablero.pirata).toBeNull();
  });

  it('sin Navegantes no se pueden construir barcos', () => {
    const estado = conRecursos(partidaEnAcciones(3), 'j0', { madera: 1, oveja: 1 });
    expect(error(estado, { tipo: 'construirBarco', jugador: 'j0', arista: 'A:0,0|1,0' })).toMatch(/Navegantes/);
  });
});

describe('Navegantes: barcos', () => {
  function conPobladoEnCosta(): EstadoJuego {
    return conRecursos(
      modificar(partidaNavegantes(), (e) => {
        e.tablero.edificios[COSTA] = { tipo: 'poblado', jugador: 'j0' };
      }),
      'j0',
      { madera: 5, oveja: 5, arcilla: 5 },
    );
  }

  it('un barco cuesta 1 Madera y 1 Oveja y sale de un edificio propio hacia el mar', () => {
    const estado = conPobladoEnCosta();
    const validas = aristasValidasBarco(estado, 'j0');
    expect(validas).toContain(MAR_1);
    // Las aristas de costa admiten carretera y barco; la de mar solo barco.
    expect(aristasValidasCarretera(estado, 'j0')).not.toContain(MAR_1);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'construirBarco', jugador: 'j0', arista: MAR_1 });
    expect(despues.tablero.barcos![MAR_1]).toBe('j0');
    expect(despues.jugadores[0]!.piezas.barcos).toBe(14);
    expect(despues.jugadores[0]!.recursos).toMatchObject({ madera: 4, oveja: 4 });
    expect(despues.turno.barcosNuevos).toEqual([MAR_1]);
    expect(eventos).toContainEqual({ tipo: 'barcoConstruido', jugador: 'j0', arista: MAR_1, gratis: false });
  });

  it('los barcos continúan una línea de barcos, pero una carretera no puede salir de un barco', () => {
    let estado = aplicar(conPobladoEnCosta(), { tipo: 'construirBarco', jugador: 'j0', arista: MAR_1 });
    const { arista: siguiente } = siguienteArista(estado, MAR_1, COSTA);
    expect(aristasValidasBarco(estado, 'j0')).toContain(siguiente);
    estado = aplicar(estado, { tipo: 'construirBarco', jugador: 'j0', arista: siguiente });
    // Sin carreteras propias, las únicas carreteras posibles salen del poblado.
    const grafo = grafoDe(estado);
    for (const a of aristasValidasCarretera(estado, 'j0')) {
      expect(grafo.arista(a).vertices).toContain(COSTA);
    }
  });

  it('con barcos se puede llegar a otra isla y fundar un poblado', () => {
    const estado = partidaNavegantes();
    const grafo = grafoDe(estado);
    // Camino de aristas de mar desde la costa de la isla A hasta un vértice de la isla B.
    const destinos = new Set(grafo.hexagono('3,-1').vertices);
    const previo = new Map<IdVertice, { vertice: IdVertice; arista: IdArista } | null>([[COSTA, null]]);
    const cola = [COSTA];
    let llegada: IdVertice | undefined;
    while (cola.length > 0 && !llegada) {
      const v = cola.shift()!;
      for (const a of grafo.aristasDeVertice(v)) {
        if (!grafo.arista(a).enMar) {
          continue;
        }
        const [x, y] = grafo.arista(a).vertices;
        const otro = x === v ? y : x;
        if (!previo.has(otro)) {
          previo.set(otro, { vertice: v, arista: a });
          if (destinos.has(otro)) {
            llegada = otro;
            break;
          }
          cola.push(otro);
        }
      }
    }
    expect(llegada).toBeDefined();
    const conRuta = modificar(estado, (e) => {
      e.tablero.edificios[COSTA] = { tipo: 'poblado', jugador: 'j0' };
      for (let paso = previo.get(llegada!); paso; paso = previo.get(paso.vertice)) {
        e.tablero.barcos![paso.arista] = 'j0';
      }
    });
    expect(verticesValidosPoblado(conRuta, 'j0')).toContain(llegada);
  });

  it('solo se mueve un barco abierto, no construido este turno, y una vez por turno', () => {
    let estado = aplicar(conPobladoEnCosta(), { tipo: 'construirBarco', jugador: 'j0', arista: MAR_1 });
    const { arista: segundo } = siguienteArista(estado, MAR_1, COSTA);
    estado = aplicar(estado, { tipo: 'construirBarco', jugador: 'j0', arista: segundo });
    expect(barcosMovibles(estado, 'j0')).toEqual([]);

    estado = modificar(estado, (e) => {
      e.turno.barcosNuevos = [];
    });
    // El primero está entre el poblado y el segundo barco: no está abierto.
    expect(barcosMovibles(estado, 'j0')).toEqual([segundo]);
    const destinoValido = destinosBarco(estado, 'j0', segundo)[0]!;
    expect(destinoValido).toBeDefined();
    expect(error(estado, { tipo: 'moverBarco', jugador: 'j0', desde: MAR_1, hasta: destinoValido })).toMatch(/ruta abierta/);

    const movido = aplicar(estado, { tipo: 'moverBarco', jugador: 'j0', desde: segundo, hasta: destinoValido });
    expect(movido.tablero.barcos![segundo]).toBeUndefined();
    expect(movido.tablero.barcos![destinoValido]).toBe('j0');
    expect(error(movido, { tipo: 'moverBarco', jugador: 'j0', desde: destinoValido, hasta: segundo })).toMatch(/un barco por turno/);
  });

  it('la ruta comercial suma carreteras y barcos solo a través de un edificio propio', () => {
    const lados = [1, 2, 3].map((l) => idAristaLado(axial(0, 0), l));
    const base = modificar(partidaNavegantes(), (e) => {
      for (const a of lados) {
        e.tablero.carreteras[a] = 'j0';
      }
      e.tablero.barcos![MAR_1] = 'j0';
    });
    const segundo = siguienteArista(base, MAR_1, COSTA).arista;
    const conBarcos = modificar(base, (e) => {
      e.tablero.barcos![segundo] = 'j0';
    });
    expect(longitudRutaMasLarga(conBarcos, 'j0')).toBe(3);
    const conPoblado = modificar(conBarcos, (e) => {
      e.tablero.edificios[COSTA] = { tipo: 'poblado', jugador: 'j0' };
    });
    expect(longitudRutaMasLarga(conPoblado, 'j0')).toBe(5);
  });
});

describe('Navegantes: pirata y oro', () => {
  it('el pirata se mueve al agua, roba a los dueños de barcos cercanos y bloquea esos barcos', () => {
    let estado = modificar(partidaNavegantes(), (e) => {
      e.tablero.edificios[COSTA] = { tipo: 'poblado', jugador: 'j0' };
      e.tablero.barcos![MAR_1] = 'j1';
      e.fase = { tipo: 'moverLadron', volverA: 'acciones' };
    });
    estado = conRecursos(estado, 'j1', { trigo: 1 });
    expect(error(estado, { tipo: 'moverPirata', jugador: 'j0', hexagono: '0,0' })).toMatch(/agua/);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'moverPirata', jugador: 'j0', hexagono: '1,0' });
    expect(despues.tablero.pirata).toBe('1,0');
    expect(eventos).toContainEqual({ tipo: 'robo', jugador: 'j0', victima: 'j1', recurso: 'trigo' });
    expect(despues.fase).toEqual({ tipo: 'acciones' });

    // Ya no se pueden construir barcos junto al pirata.
    const lado = idArista(axial(0, 0), axial(1, 0));
    expect(aristasValidasBarco(conRecursos(despues, 'j0', { madera: 1, oveja: 1 }), 'j0')).not.toContain(lado);
  });

  it('el oro deja elegir el recurso', () => {
    const verticeOro = idVerticeEsquina(axial(0, 1), 3);
    let estado = modificar(partidaNavegantes(), (e) => {
      e.tablero.edificios[verticeOro] = { tipo: 'ciudad', jugador: 'j0' };
      e.fase = { tipo: 'tirarDados' };
    });
    estado = tirarHasta(estado, (s) => s === 5);
    expect(estado.fase).toEqual({ tipo: 'elegirOro', pendientes: { j0: 2 } });
    expect(error(estado, { tipo: 'elegirOro', jugador: 'j0', recursos: { mineral: 1 } })).toMatch(/exactamente 2/);
    expect(error(estado, { tipo: 'elegirOro', jugador: 'j1', recursos: { mineral: 2 } })).toMatch(/No tienes recursos de oro/);
    const despues = aplicar(estado, { tipo: 'elegirOro', jugador: 'j0', recursos: { mineral: 1, oveja: 1 } });
    expect(despues.jugadores[0]!.recursos).toMatchObject({ mineral: 1, oveja: 1 });
    expect(despues.fase).toEqual({ tipo: 'acciones' });
  });

  it('el mapa Archipiélago es de Navegantes y se juega una partida completa con barcos', () => {
    expect(PLANTILLAS.archipielago.navegantes).toBe(true);
    const mapa = generarMapa({ plantilla: 'archipielago', semilla: 7 });
    const { estado, eventos } = jugarPartida(3, 7, { mapa, configuracion: { navegantes: true } });
    expect(estado.fase.tipo).toBe('finalizada');
    expect(eventos.some((e) => e.tipo === 'barcoConstruido')).toBe(true);
  });

  it('crearPartida sin Navegantes no añade barcos ni pirata', () => {
    const estado = crearPartida({ jugadores: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }], semilla: 1 });
    expect(estado.tablero.barcos).toBeUndefined();
    expect(estado.jugadores[0]!.piezas.barcos).toBeUndefined();
  });
});

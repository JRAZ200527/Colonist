import { describe, expect, it } from 'vitest';
import {
  calcularTitularGranRuta,
  CoordenadasCubicas,
  idArista,
  idAristaLado,
  idVerticeEsquina,
  longitudRutaMasLarga,
  ORIGEN,
  puntosDeVictoria,
  type EstadoJuego,
} from '../src/index.js';
import { aplicar, aplicarConEventos, conRecursos, error, modificar, partidaEnAcciones } from './ayudantes.js';

const axial = CoordenadasCubicas.desdeAxiales;

/** Los lados del hexágono central forman un anillo; el lado i une las esquinas i - 1 e i. */
function conCarreteras(estado: EstadoJuego, jugador: string, lados: number[]): EstadoJuego {
  return modificar(estado, (e) => {
    for (const lado of lados) {
      e.tablero.carreteras[idAristaLado(ORIGEN, lado)] = jugador;
    }
  });
}

describe('Longitud de la carretera más larga', () => {
  const base = partidaEnAcciones(3);

  it('cuenta caminos sin repetir carreteras', () => {
    expect(longitudRutaMasLarga(base, 'j0')).toBe(0);
    expect(longitudRutaMasLarga(conCarreteras(base, 'j0', [1, 2, 3]), 'j0')).toBe(3);
    // Un anillo cerrado de 6 carreteras mide 6.
    expect(longitudRutaMasLarga(conCarreteras(base, 'j0', [0, 1, 2, 3, 4, 5]), 'j0')).toBe(6);
  });

  it('en una bifurcación cuenta solo la rama más larga', () => {
    // Camino de 3 por el anillo y una rama de 1 hacia fuera desde la esquina 1.
    const ramaExterior = idArista(axial(1, -1), axial(0, -1));
    const estado = modificar(conCarreteras(base, 'j0', [1, 2, 3]), (e) => {
      e.tablero.carreteras[ramaExterior] = 'j0';
    });
    expect(longitudRutaMasLarga(estado, 'j0')).toBe(3);
  });

  it('un edificio rival corta el camino, pero uno propio no', () => {
    const camino = conCarreteras(base, 'j0', [1, 2, 3, 4, 5]);
    expect(longitudRutaMasLarga(camino, 'j0')).toBe(5);
    const propio = modificar(camino, (e) => {
      e.tablero.edificios[idVerticeEsquina(ORIGEN, 2)] = { tipo: 'poblado', jugador: 'j0' };
    });
    expect(longitudRutaMasLarga(propio, 'j0')).toBe(5);
    const rival = modificar(camino, (e) => {
      e.tablero.edificios[idVerticeEsquina(ORIGEN, 2)] = { tipo: 'poblado', jugador: 'j1' };
    });
    expect(longitudRutaMasLarga(rival, 'j0')).toBe(3);
  });
});

describe('Gran Ruta Comercial', () => {
  function caminoDeCuatro(): EstadoJuego {
    const estado = modificar(conCarreteras(partidaEnAcciones(3), 'j0', [1, 2, 3, 4]), (e) => {
      e.tablero.edificios[idVerticeEsquina(ORIGEN, 0)] = { tipo: 'poblado', jugador: 'j0' };
    });
    return conRecursos(estado, 'j0', { madera: 1, arcilla: 1 });
  }

  it('la quinta carretera seguida da el título y 2 puntos', () => {
    const estado = caminoDeCuatro();
    expect(estado.titulos.granRuta).toBeNull();
    const { estado: despues, eventos } = aplicarConEventos(estado, {
      tipo: 'construirCarretera',
      jugador: 'j0',
      arista: idAristaLado(ORIGEN, 5),
    });
    expect(despues.titulos.granRuta).toBe('j0');
    expect(puntosDeVictoria(despues, 'j0')).toBe(3);
    expect(eventos).toContainEqual({ tipo: 'tituloCambiado', titulo: 'granRuta', jugador: 'j0', anterior: null });
  });

  it('el titular la conserva si otro le empata', () => {
    const estado = modificar(conCarreteras(partidaEnAcciones(3), 'j0', [1, 2, 3, 4, 5]), (e) => {
      e.titulos.granRuta = 'j0';
      // Camino de 5 de j1 alrededor de (2, -2), lejos del de j0.
      for (let lado = 0; lado < 5; lado++) {
        e.tablero.carreteras[idAristaLado(axial(2, -2), lado)] = 'j1';
      }
    });
    expect(longitudRutaMasLarga(estado, 'j1')).toBe(5);
    expect(calcularTitularGranRuta(estado)).toBe('j0');
  });

  it('si el titular la pierde y otros empatan, nadie la tiene', () => {
    const estado = modificar(conCarreteras(partidaEnAcciones(3), 'j0', [1, 2]), (e) => {
      e.titulos.granRuta = 'j0';
      for (let lado = 0; lado < 5; lado++) {
        e.tablero.carreteras[idAristaLado(axial(2, -2), lado)] = 'j1';
        e.tablero.carreteras[idAristaLado(axial(-2, 2), lado)] = 'j2';
      }
    });
    expect(calcularTitularGranRuta(estado)).toBeNull();
  });

  it('un poblado rival puede cortar la ruta y quitar el título', () => {
    // j0 tiene 5 carreteras y el título; j1 construye un poblado en medio del camino.
    let estado = modificar(conCarreteras(partidaEnAcciones(3), 'j0', [1, 2, 3, 4, 5]), (e) => {
      e.titulos.granRuta = 'j0';
      e.turno.jugadorActual = 1;
      // Carretera de j1 que llega desde fuera a la esquina 2 del hexágono central.
      e.tablero.carreteras[idArista(axial(0, -1), axial(-1, 0))] = 'j1';
    });
    estado = conRecursos(estado, 'j1', { madera: 1, arcilla: 1, trigo: 1, oveja: 1 });
    const { estado: despues, eventos } = aplicarConEventos(estado, {
      tipo: 'construirPoblado',
      jugador: 'j1',
      vertice: idVerticeEsquina(ORIGEN, 2),
    });
    expect(longitudRutaMasLarga(despues, 'j0')).toBe(3);
    expect(despues.titulos.granRuta).toBeNull();
    expect(eventos).toContainEqual({ tipo: 'tituloCambiado', titulo: 'granRuta', jugador: null, anterior: 'j0' });
  });
});

describe('Victoria', () => {
  /** j0 con 9 puntos: 3 ciudades y 3 poblados, sin carreteras. */
  function conNuevePuntos(): EstadoJuego {
    const vertices = [
      idVerticeEsquina(axial(-2, 2), 3),
      idVerticeEsquina(axial(2, -2), 1),
      idVerticeEsquina(axial(-2, 0), 2),
      idVerticeEsquina(axial(2, 0), 5),
      idVerticeEsquina(axial(0, 2), 4),
      idVerticeEsquina(axial(0, -2), 1),
    ];
    return modificar(partidaEnAcciones(3), (e) => {
      vertices.forEach((v, i) => {
        e.tablero.edificios[v] = { tipo: i < 3 ? 'ciudad' : 'poblado', jugador: 'j0' };
      });
    });
  }

  it('al llegar a 10 puntos en su turno, el jugador gana', () => {
    const estado = conRecursos(conNuevePuntos(), 'j0', { trigo: 2, mineral: 3 });
    expect(puntosDeVictoria(estado, 'j0')).toBe(9);
    const vertice = idVerticeEsquina(axial(2, 0), 5);
    const { estado: despues, eventos } = aplicarConEventos(estado, { tipo: 'construirCiudad', jugador: 'j0', vertice });
    expect(despues.fase).toEqual({ tipo: 'finalizada', ganador: 'j0' });
    expect(eventos.at(-1)).toEqual({ tipo: 'victoria', jugador: 'j0', puntos: 10 });
    expect(error(despues, { tipo: 'finalizarTurno', jugador: 'j0' })).toBe('La partida ha terminado');
  });

  it('una carta de Punto de Victoria comprada también da la victoria', () => {
    const estado = modificar(conRecursos(conNuevePuntos(), 'j0', { trigo: 1, oveja: 1, mineral: 1 }), (e) => {
      e.mazoDesarrollo = ['puntoVictoria'];
    });
    expect(aplicar(estado, { tipo: 'comprarCartaDesarrollo', jugador: 'j0' }).fase).toEqual({
      tipo: 'finalizada',
      ganador: 'j0',
    });
  });

  it('respeta el límite de puntos configurado', () => {
    const estado = modificar(conRecursos(conNuevePuntos(), 'j0', { trigo: 2, mineral: 3 }), (e) => {
      e.configuracion.puntosVictoria = 12;
    });
    const despues = aplicar(estado, { tipo: 'construirCiudad', jugador: 'j0', vertice: idVerticeEsquina(axial(2, 0), 5) });
    expect(despues.fase).toEqual({ tipo: 'acciones' });
  });
});

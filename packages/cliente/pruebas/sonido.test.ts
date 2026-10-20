import { describe, expect, it } from 'vitest';
import { codificarWav, EFECTOS, PARTITURAS, sintetizar } from '../src/sonido/sintetizador.js';
import { efectosDeEventos } from '../src/sonido/sonidos.js';

describe('Sintetizador de efectos', () => {
  it('genera un WAV PCM de 16 bits válido', () => {
    const muestras = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
    const wav = codificarWav(muestras, 8000);
    const vista = new DataView(wav.buffer);
    const texto = (desde: number) => String.fromCharCode(...wav.subarray(desde, desde + 4));
    expect(texto(0)).toBe('RIFF');
    expect(texto(8)).toBe('WAVE');
    expect(texto(36)).toBe('data');
    expect(vista.getUint32(24, true)).toBe(8000);
    expect(vista.getUint16(34, true)).toBe(16);
    expect(vista.getUint32(40, true)).toBe(muestras.length * 2);
    // Las muestras fuera de [-1, 1] se recortan.
    expect(vista.getInt16(44 + 5 * 2, true)).toBe(32_767);
    expect(wav.length).toBe(44 + muestras.length * 2);
  });

  it.each(EFECTOS)('el efecto %s suena (no es silencio) y no satura', (efecto) => {
    const muestras = sintetizar(PARTITURAS[efecto]);
    expect(muestras.length).toBeGreaterThan(100);
    const maximo = muestras.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(maximo).toBeGreaterThan(0.05);
    expect(maximo).toBeLessThanOrEqual(1.6);
  });

  it('es determinista', () => {
    expect(sintetizar(PARTITURAS.dados)).toEqual(sintetizar(PARTITURAS.dados));
  });
});

describe('Qué evento suena con qué efecto', () => {
  it('asocia dados, construcción, ladrón, comercio y cartas', () => {
    expect(
      efectosDeEventos(
        [
          { tipo: 'dadosTirados', jugador: 'a', dados: [1, 2] },
          { tipo: 'pobladoColocado', jugador: 'a', vertice: 'v', inicial: false },
          { tipo: 'barcoConstruido', jugador: 'a', arista: 'x', gratis: false },
          { tipo: 'robo', jugador: 'a', victima: 'b', recurso: null },
          { tipo: 'comercioBanca', jugador: 'a', entrega: { madera: 4 }, recibe: { trigo: 1 } },
          { tipo: 'cartaDesarrolloComprada', jugador: 'a', carta: null },
        ],
        'a',
      ),
    ).toEqual(['dados', 'construir', 'ladron', 'comercio', 'carta']);
  });

  it('el aviso de turno solo suena cuando es mi turno', () => {
    const evento = { tipo: 'turnoIniciado', jugador: 'a', numero: 3 } as const;
    expect(efectosDeEventos([evento], 'a')).toEqual(['turno']);
    expect(efectosDeEventos([evento], 'b')).toEqual([]);
  });

  it('la victoria tapa todos los demás sonidos', () => {
    expect(
      efectosDeEventos(
        [
          { tipo: 'ciudadConstruida', jugador: 'a', vertice: 'v' },
          { tipo: 'victoria', jugador: 'a', puntos: 10 },
        ],
        'b',
      ),
    ).toEqual(['victoria']);
  });
});

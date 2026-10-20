/**
 * Efectos de sonido sintetizados en el propio navegador: se generan como WAV
 * (PCM de 16 bits) y se entregan como data URI a Howler.js. Así no hay archivos
 * de audio que descargar ni licencias que gestionar.
 */

const FRECUENCIA_MUESTREO = 22_050;

/** Codifica muestras en [-1, 1] como un archivo WAV mono de 16 bits. */
export function codificarWav(muestras: Float32Array, frecuencia = FRECUENCIA_MUESTREO): Uint8Array {
  const bytesDatos = muestras.length * 2;
  const buffer = new ArrayBuffer(44 + bytesDatos);
  const vista = new DataView(buffer);
  const texto = (posicion: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) {
      vista.setUint8(posicion + i, valor.charCodeAt(i));
    }
  };
  texto(0, 'RIFF');
  vista.setUint32(4, 36 + bytesDatos, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  vista.setUint32(16, 16, true); // tamaño del bloque fmt
  vista.setUint16(20, 1, true); // PCM
  vista.setUint16(22, 1, true); // mono
  vista.setUint32(24, frecuencia, true);
  vista.setUint32(28, frecuencia * 2, true); // bytes por segundo
  vista.setUint16(32, 2, true); // bytes por muestra
  vista.setUint16(34, 16, true); // bits por muestra
  texto(36, 'data');
  vista.setUint32(40, bytesDatos, true);
  muestras.forEach((m, i) => {
    const limitada = Math.max(-1, Math.min(1, m));
    vista.setInt16(44 + i * 2, Math.round(limitada * 32_767), true);
  });
  return new Uint8Array(buffer);
}

export function aDataUri(wav: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < wav.length; i += 0x8000) {
    binario += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(binario)}`;
}

interface Nota {
  /** Inicio en segundos. */
  inicio: number;
  duracion: number;
  frecuencia: number;
  volumen?: number;
  forma?: 'seno' | 'triangulo' | 'cuadrada' | 'ruido';
  /** Cambio de frecuencia por segundo (para golpes que bajan de tono). */
  barrido?: number;
}

/** Mezcla notas con envolvente de ataque corto y caída exponencial. */
export function sintetizar(notas: readonly Nota[], frecuencia = FRECUENCIA_MUESTREO): Float32Array {
  const duracion = Math.max(...notas.map((n) => n.inicio + n.duracion));
  const muestras = new Float32Array(Math.ceil(duracion * frecuencia));
  // Ruido determinista para que el mismo sonido se genere siempre igual.
  let semilla = 12_345;
  const ruido = () => {
    semilla = (semilla * 1_103_515_245 + 12_345) & 0x7fffffff;
    return (semilla / 0x7fffffff) * 2 - 1;
  };
  for (const nota of notas) {
    const desde = Math.floor(nota.inicio * frecuencia);
    const total = Math.floor(nota.duracion * frecuencia);
    let fase = 0;
    for (let i = 0; i < total && desde + i < muestras.length; i++) {
      const t = i / frecuencia;
      const f = Math.max(20, nota.frecuencia + (nota.barrido ?? 0) * t);
      fase += (2 * Math.PI * f) / frecuencia;
      const ataque = Math.min(1, t / 0.005);
      const envolvente = ataque * Math.exp((-5 * t) / nota.duracion);
      let onda: number;
      switch (nota.forma ?? 'seno') {
        case 'triangulo':
          onda = (2 / Math.PI) * Math.asin(Math.sin(fase));
          break;
        case 'cuadrada':
          onda = Math.sign(Math.sin(fase)) * 0.6;
          break;
        case 'ruido':
          onda = ruido();
          break;
        default:
          onda = Math.sin(fase);
      }
      muestras[desde + i]! += onda * envolvente * (nota.volumen ?? 0.5);
    }
  }
  return muestras;
}

export const EFECTOS = ['dados', 'construir', 'ladron', 'turno', 'comercio', 'carta', 'victoria', 'aviso'] as const;
export type Efecto = (typeof EFECTOS)[number];

/** Partitura de cada efecto. */
export const PARTITURAS: Readonly<Record<Efecto, readonly Nota[]>> = {
  // Varios golpes secos de ruido: los dados chocando.
  dados: [0, 0.07, 0.15, 0.21, 0.3, 0.42].map((inicio, i) => ({
    inicio,
    duracion: 0.05,
    frecuencia: 0,
    forma: 'ruido' as const,
    volumen: 0.45 - i * 0.05,
  })),
  // Golpe de madera grave.
  construir: [
    { inicio: 0, duracion: 0.18, frecuencia: 180, barrido: -400, forma: 'triangulo', volumen: 0.8 },
    { inicio: 0, duracion: 0.04, frecuencia: 0, forma: 'ruido', volumen: 0.25 },
  ],
  // Dos notas graves descendentes, amenazantes.
  ladron: [
    { inicio: 0, duracion: 0.35, frecuencia: 146.8, forma: 'cuadrada', volumen: 0.25 },
    { inicio: 0.3, duracion: 0.5, frecuencia: 138.6, forma: 'cuadrada', volumen: 0.25 },
  ],
  // Campanilla de dos notas: te toca.
  turno: [
    { inicio: 0, duracion: 0.3, frecuencia: 784, volumen: 0.4 },
    { inicio: 0.12, duracion: 0.45, frecuencia: 1046.5, volumen: 0.4 },
  ],
  // Tintineo de monedas.
  comercio: [
    { inicio: 0, duracion: 0.12, frecuencia: 1568, volumen: 0.3 },
    { inicio: 0.06, duracion: 0.2, frecuencia: 2093, volumen: 0.3 },
  ],
  carta: [{ inicio: 0, duracion: 0.12, frecuencia: 0, forma: 'ruido', volumen: 0.2 }],
  // Arpegio de victoria.
  victoria: [523.3, 659.3, 784, 1046.5].map((frecuencia, i) => ({
    inicio: i * 0.12,
    duracion: 0.6,
    frecuencia,
    forma: 'triangulo' as const,
    volumen: 0.4,
  })),
  aviso: [{ inicio: 0, duracion: 0.15, frecuencia: 440, forma: 'cuadrada', volumen: 0.2 }],
};

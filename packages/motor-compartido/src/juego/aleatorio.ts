/**
 * Generador pseudoaleatorio determinista (mulberry32). La semilla se guarda en el
 * estado de la partida, así que la misma secuencia de acciones da siempre el mismo
 * resultado: útil para reproducir partidas, depurar y para los bots.
 */

export class GeneradorAleatorio {
  semilla: number;

  constructor(semilla: number) {
    this.semilla = semilla >>> 0;
  }

  /** Número en [0, 1). */
  siguiente(): number {
    this.semilla = (this.semilla + 0x6d2b79f5) >>> 0;
    let t = this.semilla;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [0, maximo). */
  entero(maximo: number): number {
    if (!Number.isInteger(maximo) || maximo <= 0) {
      throw new Error(`El máximo debe ser un entero positivo: ${maximo}`);
    }
    return Math.floor(this.siguiente() * maximo);
  }

  elegir<T>(opciones: readonly T[]): T {
    if (opciones.length === 0) {
      throw new Error('No se puede elegir de una lista vacía');
    }
    return opciones[this.entero(opciones.length)]!;
  }

  /** Copia barajada (Fisher-Yates). */
  barajar<T>(elementos: readonly T[]): T[] {
    const copia = [...elementos];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = this.entero(i + 1);
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
    }
    return copia;
  }
}

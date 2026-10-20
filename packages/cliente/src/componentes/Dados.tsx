import { useEffect, useState } from 'react';

const PUNTOS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

function Dado({ valor, rojo }: { valor: number; rojo: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-10 drop-shadow">
      <rect x="4" y="4" width="92" height="92" rx="18" fill={rojo ? '#d84343' : '#fdf6e3'} stroke="#2b2118" strokeWidth="5" />
      {PUNTOS[valor]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={rojo ? '#fdf6e3' : '#2b2118'} />)}
    </svg>
  );
}

/** Dos dados que "ruedan" un momento cada vez que cambia `numero`. */
export function Dados({ dados, numero }: { dados: [number, number] | null; numero: number }) {
  const [rodando, setRodando] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (numero === 0 || !dados) {
      return;
    }
    let pasos = 0;
    const intervalo = setInterval(() => {
      pasos++;
      if (pasos > 8) {
        clearInterval(intervalo);
        setRodando(null);
        return;
      }
      setRodando([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 60);
    return () => clearInterval(intervalo);
  }, [numero, dados]);

  const mostrados = rodando ?? dados;
  if (!mostrados) {
    return <div className="h-10 w-[5.5rem]" />;
  }
  return (
    <div className={`flex gap-1.5 ${rodando ? 'animate-pulse' : ''}`} title={rodando ? 'Tirando…' : `Suma: ${mostrados[0] + mostrados[1]}`}>
      <Dado valor={mostrados[0]} rojo={false} />
      <Dado valor={mostrados[1]} rojo />
    </div>
  );
}

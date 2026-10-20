import type { VistaPartida } from '@colonist/motor-compartido';
import { useEffect, useRef } from 'react';
import type { Objetivos } from '../estado/derivados';
import { RenderizadorTablero, type Seleccion } from './renderizador';

interface Props {
  vista: VistaPartida;
  objetivos: Objetivos;
  alSeleccionar: (seleccion: Seleccion) => void;
}

/** Lienzo de PixiJS con el tablero. El renderizador se crea una vez y se actualiza con cada vista. */
export function Tablero({ vista, objetivos, alSeleccionar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const renderizador = useRef<RenderizadorTablero | null>(null);
  const datos = useRef({ vista, objetivos });
  const callback = useRef(alSeleccionar);
  datos.current = { vista, objetivos };
  callback.current = alSeleccionar;

  useEffect(() => {
    let activo = true;
    let creado: RenderizadorTablero | null = null;
    RenderizadorTablero.crear(contenedor.current!, (s) => callback.current(s))
      .then((r) => {
        if (!activo) {
          r.destruir();
          return;
        }
        creado = r;
        renderizador.current = r;
        r.actualizar(datos.current);
      })
      .catch((error: unknown) => console.error('No se pudo iniciar el tablero', error));
    return () => {
      activo = false;
      creado?.destruir();
      renderizador.current = null;
    };
  }, []);

  useEffect(() => {
    renderizador.current?.actualizar({ vista, objetivos });
  }, [vista, objetivos]);

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="absolute inset-0 touch-none" />
      <button
        type="button"
        onClick={() => renderizador.current?.centrar()}
        className="absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow hover:bg-white"
        title="Volver a encajar el tablero en la pantalla"
      >
        Centrar
      </button>
    </div>
  );
}

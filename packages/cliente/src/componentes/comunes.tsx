/** Piezas de interfaz reutilizables. */

import { NOMBRES_TERRENO, RECURSOS, type Recurso, type RecursosParciales } from '@colonist/motor-compartido';
import { useEffect, type ReactNode } from 'react';
import { useAlmacen } from '../estado/almacen';
import { aCss, COLOR_TERRENO, ICONO_RECURSO } from '../tablero/paleta';

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const ESTILO_BOTON: Record<VarianteBoton, string> = {
  primario: 'bg-amber-500 text-slate-900 hover:bg-amber-400',
  secundario: 'bg-white/90 text-slate-800 hover:bg-white',
  peligro: 'bg-rose-600 text-white hover:bg-rose-500',
  fantasma: 'bg-transparent text-slate-200 hover:bg-white/10',
};

export function Boton({
  children,
  variante = 'secundario',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton }) {
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${ESTILO_BOTON[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Carta de recurso con su color e icono. */
export function CartaRecurso({ recurso, cantidad, pequena = false }: { recurso: Recurso; cantidad?: number; pequena?: boolean }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-md border-2 border-black/20 font-bold text-slate-900 shadow ${pequena ? 'h-10 w-8 text-sm' : 'h-16 w-12 text-xl'}`}
      style={{ backgroundColor: aCss(COLOR_TERRENO[recurso]) }}
      title={NOMBRES_TERRENO[recurso]}
    >
      <span>{ICONO_RECURSO[recurso]}</span>
      {cantidad !== undefined && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white">
          {cantidad}
        </span>
      )}
    </div>
  );
}

/** Elige una cantidad de cada recurso con botones + y −. */
export function SelectorRecursos({
  valor,
  alCambiar,
  maximos,
}: {
  valor: RecursosParciales;
  alCambiar: (valor: RecursosParciales) => void;
  maximos?: RecursosParciales;
}) {
  const cambiar = (r: Recurso, delta: number) => {
    const actual = valor[r] ?? 0;
    const tope = maximos ? (maximos[r] ?? 0) : 19;
    const nuevo = Math.max(0, Math.min(tope, actual + delta));
    alCambiar({ ...valor, [r]: nuevo });
  };
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {RECURSOS.map((r) => (
        <div key={r} className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="h-6 w-8 rounded bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-30"
            onClick={() => cambiar(r, 1)}
            disabled={maximos !== undefined && (valor[r] ?? 0) >= (maximos[r] ?? 0)}
            aria-label={`Añadir ${NOMBRES_TERRENO[r]}`}
          >
            +
          </button>
          <CartaRecurso recurso={r} cantidad={valor[r] ?? 0} pequena />
          <button
            type="button"
            className="h-6 w-8 rounded bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-30"
            onClick={() => cambiar(r, -1)}
            disabled={(valor[r] ?? 0) === 0}
            aria-label={`Quitar ${NOMBRES_TERRENO[r]}`}
          >
            −
          </button>
        </div>
      ))}
    </div>
  );
}

export function Modal({ titulo, children, alCerrar }: { titulo: string; children: ReactNode; alCerrar?: () => void }) {
  useEffect(() => {
    if (!alCerrar) {
      return;
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={alCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          {alCerrar && (
            <button type="button" className="text-2xl leading-none text-slate-400 hover:text-slate-700" onClick={alCerrar} aria-label="Cerrar">
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mensajes de error e información en la esquina; desaparecen solos. */
export function Avisos() {
  const avisos = useAlmacen((s) => s.avisos);
  const cerrar = useAlmacen((s) => s.cerrarAviso);
  useEffect(() => {
    const temporizadores = avisos.map((a) => setTimeout(() => cerrar(a.id), 4500));
    return () => temporizadores.forEach(clearTimeout);
  }, [avisos, cerrar]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {avisos.map((a) => (
        <div
          key={a.id}
          className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${a.tipo === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'}`}
          onClick={() => cerrar(a.id)}
          role="alert"
        >
          {a.texto}
        </div>
      ))}
    </div>
  );
}

export function IndicadorConexion() {
  const estado = useAlmacen((s) => s.conexion);
  // Antes de entrar con un nombre no hay ninguna conexión que indicar.
  if (estado === 'conectado' || estado === 'desconectado') {
    return null;
  }
  const texto = estado === 'reconectando' ? 'Conexión perdida. Reconectando…' : estado === 'conectando' ? 'Conectando…' : 'Sin conexión';
  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-lg">
      {texto}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { almacenLocal } from '../red/conexion';
import { Boton } from './comunes';

export function Inicio() {
  const nombreGuardado = useAlmacen((s) => s.nombreGuardado);
  const entrar = useAlmacen((s) => s.entrar);
  const [nombre, setNombre] = useState(nombreGuardado);

  // Si ya había una sesión (por ejemplo, al recargar la página), se vuelve a ella directamente.
  useEffect(() => {
    if (nombreGuardado && almacenLocal().leer()) {
      entrar(nombreGuardado);
    }
  }, [nombreGuardado, entrar]);
  const valido = nombre.trim().length > 0 && nombre.trim().length <= 24;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-800 to-sky-950 p-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white/95 p-6 text-slate-800 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) {
            entrar(nombre.trim());
          }
        }}
      >
        <h1 className="mb-1 text-3xl font-black tracking-tight text-sky-900">Colonist</h1>
        <p className="mb-6 text-sm text-slate-500">Coloniza la isla, comercia y construye hasta la victoria.</p>
        <label className="mb-2 block text-sm font-semibold" htmlFor="nombre">
          ¿Cómo te llamas?
        </label>
        <input
          id="nombre"
          autoFocus
          maxLength={24}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          placeholder="Tu nombre de jugador"
        />
        <Boton type="submit" variante="primario" className="w-full py-3 text-base" disabled={!valido}>
          Jugar
        </Boton>
      </form>
    </main>
  );
}

import { PLANTILLAS, type NivelBot } from '@colonist/motor-compartido';
import { useEffect, useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { Boton } from './comunes';

const ESTADO_SALA = { esperando: 'Esperando', jugando: 'En juego', terminada: 'Terminada' } as const;

export function Vestibulo() {
  const yo = useAlmacen((s) => s.yo);
  const salas = useAlmacen((s) => s.salas);
  const ranking = useAlmacen((s) => s.ranking);
  const enviar = useAlmacen((s) => s.enviar);
  const [nombreSala, setNombreSala] = useState('');

  // La lista de salas se actualiza cada pocos segundos.
  useEffect(() => {
    enviar({ tipo: 'listarSalas' });
    enviar({ tipo: 'pedirRanking' });
    const temporizador = setInterval(() => enviar({ tipo: 'listarSalas' }), 4000);
    return () => clearInterval(temporizador);
  }, [enviar]);

  const crear = () => enviar({ tipo: 'crearSala', nombre: nombreSala.trim() || `Mesa de ${yo?.nombre ?? 'invitado'}` });

  const partidaRapida = (nivel: NivelBot) => {
    enviar({ tipo: 'crearSala', nombre: `Contra bots (${yo?.nombre ?? ''})`, configuracion: { privada: true } });
    for (let i = 0; i < 3; i++) {
      enviar({ tipo: 'anadirBot', nivel });
    }
    enviar({ tipo: 'iniciarPartida' });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-800 to-sky-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-black tracking-tight">Colonist</h1>
          <p className="text-sky-200">
            Hola, <strong className="text-white">{yo?.nombre}</strong>
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="space-y-6">
            <div className="rounded-2xl bg-white/10 p-5">
              <h2 className="mb-3 text-lg font-bold">Partida rápida contra la computadora</h2>
              <div className="flex flex-wrap gap-2">
                <Boton variante="primario" onClick={() => partidaRapida('facil')}>
                  Bots fáciles
                </Boton>
                <Boton variante="primario" onClick={() => partidaRapida('medio')}>
                  Bots medios
                </Boton>
                <Boton variante="primario" onClick={() => partidaRapida('dificil')}>
                  Bots difíciles
                </Boton>
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-5">
              <h2 className="mb-3 text-lg font-bold">Crear una sala</h2>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  crear();
                }}
              >
                <input
                  value={nombreSala}
                  maxLength={40}
                  onChange={(e) => setNombreSala(e.target.value)}
                  placeholder="Nombre de la sala"
                  className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-slate-800 outline-none"
                />
                <Boton type="submit" variante="primario">
                  Crear
                </Boton>
              </form>
            </div>

            <div className="rounded-2xl bg-white/10 p-5">
              <h2 className="mb-3 text-lg font-bold">Salas abiertas</h2>
              {salas.length === 0 ? (
                <p className="text-sky-200">No hay ninguna sala abierta. ¡Crea la primera!</p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {salas.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-semibold">{s.nombre}</p>
                        <p className="text-sm text-sky-200">
                          {PLANTILLAS[s.plantilla].nombre} · {s.jugadores}/{s.maxJugadores} jugadores · {ESTADO_SALA[s.estado]}
                        </p>
                      </div>
                      <Boton
                        disabled={s.estado !== 'esperando' || s.jugadores >= s.maxJugadores}
                        onClick={() => enviar({ tipo: 'unirseSala', idSala: s.id })}
                      >
                        Entrar
                      </Boton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="rounded-2xl bg-white/10 p-5">
            <h2 className="mb-3 text-lg font-bold">Ranking</h2>
            {!ranking || ranking.length === 0 ? (
              <p className="text-sm text-sky-200">Todavía no se ha terminado ninguna partida.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {ranking.map((r, i) => (
                  <li key={r.nombre} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {r.nombre}
                    </span>
                    <span className="tabular-nums text-sky-200">
                      {r.elo} · {r.partidasGanadas}/{r.partidasJugadas}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

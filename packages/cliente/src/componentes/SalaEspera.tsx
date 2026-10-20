import { IDS_PLANTILLA, NIVELES_BOT, NOMBRES_NIVEL_BOT, PLANTILLAS, type ConfiguracionSala, type IdPlantilla } from '@colonist/motor-compartido';
import { useAlmacen } from '../estado/almacen';
import { Boton } from './comunes';
import { PanelLateral } from './PanelLateral';

export function SalaEspera() {
  const sala = useAlmacen((s) => s.sala)!;
  const yo = useAlmacen((s) => s.yo);
  const enviar = useAlmacen((s) => s.enviar);
  const soyAnfitrion = sala.anfitrion === yo?.idJugador;
  const plantilla = PLANTILLAS[sala.configuracion.plantilla];
  const configurar = (cambios: Partial<ConfiguracionSala>) => enviar({ tipo: 'cambiarConfiguracion', configuracion: cambios });
  const lleno = sala.asientos.length >= sala.configuracion.maxJugadores;
  const jugadoresValidos =
    sala.asientos.length >= plantilla.jugadores.minimo && sala.asientos.length <= plantilla.jugadores.maximo;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-800 to-sky-950 p-4 text-white sm:p-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-black">{sala.nombre}</h1>
              <p className="text-sm text-sky-200">Esperando jugadores…</p>
            </div>
            <Boton variante="fantasma" onClick={() => enviar({ tipo: 'salirSala' })}>
              Salir
            </Boton>
          </header>

          <div className="rounded-2xl bg-white/10 p-5">
            <h2 className="mb-3 font-bold">
              Jugadores ({sala.asientos.length}/{sala.configuracion.maxJugadores})
            </h2>
            <ul className="space-y-2">
              {sala.asientos.map((a) => (
                <li key={a.idJugador} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2">
                  <span>
                    {a.nombre}
                    {a.idJugador === sala.anfitrion && <span className="ml-2 text-xs text-amber-300">anfitrión</span>}
                    {a.idJugador === yo?.idJugador && <span className="ml-2 text-xs text-sky-300">tú</span>}
                    {!a.conectado && <span className="ml-2 text-xs text-rose-300">desconectado</span>}
                  </span>
                  {soyAnfitrion && a.idJugador !== yo?.idJugador && (
                    <button
                      type="button"
                      className="text-sm text-rose-300 hover:text-rose-200"
                      onClick={() => enviar({ tipo: 'quitarAsiento', idJugador: a.idJugador })}
                    >
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {soyAnfitrion && (
              <div className="mt-4 flex flex-wrap gap-2">
                {NIVELES_BOT.map((nivel) => (
                  <Boton key={nivel} disabled={lleno} onClick={() => enviar({ tipo: 'anadirBot', nivel })}>
                    + Bot {NOMBRES_NIVEL_BOT[nivel].toLowerCase()}
                  </Boton>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white/10 p-5">
            <h2 className="mb-3 font-bold">Configuración</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-sky-200">Mapa</span>
                <select
                  disabled={!soyAnfitrion}
                  value={sala.configuracion.plantilla}
                  onChange={(e) => configurar({ plantilla: e.target.value as IdPlantilla })}
                  className="w-full rounded-lg px-2 py-2 text-slate-800"
                >
                  {IDS_PLANTILLA.map((id) => (
                    <option key={id} value={id}>
                      {PLANTILLAS[id].nombre} ({PLANTILLAS[id].jugadores.minimo}–{PLANTILLAS[id].jugadores.maximo})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-sky-300">{plantilla.descripcion}</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-sky-200">Distribución del mapa</span>
                <select
                  disabled={!soyAnfitrion}
                  value={sala.configuracion.modoMapa}
                  onChange={(e) => configurar({ modoMapa: e.target.value as ConfiguracionSala['modoMapa'] })}
                  className="w-full rounded-lg px-2 py-2 text-slate-800"
                >
                  <option value="equilibrado">Equilibrada (torneo)</option>
                  <option value="aleatorio">Aleatoria pura</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-sky-200">Dados</span>
                <select
                  disabled={!soyAnfitrion}
                  value={sala.configuracion.modoDados}
                  onChange={(e) => configurar({ modoDados: e.target.value as ConfiguracionSala['modoDados'] })}
                  className="w-full rounded-lg px-2 py-2 text-slate-800"
                >
                  <option value="aleatorio">Aleatorios (2d6)</option>
                  <option value="equilibrado">Equilibrados (baraja de 36)</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-sky-200">Puntos para ganar</span>
                <input
                  type="number"
                  min={3}
                  max={25}
                  disabled={!soyAnfitrion}
                  value={sala.configuracion.puntosVictoria}
                  onChange={(e) => {
                    const valor = Number(e.target.value);
                    if (Number.isInteger(valor) && valor >= 3 && valor <= 25) {
                      configurar({ puntosVictoria: valor });
                    }
                  }}
                  className="w-full rounded-lg px-2 py-2 text-slate-800"
                />
              </label>
              <label className="flex items-center gap-2 text-sm" title="Mercancías, mejoras urbanas, caballeros, bárbaros y cartas de progreso. Se juega a 13 puntos.">
                <input
                  type="checkbox"
                  disabled={!soyAnfitrion}
                  checked={sala.configuracion.ciudadesYCaballeros}
                  onChange={(e) => configurar({ ciudadesYCaballeros: e.target.checked })}
                />
                Ciudades y Caballeros
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!soyAnfitrion}
                  checked={sala.configuracion.privada}
                  onChange={(e) => configurar({ privada: e.target.checked })}
                />
                Sala privada (no aparece en la lista)
              </label>
            </div>
          </div>

          {soyAnfitrion ? (
            <div className="flex flex-wrap items-center gap-3">
              <Boton variante="primario" className="px-6 py-3 text-base" disabled={!jugadoresValidos} onClick={() => enviar({ tipo: 'iniciarPartida' })}>
                Empezar partida
              </Boton>
              {!jugadoresValidos && (
                <span className="text-sm text-amber-200">
                  Este mapa es para {plantilla.jugadores.minimo}–{plantilla.jugadores.maximo} jugadores.
                </span>
              )}
            </div>
          ) : (
            <p className="text-sky-200">El anfitrión empezará la partida cuando estéis todos.</p>
          )}
          <p className="text-xs text-sky-300">Código de la sala: {sala.id}</p>
        </section>

        <div className="h-[28rem] lg:h-auto">
          <PanelLateral soloChat />
        </div>
      </div>
    </main>
  );
}

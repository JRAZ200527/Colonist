import { useAlmacen } from './estado/almacen';
import { Avisos, IndicadorConexion } from './componentes/comunes';
import { Inicio } from './componentes/Inicio';
import { Partida } from './componentes/Partida';
import { SalaEspera } from './componentes/SalaEspera';
import { Vestibulo } from './componentes/Vestibulo';

/** Elige la pantalla según el punto del juego en que está el jugador. */
function Pantalla() {
  const yo = useAlmacen((s) => s.yo);
  const sala = useAlmacen((s) => s.sala);
  const partida = useAlmacen((s) => s.partida);
  const conexion = useAlmacen((s) => s.conexion);

  if (!yo) {
    return conexion === 'desconectado' ? <Inicio /> : <div className="min-h-screen bg-sky-900" />;
  }
  if (!sala) {
    return <Vestibulo />;
  }
  if (sala.estado !== 'esperando' && partida) {
    return <Partida vista={partida} />;
  }
  return <SalaEspera />;
}

export function App() {
  return (
    <>
      <Pantalla />
      <IndicadorConexion />
      <Avisos />
    </>
  );
}

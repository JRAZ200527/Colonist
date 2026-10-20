# Colonist en español

Réplica de Colonist.io (Catan en línea) en español: motor de reglas compartido, servidor multijugador autoritativo, cliente web con React + PixiJS y bots con IA. Preparado para desplegarse en [Render](https://render.com).

## Estructura

```
packages/
  motor-compartido/  Matemáticas hexagonales, grafo del tablero, reglas y máquina de estados (TypeScript puro)
  servidor/          Servidor Fastify + WebSockets para Render (PostgreSQL con Prisma)
  cliente/           Cliente web: React 19 + Vite + TailwindCSS + PixiJS v8 + Zustand + Howler
  bots/              IA heurística y MCTS (Fácil, Medio, Difícil)
render.yaml          Blueprint de Render (servidor, cliente estático y PostgreSQL)
```

## Requisitos

- Node.js 24 o superior
- pnpm 12 (`npm install -g pnpm`)

## Desarrollo local

```bash
pnpm install
pnpm dev
```

`pnpm dev` compila el motor y los bots, y después arranca en paralelo:

- el servidor en `http://localhost:3000` (comprobación de estado en `/salud`);
- el cliente en `http://localhost:5173`.

Para configurar variables, copia `packages/servidor/.env.ejemplo` como `packages/servidor/.env` y `packages/cliente/.env.ejemplo` como `packages/cliente/.env.local`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm test` | Ejecuta todas las pruebas con Vitest |
| `pnpm test:watch` | Pruebas en modo observación |
| `pnpm test:cobertura` | Pruebas con informe de cobertura |
| `pnpm typecheck` | Revisa los tipos de todos los paquetes (incluidas las pruebas) |
| `pnpm build` | Compila todos los paquetes |

## Coordenadas del tablero

El motor usa coordenadas cúbicas `(x, y, z)` con `x + y + z = 0`, equivalentes a las axiales `(q, r)` con `q = x` y `r = z`. Los hexágonos van con la punta hacia arriba, como en Colonist.

- **Direcciones**: 0 = este, y de ahí en sentido antihorario (noreste, noroeste, oeste, suroeste, sureste).
- **Esquinas**: la esquina `i` de un hexágono queda entre sus vecinos `i` e `i + 1`.
- **Vértices**: su id son los 3 hexágonos que se tocan en él (`V:q,r|q,r|q,r`), así que es el mismo desde cualquiera de ellos.
- **Aristas**: su id son los 2 hexágonos que separan (`A:q,r|q,r`).

El grafo (`GrafoTablero`) solo describe la forma del mapa. Lo que cambia durante la partida (edificios, carreteras, ladrón) se guarda en el estado del juego, indexado por esos ids.

## Motor de reglas

Toda la partida es un objeto `EstadoJuego` en JSON plano, y cada jugada es una `AccionJuego`:

```ts
import { aplicarAccion, crearPartida } from '@colonist/motor-compartido';

let estado = crearPartida({ jugadores: [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }], semilla: 42 });
const resultado = aplicarAccion(estado, { tipo: 'colocarPobladoInicial', jugador: 'a', vertice: '...' });
if (resultado.ok) {
  estado = resultado.estado; // estado nuevo; el anterior no se modifica
  // resultado.eventos alimenta el registro (describirEvento los pasa a texto en español)
} else {
  console.log(resultado.error); // "No es tu turno", "No tienes suficientes recursos"...
}
```

- **Determinista**: el azar (dados, mazo, robos) sale de `estado.semilla`, así que la misma semilla y las mismas acciones reproducen la misma partida.
- **Fases**: colocación inicial en serpiente → tirar dados → (descarte y ladrón con un 7) → comercio y construcción → siguiente turno.
- **Reglas incluidas**: regla de la distancia, construcción y costes, límite de piezas, producción con escasez de la banca, descarte con más de 7 cartas, ladrón y robo, comercio 4:1 / 3:1 / 2:1, ofertas y contraofertas entre jugadores, las 5 cartas de desarrollo (una por turno, no el turno de compra), Gran Ruta Comercial, Mayor Ejército y victoria solo en el propio turno.
- **Consultas** (`reglas.ts`): posiciones válidas para poblados, carreteras y ciudades, tasas de comercio, puntos, longitud de la ruta más larga... Las usan la interfaz y los bots.
- **Mapa**: por defecto, un tablero clásico fijo (`crearMapaClasicoFijo`); para partidas reales, usa el generador.

## Mapas

```ts
import { crearPartida, generarMapa, PLANTILLAS } from '@colonist/motor-compartido';

const mapa = generarMapa({ plantilla: 'expansion56', modo: 'equilibrado', semilla: 123 });
const estado = crearPartida({ jugadores, mapa, configuracion: { puntosVictoria: PLANTILLAS.expansion56.puntosVictoria } });
```

| Plantilla | Nombre | Jugadores | Tablero |
| --- | --- | --- | --- |
| `clasico` | Clásico | 2–4 | 19 hexágonos, 9 puertos |
| `expansion56` | Expansión 5-6 jugadores | 5–6 | 30 hexágonos (2 desiertos), 11 puertos |
| `duelo` | Duelo 1 contra 1 | 2 | Clásico, a 15 puntos |
| `bosqueNegro` | Bosque Negro | 2–4 | Mucha madera y mineral |
| `tierrasAltas` | Tierras Altas | 2–4 | Mucho mineral, poca arcilla |
| `diamante` | Diamante | 2–4 | Rombo de 25 hexágonos |
| `volcan` | Volcán | 2–4 | Desierto fijo en el centro |
| `archipielago` | Archipiélago | 2–4 | 3 islas separadas por el mar |

- **Modo equilibrado / torneo** (por defecto): nunca pone 6 y 8 juntos y, de 60 candidatos, elige el que mejor reparte las probabilidades entre recursos, evita terrenos y números iguales contiguos y no concentra demasiada producción en un vértice. Los puertos se reparten a intervalos regulares por la costa, alternando genéricos y específicos.
- **Modo aleatorio puro**: todo mezclado sin restricciones.
- **Mapas personalizados**: `mapaATextoJson(mapa, nombre)` guarda un mapa en JSON e `importarMapaJson(texto)` lo carga, con todos los problemas explicados en español si no es válido. Los puertos se escriben como hexágono de tierra + lado que da al mar (0 = este, en sentido antihorario).

## Servidor multijugador

El servidor (`packages/servidor`) es **autoritativo**: guarda la partida, valida cada acción con el motor y envía a cada jugador solo lo que puede ver (`vistaParaJugador`): nunca las manos ni las cartas de desarrollo de los rivales, ni el mazo ni la semilla del azar.

- **WebSocket** en `/ws`. Los mensajes están tipados en `motor-compartido/src/protocolo/mensajes.ts` y el servidor los valida con zod.
- **Latido cada 25 s**: el servidor envía pings de WebSocket y cierra las conexiones que no responden; el cliente envía su propio `ping`. Así Render no corta la conexión, que cierra tras unos 100 s sin tráfico.
- **Reconexión**: al conectarse, el cliente recibe un `token_sesion` (lo guarda en `localStorage`). Si se corta la red, `ConexionJuego` (`cliente/src/red/conexion.ts`) reconecta sola con espera creciente y el mismo token, y el jugador recupera su asiento y todo el registro de la partida.
- **Desconexiones largas**: el asiento se guarda 60 s; después juega un bot por él hasta que vuelva.
- **Salas**: crear, listar, unirse, añadir o quitar bots, elegir mapa, modo de dados y puntos, chat. El orden de turno se sortea al empezar.
- **Bots** (`packages/bots`): Fácil (reglas con decisiones al azar), Medio (heurísticas de colocación, ladrón, descartes y comercio) y Difícil (búsqueda Monte Carlo con determinización sobre la política Medio). Responden a las ofertas de comercio de los humanos.
- **Ranking Elo**: al terminar una partida se guarda el resultado y se actualiza el Elo de los humanos (los bots no cuentan). Consulta: mensaje `pedirRanking` o `GET /api/ranking`.
- **Base de datos**: con `DATABASE_URL` usa PostgreSQL mediante Prisma 7; sin ella, guarda el ranking en memoria (se pierde al reiniciar).

### PostgreSQL en local

No hace falta instalar PostgreSQL: Prisma trae un servidor local.

```bash
pnpm --filter @colonist/servidor db:local -- --name colonist --detach
```

Copia la URL que muestra en `packages/servidor/.env` (`DATABASE_URL=...`) y aplica las migraciones:

```bash
pnpm --filter @colonist/servidor exec prisma migrate deploy
```

Para ejecutar también la prueba contra PostgreSQL, define `DATABASE_URL_PRUEBAS` con esa URL antes de `pnpm test` (la prueba vacía las tablas).

## Cliente web

`pnpm dev` y abre `http://localhost:5173`. Escribe tu nombre y elige **Partida rápida contra la computadora** o crea una sala para jugar con otras personas (en otra pestaña o en otro navegador, con otro nombre).

- **Pantallas**: inicio (nombre), vestíbulo (partida rápida contra bots, crear sala, salas abiertas, ranking), sala de espera (jugadores, bots, mapa, dados, puntos, chat) y partida.
- **Tablero** (PixiJS): rueda del ratón para el zoom, arrastra para moverlo y pulsa **Centrar** para encajarlo. Las posiciones donde se puede construir o mover el ladrón se iluminan en amarillo.
- **Partida**: panel de jugadores (puntos, cartas, caballeros, carretera más larga, títulos), tu mano de recursos y cartas de desarrollo (se juegan pulsándolas), dados animados, registro de la partida y chat, comercio con la banca y con jugadores (ofertas, aceptar, rechazar, contraofertas) y diálogos de descarte, robo, Abundancia, Monopolio y fin de partida.
- **Atajos de teclado**: `R` carretera · `S` poblado · `C` ciudad · `D` comprar carta de desarrollo · `B` barco · `M` mover barco · `Espacio` tirar dados / terminar turno / pasar · `Esc` cancelar.
- Si recargas la página o se corta la conexión, vuelves automáticamente a tu partida.

El estado del cliente está en un almacén de Zustand (`cliente/src/estado`); las posiciones válidas se calculan con las mismas reglas del motor que usa el servidor.

## Sonido

Efectos con Howler.js para los dados, las construcciones, el ladrón y el pirata, el comercio, las cartas, el aviso de "te toca" y la victoria. Los sonidos se sintetizan en el navegador (`cliente/src/sonido/sintetizador.ts`), así que no hay archivos de audio. El botón 🔊 de la partida los silencia.

## Expansiones

### 5–6 jugadores

Mapa `expansion56` y **fase especial de construcción**: tras cada turno, los demás jugadores, por orden, pueden construir y comprar cartas de desarrollo (sin comerciar ni jugar cartas) antes de que empiece el siguiente turno. Se activa sola con 5 o 6 jugadores (`configuracion.faseEspecialConstruccion`).

### Navegantes

Se activa con el mapa **Archipiélago** (o `configuracion.navegantes: true` con un mapa que tenga agua entre islas):

- **Barcos** (1 Madera + 1 Oveja, 15 por jugador, tecla `B`): van en lados que dan al mar, salen de un edificio propio o continúan una línea de barcos. Las carreteras no pueden salir de un barco ni al revés, salvo a través de un poblado o ciudad. Con los barcos se llega a otras islas para fundar poblados.
- **Mover barco** (tecla `M`): una vez por turno, el último barco de una ruta abierta que no se haya construido ese turno.
- **Colocación inicial**: la segunda pieza puede ser un barco si el poblado está en la costa. Construcción de Carreteras permite también barcos.
- **Barco pirata**: con un 7 o un Caballero se mueve el ladrón (a tierra) o el pirata (al mar). El pirata roba a quien tenga barcos junto a él e impide construir o mover barcos a su lado.
- **Campos de oro**: al producir, cada jugador elige el recurso que quiere (1 por poblado, 2 por ciudad).
- **Ruta comercial más larga**: cuenta carreteras y barcos.

Aún no se incluyen los escenarios oficiales con islas por descubrir ni los puntos extra por colonizar islas nuevas.

### Ciudades y Caballeros

Se activa con la casilla **Ciudades y Caballeros** de la sala (`configuracion.ciudadesYCaballeros`). Se juega a 13 puntos y no hay cartas de desarrollo.

- **Mercancías**: las ciudades en bosque, pasto y montaña dan 1 recurso + 1 Papel, Tela o Moneda. Se cambian con la banca a 4:1 (3:1 con puerto genérico, 2:1 con la Casa de Comercio).
- **Mejoras urbanas** (Comercio, Política, Ciencia, niveles 1–5, pagadas con mercancías). Nivel 3: Casa de Comercio, Fortaleza y Acueducto. Nivel 4: metrópolis (+2 puntos), que otro jugador puede arrebatar al llegar a 5.
- **Caballeros** de 3 niveles: reclutar, activar con Trigo, ascender (al 3 hace falta la Fortaleza), mover por tus carreteras, desplazar a uno rival más débil y expulsar al ladrón. Los caballeros rivales cortan tus carreteras.
- **Dado de evento y bárbaros**: el barco avanza y al llegar ataca. Fuerza = ciudades; defensa = caballeros activos. Si Catán resiste, el mejor defensor recibe el Defensor de Catán (+1 punto); si pierde, quien menos aportó pierde una ciudad (las metrópolis están protegidas). El ladrón no se mueve hasta el primer ataque.
- **Murallas** (2 Arcilla): +2 al límite de descarte.
- **Cartas de progreso**: 3 mazos de 18 con las 25 cartas del juego; las de puntos se juegan al robarlas; máximo 4 en la mano.
- **Simplificaciones**: el caballero desplazado se recoloca solo; en Boda y Saboteador las cartas se toman al azar; el ladrón y el Obispo roban solo recursos; no se intercambian mercancías entre jugadores.

## Despliegue en Render

1. Sube el repositorio a GitHub.
2. En Render, elige **New → Blueprint** y selecciona el repositorio. Render lee `render.yaml` y crea:
   - `colonist-servidor`: servicio web Node con WebSockets; Render le da el puerto en `PORT`. Al arrancar aplica las migraciones pendientes (`prisma migrate deploy`).
   - `colonist-cliente`: sitio estático; recibe la dirección del servidor en `VITE_WS_URL`.
   - `colonist-db`: PostgreSQL administrado; su URL llega al servidor en `DATABASE_URL`.
3. CORS permite `https://*.onrender.com` y `localhost`. Para un dominio propio, añádelo en `CORS_ORIGENES_EXTRA`.
4. Si la dirección pública del servidor no coincide con su nombre de servicio, pon la URL completa (`wss://…/ws`) en la variable `VITE_WS_URL` del cliente y vuelve a desplegarlo.

En el plan gratuito, el servidor se duerme tras 15 minutos sin uso (la primera conexión tarda unos segundos y el cliente reconecta solo) y la base de datos caduca a los 30 días.

Para comprobar el arranque de producción en local:

```bash
pnpm --filter "@colonist/servidor..." build
```

Después, desde `packages/servidor`, con `DATABASE_URL` definida: `npx prisma migrate deploy && node dist/index.js`.

## Estado del proyecto

- [x] Fase 1: monorepo, `render.yaml` y matemáticas hexagonales con pruebas
- [x] Fase 2: máquina de estados y reglas del juego
- [x] Fase 3: generador de mapas y modos de juego
- [x] Fase 4: servidor multijugador, heartbeat, Prisma y bots (Redis para varias instancias queda pendiente)
- [x] Fase 5: tablero con PixiJS e interfaz con React
- [x] Fase 6: sonido, 5–6 jugadores, Navegantes (núcleo) y despliegue
- [x] Ciudades y Caballeros (interfaz aún sin probar a fondo en el navegador)

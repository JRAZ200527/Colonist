/**
 * Reductor de acciones: `aplicarAccion(estado, accion)` valida la acción con las
 * reglas de Catan y devuelve un estado nuevo (el original no se modifica) junto
 * con los eventos ocurridos, o un error en español si la acción no es válida.
 *
 * Es determinista: el azar sale de `estado.semilla`, así que el servidor puede ser
 * la única fuente de verdad y las partidas se pueden reproducir.
 */

import type { GrafoTablero, IdArista, IdVertice } from '../grafo.js';
import { NOMBRES_TERRENO, RECURSOS, recursoDeTerreno } from '../terreno.js';
import { GeneradorAleatorio } from './aleatorio.js';
import { barajaDadosCompleta } from './crearPartida.js';
import {
  esCantidadValida,
  esVacia,
  listaDeCartas,
  manoVacia,
  restarA,
  soloPositivos,
  sumarA,
  tieneRecursos,
  totalCartas,
} from './recursos.js';
import {
  aristasValidasBarco,
  aristasValidasBarcoInicial,
  aristasValidasCarretera,
  aristasValidasCarreteraInicial,
  barcosMovibles,
  buscarJugador,
  calcularOro,
  calcularProduccion,
  conNavegantes,
  destinosBarco,
  esAristaValidaBarco,
  calcularTitularGranRuta,
  esAristaValidaCarretera,
  esVerticeValidoPoblado,
  grafoDe,
  hexagonosValidosLadron,
  hexagonosValidosPirata,
  jugadorEnTurno,
  ordenSerpiente,
  puntosDeVictoria,
  tasasComercio,
  victimasPirata,
  victimasRobo,
} from './reglas.js';
import {
  CABALLEROS_MINIMOS_MAYOR_EJERCITO,
  COSTES,
  NOMBRES_CARTA_DESARROLLO,
  NOMBRES_FASE,
  type AccionJuego,
  type EstadoJuego,
  type EstadoJugador,
  type EventoJuego,
  type FaseJuego,
  type FaseRetorno,
  type IdJugador,
  type RecursosParciales,
  type TipoCartaDesarrollo,
  type TipoFase,
} from './tipos.js';
import {
  actualizarGranRuta,
  actualizarMayorEjercito,
  avanzarTurno,
  clonarEstado,
  clonarProfundo,
  cobrarDeBanca,
  colocarBarco,
  colocarCarretera,
  colocarPoblado,
  comprobarVictoria,
  emitir,
  ErrorRegla,
  exigirConstructor,
  exigirFase,
  exigirNavegantes,
  exigirTurno,
  fallar,
  iniciarRoboOVolver,
  jugador,
  jugarCarta,
  lanzarDados,
  pagarABanca,
  producir,
  realizarRobo,
  sinRecursosRepetidos,
  terminarConstruccionCarreterasSiProcede,
  trasColocacionInicial,
  validarRecursos,
  type Contexto,
} from './nucleo.js';

import { comercioBancaCyC, descartarCyC, ejecutarCyC, faseTrasSiete, tiradaCyC } from './reductorCyC.js';

export { clonarEstado, ErrorRegla } from './nucleo.js';

export type ResultadoAccion =
  | { readonly ok: true; readonly estado: EstadoJuego; readonly eventos: readonly EventoJuego[] }
  | { readonly ok: false; readonly error: string };

export function aplicarAccion(estado: EstadoJuego, accion: AccionJuego): ResultadoAccion {
  try {
    const copia = clonarEstado(estado);
    const ctx: Contexto = {
      estado: copia,
      grafo: grafoDe(copia),
      rng: new GeneradorAleatorio(copia.semilla),
      eventos: [],
    };
    ejecutar(ctx, accion);
    comprobarVictoria(ctx);
    copia.semilla = ctx.rng.semilla;
    return { ok: true, estado: copia, eventos: ctx.eventos };
  } catch (error) {
    if (error instanceof ErrorRegla) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

// ───────────────────────── acciones ─────────────────────────

function ejecutar(ctx: Contexto, accion: AccionJuego): void {
  const { estado, grafo } = ctx;
  if (estado.fase.tipo === 'finalizada') {
    fallar('La partida ha terminado');
  }

  switch (accion.tipo) {
    case 'colocarPobladoInicial': {
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'colocacionInicial');
      if (fase.paso !== 'poblado') {
        fallar('Ahora debes colocar una carretera');
      }
      if (!esVerticeValidoPoblado(estado, j.id, accion.vertice, true)) {
        fallar('No puedes colocar un poblado ahí: debe estar libre y a 2 aristas de cualquier otro poblado');
      }
      colocarPoblado(ctx, j, accion.vertice, true);
      // Con Ciudades y Caballeros, la segunda pieza inicial es una ciudad.
      if (estado.cyc && fase.indice >= estado.jugadores.length && j.piezas.ciudades > 0) {
        estado.tablero.edificios[accion.vertice]!.tipo = 'ciudad';
        j.piezas.ciudades--;
        j.piezas.poblados++;
        emitir(ctx, { tipo: 'ciudadConstruida', jugador: j.id, vertice: accion.vertice });
      }
      // El segundo poblado da 1 recurso de cada hexágono adyacente.
      if (fase.indice >= estado.jugadores.length) {
        const recursos = manoVacia();
        for (const h of grafo.hexagonosDeVertice(accion.vertice)) {
          const recurso = recursoDeTerreno(h.terreno);
          if (recurso !== null) {
            recursos[recurso]++;
          }
        }
        cobrarDeBanca(ctx, j, recursos);
        emitir(ctx, { tipo: 'recursosIniciales', jugador: j.id, recursos: soloPositivos(recursos) });
      }
      estado.fase = { ...fase, paso: 'carretera', ultimoPoblado: accion.vertice };
      return;
    }

    case 'colocarCarreteraInicial': {
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'colocacionInicial');
      if (fase.paso !== 'carretera' || fase.ultimoPoblado === null) {
        fallar('Primero debes colocar un poblado');
      }
      if (!grafo.aristas.has(accion.arista) || !grafo.arista(accion.arista).vertices.includes(fase.ultimoPoblado)) {
        fallar('La carretera debe salir del poblado que acabas de colocar');
      }
      if (!aristasValidasCarreteraInicial(estado, fase.ultimoPoblado).includes(accion.arista)) {
        fallar('No puedes colocar una carretera ahí');
      }
      colocarCarretera(ctx, j, accion.arista, true);
      trasColocacionInicial(ctx, fase.indice);
      return;
    }

    case 'colocarBarcoInicial': {
      exigirNavegantes(ctx);
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'colocacionInicial');
      if (fase.paso !== 'carretera' || fase.ultimoPoblado === null) {
        fallar('Primero debes colocar un poblado');
      }
      if (!aristasValidasBarcoInicial(estado, fase.ultimoPoblado).includes(accion.arista)) {
        fallar('El barco debe salir del poblado que acabas de colocar y estar en el mar');
      }
      colocarBarco(ctx, j, accion.arista, true);
      trasColocacionInicial(ctx, fase.indice);
      return;
    }

    case 'tirarDados': {
      const j = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'tirarDados');
      if (estado.cyc) {
        tiradaCyC(ctx, j, () => lanzarDados(ctx));
        return;
      }
      const dados = lanzarDados(ctx);
      estado.turno.dados = dados;
      emitir(ctx, { tipo: 'dadosTirados', jugador: j.id, dados });
      const suma = dados[0] + dados[1];
      if (suma !== 7) {
        producir(ctx, suma);
        const oro = calcularOro(estado, suma);
        estado.fase = Object.keys(oro).length > 0 ? { tipo: 'elegirOro', pendientes: oro } : { tipo: 'acciones' };
        return;
      }
      const pendientes: Record<IdJugador, number> = {};
      for (const otro of estado.jugadores) {
        const total = totalCartas(otro.recursos);
        if (total > estado.configuracion.limiteDescarte) {
          pendientes[otro.id] = Math.floor(total / 2);
        }
      }
      estado.fase =
        Object.keys(pendientes).length > 0
          ? { tipo: 'descartar', pendientes }
          : { tipo: 'moverLadron', volverA: 'acciones' };
      return;
    }

    case 'descartar': {
      const fase = exigirFase(ctx, 'descartar');
      const j = jugador(ctx, accion.jugador);
      const debe = fase.pendientes[j.id];
      if (debe === undefined) {
        fallar('No tienes que descartar');
      }
      if (estado.cyc) {
        descartarCyC(ctx, j, debe, accion.recursos, accion.mercancias ?? {});
      } else {
        validarRecursos(accion.recursos, 'el descarte');
        if (totalCartas(accion.recursos) !== debe) {
          fallar(`Debes descartar exactamente ${debe} cartas`);
        }
        pagarABanca(ctx, j, accion.recursos);
        emitir(ctx, { tipo: 'descarte', jugador: j.id, recursos: soloPositivos(accion.recursos) });
      }
      delete fase.pendientes[j.id];
      if (Object.keys(fase.pendientes).length === 0) {
        estado.fase = estado.cyc ? faseTrasSiete(ctx) : { tipo: 'moverLadron', volverA: 'acciones' };
      }
      return;
    }

    case 'moverLadron': {
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'moverLadron');
      if (!hexagonosValidosLadron(estado).includes(accion.hexagono)) {
        fallar('El ladrón debe moverse a otro hexágono de tierra');
      }
      estado.tablero.ladron = accion.hexagono;
      emitir(ctx, { tipo: 'ladronMovido', jugador: j.id, hexagono: accion.hexagono });
      iniciarRoboOVolver(ctx, j, fase.volverA, victimasRobo(estado, accion.hexagono, j.id));
      return;
    }

    case 'moverPirata': {
      exigirNavegantes(ctx);
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'moverLadron');
      if (!hexagonosValidosPirata(estado).includes(accion.hexagono)) {
        fallar('El barco pirata debe moverse a otro hexágono de agua');
      }
      estado.tablero.pirata = accion.hexagono;
      emitir(ctx, { tipo: 'pirataMovido', jugador: j.id, hexagono: accion.hexagono });
      iniciarRoboOVolver(ctx, j, fase.volverA, victimasPirata(estado, accion.hexagono, j.id));
      return;
    }

    case 'robar': {
      const j = exigirTurno(ctx, accion.jugador);
      const fase = exigirFase(ctx, 'robar');
      if (!fase.victimas.includes(accion.victima)) {
        fallar('No puedes robar a ese jugador');
      }
      realizarRobo(ctx, j, jugador(ctx, accion.victima));
      estado.fase = { tipo: fase.volverA };
      return;
    }

    case 'construirCarretera': {
      const fase = exigirFase(ctx, 'acciones', 'construccionCarreteras', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!esAristaValidaCarretera(estado, j.id, accion.arista)) {
        fallar('La carretera debe estar libre y conectada a tus carreteras o edificios');
      }
      const gratis = fase.tipo === 'construccionCarreteras';
      if (gratis) {
        fase.restantes--;
      } else {
        if (j.piezas.carreteras <= 0) {
          fallar('No te quedan carreteras');
        }
        pagarABanca(ctx, j, COSTES.carretera);
      }
      colocarCarretera(ctx, j, accion.arista, gratis);
      terminarConstruccionCarreterasSiProcede(ctx, j);
      return;
    }

    case 'construirPoblado': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!esVerticeValidoPoblado(estado, j.id, accion.vertice, false)) {
        fallar('El poblado debe tocar una carretera tuya y estar a 2 aristas de cualquier otro poblado');
      }
      if (j.piezas.poblados <= 0) {
        fallar('No te quedan poblados');
      }
      pagarABanca(ctx, j, COSTES.poblado);
      colocarPoblado(ctx, j, accion.vertice, false);
      // Un poblado puede cortar la carretera de un rival.
      actualizarGranRuta(ctx);
      return;
    }

    case 'construirCiudad': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      const edificio = estado.tablero.edificios[accion.vertice];
      if (!edificio || edificio.jugador !== j.id || edificio.tipo !== 'poblado') {
        fallar('Solo puedes convertir en ciudad uno de tus poblados');
      }
      if (j.piezas.ciudades <= 0) {
        fallar('No te quedan ciudades');
      }
      pagarABanca(ctx, j, COSTES.ciudad);
      edificio.tipo = 'ciudad';
      j.piezas.ciudades--;
      j.piezas.poblados++;
      emitir(ctx, { tipo: 'ciudadConstruida', jugador: j.id, vertice: accion.vertice });
      return;
    }

    case 'comprarCartaDesarrollo': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (estado.cyc) {
        fallar('Con Ciudades y Caballeros no hay cartas de desarrollo: se consiguen cartas de progreso');
      }
      if (estado.mazoDesarrollo.length === 0) {
        fallar('No quedan cartas de desarrollo');
      }
      pagarABanca(ctx, j, COSTES.cartaDesarrollo);
      const carta = estado.mazoDesarrollo.pop()!;
      j.cartasDesarrollo.push({ tipo: carta, turnoCompra: estado.turno.numero });
      emitir(ctx, { tipo: 'cartaDesarrolloComprada', jugador: j.id, carta });
      return;
    }

    case 'jugarCaballero': {
      const { j, volverA } = jugarCarta(ctx, accion.jugador, 'caballero');
      j.caballerosJugados++;
      actualizarMayorEjercito(ctx, j);
      estado.fase = { tipo: 'moverLadron', volverA };
      return;
    }

    case 'jugarConstruccionCarreteras': {
      const { j, volverA } = jugarCarta(ctx, accion.jugador, 'construccionCarreteras');
      estado.fase = {
        tipo: 'construccionCarreteras',
        restantes: Math.min(2, j.piezas.carreteras + (j.piezas.barcos ?? 0)),
        volverA,
      };
      terminarConstruccionCarreterasSiProcede(ctx, j);
      return;
    }

    case 'jugarAbundancia': {
      if (accion.recursos.length !== 2 || !accion.recursos.every((r) => RECURSOS.includes(r))) {
        fallar('Abundancia: elige exactamente 2 recursos');
      }
      const { j } = jugarCarta(ctx, accion.jugador, 'abundancia');
      const recursos = manoVacia();
      for (const r of accion.recursos) {
        recursos[r]++;
      }
      cobrarDeBanca(ctx, j, recursos);
      emitir(ctx, { tipo: 'abundancia', jugador: j.id, recursos: soloPositivos(recursos) });
      return;
    }

    case 'jugarMonopolio': {
      if (!RECURSOS.includes(accion.recurso)) {
        fallar('Monopolio: recurso inválido');
      }
      const { j } = jugarCarta(ctx, accion.jugador, 'monopolio');
      let cantidad = 0;
      for (const otro of estado.jugadores) {
        if (otro.id !== j.id) {
          cantidad += otro.recursos[accion.recurso];
          otro.recursos[accion.recurso] = 0;
        }
      }
      j.recursos[accion.recurso] += cantidad;
      emitir(ctx, { tipo: 'monopolio', jugador: j.id, recurso: accion.recurso, cantidad });
      return;
    }

    case 'comerciarConBanca': {
      const j = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      if (estado.cyc) {
        comercioBancaCyC(ctx, j, accion);
        return;
      }
      validarRecursos(accion.entrega, 'lo que entregas');
      validarRecursos(accion.recibe, 'lo que recibes');
      if (!sinRecursosRepetidos(accion.entrega, accion.recibe)) {
        fallar('No puedes entregar y recibir el mismo recurso');
      }
      const tasas = tasasComercio(estado, j.id);
      let creditos = 0;
      for (const r of RECURSOS) {
        const cantidad = accion.entrega[r] ?? 0;
        if (cantidad % tasas[r] !== 0) {
          fallar(`${NOMBRES_TERRENO[r]} se cambia a ${tasas[r]}:1`);
        }
        creditos += cantidad / tasas[r];
      }
      const recibidas = totalCartas(accion.recibe);
      if (recibidas === 0 || recibidas !== creditos) {
        fallar('La cantidad recibida no corresponde a lo entregado');
      }
      pagarABanca(ctx, j, accion.entrega);
      cobrarDeBanca(ctx, j, accion.recibe);
      emitir(ctx, {
        tipo: 'comercioBanca',
        jugador: j.id,
        entrega: soloPositivos(accion.entrega),
        recibe: soloPositivos(accion.recibe),
      });
      return;
    }

    case 'proponerOferta': {
      exigirFase(ctx, 'acciones');
      const autor = jugador(ctx, accion.jugador);
      validarRecursos(accion.ofrece, 'la oferta');
      validarRecursos(accion.pide, 'la oferta');
      if (esVacia(accion.ofrece) || esVacia(accion.pide)) {
        fallar('Una oferta debe dar y pedir al menos una carta');
      }
      if (!sinRecursosRepetidos(accion.ofrece, accion.pide)) {
        fallar('No puedes ofrecer y pedir el mismo recurso');
      }
      if (!tieneRecursos(autor.recursos, accion.ofrece)) {
        fallar('No tienes las cartas que ofreces');
      }
      const actual = jugadorEnTurno(estado);
      const oferta = {
        id: estado.siguienteIdOferta++,
        autor: autor.id,
        // Los demás jugadores solo pueden hacer contraofertas al jugador en turno.
        destinatario: autor.id === actual.id ? null : actual.id,
        ofrece: soloPositivos(accion.ofrece),
        pide: soloPositivos(accion.pide),
        aceptadaPor: [],
        rechazadaPor: [],
      };
      estado.ofertas.push(oferta);
      emitir(ctx, { tipo: 'ofertaPropuesta', oferta: clonarProfundo(oferta) });
      return;
    }

    case 'responderOferta': {
      exigirFase(ctx, 'acciones');
      const j = jugador(ctx, accion.jugador);
      const oferta = estado.ofertas.find((o) => o.id === accion.idOferta) ?? fallar('Esa oferta ya no existe');
      if (oferta.autor === j.id) {
        fallar('No puedes responder a tu propia oferta');
      }
      if (oferta.destinatario !== null && oferta.destinatario !== j.id) {
        fallar('Esa oferta no va dirigida a ti');
      }
      if (accion.acepta && !tieneRecursos(j.recursos, oferta.pide)) {
        fallar('No tienes las cartas que pide la oferta');
      }
      oferta.aceptadaPor = oferta.aceptadaPor.filter((id) => id !== j.id);
      oferta.rechazadaPor = oferta.rechazadaPor.filter((id) => id !== j.id);
      (accion.acepta ? oferta.aceptadaPor : oferta.rechazadaPor).push(j.id);
      emitir(ctx, { tipo: 'ofertaRespondida', jugador: j.id, idOferta: oferta.id, acepta: accion.acepta });
      return;
    }

    case 'confirmarOferta': {
      const actual = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      const oferta = estado.ofertas.find((o) => o.id === accion.idOferta) ?? fallar('Esa oferta ya no existe');
      let otro: EstadoJugador;
      if (oferta.autor === actual.id) {
        if (!oferta.aceptadaPor.includes(accion.con)) {
          fallar('Ese jugador no ha aceptado la oferta');
        }
        otro = jugador(ctx, accion.con);
      } else if (oferta.destinatario === actual.id && oferta.autor === accion.con) {
        otro = jugador(ctx, oferta.autor);
      } else {
        fallar('No puedes confirmar esa oferta');
      }
      // `entrega` es lo que da el jugador en turno.
      const entrega = oferta.autor === actual.id ? oferta.ofrece : oferta.pide;
      const recibe = oferta.autor === actual.id ? oferta.pide : oferta.ofrece;
      if (!tieneRecursos(actual.recursos, entrega)) {
        fallar('Ya no tienes las cartas de la oferta');
      }
      if (!tieneRecursos(otro.recursos, recibe)) {
        fallar('El otro jugador ya no tiene las cartas de la oferta');
      }
      restarA(actual.recursos, entrega);
      sumarA(otro.recursos, entrega);
      restarA(otro.recursos, recibe);
      sumarA(actual.recursos, recibe);
      estado.ofertas = [];
      emitir(ctx, { tipo: 'comercioJugadores', de: actual.id, con: otro.id, entrega, recibe });
      return;
    }

    case 'retirarOferta': {
      const indice = estado.ofertas.findIndex((o) => o.id === accion.idOferta);
      if (indice === -1) {
        fallar('Esa oferta ya no existe');
      }
      if (estado.ofertas[indice]!.autor !== accion.jugador) {
        fallar('Solo el autor puede retirar una oferta');
      }
      estado.ofertas.splice(indice, 1);
      emitir(ctx, { tipo: 'ofertaRetirada', jugador: accion.jugador, idOferta: accion.idOferta });
      return;
    }

    case 'finalizarTurno': {
      exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      if (!estado.configuracion.faseEspecialConstruccion) {
        avanzarTurno(ctx);
        return;
      }
      // 5–6 jugadores: los demás, por orden, pueden construir antes del siguiente turno.
      const n = estado.jugadores.length;
      const pendientes = Array.from({ length: n - 1 }, (_, k) => estado.jugadores[(estado.turno.jugadorActual + 1 + k) % n]!.id);
      estado.ofertas = [];
      estado.fase = { tipo: 'construccionEspecial', pendientes };
      emitir(ctx, { tipo: 'construccionEspecial', jugador: pendientes[0]! });
      return;
    }

    case 'terminarConstruccionEspecial': {
      const fase = exigirFase(ctx, 'construccionEspecial');
      exigirConstructor(ctx, accion.jugador);
      fase.pendientes.shift();
      if (fase.pendientes.length === 0) {
        avanzarTurno(ctx);
      } else {
        emitir(ctx, { tipo: 'construccionEspecial', jugador: fase.pendientes[0]! });
      }
      return;
    }

    case 'construirBarco': {
      exigirNavegantes(ctx);
      const fase = exigirFase(ctx, 'acciones', 'construccionCarreteras', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!esAristaValidaBarco(estado, j.id, accion.arista)) {
        fallar('El barco debe ir en el mar, junto a un edificio o barco tuyo y lejos del pirata');
      }
      const gratis = fase.tipo === 'construccionCarreteras';
      if (gratis) {
        fase.restantes--;
      } else {
        if ((j.piezas.barcos ?? 0) <= 0) {
          fallar('No te quedan barcos');
        }
        pagarABanca(ctx, j, COSTES.barco);
      }
      colocarBarco(ctx, j, accion.arista, gratis);
      terminarConstruccionCarreterasSiProcede(ctx, j);
      return;
    }

    case 'moverBarco': {
      exigirNavegantes(ctx);
      const j = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      if (estado.turno.barcoMovido) {
        fallar('Solo puedes mover un barco por turno');
      }
      if (!barcosMovibles(estado, j.id).includes(accion.desde)) {
        fallar('Solo puedes mover un barco tuyo del final de una ruta abierta, que no hayas construido este turno');
      }
      if (!destinosBarco(estado, j.id, accion.desde).includes(accion.hasta)) {
        fallar('No puedes mover el barco ahí');
      }
      delete estado.tablero.barcos![accion.desde];
      estado.tablero.barcos![accion.hasta] = j.id;
      estado.turno.barcoMovido = true;
      emitir(ctx, { tipo: 'barcoMovido', jugador: j.id, desde: accion.desde, hasta: accion.hasta });
      actualizarGranRuta(ctx);
      return;
    }

    case 'elegirOro': {
      const fase = exigirFase(ctx, 'elegirOro');
      const j = jugador(ctx, accion.jugador);
      const debe = fase.pendientes[j.id];
      if (debe === undefined) {
        fallar('No tienes recursos de oro que elegir');
      }
      validarRecursos(accion.recursos, 'el oro');
      // Si la banca se queda sin cartas, solo se recibe lo que queda.
      const cantidad = Math.min(debe, totalCartas(estado.banca));
      if (totalCartas(accion.recursos) !== cantidad) {
        fallar(`Elige exactamente ${cantidad} recursos`);
      }
      cobrarDeBanca(ctx, j, accion.recursos);
      delete fase.pendientes[j.id];
      emitir(ctx, { tipo: 'oroElegido', jugador: j.id, recursos: soloPositivos(accion.recursos) });
      if (Object.keys(fase.pendientes).length === 0) {
        estado.fase = { tipo: 'acciones' };
      }
      return;
    }

    case 'construirCaballero':
    case 'activarCaballero':
    case 'ascenderCaballero':
    case 'moverCaballero':
    case 'expulsarLadron':
    case 'construirMuralla':
    case 'mejorarCiudad':
    case 'jugarProgreso':
      ejecutarCyC(ctx, accion);
      return;

    default: {
      const desconocida: never = accion;
      fallar(`Acción desconocida: ${JSON.stringify(desconocida)}`);
    }
  }
}

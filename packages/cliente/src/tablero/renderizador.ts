/**
 * Dibujo del tablero con PixiJS v8 (WebGL/Canvas).
 *
 * Capas, de abajo arriba: mar y hexágonos, puertos, carreteras, edificios, ladrón
 * y, encima, las posiciones válidas para la acción en curso (que se pueden pulsar).
 * La rueda del ratón hace zoom hacia el cursor y arrastrando se mueve el tablero.
 */

import {
  esquinasHexagono,
  GrafoTablero,
  hexAPixel,
  puntosProbabilidad,
  type ColorJugador,
  type IdJugador,
  type Punto,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { Application, Circle, Container, Graphics, Polygon, Text } from 'pixi.js';
import type { Objetivos } from '../estado/derivados';
import { COLOR_JUGADOR, COLOR_TERRENO } from './paleta';

/** Distancia del centro a una esquina de cada hexágono, en unidades del mundo. */
const T = 60;
const ZOOM_MINIMO = 0.35;
const ZOOM_MAXIMO = 3;
const UMBRAL_ARRASTRE = 5;
const CONTORNO = 0x2b2118;
/** Color de las posiciones donde se puede construir o mover el ladrón. */
const RESALTADO = 0xffe14d;

export type Seleccion = { tipo: 'vertice' | 'arista' | 'hexagono'; id: string };

export interface DatosTablero {
  vista: VistaPartida;
  objetivos: Objetivos;
}

function claveMapa(vista: VistaPartida): string {
  return JSON.stringify([vista.tablero.hexagonos, vista.tablero.puertos, vista.tablero.barcos !== undefined]);
}

/** Segmento entre dos puntos recortado por ambos extremos. */
function recortar(a: Punto, b: Punto, fraccion: number): [Punto, Punto] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return [
    { x: a.x + dx * fraccion, y: a.y + dy * fraccion },
    { x: b.x - dx * fraccion, y: b.y - dy * fraccion },
  ];
}

/** Rectángulo alrededor de un segmento, para que sea fácil de pulsar. */
function areaSegmento(a: Punto, b: Punto, ancho: number): Polygon {
  const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / largo) * ancho;
  const ny = ((b.x - a.x) / largo) * ancho;
  return new Polygon([a.x + nx, a.y + ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny, a.x - nx, a.y - ny]);
}

export class RenderizadorTablero {
  private readonly app: Application;
  private readonly mundo = new Container();
  private readonly capaMapa = new Container();
  private readonly capaPuertos = new Container();
  private readonly capaCarreteras = new Container();
  private readonly capaEdificios = new Container();
  private readonly capaLadron = new Container();
  private readonly capaObjetivos = new Container();
  private grafo: GrafoTablero | null = null;
  private clave = '';
  private datos: DatosTablero | null = null;
  private arrastre: { x: number; y: number; inicioX: number; inicioY: number } | null = null;
  private arrastrado = false;
  private movidoPorUsuario = false;
  private readonly alSeleccionar: (seleccion: Seleccion) => void;
  private readonly alRueda: (evento: WheelEvent) => void;

  static async crear(contenedor: HTMLElement, alSeleccionar: (seleccion: Seleccion) => void): Promise<RenderizadorTablero> {
    const app = new Application();
    await app.init({
      resizeTo: contenedor,
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    });
    contenedor.appendChild(app.canvas);
    return new RenderizadorTablero(app, alSeleccionar);
  }

  private constructor(app: Application, alSeleccionar: (seleccion: Seleccion) => void) {
    this.app = app;
    this.alSeleccionar = alSeleccionar;
    this.mundo.addChild(this.capaMapa, this.capaPuertos, this.capaCarreteras, this.capaEdificios, this.capaLadron, this.capaObjetivos);
    app.stage.addChild(this.mundo);

    // Arrastre para mover el tablero.
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (e) => {
      this.arrastre = { x: e.global.x, y: e.global.y, inicioX: this.mundo.x, inicioY: this.mundo.y };
      this.arrastrado = false;
    });
    app.stage.on('globalpointermove', (e) => {
      if (!this.arrastre) {
        return;
      }
      const dx = e.global.x - this.arrastre.x;
      const dy = e.global.y - this.arrastre.y;
      if (!this.arrastrado && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) {
        return;
      }
      this.arrastrado = true;
      this.movidoPorUsuario = true;
      this.mundo.position.set(this.arrastre.inicioX + dx, this.arrastre.inicioY + dy);
      app.canvas.style.cursor = 'grabbing';
    });
    const soltar = () => {
      this.arrastre = null;
      app.canvas.style.cursor = '';
    };
    app.stage.on('pointerup', soltar);
    app.stage.on('pointerupoutside', soltar);

    // Zoom con la rueda, centrado en el cursor.
    this.alRueda = (evento: WheelEvent) => {
      evento.preventDefault();
      const rect = app.canvas.getBoundingClientRect();
      const px = evento.clientX - rect.left;
      const py = evento.clientY - rect.top;
      const anterior = this.mundo.scale.x;
      const nueva = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, anterior * (evento.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const mundoX = (px - this.mundo.x) / anterior;
      const mundoY = (py - this.mundo.y) / anterior;
      this.mundo.scale.set(nueva);
      this.mundo.position.set(px - mundoX * nueva, py - mundoY * nueva);
      this.movidoPorUsuario = true;
    };
    app.canvas.addEventListener('wheel', this.alRueda, { passive: false });

    app.renderer.on('resize', () => {
      if (!this.movidoPorUsuario) {
        this.centrar();
      }
    });
  }

  actualizar(datos: DatosTablero): void {
    this.datos = datos;
    const clave = claveMapa(datos.vista);
    if (clave !== this.clave) {
      this.clave = clave;
      // Con Navegantes el mar también tiene vértices y aristas (para los barcos).
      this.grafo = new GrafoTablero(datos.vista.tablero.hexagonos, { incluirMar: datos.vista.tablero.barcos !== undefined });
      this.dibujarMapa();
      this.movidoPorUsuario = false;
      this.centrar();
    }
    this.dibujarCarreteras();
    this.dibujarBarcos();
    this.dibujarEdificios();
    this.dibujarLadron();
    this.dibujarObjetivos();
  }

  /** Encaja todo el tablero en la pantalla. */
  centrar(): void {
    if (!this.grafo) {
      return;
    }
    const centros = [...this.grafo.hexagonos.values()].map((h) => hexAPixel(h.coordenadas, T));
    const minX = Math.min(...centros.map((p) => p.x)) - T;
    const maxX = Math.max(...centros.map((p) => p.x)) + T;
    const minY = Math.min(...centros.map((p) => p.y)) - T;
    const maxY = Math.max(...centros.map((p) => p.y)) + T;
    const { width, height } = this.app.screen;
    const escala = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.96));
    this.mundo.scale.set(escala);
    this.mundo.position.set(width / 2 - ((minX + maxX) / 2) * escala, height / 2 - ((minY + maxY) / 2) * escala);
    this.movidoPorUsuario = false;
  }

  destruir(): void {
    this.app.canvas.removeEventListener('wheel', this.alRueda);
    this.app.destroy(true, { children: true });
  }

  // ───────────── dibujo ─────────────

  private colorDe(id: IdJugador): number {
    const color = this.datos?.vista.jugadores.find((j) => j.id === id)?.color as ColorJugador | undefined;
    return color ? COLOR_JUGADOR[color] : 0x999999;
  }

  private vaciar(capa: Container): void {
    for (const hijo of capa.removeChildren()) {
      hijo.destroy({ children: true });
    }
  }

  private dibujarMapa(): void {
    const grafo = this.grafo!;
    this.vaciar(this.capaMapa);
    this.vaciar(this.capaPuertos);

    const hexagonos = [...grafo.hexagonos.values()];
    // Primero el agua (un poco más grande para que no queden huecos) y después la tierra.
    for (const h of [...hexagonos.filter((x) => !x.esJugable), ...hexagonos.filter((x) => x.esJugable)]) {
      const centro = hexAPixel(h.coordenadas, T);
      const g = new Graphics();
      const esquinas = esquinasHexagono(centro, h.esJugable ? T * 0.965 : T * 1.02);
      g.poly(esquinas.flatMap((p) => [p.x, p.y])).fill({ color: COLOR_TERRENO[h.terreno] });
      if (h.esJugable) {
        g.stroke({ width: 3, color: 0xf3e6c4, alpha: 0.9 });
      }
      this.capaMapa.addChild(g);
      if (h.ficha !== null) {
        this.capaMapa.addChild(this.ficha(centro, h.ficha));
      }
    }

    for (const puerto of this.datos!.vista.tablero.puertos) {
      this.capaPuertos.addChild(this.puerto(puerto.vertices[0], puerto.vertices[1], puerto.tipo));
    }
  }

  private ficha(centro: Punto, numero: number): Container {
    const contenedor = new Container();
    const roja = numero === 6 || numero === 8;
    const g = new Graphics()
      .circle(centro.x, centro.y, T * 0.31)
      .fill({ color: 0xf8f0dc })
      .stroke({ width: 2, color: 0x9c8660 });
    contenedor.addChild(g);
    const texto = new Text({
      text: String(numero),
      style: { fontFamily: 'system-ui, sans-serif', fontSize: T * 0.3, fontWeight: '800', fill: roja ? 0xc62828 : 0x2b2118 },
    });
    texto.anchor.set(0.5);
    texto.position.set(centro.x, centro.y - T * 0.05);
    contenedor.addChild(texto);
    const puntos = puntosProbabilidad(numero);
    const separacion = T * 0.07;
    const puntitos = new Graphics();
    for (let i = 0; i < puntos; i++) {
      puntitos.circle(centro.x + (i - (puntos - 1) / 2) * separacion, centro.y + T * 0.16, T * 0.026);
    }
    puntitos.fill({ color: roja ? 0xc62828 : 0x2b2118 });
    contenedor.addChild(puntitos);
    return contenedor;
  }

  private puerto(a: string, b: string, tipo: string): Container {
    const grafo = this.grafo!;
    const pa = grafo.posicionVertice(a, T);
    const pb = grafo.posicionVertice(b, T);
    const medio = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    // El puerto se dibuja hacia el mar: el hexágono del lado que no es tierra.
    const arista = grafo.aristaEntre(a, b);
    const mar = arista
      ? grafo.arista(arista).hexagonos.find((c) => !grafo.hexagonoEn(c)?.esJugable)
      : undefined;
    const destino = mar ? hexAPixel(mar, T) : medio;
    const posicion = { x: medio.x + (destino.x - medio.x) * 0.5, y: medio.y + (destino.y - medio.y) * 0.5 };

    const contenedor = new Container();
    const muelles = new Graphics()
      .moveTo(posicion.x, posicion.y)
      .lineTo(pa.x, pa.y)
      .moveTo(posicion.x, posicion.y)
      .lineTo(pb.x, pb.y)
      .stroke({ width: 5, color: 0x8a6440, cap: 'round' });
    const generico = tipo === 'generico';
    const circulo = new Graphics()
      .circle(posicion.x, posicion.y, T * 0.27)
      .fill({ color: generico ? 0xffffff : COLOR_TERRENO[tipo as keyof typeof COLOR_TERRENO] })
      .stroke({ width: 2.5, color: CONTORNO });
    const texto = new Text({
      text: generico ? '3:1' : '2:1',
      style: { fontFamily: 'system-ui, sans-serif', fontSize: T * 0.21, fontWeight: '800', fill: CONTORNO },
    });
    texto.anchor.set(0.5);
    texto.position.set(posicion.x, posicion.y);
    contenedor.addChild(muelles, circulo, texto);
    return contenedor;
  }

  private dibujarCarreteras(): void {
    const grafo = this.grafo!;
    this.vaciar(this.capaCarreteras);
    for (const [arista, jugador] of Object.entries(this.datos!.vista.tablero.carreteras)) {
      const [a, b] = grafo.arista(arista).vertices.map((v) => grafo.posicionVertice(v, T)) as [Punto, Punto];
      const [p, q] = recortar(a, b, 0.14);
      const g = new Graphics()
        .moveTo(p.x, p.y)
        .lineTo(q.x, q.y)
        .stroke({ width: T * 0.17, color: CONTORNO, cap: 'round' })
        .moveTo(p.x, p.y)
        .lineTo(q.x, q.y)
        .stroke({ width: T * 0.11, color: this.colorDe(jugador), cap: 'round' });
      this.capaCarreteras.addChild(g);
    }
  }

  /** Velero centrado en `centro`, orientado según `angulo` (radianes). */
  private barco(centro: Punto, angulo: number, color: number, escala: number, colorVela = 0xfdf6e3): Container {
    const contenedor = new Container();
    const s = T * escala;
    const casco = new Graphics()
      .poly([-0.5, 0, 0.5, 0, 0.32, 0.24, -0.32, 0.24].map((v) => v * s))
      .fill({ color })
      .stroke({ width: 2, color: CONTORNO, join: 'round' });
    const vela = new Graphics()
      .poly([-0.02, -0.04, -0.02, -0.5, 0.3, -0.04].map((v) => v * s))
      .fill({ color: colorVela })
      .stroke({ width: 1.5, color: CONTORNO, join: 'round' });
    contenedor.addChild(casco, vela);
    contenedor.position.set(centro.x, centro.y);
    // Que el barco nunca quede boca abajo.
    const normalizado = ((angulo % Math.PI) + Math.PI) % Math.PI;
    contenedor.rotation = normalizado > Math.PI / 2 ? normalizado - Math.PI : normalizado;
    return contenedor;
  }

  private dibujarBarcos(): void {
    const grafo = this.grafo!;
    for (const [arista, jugador] of Object.entries(this.datos!.vista.tablero.barcos ?? {})) {
      if (!grafo.aristas.has(arista)) {
        continue;
      }
      const [a, b] = grafo.arista(arista).vertices.map((v) => grafo.posicionVertice(v, T)) as [Punto, Punto];
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.capaCarreteras.addChild(this.barco(centro, Math.atan2(b.y - a.y, b.x - a.x), this.colorDe(jugador), 0.62));
    }
  }

  /** Ciudades y Caballeros: caballeros, murallas, metrópolis y mercader. */
  private dibujarCiudadesYCaballeros(): void {
    const grafo = this.grafo!;
    const { tablero, cyc } = this.datos!.vista;
    for (const [vertice, jugador] of Object.entries(tablero.murallas ?? {})) {
      const p = grafo.posicionVertice(vertice, T);
      const muralla = new Graphics()
        .roundRect(p.x - T * 0.3, p.y - T * 0.06, T * 0.6, T * 0.3, T * 0.05)
        .fill({ color: 0x8d8478 })
        .stroke({ width: 3, color: this.colorDe(jugador) });
      this.capaEdificios.addChild(muralla);
    }
    for (const [vertice, caballero] of Object.entries(tablero.caballeros ?? {})) {
      const p = grafo.posicionVertice(vertice, T);
      const color = this.colorDe(caballero.jugador);
      const ficha = new Graphics()
        .circle(p.x, p.y, T * 0.17)
        .fill({ color: caballero.activo ? color : 0xffffff })
        .stroke({ width: caballero.activo ? 3 : 4, color: caballero.activo ? CONTORNO : color });
      const nivel = new Text({
        text: '★'.repeat(caballero.nivel),
        style: { fontFamily: 'system-ui, sans-serif', fontSize: T * (caballero.nivel === 3 ? 0.11 : 0.14), fontWeight: '900', fill: caballero.activo ? 0xffffff : CONTORNO },
      });
      nivel.anchor.set(0.5);
      nivel.position.set(p.x, p.y);
      this.capaEdificios.addChild(ficha, nivel);
    }
    for (const vertice of Object.values(cyc?.metropolis ?? {})) {
      if (!vertice || !tablero.edificios[vertice]) {
        continue;
      }
      const p = grafo.posicionVertice(vertice, T);
      const estrella = new Text({ text: '♛', style: { fontSize: T * 0.3, fill: 0xffd54f, stroke: { color: CONTORNO, width: 3 } } });
      estrella.anchor.set(0.5);
      estrella.position.set(p.x, p.y - T * 0.3);
      this.capaEdificios.addChild(estrella);
    }
    const mercader = cyc?.mercader;
    const hexMercader = mercader ? grafo.hexagonos.get(mercader.hexagono) : undefined;
    if (mercader && hexMercader) {
      const c = hexAPixel(hexMercader.coordenadas, T);
      const ficha = new Graphics()
        .circle(c.x + T * 0.42, c.y, T * 0.14)
        .fill({ color: this.colorDe(mercader.jugador) })
        .stroke({ width: 2.5, color: CONTORNO });
      const letra = new Text({ text: 'M', style: { fontFamily: 'system-ui, sans-serif', fontSize: T * 0.16, fontWeight: '900', fill: CONTORNO } });
      letra.anchor.set(0.5);
      letra.position.set(c.x + T * 0.42, c.y);
      this.capaEdificios.addChild(ficha, letra);
    }
  }

  private dibujarEdificios(): void {
    const grafo = this.grafo!;
    this.vaciar(this.capaEdificios);
    if (this.datos!.vista.tablero.caballeros) {
      this.dibujarCiudadesYCaballeros();
    }
    for (const [vertice, edificio] of Object.entries(this.datos!.vista.tablero.edificios)) {
      const p = grafo.posicionVertice(vertice, T);
      const s = T * 0.17;
      const forma =
        edificio.tipo === 'poblado'
          ? [[-1, 0.9], [-1, -0.2], [0, -1.05], [1, -0.2], [1, 0.9]]
          : [[-1.35, 1], [-1.35, -0.35], [-0.65, -1.05], [0.05, -0.35], [0.05, -0.1], [1.35, -0.1], [1.35, 1]];
      const g = new Graphics()
        .poly(forma.flatMap(([x, y]) => [p.x + x! * s, p.y + y! * s]))
        .fill({ color: this.colorDe(edificio.jugador) })
        .stroke({ width: 2.5, color: CONTORNO, join: 'round' });
      this.capaEdificios.addChild(g);
    }
  }

  private dibujarLadron(): void {
    const grafo = this.grafo!;
    this.vaciar(this.capaLadron);
    const hexagono = grafo.hexagonos.get(this.datos!.vista.tablero.ladron);
    if (!hexagono) {
      return;
    }
    const pirata = this.datos!.vista.tablero.pirata;
    const hexPirata = pirata ? grafo.hexagonos.get(pirata) : undefined;
    if (hexPirata) {
      this.capaLadron.addChild(this.barco(hexAPixel(hexPirata.coordenadas, T), 0, 0x22252b, 1.1, 0x111111));
    }
    const c = hexAPixel(hexagono.coordenadas, T);
    const x = c.x - T * 0.42;
    const g = new Graphics()
      .ellipse(x, c.y + T * 0.2, T * 0.15, T * 0.06)
      .fill({ color: 0x000000, alpha: 0.25 })
      .poly([x - T * 0.13, c.y + T * 0.2, x - T * 0.07, c.y - T * 0.08, x + T * 0.07, c.y - T * 0.08, x + T * 0.13, c.y + T * 0.2])
      .fill({ color: 0x3a3f47 })
      .stroke({ width: 2, color: 0x111111 })
      .circle(x, c.y - T * 0.15, T * 0.09)
      .fill({ color: 0x3a3f47 })
      .stroke({ width: 2, color: 0x111111 });
    this.capaLadron.addChild(g);
  }

  private dibujarObjetivos(): void {
    const grafo = this.grafo!;
    this.vaciar(this.capaObjetivos);
    const { objetivos } = this.datos!;

    const interactivo = (g: Graphics, seleccion: Seleccion) => {
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.alpha = 0.75;
      g.on('pointerover', () => (g.alpha = 1));
      g.on('pointerout', () => (g.alpha = 0.75));
      g.on('pointertap', () => {
        if (!this.arrastrado) {
          this.alSeleccionar(seleccion);
        }
      });
      this.capaObjetivos.addChild(g);
    };

    for (const vertice of objetivos.vertices) {
      const p = grafo.posicionVertice(vertice, T);
      const g = new Graphics()
        .circle(p.x, p.y, T * 0.15)
        .fill({ color: RESALTADO })
        .stroke({ width: 3, color: CONTORNO });
      g.hitArea = new Circle(p.x, p.y, T * 0.24);
      interactivo(g, { tipo: 'vertice', id: vertice });
    }
    for (const arista of objetivos.aristas) {
      const [a, b] = grafo.arista(arista).vertices.map((v) => grafo.posicionVertice(v, T)) as [Punto, Punto];
      const [p, q] = recortar(a, b, 0.2);
      const g = new Graphics()
        .moveTo(p.x, p.y)
        .lineTo(q.x, q.y)
        .stroke({ width: T * 0.17, color: CONTORNO, cap: 'round' })
        .moveTo(p.x, p.y)
        .lineTo(q.x, q.y)
        .stroke({ width: T * 0.1, color: RESALTADO, cap: 'round' });
      g.hitArea = areaSegmento(p, q, T * 0.13);
      interactivo(g, { tipo: 'arista', id: arista });
    }
    for (const id of objetivos.hexagonos) {
      const h = grafo.hexagonos.get(id);
      if (!h) {
        continue;
      }
      const c = hexAPixel(h.coordenadas, T);
      const g = new Graphics()
        .poly(esquinasHexagono(c, T * 0.9).flatMap((p) => [p.x, p.y]))
        .fill({ color: RESALTADO, alpha: 0.25 })
        .stroke({ width: 5, color: RESALTADO });
      g.hitArea = new Circle(c.x, c.y, T * 0.8);
      interactivo(g, { tipo: 'hexagono', id });
    }
  }
}

// threejs-render-engine: cómo se ve una escena de three.js. La app pone lo suyo en
// `motor.scene` (o en `motor.content`) y decide qué está seleccionado; el motor pone el
// resto: luces, sombras, entorno, piso, contornos, modos de vista y el render final.
//
//   const motor = createEngine(document.body, { preset: 'warm', area: 250 });
//   motor.content.add(miMalla);
//   motor.select([miMalla]);             // contorno de selección
//   motor.mode = 'clay';                 // render | clay | wireframe | normals | matcap
//   motor.edges({ enabled: true });      // contorno fino de geometría
//   const png = await motor.render({ samples: 300 });   // path tracing, con un click
//   motor.help();
//
// Cómo se ve sale de un PRESET (ver presets.js): un cliente nuevo es un preset, no código.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PRESETS, resolvePreset, mergePreset, definePreset } from './presets.js';
import { createEdgePass } from './edges.js';
import { pathTrace } from './pathtracer.js';
import { help } from './help.js';
import { classifyGpu, GPU_KIND_TEXT } from './gpu.js';
import { createAutoScale } from './resolution.js';
import { ENGINE_MEMBERS } from './members.js';

export { PRESETS, resolvePreset, mergePreset, definePreset, ENGINE_MEMBERS };

/** @typedef {import('./presets.js').Preset} Preset */
/** @typedef {'render' | 'clay' | 'wireframe' | 'normals' | 'matcap'} Mode */

/** Los modos de vista. 'render' es la escena con sus materiales; los otros pisan el material de todo. */
export const MODES = /** @type {readonly Mode[]} */ (Object.freeze(['render', 'clay', 'wireframe', 'normals', 'matcap']));

/** Un matcap de estudio, dibujado en un canvas (sin archivos). */
function matcapTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const r = g.createRadialGradient(96, 84, 6, 128, 128, 170);
  r.addColorStop(0, '#f6f3ee'); r.addColorStop(0.35, '#c9c3ba'); r.addColorStop(0.7, '#6b665f'); r.addColorStop(1, '#25231f');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Crea el motor dentro de un contenedor (o sobre un canvas).
 * @param {HTMLElement | HTMLCanvasElement} target
 * @param {{ preset?: string | Record<string, any>, area?: number, fov?: number, controls?: boolean, pixelRatio?: number, antialias?: number, resolution?: number | 'auto' }} [opts]
 *   `area`: el radio de la zona de trabajo en la unidad de la escena (cm: 250 es un taller).
 *   `antialias`: muestras de MSAA del visor (4 por defecto; 0 lo apaga).
 *   `resolution`: escala de los píxeles del visor (1 nativa, 0.5 la mitad) o 'auto' (ver resolution()).
 */
export function createEngine(target, { preset = 'studio', area = 250, fov = 38, controls: conControles = true, pixelRatio, antialias = 4, resolution: resolucionInicial = 1 } = {}) {
  if (!(area > 0)) throw new RangeError(`area inválida: ${area} (va el radio de la zona de trabajo, mayor que 0)`);
  const esCanvas = target instanceof HTMLCanvasElement;
  const container = esCanvas ? /** @type {HTMLElement} */ (target.parentElement ?? document.body) : target;
  const medida = () => {
    const w = container === document.body ? window.innerWidth : container.clientWidth;
    const h = container === document.body ? window.innerHeight : container.clientHeight;
    return [Math.max(1, w), Math.max(1, h)];
  };

  // ---------- renderer, escena, cámara ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', ...(esCanvas ? { canvas: target } : {}) });
  /** El pixelRatio con escala 1: el de la pantalla, hasta 2 (o el que se pidió). */
  const prBase = pixelRatio ?? Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(prBase);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (!esCanvas) container.appendChild(renderer.domElement);
  const [w0, h0] = medida();
  renderer.setSize(w0, h0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, w0 / h0, area / 250, area * 16);
  camera.position.set(area * 0.6, area * 0.48, area * 0.76);
  const controls = conControles ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) { controls.target.set(0, area * 0.1, 0); controls.enableDamping = true; controls.dampingFactor = 0.12; }

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /** Lo de la app, si no quiere colgarlo directo de la escena. */
  const content = new THREE.Group();
  content.name = 'content';
  scene.add(content);
  /** Lo que va encima de todo y fuera del post-proceso: gizmos, manijas. */
  const overlay = new THREE.Scene();

  // ---------- el "estudio": luces, piso, grilla (salen del preset) ----------
  const estudio = new THREE.Group();
  estudio.name = 'studio';
  scene.add(estudio);
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.shadow.bias = -0.0004;
  estudio.add(hemi, sun, sun.target);
  /** @type {THREE.Mesh | null} */ let floor = null;
  /** @type {THREE.GridHelper | null} */ let grid = null;

  // ---------- post-proceso ----------
  // el post-proceso dibuja a texturas intermedias, que no tienen el antialiasing del canvas: sin
  // MSAA en ellas los bordes de las piezas quedan dentados
  const pr0 = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w0 * pr0, h0 * pr0, { type: THREE.HalfFloatType, samples: Math.max(0, antialias) }));
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w0, h0);
  composer.addPass(new RenderPass(scene, camera));
  const edgePass = createEdgePass(renderer, scene, camera);
  composer.addPass(edgePass);
  // bloom: lo que pasa de `threshold` (en lineal: un emisivo con intensidad > 1, un reflejo del
  // sol) se derrama alrededor. Antes de los contornos, para que la selección no brille.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.8, 0.4, 0.9);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

  /** @param {number} strength @param {number} thickness */
  function outlinePass(strength, thickness) {
    const o = new OutlinePass(new THREE.Vector2(w0, h0), scene, camera);
    o.edgeStrength = strength;
    o.edgeThickness = thickness;
    o.edgeGlow = 0;
    o.pulsePeriod = 0;
    // el overlay entrega color premultiplicado por alfa: con NormalBlending se multiplica dos
    // veces y, con tonemapping, el color vira (cian/magenta). Lo correcto es (One, 1 − alfa).
    o.overlayMaterial.blending = THREE.CustomBlending;
    o.overlayMaterial.blendSrc = THREE.OneFactor;
    o.overlayMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
    o.overlayMaterial.blendEquation = THREE.AddEquation;
    return o;
  }
  const seleccion = outlinePass(3, 1.2);
  composer.addPass(seleccion);
  /** Un contorno angosto por objeto: marca las costuras entre piezas que se tocan. @type {OutlinePass[]} */
  const detalles = [];
  composer.addPass(new OutputPass());

  // ---------- preset ----------
  /** @type {Preset} */ let P = resolvePreset(preset);
  /** Lo que se ve del estudio: se prende y apaga sin cambiar de preset (show). */
  const vis = { grid: true, floor: true, sky: false, fog: true, shadows: true };
  /** @type {THREE.Texture | null} */ let cieloTex = null;

  /** Un cielo degradé (de arriba al horizonte) como fondo equirectangular. @param {{ top: string, bottom: string }} s */
  function cielo(s) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, s.top); grad.addColorStop(0.5, s.bottom); grad.addColorStop(1, s.bottom);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function aplicarVisibilidad() {
    const bg = new THREE.Color(P.background);
    cieloTex?.dispose();
    cieloTex = vis.sky && P.sky ? cielo(P.sky) : null;
    scene.background = cieloTex ?? bg;
    scene.fog = vis.fog && P.fog ? new THREE.Fog(P.sky && vis.sky ? P.sky.bottom : bg, P.fog.near * area, P.fog.far * area) : null;
    sun.castShadow = P.sun.shadows && vis.shadows;
    if (grid) grid.visible = vis.grid;
    if (floor) floor.visible = vis.floor && (modo === 'render' || modo === 'clay');
  }

  function aplicarPreset() {
    scene.environmentIntensity = P.environment.intensity;
    renderer.toneMappingExposure = P.exposure;

    hemi.color.set(P.hemisphere.sky); hemi.groundColor.set(P.hemisphere.ground); hemi.intensity = P.hemisphere.intensity;
    sun.color.set(P.sun.color); sun.intensity = P.sun.intensity;
    const d = new THREE.Vector3(...P.sun.direction).normalize();
    sun.position.copy(d.multiplyScalar(area * 1.1));
    if (sun.shadow.mapSize.x !== P.sun.shadowMapSize) { sun.shadow.mapSize.set(P.sun.shadowMapSize, P.sun.shadowMapSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    Object.assign(sun.shadow.camera, { left: -area * 0.9, right: area * 0.9, top: area * 0.9, bottom: -area * 0.9, near: area * 0.04, far: area * 2.8 });
    sun.shadow.normalBias = area * 0.0016;
    sun.shadow.camera.updateProjectionMatrix();

    if (floor) { estudio.remove(floor); floor.geometry.dispose(); /** @type {THREE.Material} */ (floor.material).dispose(); floor = null; }
    if (P.floor) {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(area * 16, area * 16), new THREE.MeshStandardMaterial({ color: P.floor.color, roughness: P.floor.roughness }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      floor.userData.noEdge = true;
      floor.name = 'floor';
      estudio.add(floor);
    }
    if (grid) { estudio.remove(grid); grid.geometry.dispose(); /** @type {THREE.Material} */ (grid.material).dispose(); grid = null; }
    if (P.grid) {
      grid = new THREE.GridHelper(area * 1.12, P.grid.divisions, P.grid.color, P.grid.color);
      const gm = /** @type {THREE.LineBasicMaterial} */ (grid.material);
      gm.transparent = true; gm.opacity = P.grid.opacity;
      grid.position.y = area * 0.00024;
      grid.userData.noEdge = true;
      grid.name = 'grid';
      estudio.add(grid);
    }

    for (const o of [seleccion, ...detalles]) { o.visibleEdgeColor.set(P.selection.color); o.hiddenEdgeColor.set(P.selection.color); }
    seleccion.edgeStrength = P.selection.strength; seleccion.edgeThickness = P.selection.thickness;
    for (const o of detalles) { o.edgeStrength = P.selection.detailStrength; o.edgeThickness = P.selection.detailThickness; }
    aplicarBordes(P.edges);
    aplicarBloom(P.bloom);
    aplicarModo();
  }

  // ---------- contorno fino ----------
  /** @param {Partial<Preset['edges']>} e */
  /** @param {Partial<Preset['bloom']>} b */
  function aplicarBloom(b) {
    if (b.enabled !== undefined) bloomPass.enabled = !!b.enabled;
    if (b.strength !== undefined) bloomPass.strength = b.strength;
    if (b.radius !== undefined) bloomPass.radius = b.radius;
    if (b.threshold !== undefined) bloomPass.threshold = b.threshold;
  }

  function aplicarBordes(e) {
    if (e.enabled !== undefined) edgePass.enabled = !!e.enabled;
    if (e.normalThreshold !== undefined) edgePass.uniforms.normalThreshold.value = e.normalThreshold;
    if (e.depthThreshold !== undefined) edgePass.uniforms.depthThreshold.value = e.depthThreshold;
    if (e.darken !== undefined) edgePass.uniforms.darkenFactor.value = e.darken;
  }

  // ---------- modos de vista ----------
  /** @type {Mode} */ let modo = 'render';
  /** @type {Record<Exclude<Mode, 'render'>, THREE.Material>} */
  const pisadores = {
    clay: new THREE.MeshStandardMaterial({ color: '#b6b0a6', roughness: 1, metalness: 0 }),
    wireframe: new THREE.MeshBasicMaterial({ color: '#3a3a40', wireframe: true }),
    normals: new THREE.MeshNormalMaterial(),
    matcap: new THREE.MeshMatcapMaterial({ matcap: matcapTexture() }),
  };
  function aplicarModo() {
    aplicarVisibilidad();
  }

  /**
   * Dibuja con el material del modo puesto solo en las mallas de la app (no en el estudio ni en
   * el fondo), y lo devuelve. No va en scene.overrideMaterial: ese pisa también la grilla y el
   * fondo, y los pases de contorno lo usan para sus máscaras y lo dejan en null al terminar.
   * @param {() => void} dibujar
   */
  function conModo(dibujar) {
    if (modo === 'render') return dibujar();
    const pisador = pisadores[modo];
    /** @type {[THREE.Mesh, THREE.Material | THREE.Material[]][]} */
    const cambiados = [];
    scene.traverse((o) => {
      const m = /** @type {THREE.Mesh} */ (o);
      if (!m.isMesh || o.parent === estudio) return;
      cambiados.push([m, m.material]);
      m.material = pisador;
    });
    try { dibujar(); } finally { for (const [m, mat] of cambiados) m.material = mat; }
  }

  // ---------- tamaño ----------
  function ajustar() {
    const [w, h] = medida();
    renderer.setSize(w, h, !esCanvas);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(container);

  // ---------- resolución: cuántos píxeles se dibujan (fija o automática) ----------
  let escala = 1;
  /** @type {ReturnType<typeof createAutoScale> | null} */ let auto = null;
  /** @param {number} s */
  function aplicarEscala(s) {
    escala = s;
    const pr = prBase * s;
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    ajustar();
  }

  // ---------- el cuadro ----------
  /** @type {Set<(dt: number) => void>} */
  const alCuadro = new Set();
  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = reloj.getDelta();
    if (auto) { const n = auto.sample(dt * 1000); if (n !== null) aplicarEscala(n); }
    controls?.update();
    for (const fn of alCuadro) fn(dt);
    conModo(() => composer.render());
    if (overlay.children.length) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlay, camera);
      renderer.autoClear = true;
    }
  });

  aplicarPreset();

  /**
   * La caja de unos objetos, o de todo el contenido (sin el estudio).
   * @param {THREE.Object3D[] | undefined} objs
   */
  function cajaDe(objs) {
    const caja = new THREE.Box3();
    const lista = objs?.length ? objs : scene.children.filter((o) => o !== estudio);
    for (const o of lista) caja.expandByObject(o);
    return caja;
  }

  const motor = {
    renderer, scene, camera, controls, content, overlay, composer,

    /** El preset que está puesto (una copia: para cambiarlo, setPreset). */
    get preset() { return structuredClone(P); },
    /**
     * Cambia cómo se ve: un nombre de PRESETS, un objeto completo, o `{ extends, … }`.
     * @param {string | Record<string, any>} p
     */
    setPreset(p) { P = resolvePreset(p); aplicarPreset(); return motor; },
    /** Pisa algunos valores del preset actual: `motor.tweak({ sun: { intensity: 3 } })`. @param {Record<string, any>} over */
    tweak(over) { P = mergePreset(P, over); aplicarPreset(); return motor; },

    get mode() { return modo; },
    set mode(m) { motor.setMode(m); },
    /** @param {Mode} m */
    setMode(m) {
      if (!MODES.includes(m)) throw new Error(`modo desconocido: ${String(m)} (van ${MODES.join(', ')})`);
      modo = m; aplicarModo(); return motor;
    },

    /**
     * Contorno de selección: la silueta de lo que se pasa (vacío: nada). Con `{ detail: true }`,
     * además una línea fina por objeto, para ver las costuras entre los que se tocan.
     * @param {THREE.Object3D[]} [objects] @param {{ detail?: boolean }} [opts]
     */
    select(objects = [], { detail = false } = {}) {
      seleccion.selectedObjects = [...objects];
      const n = detail ? objects.length : 0;
      while (detalles.length < n) {
        const o = outlinePass(P.selection.detailStrength, P.selection.detailThickness);
        o.visibleEdgeColor.set(P.selection.color); o.hiddenEdgeColor.set(P.selection.color);
        o.setSize(...medida());
        detalles.push(o);
        composer.insertPass(o, composer.passes.indexOf(seleccion));
      }
      detalles.forEach((o, i) => { o.selectedObjects = i < n ? [objects[i]] : []; });
      return motor;
    },
    /** Lo que está seleccionado. */
    get selected() { return [...seleccion.selectedObjects]; },

    /**
     * Prender o apagar partes del estudio sin cambiar de preset: grilla, piso, cielo (degradé de
     * fondo, en vez del color liso), niebla y sombras. Sin argumentos, devuelve cómo está.
     * @param {Partial<{ grid: boolean, floor: boolean, sky: boolean, fog: boolean, shadows: boolean }>} [s]
     */
    show(s) {
      if (s) {
        for (const [k, v] of Object.entries(s)) {
          if (!(k in vis)) throw new Error(`no hay ${k} para mostrar (van ${Object.keys(vis).join(', ')})`);
          /** @type {Record<string, boolean>} */ (vis)[k] = !!v;
        }
        aplicarVisibilidad();
      }
      return { ...vis };
    },

    /**
     * El contorno fino de geometría: `{ enabled, normalThreshold, depthThreshold, darken }`. Sin
     * argumentos, devuelve cómo está.
     * @param {Partial<Preset['edges']>} [e]
     */
    edges(e) {
      if (e) { P = mergePreset(P, { edges: e }); aplicarBordes(e); }
      return { enabled: edgePass.enabled, normalThreshold: edgePass.uniforms.normalThreshold.value, depthThreshold: edgePass.uniforms.depthThreshold.value, darken: edgePass.uniforms.darkenFactor.value };
    },

    /**
     * El bloom: lo que pasa de `threshold` se derrama alrededor (la luz de un emisivo, un reflejo
     * fuerte). `{ enabled, strength, radius, threshold }`; sin argumentos, devuelve cómo está.
     * @param {Partial<Preset['bloom']>} [b]
     */
    bloom(b) {
      if (b) { P = mergePreset(P, { bloom: b }); aplicarBloom(b); }
      return { enabled: bloomPass.enabled, strength: bloomPass.strength, radius: bloomPass.radius, threshold: bloomPass.threshold };
    },

    /**
     * Encuadra la cámara en unos objetos, o en todo lo que hay.
     * @param {THREE.Object3D[]} [objects]
     */
    frame(objects) {
      const caja = cajaDe(objects);
      if (caja.isEmpty()) return motor;
      const centro = caja.getCenter(new THREE.Vector3());
      const radio = Math.max(area * 0.08, caja.getSize(new THREE.Vector3()).length() / 2);
      const objetivo = controls?.target ?? new THREE.Vector3();
      const dir = camera.position.clone().sub(objetivo).normalize();
      objetivo.copy(centro);
      camera.position.copy(centro).addScaledVector(dir, (radio / Math.sin((camera.fov * Math.PI) / 360)) * 1.1);
      camera.lookAt(centro);
      return motor;
    },

    /**
     * Una foto rápida del visor (rasterizada, con lo que se ve ahora), como data URL.
     * @param {{ width?: number, height?: number, type?: string, quality?: number }} [opts]
     */
    snapshot({ width, height, type = 'image/png', quality = 0.92 } = {}) {
      const [w, h] = medida();
      const W = width ?? w, H = height ?? h;
      const prev = renderer.getPixelRatio();
      try {
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);
        composer.setPixelRatio(1);
        composer.setSize(W, H);
        camera.aspect = W / H; camera.updateProjectionMatrix();
        conModo(() => composer.render());
        return renderer.domElement.toDataURL(type, quality);
      } finally {
        renderer.setPixelRatio(prev);
        composer.setPixelRatio(prev);
        ajustar();
      }
    },

    /**
     * El render final: path tracing de la escena como está, a una imagen (Blob). Carga
     * three-gpu-pathtracer la primera vez. `onProgress(fracción, muestras)`; `signal` lo corta.
     * @param {import('./pathtracer.js').RenderOptions} [opts]
     */
    render(opts) { return pathTrace({ scene, camera, renderer, preset: () => P }, opts); },

    /**
     * En qué placa se está dibujando: { name, vendor, kind, buffer, pixelRatio, maxMSAA, antialias }.
     * `kind`: 'discrete' | 'integrated' | 'software' | 'unknown'. Lo imprime en la consola (con
     * { print: false }, solo lo devuelve).
     * @param {{ print?: boolean }} [o]
     */
    gpu({ print = true } = {}) {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
      const kind = classifyGpu(name);
      const info = Object.freeze({
        name, vendor, kind,
        buffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
        pixelRatio: renderer.getPixelRatio(),
        maxMSAA: /** @type {number} */ (gl.getParameter(/** @type {WebGL2RenderingContext} */ (gl).MAX_SAMPLES) ?? 0),
        antialias: composer.renderTarget1.samples,
      });
      if (print) {
        const color = kind === 'discrete' ? '#2e7d32' : kind === 'unknown' ? '#666' : '#c62828';
        console.log(`%cGPU%c ${name}  —  %c${GPU_KIND_TEXT[kind]}`, 'font-weight:700', '', `color:${color};font-weight:600`);
        console.log(`   ${info.buffer} px (pixelRatio ${info.pixelRatio}, resolución ${auto ? 'auto, ' : ''}${Math.round(escala * 100)}%), MSAA ${info.antialias} de ${info.maxMSAA} posibles`);
      }
      return info;
    },

    /**
     * Con cuántos píxeles se dibuja el visor, en vivo. Un número es la escala respecto de la
     * resolución nativa (1; 0.5 es la mitad de ancho y de alto: un cuarto de los píxeles), y el
     * navegador estira la imagen a la ventana. 'auto' la ajusta sola según lo que tarda cada
     * cuadro, entre `min` y `max`, para llegar a `fps`. Sin argumentos, devuelve cómo está.
     * No toca el render final (render() tiene su propio tamaño).
     * @param {number | 'auto'} [value] @param {import('./resolution.js').AutoOptions} [opts]
     */
    resolution(value, opts = {}) {
      if (value === 'auto') {
        auto = createAutoScale({ ...opts, start: escala });
        aplicarEscala(auto.scale);
      } else if (value !== undefined) {
        if (typeof value !== 'number' || !(value >= 0.1 && value <= 2)) throw new RangeError(`resolución inválida: ${String(value)} (va un número entre 0.1 y 2, o 'auto')`);
        auto = null;
        aplicarEscala(value);
      }
      const gl = renderer.getContext();
      return Object.freeze({
        mode: auto ? 'auto' : 'fixed', scale: escala, pixelRatio: +renderer.getPixelRatio().toFixed(3),
        buffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, ...(auto ? auto.options : {}),
      });
    },

    /** Algo que corre en cada cuadro, antes de dibujar (etiquetas, animaciones). Devuelve cómo sacarlo. @param {(dt: number) => void} fn */
    onFrame(fn) { alCuadro.add(fn); return () => alCuadro.delete(fn); },

    /** Lo suelta todo: el loop, el post-proceso, el renderer. */
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls?.dispose();
      composer.passes.forEach((p) => p.dispose?.());
      Object.values(pisadores).forEach((m) => m.dispose());
      pmrem.dispose();
      renderer.dispose();
      if (!esCanvas) renderer.domElement.remove();
    },

    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Engine — cómo se ve la escena', ENGINE_MEMBERS, o); },
  };
  if (resolucionInicial !== 1) motor.resolution(resolucionInicial);
  return motor;
}

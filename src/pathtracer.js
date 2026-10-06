// El render final, con un click: path tracing de la escena tal como está (three-gpu-pathtracer),
// a una imagen. Corre en un renderer aparte, del tamaño pedido, así el visor sigue andando y
// el tamaño de la imagen no depende del de la ventana.
//
// three-gpu-pathtracer se carga recién la primera vez que se pide un render (import dinámico):
// una app que nunca renderiza no lo necesita en su importmap.
//
// Lo que el path tracer no entiende se resuelve acá:
//   - el entorno del visor (PMREM) no es equirectangular: durante el render va un degradé
//     cielo/suelo del preset;
//   - la luz hemisférica no existe para él: ese relleno lo da el entorno;
//   - líneas, grillas, sprites y lo marcado con `userData.noRender` no salen en la imagen.
import * as THREE from 'three';

/** @typedef {import('./presets.js').Preset} Preset */
/**
 * @typedef {{ samples?: number, width?: number, height?: number, bounces?: number,
 *   camera?: THREE.Camera, onProgress?: (fraction: number, samples: number) => void,
 *   signal?: AbortSignal, type?: string }} RenderOptions
 */

/** @type {Promise<any> | null} */
let modulo = null;
const cargar = () => (modulo ??= import('three-gpu-pathtracer').catch((e) => {
  modulo = null;
  throw new Error(`no se pudo cargar three-gpu-pathtracer (¿está en el importmap, junto con "three/examples/jsm/"?): ${e.message}`);
}));

/** El navegador pinta entre tanda y tanda de muestras. */
const cuadro = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/**
 * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, preset: () => Preset }} ctx
 * @param {RenderOptions} [opts]
 * @returns {Promise<Blob>}
 */
export async function pathTrace(ctx, opts = {}) {
  const { scene, renderer: visor } = ctx;
  const p = ctx.preset();
  const tam = visor.getSize(new THREE.Vector2());
  const { samples = p.render.samples, bounces = p.render.bounces, onProgress, signal, type = 'image/png' } = opts;
  const width = Math.round(opts.width ?? tam.x), height = Math.round(opts.height ?? tam.y);
  if (!(samples >= 1) || !(width >= 1) || !(height >= 1)) throw new RangeError('samples, width y height van mayores que 0');

  const { WebGLPathTracer, GradientEquirectTexture } = await cargar();

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = visor.toneMapping;
  renderer.toneMappingExposure = visor.toneMappingExposure;
  renderer.outputColorSpace = visor.outputColorSpace;

  const base = /** @type {THREE.PerspectiveCamera} */ (opts.camera ?? ctx.camera);
  const camera = base.clone();
  if (camera.isPerspectiveCamera) { camera.aspect = width / height; camera.updateProjectionMatrix(); }

  const cielo = new GradientEquirectTexture(256);
  cielo.topColor.set(p.render.sky);
  cielo.bottomColor.set(p.render.ground);
  cielo.update();

  const tracer = new WebGLPathTracer(renderer);
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 0;
  tracer.bounces = bounces;
  tracer.tiles.set(2, 2);

  // la escena se toma como está; lo que no va a la imagen se esconde solo mientras se arma
  const antes = { environment: scene.environment, intensity: scene.environmentIntensity, fog: scene.fog };
  /** @type {THREE.Object3D[]} */
  const escondidos = [];
  scene.traverse((o) => {
    const fuera = o.userData.noRender || /** @type {any} */ (o).isLine || /** @type {any} */ (o).isPoints || /** @type {any} */ (o).isSprite;
    if (fuera && o.visible) { o.visible = false; escondidos.push(o); }
  });
  scene.environment = cielo;
  scene.environmentIntensity = p.render.environmentIntensity;
  scene.fog = null;
  try {
    // síncrono: setSceneAsync pide un worker de BVH aparte, y para un render a pedido no vale la pena
    tracer.setScene(scene, camera);
  } finally {
    for (const o of escondidos) o.visible = true;
    scene.environment = antes.environment;
    scene.environmentIntensity = antes.intensity;
    scene.fog = antes.fog;
  }

  try {
    while (tracer.samples < samples) {
      if (signal?.aborted) throw new DOMException('render cancelado', 'AbortError');
      tracer.renderSample();
      onProgress?.(Math.min(1, tracer.samples / samples), Math.floor(tracer.samples));
      await cuadro();
    }
    return await new Promise((ok, mal) => renderer.domElement.toBlob((b) => (b ? ok(b) : mal(new Error('no se pudo sacar la imagen'))), type));
  } finally {
    // tracer.dispose() de la 0.0.23 falla (usa un _renderQuad que no existe), y no hace falta:
    // perder el contexto de este renderer propio suelta todo lo que el tracer subió a la GPU
    cielo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

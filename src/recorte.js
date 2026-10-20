// El recorte por alfa en las pasadas que vuelven a dibujar la escena con un material propio
// (aristas, AO, contornos de selección) y en los modos de vista: una malla con `alphaTest` y una
// `map` o `alphaMap` se ve con su figura, no como el quad entero.
//
// Las pasadas ponen `scene.overrideMaterial` y dibujan. Mientras corre una pasada envuelta, el
// motor intercepta ese override: si en la escena hay algo con recorte, le da a cada malla
// recortada una VARIANTE del material de la pasada que descarta donde el alfa (`map.a ×
// alphaMap.g`) no llega a `alphaTest`, y al resto el material de la pasada tal cual. Si no hay
// nada recortado, la pasada corre como siempre, sin costo.
//
// La variante no usa el color de la textura, solo su alfa: sirve igual para normales,
// profundidad, la máscara de un contorno o el clay.
import * as THREE from 'three';
import { conRecorte, origenDelRecorte as origen } from './flags.js';

export { conRecorte };

/** ¿Algo de la escena recorta por alfa? @param {THREE.Object3D} scene */
export function hayRecorte(scene) {
  let hay = false;
  scene.traverse((o) => {
    const m = /** @type {any} */ (o).material;
    if (!hay && m && (Array.isArray(m) ? m.some(conRecorte) : conRecorte(m))) hay = true;
  });
  return hay;
}

const VERT_PARS = /* glsl */ `
varying vec2 vRecorteMapUv;
varying vec2 vRecorteAlphaUv;
uniform mat3 recorteMapT;
uniform mat3 recorteAlphaT;
`;
const VERT_MAIN = /* glsl */ `
  vRecorteMapUv = (recorteMapT * vec3(uv, 1.0)).xy;
  vRecorteAlphaUv = (recorteAlphaT * vec3(uv, 1.0)).xy;
`;
const FRAG_PARS = /* glsl */ `
varying vec2 vRecorteMapUv;
varying vec2 vRecorteAlphaUv;
uniform sampler2D recorteMap;
uniform sampler2D recorteAlpha;
uniform float recorteTest;
`;
const FRAG_MAIN = /* glsl */ `
  {
    float recorteA = 1.0;
    #ifdef RECORTE_MAP
      recorteA *= texture2D(recorteMap, vRecorteMapUv).a;
    #endif
    #ifdef RECORTE_ALPHA
      recorteA *= texture2D(recorteAlpha, vRecorteAlphaUv).g;
    #endif
    if (recorteA < recorteTest) discard;
  }
`;

/** Mete el descarte en un par de shaders: después de las declaraciones y al principio de main. @param {string} vs @param {string} fs */
function inyectar(vs, fs) {
  const main = /void\s+main\s*\(\s*(void)?\s*\)\s*\{/;
  if (!main.test(vs) || !main.test(fs)) throw new Error('recorte: el shader de la pasada no tiene un main() reconocible');
  return {
    vertexShader: vs.replace(main, (m) => `${VERT_PARS}\n${m}\n${VERT_MAIN}`),
    fragmentShader: fs.replace(main, (m) => `${FRAG_PARS}\n${m}\n${FRAG_MAIN}`),
  };
}

/** La matriz de UV de una textura (como la usa three: offset, repeat, rotation). @param {THREE.Texture | null} t @param {THREE.Matrix3} m */
function matrizDe(t, m) {
  if (!t) return m.identity();
  if (t.matrixAutoUpdate) t.updateMatrix();
  return m.copy(t.matrix);
}

/** @type {WeakMap<THREE.Material, WeakMap<THREE.Material, { v: THREE.Material, firma: string }>>} */
const cache = new WeakMap();

/**
 * La variante de `base` (el material de una pasada) que recorta como `fuente`. Se reusa mientras
 * no cambien qué texturas tiene la fuente ni el shader de la base; los valores (texturas, su
 * transformación, alphaTest, side) se actualizan en cada uso.
 * @param {THREE.Material} base @param {THREE.Material} fuente
 */
export function variante(base, fuente) {
  const f = /** @type {any} */ (origen(fuente));
  const b = /** @type {any} */ (base);
  const firma = `${!!f.map}|${!!f.alphaMap}|${b.isShaderMaterial ? b.vertexShader + b.fragmentShader : ''}`;
  let porFuente = cache.get(base);
  if (!porFuente) { porFuente = new WeakMap(); cache.set(base, porFuente); }
  let e = porFuente.get(f);
  if (!e || e.firma !== firma) {
    e?.v.dispose();
    e = { v: crear(base, f), firma };
    porFuente.set(f, e);
  }
  const v = /** @type {any} */ (e.v);
  const u = v.userData.recorteUniforms;
  u.recorteMap.value = f.map ?? null;
  u.recorteAlpha.value = f.alphaMap ?? null;
  matrizDe(f.map, u.recorteMapT.value);
  matrizDe(f.alphaMap, u.recorteAlphaT.value);
  u.recorteTest.value = f.alphaTest;
  v.side = f.side;
  return e.v;
}

/** @param {any} base @param {any} f */
function crear(base, f) {
  const uniforms = {
    recorteMap: { value: null }, recorteAlpha: { value: null },
    recorteMapT: { value: new THREE.Matrix3() }, recorteAlphaT: { value: new THREE.Matrix3() },
    recorteTest: { value: 0.5 },
  };
  const defines = { ...(f.map ? { RECORTE_MAP: '' } : {}), ...(f.alphaMap ? { RECORTE_ALPHA: '' } : {}) };
  const v = base.clone();
  v.userData = { recorteDe: f, recorteUniforms: uniforms };
  v.defines = { ...(base.defines ?? {}), ...defines };
  if (base.isShaderMaterial) {
    // los uniforms de la pasada se comparten (la pasada los actualiza en cada cuadro)
    v.uniforms = { ...base.uniforms, ...uniforms };
    Object.assign(v, inyectar(base.vertexShader, base.fragmentShader));
  } else {
    v.onBeforeCompile = (/** @type {THREE.WebGLProgramParametersWithUniforms} */ s) => {
      base.onBeforeCompile?.(s);
      Object.assign(s.uniforms, uniforms);
      Object.assign(s, inyectar(s.vertexShader, s.fragmentShader));
    };
    const clave = Object.keys(defines).join(',');
    v.customProgramCacheKey = () => `recorte:${clave}:${base.customProgramCacheKey?.() ?? ''}`;
  }
  return v;
}

/** @param {any} o */
const dibujable = (o) => !!(o.material && (o.isMesh || o.isLine || o.isPoints || o.isSprite));

/**
 * Corre `fn` (una pasada que pone `scene.overrideMaterial` y dibuja) respetando el recorte por
 * alfa. Sin nada recortado en la escena, la pasada corre igual que siempre.
 * @template T @param {THREE.Scene} scene @param {() => T} fn @returns {T}
 */
export function respetandoRecorte(scene, fn) {
  if (!hayRecorte(scene)) return fn();
  const propio = scene.overrideMaterial;
  /** @type {Map<any, THREE.Material | THREE.Material[]>} */
  const originales = new Map();
  const restaurar = () => { for (const [o, m] of originales) o.material = m; originales.clear(); };
  /** @param {THREE.Material | null} base */
  const poner = (base) => {
    restaurar();
    if (!base) return;
    scene.traverse((o) => {
      if (!dibujable(o)) return;
      const a = /** @type {any} */ (o);
      const m = a.material;
      originales.set(a, m);
      a.material = Array.isArray(m) ? m.map((x) => (conRecorte(x) ? variante(base, x) : base)) : conRecorte(m) ? variante(base, m) : base;
    });
  };
  // mientras corre la pasada, el override que pone se reparte por objeto; al renderer le llega null
  Object.defineProperty(scene, 'overrideMaterial', { configurable: true, get: () => null, set: poner });
  try {
    poner(propio);
    return fn();
  } finally {
    restaurar();
    delete (/** @type {any} */ (scene)).overrideMaterial;
    scene.overrideMaterial = propio;
  }
}

/**
 * Envuelve el render de una pasada para que respete el recorte.
 * @param {{ render: (...a: any[]) => void }} pass @param {THREE.Scene} scene
 */
export function respetarRecorte(pass, scene) {
  const original = pass.render.bind(pass);
  pass.render = (...args) => respetandoRecorte(scene, () => original(...args));
}

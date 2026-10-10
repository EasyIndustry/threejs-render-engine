// Las pruebas en Node: lo puro (presets, la tabla de help) y lo que el motor promete de su
// forma. Lo que dibuja se prueba en un navegador (examples/index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRESETS, resolvePreset, mergePreset, definePreset } from '../src/presets.js';
import { ENGINE_MEMBERS } from '../src/members.js';
import { memberNames } from '../src/help.js';
import { classifyGpu, GPU_KIND_TEXT } from '../src/gpu.js';
import { createAutoScale } from '../src/resolution.js';
import { QUALITY, CUSTOM_QUALITY, resolveQuality, mergeQuality, qualityName, suggestQuality } from '../src/quality.js';
import { sinAristas, sinAO, sinRender, sinContorno } from '../src/flags.js';
import { HDRI_DEFAULTS, hdriKind, mergeHdri } from '../src/hdri.js';

/** n cuadros de `ms` cada uno; devuelve la última escala que cambió (o null). */
const cuadros = (a, n, ms) => { let c = null; for (let i = 0; i < n; i++) { const r = a.sample(ms); if (r !== null) c = r; } return c; };

const fuente = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('todos los presets tienen las mismas secciones y claves que studio', () => {
  const ref = PRESETS.studio;
  for (const [nombre, p] of Object.entries(PRESETS)) {
    assert.deepEqual(Object.keys(p).sort(), Object.keys(ref).sort(), nombre);
    for (const [k, v] of Object.entries(p)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) assert.deepEqual(Object.keys(v).sort(), Object.keys(ref[k]).sort(), `${nombre}.${k}`);
    }
  }
});

test('resolvePreset por nombre devuelve una copia: tocarla no cambia el preset', () => {
  const a = resolvePreset('warm');
  a.sun.intensity = 99;
  assert.notEqual(PRESETS.warm.sun.intensity, 99);
  assert.throws(() => resolvePreset('no-existe'), /preset desconocido/);
});

test('mergePreset pisa por sección: un sun parcial cambia solo lo que dice', () => {
  const p = mergePreset(PRESETS.studio, { sun: { intensity: 3 } });
  assert.equal(p.sun.intensity, 3);
  assert.equal(p.sun.color, PRESETS.studio.sun.color);
  assert.deepEqual(p.sun.direction, PRESETS.studio.sun.direction);
});

test('null saca lo que se puede sacar (sky, fog, floor, grid) y nada más', () => {
  const p = mergePreset(PRESETS.studio, { sky: null, fog: null, floor: null, grid: null });
  assert.equal(p.sky, null); assert.equal(p.fog, null); assert.equal(p.floor, null); assert.equal(p.grid, null);
  assert.throws(() => mergePreset(PRESETS.studio, { sun: null }), /no se puede/);
});

test('una clave que no existe es un error, no un valor que se ignora', () => {
  assert.throws(() => mergePreset(PRESETS.studio, { sol: {} }), /desconocida: sol/);
  assert.throws(() => mergePreset(PRESETS.studio, { sun: { intensidad: 2 } }), /sun\.intensidad/);
});

test('una sección sacada vuelve con los valores de studio si se la pisa', () => {
  const sinGrilla = mergePreset(PRESETS.studio, { grid: null });
  const conGrilla = mergePreset(sinGrilla, { grid: { opacity: 0.5 } });
  assert.equal(conGrilla.grid?.opacity, 0.5);
  assert.equal(conGrilla.grid?.divisions, PRESETS.studio.grid?.divisions);
});

test('{ extends } y definePreset: el preset de un cliente pisa a uno que existe', () => {
  const p = definePreset('prueba-cliente', { extends: 'dark', selection: { color: '#00aa77' } });
  assert.equal(p.selection.color, '#00aa77');
  assert.equal(p.background, PRESETS.dark.background);
  assert.deepEqual(resolvePreset('prueba-cliente'), p);
  delete PRESETS['prueba-cliente'];
});

test('classifyGpu: dedicada, integrada o software, con los nombres que da WebGL', () => {
  const casos = {
    'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.5.0)': 'discrete',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'discrete',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)': 'discrete',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'integrated',
    'Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2)': 'integrated',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': 'integrated',
    'AMD Radeon Vega 8 Graphics': 'integrated',
    'Apple M2': 'integrated',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)': 'software',
    'llvmpipe (LLVM 15.0.7, 256 bits)': 'software',
    'Microsoft Basic Render Driver': 'software',
    '': 'unknown',
    'WebKit WebGL': 'unknown',
  };
  for (const [nombre, tipo] of Object.entries(casos)) assert.equal(classifyGpu(nombre), tipo, nombre);
  for (const t of ['discrete', 'integrated', 'software', 'unknown']) assert.ok(GPU_KIND_TEXT[t], t);
});

test('resolución automática: si no llega a los fps baja, y no pasa del mínimo', () => {
  const a = createAutoScale({ fps: 60, min: 0.4 });
  assert.equal(a.scale, 1);
  const bajo = cuadros(a, 30, 33); // 30 fps
  assert.ok(bajo !== null && bajo < 1 && bajo >= 0.7, `bajó a ${bajo}`);
  cuadros(a, 30 * 20, 100); // muy lento, mucho tiempo
  assert.equal(a.scale, 0.4);
});

test('resolución automática: sube despacio solo si estuvo estable varias mediciones', () => {
  const a = createAutoScale({ fps: 60, start: 0.5 });
  assert.equal(cuadros(a, 30 * 3, 16.7), null); // tres mediciones estables: todavía no
  const sube = cuadros(a, 30, 16.7); // la cuarta
  assert.equal(sube, 0.55);
  cuadros(a, 30 * 4 * 20, 16.7);
  assert.equal(a.scale, 1); // no pasa del máximo
});

test('resolución automática: recuerda el techo y no oscila; pasado un rato vuelve a probar', () => {
  // una "placa" cuyo cuadro tarda según los píxeles: a escala s, 25 ms × s² (con vsync, nunca menos de 16.7)
  const a = createAutoScale({ fps: 60, memory: 20 });
  const cuadro = () => Math.max(16.7, 25 * a.scale * a.scale);
  const escalas = [];
  // 60 mediciones ≈ 30 s: baja una vez al principio y después prueba subir pocas veces, cada vez más espaciadas
  for (let i = 0; i < 30 * 60; i++) { a.sample(cuadro()); if (i % 30 === 29) escalas.push(a.scale); }
  const lentas = escalas.filter((s) => 25 * s * s > 16.7 * 1.1).length;
  assert.ok(lentas <= 3, `se pasó del presupuesto ${lentas} veces: ${escalas.join(' ')}`);
  assert.ok(a.scale >= 0.78 && a.scale <= 0.84, `se acomodó en ${a.scale}`);
});

test('resolución automática: un tirón suelto no la baja, una pausa larga no cuenta', () => {
  const a = createAutoScale({ fps: 60 });
  for (let i = 0; i < 29; i++) a.sample(16.7);
  assert.equal(a.sample(80), null); // 1 de 30 cuadros lento: el percentil 75 sigue bien
  assert.equal(a.sample(5000), null); // la pestaña estuvo oculta
  assert.equal(a.scale, 1);
  assert.throws(() => createAutoScale({ min: 0 }), /límites/);
});

test('calidad: baja, media y alta tienen los mismos ajustes, y suben de costo', () => {
  const claves = Object.keys(QUALITY.media).sort();
  for (const q of ['baja', 'media', 'alta']) assert.deepEqual(Object.keys(QUALITY[q]).sort(), claves, q);
  assert.ok(QUALITY.baja.antialias < QUALITY.media.antialias && QUALITY.media.antialias < QUALITY.alta.antialias);
  assert.ok(QUALITY.baja.shadowMapSize < QUALITY.alta.shadowMapSize);
  assert.equal(QUALITY.alta.textures, 'hd');
});

test('calidad: tocar un ajuste la vuelve personalizada; volver a los valores de fábrica, no', () => {
  const p = mergeQuality(resolveQuality('media'), { ao: true });
  assert.equal(qualityName(p), CUSTOM_QUALITY);
  assert.equal(qualityName(mergeQuality(p, { ao: false })), 'media');
  assert.equal(qualityName(resolveQuality({ extends: 'alta', bloom: false })), CUSTOM_QUALITY);
  assert.deepEqual(resolveQuality('baja'), { ...QUALITY.baja });
});

test('calidad: un ajuste mal escrito o fuera de rango es un error claro', () => {
  assert.throws(() => resolveQuality('ultra'), /calidad desconocida: ultra/);
  assert.throws(() => mergeQuality(QUALITY.media, { msaa: 4 }), /ajuste de calidad desconocido: msaa/);
  assert.throws(() => mergeQuality(QUALITY.media, { antialias: 3 }), /antialias: va 0, 2, 4, 8 o 16/);
  assert.throws(() => mergeQuality(QUALITY.media, { shadowMapSize: 3000 }), /potencia de 2/);
  assert.throws(() => mergeQuality(QUALITY.media, { textures: '4k' }), /textures/);
});

test('calidad sugerida según la placa', () => {
  assert.equal(suggestQuality('discrete'), 'alta');
  assert.equal(suggestQuality('integrated'), 'baja');
  assert.equal(suggestQuality('software'), 'baja');
  assert.equal(suggestQuality('unknown'), 'media');
});

test('espejos y materiales de shader: fuera de las pasadas auxiliares y del render final', () => {
  const malla = (material, extra = {}) => ({ userData: {}, isMesh: true, material, ...extra });
  const estandar = { isMeshStandardMaterial: true };
  const shader = { isShaderMaterial: true };
  const espejo = malla(shader, { isReflector: true });
  // un espejo (Reflector) no entra en aristas, AO ni render, sin que la app lo marque
  assert.ok(sinAristas(espejo) && sinAO(espejo) && sinContorno(espejo) && sinRender(espejo));
  // una pieza común entra en todo
  const pieza = malla(estandar);
  assert.ok(!sinAristas(pieza) && !sinAO(pieza) && !sinContorno(pieza) && !sinRender(pieza));
  // las banderas van cada una a lo suyo
  assert.ok(sinAristas(malla(estandar, { userData: { noEdge: true } })));
  assert.ok(!sinAO(malla(estandar, { userData: { noEdge: true } })));
  assert.ok(sinAO(malla(estandar, { userData: { noAO: true } })));
  assert.ok(sinRender(malla(estandar, { userData: { noRender: true } })));
  // el path tracer no entiende un material de shader propio, solo o en un array
  assert.ok(sinRender(malla(shader)));
  assert.ok(sinRender(malla([estandar, { isRawShaderMaterial: true }])));
  assert.ok(!sinRender(malla([estandar, estandar])));
  // lo que no es superficie, tampoco
  assert.ok(sinRender({ userData: {}, isLine: true }));
  assert.ok(!sinRender({ userData: {} })); // un grupo: se mira lo de adentro
});

test('lo puro no importa three ni el DOM', async () => {
  for (const f of ['presets.js', 'help.js', 'members.js', 'gpu.js', 'resolution.js', 'quality.js', 'flags.js', 'view.js', 'gestures.js']) {
    const s = await fuente(f);
    assert.doesNotMatch(s, /^import .* from 'three/m, f);
    assert.doesNotMatch(s, /\b(document|window)\./, f);
  }
});

test('la tabla de help() y la API del motor coinciden, en las dos direcciones', async () => {
  const s = await fuente('index.js');
  const cuerpo = s.slice(s.indexOf('const motor = {'), s.indexOf('\n  };', s.indexOf('const motor = {')));
  const api = new Set();
  // primera línea: renderer, scene, camera, … (shorthand)
  for (const n of cuerpo.split('\n')[1].split(',').map((x) => x.trim()).filter(Boolean)) api.add(n);
  for (const m of cuerpo.matchAll(/^ {4}(?:get |set )?([A-Za-z_$][\w$]*)\s*\(/gm)) api.add(m[1]);
  const doc = new Set(ENGINE_MEMBERS.flatMap(([sig]) => memberNames(sig)));
  for (const n of api) assert.ok(doc.has(n), `${n} está en la API pero no en la tabla de help()`);
  for (const n of doc) assert.ok(api.has(n), `${n} está en la tabla de help() pero no en la API`);
});

test('la tabla de help() y motor.view coinciden, en las dos direcciones', async () => {
  const s = await fuente('index.js');
  const cuerpo = s.slice(s.indexOf('const view = {'), s.indexOf('\n  };', s.indexOf('const view = {')));
  const api = new Set([...cuerpo.matchAll(/^ {4}(?:get |set )?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));
  const doc = new Set(ENGINE_MEMBERS.map(([sig]) => sig.match(/^view\.([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean));
  assert.ok(api.size > 0);
  for (const n of api) assert.ok(doc.has(n), `view.${n} está en la API pero no en la tabla de help()`);
  for (const n of doc) assert.ok(api.has(n), `view.${n} está en la tabla de help() pero no en la API`);
});

test('hdriKind: el formato sale de la extensión, sin mirar la query, o se pide', () => {
  assert.equal(hdriKind('a/galpon.hdr'), 'hdr');
  assert.equal(hdriKind('a/galpon.HDR?v=2#x'), 'hdr');
  assert.equal(hdriKind('https://x.org/z.exr'), 'exr');
  assert.equal(hdriKind('foto.jpg'), 'image');
  assert.equal(hdriKind('sin-extension'), 'image');
  assert.equal(hdriKind('blob:http://x/uuid', 'hdr'), 'hdr');
  assert.throws(() => hdriKind('a.hdr', 'png'), /tipo de HDRI desconocido/);
});

test('mergeHdri: pisa lo que se dice, valida el rango y no deja pasar un typo', () => {
  const base = { ...HDRI_DEFAULTS };
  assert.deepEqual(mergeHdri(base), base);
  assert.deepEqual(mergeHdri(base, { rotation: 90, blur: 0.5 }), { background: true, intensity: 1, blur: 0.5, rotation: 90 });
  assert.equal(mergeHdri(base, { background: 0 }).background, false);
  assert.equal(mergeHdri(base, { intensity: undefined }).intensity, 1);
  assert.equal(mergeHdri(base, { type: 'exr' }).intensity, 1, 'type es de quien carga, no de cómo se ve');
  assert.throws(() => mergeHdri(base, { intensidad: 2 }), /opción de HDRI desconocida/);
  assert.throws(() => mergeHdri(base, { blur: 2 }), /de 0 a 1/);
  assert.throws(() => mergeHdri(base, { intensity: -1 }), /negativa/);
  assert.throws(() => mergeHdri(base, { rotation: '90' }), /número/);
  assert.throws(() => mergeHdri(base, { rotation: NaN }), /número/);
  assert.throws(() => mergeHdri(base, [1]), /objeto/);
  assert.equal(base.rotation, 0, 'no toca la base');
});

test('los HDRI de examples/hdri son Radiance y están en la lista del README de esa carpeta', async () => {
  const dir = new URL('../examples/hdri/', import.meta.url);
  const listado = await readFile(new URL('README.md', dir), 'utf8');
  for (const f of ['empty_warehouse_01', 'carpentry_shop_02', 'glass_passage', 'studio_garden']) {
    const bytes = await readFile(new URL(`${f}.hdr`, dir));
    assert.equal(bytes.subarray(0, 10).toString('latin1'), '#?RADIANCE', f);
    assert.match(listado, new RegExp(f), `${f} no está en examples/hdri/README.md`);
  }
});

// Las pruebas en Node: lo puro (presets, la tabla de help) y lo que el motor promete de su
// forma. Lo que dibuja se prueba en un navegador (examples/index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRESETS, resolvePreset, mergePreset, definePreset } from '../src/presets.js';
import { ENGINE_MEMBERS } from '../src/members.js';
import { memberNames } from '../src/help.js';

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

test('lo puro no importa three ni el DOM', async () => {
  for (const f of ['presets.js', 'help.js', 'members.js']) {
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

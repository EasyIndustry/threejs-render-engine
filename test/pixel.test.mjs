// El look pixelado (src/pixel.js), en Node: píxeles enteros y la cámara en la grilla (#13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixelSize, pixelGrid, bufferTexel, snapToGrid, pixelOptions } from '../src/pixel.js';
import { basis, merge, pan, project } from '../src/view.js';

const BASE = { position: [150, 120, 190], target: [0, 25, 0], up: [0, 1, 0], fov: 38, projection: 'perspective', zoom: 1 };

test('el tamaño del píxel es entero en píxeles reales', () => {
  assert.equal(pixelSize(3, 1), 3);
  assert.equal(pixelSize(3, 2), 6);
  assert.equal(pixelSize(3, 1.5), 5);
  assert.equal(pixelSize(1, 0.4), 1);
});

test('todos los píxeles grandes miden k, aunque la ventana no sea múltiplo de k', () => {
  for (const [w, k] of [[1001, 3], [1920, 7], [37, 4]]) {
    const g = pixelGrid(w, 600, k);
    // cuántos píxeles de pantalla caen en cada columna del buffer, con cualquier corrimiento
    for (const off of [0, 1.4, -1.4, k / 2 - 0.01]) {
      const cuenta = new Map();
      for (let x = 0; x < w; x++) { const [c] = bufferTexel(x, 0, k, [off, 0]); cuenta.set(c, (cuenta.get(c) ?? 0) + 1); }
      const cols = [...cuenta.keys()].sort((a, b) => a - b);
      // las del medio miden exactamente k; solo la primera y la última pueden quedar cortadas
      for (const c of cols.slice(1, -1)) assert.equal(cuenta.get(c), k, `w ${w}, k ${k}, off ${off}, col ${c}`);
      // y nunca se sale del buffer
      assert.ok(cols[0] >= 0 && cols.at(-1) < g.bufW);
    }
    // la cámara cubre exactamente el buffer, empezando un píxel grande antes
    assert.deepEqual([g.view.x, g.view.width], [-k, g.bufW * k]);
  }
});

test('snap: el objetivo cae en la grilla y el corrimiento compensa lo que se movió', () => {
  const texel = 0.73, k = 3;
  for (const s0 of [BASE, merge(BASE, { projection: 'orthographic' })]) {
    for (const [px, py] of [[0.31, 0], [0, -0.44], [1.07, 2.21]]) {
      const s = pan(s0, px, py);
      const { delta, offset } = snapToGrid(s, texel, k);
      // el objetivo corrido queda en la grilla, en las dos direcciones de la pantalla
      const { right, up } = basis(s);
      const t = s.target.map((x, i) => x + delta[i]);
      const enGrilla = (v) => Math.abs(v / texel - Math.round(v / texel)) < 1e-9;
      assert.ok(enGrilla(t[0] * right[0] + t[1] * right[1] + t[2] * right[2]));
      assert.ok(enGrilla(t[0] * up[0] + t[1] * up[1] + t[2] * up[2]));
      // se corre menos de medio píxel grande
      assert.ok(Math.abs(offset[0]) <= k / 2 + 1e-9 && Math.abs(offset[1]) <= k / 2 + 1e-9);
      // compensar: con la cámara corrida, un punto del plano del objetivo cae `offset` más allá de
      // donde lo ve la cámara sin correr; el ampliado lee ahí, así se ve en su lugar
      const corrida = { ...s, position: s.position.map((x, i) => x + delta[i]), target: t };
      const aspect = 1.5, alto = 600;
      const medio = Math.hypot(...s.position.map((x, i) => x - s.target[i])) * Math.tan((s.fov * Math.PI) / 360);
      const pxPorUnidad = alto / (2 * medio);
      const p = s.target.map((x, i) => x + right[i] * 4 - up[i] * 2);
      const [x0, y0] = project(s, p, aspect), [x1, y1] = project(corrida, p, aspect);
      // en píxeles reales: x a la derecha, y hacia abajo
      const dxPx = ((x1 - x0) * alto * aspect) / 2, dyPx = (-(y1 - y0) * alto) / 2;
      // texel en la escena son k píxeles reales: pxPorUnidad = k / texel
      const escala = k / texel / pxPorUnidad;
      assert.ok(Math.abs(dxPx * escala - offset[0]) < 1e-6, `${s0.projection} x`);
      assert.ok(Math.abs(dyPx * escala - offset[1]) < 1e-6, `${s0.projection} y`);
    }
  }
  assert.deepEqual(snapToGrid(BASE, 0, 3).delta, [0, 0, 0]);
});

test('pixelate valida', () => {
  assert.throws(() => pixelOptions({ size: 2.5 }), /entero/);
  assert.throws(() => pixelOptions({ size: 0 }), /entero/);
  assert.throws(() => pixelOptions({ tamaño: 3 }), /desconocida/);
  assert.throws(() => pixelOptions({ snap: 'si' }), /true o false/);
  assert.deepEqual(pixelOptions({ enabled: true, size: 4 }), { enabled: true, size: 4 });
});

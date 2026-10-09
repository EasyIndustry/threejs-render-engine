// La matemática de la cámara (src/view.js), en Node: lo que #5 pide para saber que está.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angles, basis, orbit, pan, zoom, dolly, lookAt, constrain, interpolate, easing, merge, mergeLimits, sameView, clone, NO_LIMITS } from '../src/view.js';

/** @type {import('../src/view.js').ViewState} */
const BASE = { position: [150, 120, 190], target: [0, 25, 0], up: [0, 1, 0], fov: 38, projection: 'perspective', zoom: 1 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const radio = (s) => dist(s.position, s.target);
const deg = (r) => (r * 180) / Math.PI;

/** Dónde cae un punto del mundo en la pantalla (normalizada, de −1 a 1, hacia arriba). */
function proyectar(s, p, aspect) {
  const { forward, right, up } = basis(s);
  const v = [p[0] - s.position[0], p[1] - s.position[1], p[2] - s.position[2]];
  const z = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2];
  const t = Math.tan((s.fov * Math.PI) / 360);
  return [(v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / (z * t * aspect), (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / (z * t)];
}

test('merge(get()) no mueve nada, y el estado viaja por JSON igual', () => {
  assert.ok(sameView(merge(BASE, clone(BASE)), BASE, 0));
  assert.deepEqual(merge(BASE, JSON.parse(JSON.stringify(BASE))), BASE);
  // lo que no se pasa queda como está
  const s = merge(BASE, { fov: 50 });
  assert.equal(s.fov, 50);
  assert.deepEqual(s.position, BASE.position);
  assert.throws(() => merge(BASE, { posicion: [0, 0, 0] }), /clave de vista desconocida/);
  assert.throws(() => merge(BASE, { position: [0, NaN, 0] }), /números finitos/);
  assert.throws(() => merge(BASE, { projection: 'orthographic' }), /no soportada todavía/);
});

test('orbit(90, 0) cuatro veces vuelve a la posición inicial', () => {
  let s = BASE;
  for (let i = 0; i < 4; i++) s = orbit(s, 90, 0);
  assert.ok(dist(s.position, BASE.position) / radio(BASE) < 1e-9);
  assert.deepEqual(s.target, BASE.target);
  // la guiñada positiva lleva la cámara a su derecha
  const d = orbit(BASE, 10, 0);
  const { right } = basis(BASE);
  const mov = [d.position[0] - BASE.position[0], d.position[1] - BASE.position[1], d.position[2] - BASE.position[2]];
  assert.ok(mov[0] * right[0] + mov[1] * right[1] + mov[2] * right[2] > 0);
  // el cabeceo positivo, hacia arriba
  assert.ok(orbit(BASE, 0, 10).position[1] > BASE.position[1]);
});

test('con maxPitch 89, orbit(0, 200) se detiene en 89°', () => {
  const limits = mergeLimits(NO_LIMITS, { maxPitch: 89 });
  const s = orbit(BASE, 0, 200, { limits });
  assert.ok(Math.abs(deg(angles(s).pitch) - 89) < 1e-9);
  assert.ok(Math.abs(radio(s) - radio(BASE)) < 1e-9);
});

test('en el polo la vista es exacta (sin un 0.0001 escondido), y orbitar desde ahí no salta', () => {
  const arriba = orbit(BASE, 0, 200);
  assert.ok(Math.abs(deg(angles(arriba).pitch) - 90) < 1e-12);
  assert.equal(arriba.position[0], arriba.target[0]);
  assert.equal(arriba.position[2], arriba.target[2]);
  // la pantalla sigue mirando para donde miraba: el up es la dirección horizontal de antes, invertida
  const h = angles(BASE).h;
  assert.ok(dist(arriba.up, [-h[0], 0, -h[2]]) < 1e-12);
  // bajar un poco desde el polo: la pantalla no gira
  const casi = orbit(arriba, 0, -0.01);
  assert.ok(dist(basis(casi).up, basis(arriba).up) < 1e-3);
  assert.ok(dist(basis(casi).right, basis(arriba).right) < 1e-9);
  // girar en el polo gira la pantalla, y cuatro cuartos vuelven
  let g = arriba;
  for (let i = 0; i < 4; i++) g = orbit(g, 90, 0);
  assert.ok(dist(g.up, arriba.up) < 1e-12);
  // el up solo cuenta en el polo: un up de pantalla [0, 0, 1] mira la planta desde atrás
  const planta = merge(BASE, { position: [0, 300, 0], target: [0, 0, 0], up: [0, 0, 1] });
  assert.deepEqual(basis(planta).up.map((x) => Math.round(x) + 0), [0, 0, 1]);
  assert.deepEqual(merge(BASE, { up: [0, 0, 1] }).up, [0, 1, 0]);
});

test('orbitar alrededor de otro punto: ese punto queda quieto en la pantalla', () => {
  const p = [30, 10, -20];
  const antes = proyectar(BASE, p, 16 / 9);
  const s = orbit(BASE, 35, -12, { around: p });
  const despues = proyectar(s, p, 16 / 9);
  assert.ok(Math.hypot(antes[0] - despues[0], antes[1] - despues[1]) < 1e-9);
});

test('zoom(2, { at }): lo que estaba bajo `at` sigue bajo `at`, y se ve el doble', () => {
  const aspect = 16 / 9, at = /** @type {[number, number]} */ ([0.4, -0.3]);
  // el punto del plano del objetivo bajo `at`
  const { right, up } = basis(BASE);
  const medio = radio(BASE) * Math.tan((BASE.fov * Math.PI) / 360);
  const p = [0, 1, 2].map((i) => BASE.target[i] + right[i] * at[0] * medio * aspect + up[i] * at[1] * medio);
  const s = zoom(BASE, 2, { at, aspect });
  const q = proyectar(s, p, aspect);
  assert.ok(Math.hypot(q[0] - at[0], q[1] - at[1]) < 1e-9);
  assert.ok(Math.abs(radio(s) - radio(BASE) / 2) < 1e-9);
  // sin `at`, hacia el objetivo
  assert.deepEqual(zoom(BASE, 2).target, BASE.target);
  assert.throws(() => zoom(BASE, 0), /mayor que 0/);
});

test('los límites de distancia valen para zoom y dolly; dolly no pasa el objetivo', () => {
  const limits = mergeLimits(NO_LIMITS, { minDistance: 50, maxDistance: 400 });
  assert.ok(Math.abs(radio(zoom(BASE, 100, { limits })) - 50) < 1e-9);
  assert.ok(Math.abs(radio(zoom(BASE, 0.01, { limits })) - 400) < 1e-9);
  assert.ok(Math.abs(radio(dolly(BASE, 1e6, { limits })) - 50) < 1e-9);
  const pasado = dolly(BASE, radio(BASE) * 3);
  assert.ok(radio(pasado) > 0 && radio(pasado) < 1e-6);
  assert.ok(Math.abs(radio(dolly(BASE, -20)) - (radio(BASE) + 20)) < 1e-9);
});

test('pan: mueve cámara y objetivo juntos, en el plano de la pantalla', () => {
  const s = pan(BASE, 10, 5);
  const { right, up } = basis(BASE);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(s.position[i] - BASE.position[i] - (right[i] * 10 + up[i] * 5)) < 1e-9);
    assert.ok(Math.abs(s.target[i] - BASE.target[i] - (right[i] * 10 + up[i] * 5)) < 1e-9);
  }
});

test('el piso: ningún camino lleva la cámara debajo', () => {
  const limits = mergeLimits(NO_LIMITS, { floor: 1 });
  assert.ok(orbit(BASE, 0, -80, { limits }).position[1] >= 1 - 1e-9);
  assert.ok(Math.abs(orbit(BASE, 0, -80, { limits }).position[1] - 1) < 1e-6);
  assert.ok(pan(BASE, 0, -1000, { limits }).position[1] >= 1 - 1e-9);
  const bajo = merge(BASE, { position: [100, 30, 100], target: [0, -50, 0] });
  assert.ok(dolly(bajo, 1000, { limits }).position[1] >= 1 - 1e-9);
  assert.ok(constrain(merge(BASE, { position: [100, -5, 100] }), limits).position[1] === 1);
  // si ya estaba abajo, deja subir
  const abajo = merge(BASE, { position: [100, -5, 100] });
  assert.ok(pan(abajo, 0, 3, { limits }).position[1] > -5);
});

test('lookAt: la cámara no se mueve; cambia lo que mira', () => {
  const s = lookAt(BASE, [10, 0, 10]);
  assert.deepEqual(s.position, BASE.position);
  assert.deepEqual(s.target, [10, 0, 10]);
  // mirar justo abajo es un cabeceo de 90°: con maxPitch 60 se queda en 60
  const limits = mergeLimits(NO_LIMITS, { maxPitch: 60 });
  const l = lookAt(BASE, [150, -500, 190], { limits });
  assert.deepEqual(l.position, BASE.position);
  assert.ok(Math.abs(deg(angles(l).pitch) - 60) < 1e-9);
  assert.throws(() => lookAt(BASE, BASE.position), /donde está la cámara/);
});

test('interpolar: empieza y termina exacto, sin pasos raros, por el camino corto', () => {
  const b = merge(orbit(BASE, 170, 20), { target: [10, 0, 5], fov: 50 });
  assert.deepEqual(interpolate(BASE, b, 0), BASE);
  assert.deepEqual(interpolate(BASE, b, 1), b);
  // por el camino corto: de 0° a 350° pasa por 355°, no por 180°
  const ida = orbit(BASE, -10, 0);
  const medio = interpolate(BASE, ida, 0.5);
  assert.ok(Math.abs(deg(angles(medio).yaw - angles(BASE).yaw) + 5) < 1e-9);
  // continuo: pasos chicos dan movimientos chicos
  let prev = BASE;
  for (let i = 1; i <= 100; i++) {
    const s = interpolate(BASE, b, i / 100);
    assert.ok(dist(s.position, prev.position) < radio(BASE) * 0.1);
    prev = s;
  }
  assert.equal(easing('ease-in-out')(0.5), 0.5);
  assert.throws(() => easing('rebote'), /easing desconocido/);
});

test('mergeLimits valida', () => {
  assert.throws(() => mergeLimits(NO_LIMITS, { minPitch: -100 }), /cabeceo/);
  assert.throws(() => mergeLimits(NO_LIMITS, { minDistance: 10, maxDistance: 5 }), /distancias/);
  assert.throws(() => mergeLimits(NO_LIMITS, { techo: 3 }), /límite desconocido/);
});

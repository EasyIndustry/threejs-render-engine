// Las tablas de gestos y de teclas (src/gestures.js), en Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMES, scheme, mouseAction, dragToOrbit, dragToZoom, wheelToZoom, KEYS, keyCombo, keyAction, keyBindings, dampingStep } from '../src/gestures.js';

test("con 'cad', el izquierdo es de la app y el medio orbita; Shift + medio desplaza", () => {
  const s = scheme('cad');
  assert.equal(mouseAction(s, { button: 0 }), null);
  assert.equal(mouseAction(s, { button: 2 }), null);
  assert.equal(mouseAction(s, { button: 1 }), 'orbit');
  assert.equal(mouseAction(s, { button: 1, shiftKey: true }), 'pan');
  assert.equal(mouseAction(s, { button: 1, ctrlKey: true }), 'dolly');
});

test("'three' es el de OrbitControls", () => {
  const s = scheme('three');
  assert.equal(mouseAction(s, { button: 0 }), 'orbit');
  assert.equal(mouseAction(s, { button: 0, ctrlKey: true }), 'pan');
  assert.equal(mouseAction(s, { button: 0, metaKey: true }), 'pan');
  assert.equal(mouseAction(s, { button: 0, shiftKey: true }), 'pan');
  assert.equal(mouseAction(s, { button: 1 }), 'dolly');
  assert.equal(mouseAction(s, { button: 2 }), 'pan');
  // todos tienen touch: un dedo orbita, dos desplazan y pellizcan
  for (const n of Object.keys(SCHEMES)) assert.deepEqual({ ...scheme(n).touch }, { 1: 'orbit', 2: 'pan-zoom' }, n);
});

test('un esquema propio: la primera regla que coincide gana, y se valida', () => {
  const s = scheme({ mouse: [{ button: 2, alt: true, action: 'orbit' }, { button: 2, action: null }] });
  assert.equal(mouseAction(s, { button: 2, altKey: true }), 'orbit');
  assert.equal(mouseAction(s, { button: 2 }), null);
  assert.equal(s.wheel, 'zoom');
  assert.throws(() => scheme('maya'), /esquema desconocido/);
  assert.throws(() => scheme({ mouse: [{ button: 4, action: 'orbit' }] }), /botón inválido/);
  assert.throws(() => scheme({ mouse: [{ button: 0, action: 'girar' }] }), /acción desconocida/);
  assert.ok(Object.isFrozen(SCHEMES.cad));
});

test('arrastres, rueda e inercia en números', () => {
  // toda la altura: 360°; a la derecha lleva la cámara a la izquierda
  assert.deepEqual(dragToOrbit(500, 0, 500), [-360, 0]);
  assert.deepEqual(dragToOrbit(0, 250, 500), [-0, 180]);
  assert.ok(dragToZoom(-100, 500) > 1 && dragToZoom(100, 500) < 1);
  assert.ok(Math.abs(wheelToZoom(-100) - 1 / 0.95) < 1e-12);
  assert.ok(Math.abs(wheelToZoom(3, 1) - wheelToZoom(48)) < 1e-12);
  assert.equal(dampingStep(0, 1 / 60), 1);
  assert.ok(Math.abs(dampingStep(0.12, 1 / 60) - 0.12) < 1e-12);
  // dos cuadros de 1/60 dejan lo mismo pendiente que uno de 1/30
  const dos = (1 - dampingStep(0.12, 1 / 60)) ** 2, uno = 1 - dampingStep(0.12, 1 / 30);
  assert.ok(Math.abs(dos - uno) < 1e-12);
});

test('teclas: combinaciones, la tabla por defecto y una propia', () => {
  assert.equal(keyCombo({ code: 'Numpad1', ctrlKey: true, shiftKey: true }), 'ctrl+shift+Numpad1');
  assert.deepEqual(keyAction(KEYS, { code: 'Numpad7' }), { go: 'top' });
  assert.deepEqual(keyAction(KEYS, { code: 'Numpad7', ctrlKey: true }), { go: 'bottom' });
  assert.deepEqual(keyAction(KEYS, { code: 'ArrowLeft', shiftKey: true }), { pan: [-40, 0] });
  assert.equal(keyAction(KEYS, { code: 'KeyF' }), null);
  const propia = keyBindings({ 'shift+ctrl+KeyQ': { orbit: [-90, 0] } });
  assert.deepEqual(keyAction(propia, { code: 'KeyQ', ctrlKey: true, shiftKey: true }), { orbit: [-90, 0] });
  assert.throws(() => keyBindings({ 'hyper+KeyQ': { orbit: [1, 0] } }), /modificador desconocido/);
  assert.throws(() => keyBindings({ KeyQ: { girar: 1 } }), /va con un comando/);
});

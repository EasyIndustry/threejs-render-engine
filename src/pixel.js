// El look pixelado (motor.pixelate): la escena se dibuja en un buffer chico y se amplía a
// píxeles enteros y nítidos, y la cámara se corre a la grilla de esos píxeles para que los bordes
// no titilen al moverla.
//
//   k        el tamaño de un píxel grande, en píxeles reales de la pantalla (entero)
//   buffer   ceil(ancho / k) + 2 por ceil(alto / k) + 2: un píxel grande de margen a cada lado,
//            para el corrimiento subpíxel
//   view     el setViewOffset de la cámara que hace que el buffer cubra exactamente esos píxeles
//            (empieza un píxel grande antes del borde de la pantalla)
//
// Cada píxel de la pantalla va al píxel del buffer floor((x + k + off) / k): con cuentas enteras
// todos los píxeles grandes miden k, sea cual sea el tamaño de la ventana.
//
// Puro: no importa three ni DOM.
import { basis } from './view.js';

/**
 * El tamaño de un píxel grande en píxeles reales: `size` es en píxeles de pantalla (CSS) y se
 * redondea a entero con el pixelRatio, así ningún píxel queda partido.
 * @param {number} size @param {number} pixelRatio
 */
export function pixelSize(size, pixelRatio) {
  return Math.max(1, Math.round(size * pixelRatio));
}

/**
 * El buffer chico y cómo la cámara lo cubre, para una pantalla de `width` × `height` píxeles reales.
 * @param {number} width @param {number} height @param {number} k
 */
export function pixelGrid(width, height, k) {
  const bufW = Math.ceil(width / k) + 2, bufH = Math.ceil(height / k) + 2;
  return { k, bufW, bufH, view: { fullWidth: width, fullHeight: height, x: -k, y: -k, width: bufW * k, height: bufH * k } };
}

/**
 * A qué píxel del buffer va un píxel de la pantalla (columna desde la izquierda, fila desde arriba).
 * Es la misma cuenta que hace el shader del ampliado.
 * @param {number} x @param {number} yTop @param {number} k @param {[number, number]} [off] corrimiento en píxeles reales
 * @returns {[number, number]}
 */
export function bufferTexel(x, yTop, k, off = [0, 0]) {
  return [Math.floor((x + k + off[0]) / k), Math.floor((yTop + k + off[1]) / k)];
}

/**
 * Cuánto correr la cámara para que el objetivo caiga justo en la grilla de píxeles grandes
 * (`texel`: cuánto mide uno en la escena, en el plano del objetivo), y cuánto correr el ampliado
 * para compensarlo: `offset` en píxeles reales, x hacia la derecha e y hacia abajo. Correr la
 * cámara de a píxeles enteros hace que lo que está en ese plano no titile; el corrimiento que
 * sobra (menos de medio píxel grande) se devuelve al ampliar, así la imagen no salta.
 * @param {import('./view.js').ViewState} s @param {number} texel @param {number} k
 * @returns {{ delta: [number, number, number], offset: [number, number] }}
 */
export function snapToGrid(s, texel, k) {
  if (!(texel > 0)) return { delta: [0, 0, 0], offset: [0, 0] };
  const { right, up } = basis(s);
  const t = s.target;
  const x = t[0] * right[0] + t[1] * right[1] + t[2] * right[2];
  const y = t[0] * up[0] + t[1] * up[1] + t[2] * up[2];
  const dx = Math.round(x / texel) * texel - x, dy = Math.round(y / texel) * texel - y;
  return {
    delta: [right[0] * dx + up[0] * dy, right[1] * dx + up[1] * dy, right[2] * dx + up[2] * dy],
    // la cámara a la derecha corre la imagen a la izquierda: se lee más a la izquierda en el
    // buffer; la cámara arriba la corre hacia abajo: se lee más abajo (y crece hacia abajo)
    offset: [(-dx / texel) * k, (dy / texel) * k],
  };
}

/**
 * Las opciones de pixelate, validadas.
 * @param {Record<string, unknown>} o
 */
export function pixelOptions(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new TypeError('pixelate() va con { enabled, size, snap }');
  for (const k of Object.keys(o)) if (!['enabled', 'size', 'snap'].includes(k)) throw new Error(`opción de pixelate desconocida: ${k} (van enabled, size, snap)`);
  if (o.size !== undefined && !(Number.isInteger(o.size) && /** @type {number} */ (o.size) >= 1 && /** @type {number} */ (o.size) <= 32)) throw new RangeError(`size va como un entero de 1 a 32: el tamaño del píxel en píxeles de pantalla (llegó ${o.size})`);
  for (const k of ['enabled', 'snap']) if (o[k] !== undefined && typeof o[k] !== 'boolean') throw new TypeError(`${k} va true o false`);
  return o;
}

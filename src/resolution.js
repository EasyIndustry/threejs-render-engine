// Resolución dinámica: con cuántos píxeles se dibuja el visor, según cuánto tarda cada cuadro.
// Si no se llega a los fps pedidos se baja (la imagen se estira y se ve más blanda); si sobra
// margen un rato, se vuelve a subir. Ayuda cuando el cuello de botella es la GPU (pantallas
// grandes, placas integradas); si lo que tarda es el procesador, bajar píxeles no cambia nada,
// y por eso hay un mínimo.
//
// Mira el percentil 75 de una ventana de cuadros (no un cuadro suelto: un tirón no cuenta), y
// sube despacio y baja rápido, para no oscilar. Con vsync el cuadro nunca baja de 1000/Hz, así
// que "sobra margen" es "llega justo al presupuesto, sin tirones".
//
// Puro: no importa three ni DOM.

/** @typedef {{ min?: number, max?: number, fps?: number, start?: number, window?: number, calm?: number }} AutoOptions */

/**
 * @param {AutoOptions} [opts] `min`/`max`: límites de la escala (0.35 y 1); `fps`: objetivo (60);
 *   `window`: cuadros por medición (30); `calm`: mediciones seguidas sin tirones para subir (4).
 */
export function createAutoScale({ min = 0.35, max = 1, fps = 60, start = 1, window = 30, calm = 4 } = {}) {
  if (!(min > 0) || !(max >= min)) throw new RangeError(`límites inválidos: min ${min}, max ${max}`);
  if (!(fps > 0)) throw new RangeError(`fps inválido: ${fps}`);
  const presupuesto = 1000 / fps;
  const limitar = (/** @type {number} */ s) => Math.round(Math.min(max, Math.max(min, s)) * 100) / 100;
  let scale = limitar(start);
  /** @type {number[]} */
  let muestras = [];
  let tranquilo = 0;
  return {
    get scale() { return scale; },
    get options() { return { min, max, fps }; },
    /**
     * Un cuadro más, con lo que tardó en ms. Devuelve la escala nueva si cambió, o null.
     * @param {number} ms
     */
    sample(ms) {
      if (!(ms > 0) || ms > 250) return null; // pestaña oculta, pausa o un corte: no cuenta
      muestras.push(ms);
      if (muestras.length < window) return null;
      muestras.sort((a, b) => a - b);
      const p75 = muestras[Math.floor(muestras.length * 0.75)];
      muestras = [];
      let nueva = scale;
      if (p75 > presupuesto * 1.2) {
        // baja en proporción a lo que falta (los píxeles van con el cuadrado de la escala), sin pasarse
        nueva = scale * Math.max(0.7, Math.sqrt(presupuesto / p75));
        tranquilo = 0;
      } else if (p75 <= presupuesto * 1.08) {
        if (++tranquilo >= calm) { nueva = scale * 1.1; tranquilo = 0; }
      } else {
        tranquilo = 0;
      }
      nueva = limitar(nueva);
      if (nueva === scale) return null;
      scale = nueva;
      return scale;
    },
  };
}

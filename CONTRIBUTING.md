# Contribuir

Este motor se vendoriza en varias apps. La pregunta antes de cada cambio no es "¿le sirve a
la app que lo pidió?" sino "¿le sirve a cualquier app que muestre objetos en three.js?".

## Agnóstico: qué entra y qué no

- **Entra:** cómo se ve una escena — luces, sombras, entorno, piso, contornos, modos de vista,
  post-proceso, render final — y lo que hace falta para mostrarlo (encuadrar, fotos).
- **No entra:** el modelo de la app (qué es una pieza, qué está seleccionado), sus materiales
  (maderas, metales de un catálogo), ni textos de interfaz. Los materiales los pone la app en
  sus mallas; el motor los respeta.
- **Los valores de apariencia van en un preset** (`src/presets.js`), no escritos a mano en el
  resto de `src/`. Un color de un cliente es un preset de ese cliente, no un default nuevo.

## El contrato

1. **Cómo se ve sale del preset**; `show()` prende y apaga partes sin cambiarlo.
2. **Lo que la app marca, el motor lo respeta:** `userData.noEdge`, `userData.noRender`.
3. **Cada miembro de la API tiene su línea en `src/members.js`.** Una prueba exige que la
   tabla de `help()` y la API coincidan, en las dos direcciones.
4. **Lo puro no importa three ni el DOM** (`presets.js`, `help.js`, `members.js`), y una
   prueba lo frena si pasa.
5. **Las dependencias pesadas se cargan a pedido** (como three-gpu-pathtracer en
   `render()`): una app que no las usa no las necesita en su importmap.

## Cómo se agrega algo

1. Si es un valor de apariencia, primero al preset (en los tres, con la misma forma: una
   prueba lo exige).
2. Después en `src/index.js` (o un módulo de `src/`), con su línea en `src/members.js`.
3. Probado a ojo en `examples/index.html`, y lo puro con su prueba en `test/`.

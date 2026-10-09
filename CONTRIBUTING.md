# Contribuir

Este motor se vendoriza en varias apps. La pregunta antes de cada cambio no es "¿le sirve a
la app que lo pidió?" sino "¿le sirve a cualquier app que muestre objetos en three.js?".

**Primero, [`POLITICA.md`](POLITICA.md):** qué entra, cómo se evalúa un pedido y qué puede pasar
con él. Un pedido de una app de casa pasa por el mismo filtro que uno de afuera.

## Cómo se pide algo

- **Un pedido:** un issue con la plantilla *Pedido*. Contá el problema, no solo la solución, y a
  qué otro tipo de app le serviría.
- **Un error:** un issue con la plantilla *Error*, con cómo reproducirlo.
- **Un PR:** mejor después de un issue `aceptado`, para no hacer trabajo que no va a entrar. La
  plantilla del PR trae el checklist del contrato.

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
4. En el `CHANGELOG.md`, y si rompe algo, marcado **Ruptura** con cómo migrar.

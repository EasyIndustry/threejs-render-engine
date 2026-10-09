## Qué cambia y por qué

<!-- Qué problema resuelve, para qué tipo de apps. -->

Cierra #

## Política

- [ ] Viene de un issue `aceptado` (o es un error).
- [ ] Es una herramienta general, no la solución de una app ([POLITICA.md](../POLITICA.md)).
- [ ] Si alcanzaba con un punto de extensión (preset, marca, opción, aviso), es eso y no una función nueva.

## Contrato

- [ ] Los valores de apariencia van en los presets (en todos, con la misma forma).
- [ ] Cada miembro nuevo de la API tiene su línea en `src/members.js`.
- [ ] Lo puro no importa three ni el DOM, y tiene su prueba en `test/`.
- [ ] Ninguna dependencia nueva, o se carga a pedido y está justificada en el issue.
- [ ] Lo que andaba sigue andando, o va en el `CHANGELOG.md` como **Ruptura** con cómo migrar.
- [ ] `node --test` pasa, y lo que dibuja está probado a ojo en `examples/index.html`.

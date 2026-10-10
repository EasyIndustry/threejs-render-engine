# HDRI de ejemplo

Panoramas equirectangulares de 1K para probar `motor.hdri()` en `examples/index.html`. Son de
[Poly Haven](https://polyhaven.com) y están bajo **CC0** (dominio público: se pueden usar y
redistribuir sin atribución, aunque se agradece).

| Archivo | Qué es | Autor |
|---|---|---|
| `empty_warehouse_01.hdr` | galpón vacío | Sergej Majboroda |
| `carpentry_shop_02.hdr` | taller de carpintería | Greg Zaal |
| `glass_passage.hdr` | pasaje cubierto con plantas | Greg Zaal |
| `studio_garden.hdr` | jardín con galpón | Sergej Majboroda |

```js
await motor.hdri('./hdri/empty_warehouse_01.hdr', { rotation: 90, blur: 0.1 });
motor.show({ floor: false, grid: false });   // el piso del estudio tapa el panorama
```

Para más calidad, bajá la versión 2K o 4K de la misma página (`https://polyhaven.com/a/<nombre>`).
Los `.hdr` no van en el paquete de npm, solo en el repo.
Una app no necesita copiar estos archivos: `hdri()` acepta cualquier URL (o una `THREE.Texture`).

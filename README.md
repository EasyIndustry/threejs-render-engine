# threejs-render-engine

Cómo se ve una escena de [three.js](https://threejs.org). La app pone lo suyo en la escena y
decide qué está seleccionado; el motor pone el resto: el estudio (luces, sombras, entorno,
cielo, piso, grilla), el contorno de selección, el contorno fino de geometría, los modos de
vista y el **render final con path tracing en un click**.

```js
import { createEngine } from 'threejs-render-engine';

const motor = createEngine(document.body, { preset: 'warm', quality: 'media', area: 250 });
motor.quality(motor.suggestQuality());          // alta en una placa dedicada, baja en una integrada
motor.content.add(miMalla);
motor.frame();                                  // encuadrar
motor.select([miMalla], { detail: true });     // contorno de selección
motor.show({ grid: false, sky: true });        // prender y apagar partes del estudio
motor.mode = 'clay';                            // render | clay | wireframe | normals | matcap
motor.edges({ enabled: true });                 // contorno fino de geometría
motor.view.orbit(45, 0, { animate: true });     // la cámara con valores planos, sin tocar three
const vista = motor.view.get();                 // { position, target, up, fov, … }: va al documento como JSON
motor.view.go('front', { fit: { min: [0, 0, 0], max: [60, 75, 40] } });   // vista con nombre, encuadrando una caja
const png = await motor.render({ samples: 300, width: 1920, height: 1080 });
motor.help();                                   // todo lo que hay
```

- **Calidad, como en un juego**: `motor.quality('baja' | 'media' | 'alta')` — antialiasing,
  sombras, oclusión ambiental, bloom, muestras del render — o ajustes sueltos, que la vuelven
  `'personalizada'`. Aparte del preset de apariencia (el look) y de la resolución.
  `motor.suggestQuality()` la elige según la placa.
- **Por presets.** Cómo se ve sale de un preset (`studio`, `warm`, `dark`): fondo, cielo,
  niebla, luces, sombras, piso, grilla, colores de los contornos y el entorno del render. Un
  cliente nuevo es un preset nuevo, no código: `definePreset('cliente', { extends: 'warm',
  selection: { color: '#0a7' } })`.
- **A cualquier escala.** `area` es el radio de la zona de trabajo en la unidad de la escena
  (250 en cm es un taller): sombras, grilla, niebla y cámara se escalan con ella.
- **La cámara, con valores planos.** `motor.view` la mueve sin que la app importe three:
  `get()` y `set(estado)` (serializable con JSON: la vista se guarda con el documento),
  `orbit`, `pan`, `zoom` (hacia el cursor con `at`), `dolly`, `lookAt`, todos con
  `{ animate }` y una Promise; `limits()` (distancia, cabeceo, piso) en todos los caminos; y
  `onChange`, `onStart`, `onEnd`. Vistas con nombre (`motor.VIEWS`: front, back, right, left,
  top, bottom, iso, o un `{ dir, up }` propio) con `view.go()`, y encuadre con `view.fit()`:
  una caja `{ min, max }` o unos objetos, con el aspecto de la pantalla (no se corta en un
  teléfono parado). La navegación es del motor: `view.input({ scheme: 'cad' })` deja el
  botón izquierdo para la app, `zoomToCursor`, `orbitAround: 'cursor'`, teclado opcional;
  `view.drive()` para un joystick o un botón mantenido; y `view.claim()` / `view.suspend()`
  para que un gizmo o un arrastre no pelee con la órbita. Perspectiva u ortográfica con `view.projection()`, sin salto (el plano
  del objetivo se ve del mismo tamaño), y todo sigue andando: contornos, selección, overlay,
  `snapshot()` y `render()`. Justo arriba la vista es exacta, sin ángulos mágicos. La duración, el
  easing, la inercia y el margen del encuadre están en el preset (`camera`).
- **Render en un click.** `render()` hace path tracing de la escena como está, en un
  renderer aparte del tamaño pedido, y devuelve un PNG. El visor sigue andando mientras.
- **Bordes suaves.** El post-proceso usa MSAA (`antialias: 4` por defecto); el render final
  ya sale suave porque el path tracing muestrea dentro de cada píxel.
- **Sin build.** Módulos ES, el navegador los carga tal cual. Sin dependencias propias:
  three es *peer*, y three-gpu-pathtracer solo hace falta si se usa `render()` (se carga
  la primera vez que se pide).

## Estructura

```
src/
  index.js        createEngine: el estudio, el post-proceso, los modos y la API
  view.js         la cámara como valores planos: estado, orbitar, desplazar, acercar, límites (puro)
  gestures.js     qué hace cada gesto y cada tecla: esquemas three, cad, blender (puro)
  presets.js      los presets (puro: sin three)
  edges.js        el contorno fino de geometría (profundidad + normales, 1px)
  pathtracer.js   el render final (three-gpu-pathtracer)
  help.js         help(): la ayuda de la API
  members.js      la tabla de help() (pura: una prueba la compara con la API)
examples/         una página para probarlo
test/             las pruebas, en Node
```

## Usarlo, sin build

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
      "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
      "three-mesh-bvh": "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.8.3/build/index.module.js",
      "three-gpu-pathtracer": "https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/build/index.module.js"
    }
  }
</script>
```

Las tres últimas entradas son solo para `render()`. three-gpu-pathtracer importa
`three/examples/jsm/…` (no `three/addons/`), por eso va esa entrada aparte.

**Versiones.** Con three 0.170 va three-gpu-pathtracer **0.0.23** (la última que acepta
three < 0.180). Las 0.0.25 en adelante piden three ≥ 0.185 y three-mesh-bvh ≥ 0.9.15.

## Lo que el motor hace por la app

| | |
|---|---|
| `userData.noEdge` | el objeto no sale en el contorno fino (piso, grilla, cotas, guías) |
| `userData.noAO` | el objeto no entra en la oclusión ambiental |
| `userData.noRender` | el objeto no sale en el render final |
| `motor.content` | un grupo para lo de la app (o directo en `motor.scene`) |
| `motor.overlay` | una escena encima de todo y fuera del post-proceso: gizmos, manijas |
| `motor.onFrame(fn)` | algo que corre en cada cuadro (etiquetas CSS2D, animaciones) |
| `motor.onResize(fn)` | avisa cuando cambian los píxeles del visor (ventana o resolución): ahí se ajusta lo que la app dimensiona según el visor, como el reflejo de un espejo |

En el render final no salen líneas, puntos, sprites, espejos (`Reflector`) ni mallas con material de
shader propio (el path tracer no los entiende: un espejo, ahí, es un material estándar con
`metalness: 1, roughness: 0`). Los espejos tampoco entran en las aristas, la oclusión ambiental ni los contornos de selección:
así cada uno cuesta un render extra por cuadro y no uno por pasada. La luz hemisférica no existe para el
path tracer: ese relleno lo da un entorno degradé (`preset.render.sky` / `ground`).

## Pruebas

```
node --test
```

Lo que dibuja se prueba a ojo en `examples/index.html` (servido por HTTP: `python3 -m
http.server` en la raíz del repo y abrir `/examples/`).

## Contribuir

El motor es agnóstico: no entra la solución de una app, entra la herramienta que resuelve esa
clase de problema para cualquier app. Qué entra y cómo se evalúa un pedido está en
[`POLITICA.md`](POLITICA.md); cómo se contribuye, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licencia

MIT

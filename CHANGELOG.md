# Cambios

## 0.2.1

- `resolution('auto')` no oscila: con vsync no se puede medir cuánto margen sobra, solo si se
  llega o no, así que subía hasta pasarse, bajaba y otra vez. Ahora, al bajar, calcula la
  escala que llega justo y no la pasa por un rato (`memory`, unos 10 s); si una prueba de subir
  falla, la próxima espera el doble (hasta 8 veces). Umbrales más ajustados: baja si el cuadro
  pasa el presupuesto en más de 10 %, considera estable hasta 4 %.

## 0.2.0

- `resolution(value, { min, max, fps })`: con cuántos píxeles se dibuja el visor, en vivo. Un
  número es la escala respecto de la resolución nativa (0.5: la mitad de ancho y de alto); el
  navegador estira la imagen a la ventana. `'auto'` la ajusta sola según lo que tarda cada
  cuadro (percentil 75 de 30 cuadros; baja rápido, sube despacio), entre `min` y `max`. También
  como opción de `createEngine({ resolution })`. El control está en `src/resolution.js` (puro,
  con pruebas). No toca `render()`.
- Arreglo: el contorno fino multiplicaba dos veces por el pixelRatio al cambiar de tamaño (el
  EffectComposer ya le pasa los píxeles reales). Con pixelRatio 1 no se notaba.

## 0.1.3

- `gpu({ print })`: en qué placa se dibuja — nombre, fabricante y tipo (`discrete`,
  `integrated`, `software` o `unknown`), tamaño del buffer, pixelRatio y MSAA usado y posible.
  Lo imprime en la consola con un aviso si es integrada o por software. La clasificación por
  nombre está en `src/gpu.js` (pura, con prueba). Elegir la placa no se puede desde una
  página: `powerPreference: 'high-performance'` es un pedido que el navegador y el sistema
  pueden ignorar.

## 0.1.2

- Antialiasing en el visor: el post-proceso dibuja a un render target con MSAA
  (`createEngine(…, { antialias: 4 })`, 0 lo apaga). Sin eso los bordes quedaban dentados,
  porque las texturas intermedias del composer no tienen el antialiasing del canvas.
- Los modos de vista (clay, wireframe, normals, matcap) cambian el material solo de las mallas
  de la app, cuadro a cuadro: antes pisaban también la grilla (líneas oscuras y gruesas) y el
  fondo (una franja negra donde iba el cielo).

## 0.1.1

- `render()`: las mallas con varios materiales salen bien. three-gpu-pathtracer 0.0.23 numera
  los grupos de la escena junta por malla pero despliega los arrays de materiales, así que una
  malla con varios materiales corría los índices de las siguientes (una pieza tomaba el
  material de otra, el piso la madera de la tapa). Durante el render, cada una se parte en una
  malla por grupo, con un solo material, y después se restaura.
- El ejemplo tiene una malla con un material por cara, que reproduce el caso.

## 0.1.0

Primera versión, a partir del render de carpinteria-online.

- `createEngine(container, { preset, area, fov, controls, pixelRatio })`: renderer, escena,
  cámara, OrbitControls y el estudio (luz hemisférica, sol con sombras, entorno, piso, grilla,
  niebla), todo escalado con `area`.
- Presets `studio`, `warm` y `dark`; `setPreset`, `tweak`, `definePreset` y `{ extends }`.
- `show({ grid, floor, sky, fog, shadows })`: prender y apagar partes del estudio. Cielo
  degradé como fondo.
- `select(objects, { detail })`: contorno de selección (OutlinePass con blending para color
  premultiplicado) y, con `detail`, una línea fina por objeto.
- `edges({ … })`: contorno fino de geometría (profundidad + normales, 1px, color del material
  oscurecido). Respeta `userData.noEdge`.
- Modos de vista: `render`, `clay`, `wireframe`, `normals`, `matcap`.
- `frame()`, `snapshot()`, `onFrame()`, `overlay` (gizmos fuera del post-proceso), `dispose()`.
- `render({ samples, width, height, bounces, camera, onProgress, signal })`: path tracing con
  three-gpu-pathtracer (cargado a pedido) a un PNG. Respeta `userData.noRender`.
- `help()`, con una prueba que exige que la tabla y la API coincidan.

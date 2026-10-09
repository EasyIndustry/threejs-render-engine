# Cambios

## 0.7.0

- **La cámara, con valores planos** (`motor.view`, #5): la app la mueve sin importar three.
  `view.get()` devuelve `{ position, target, up, fov, projection, zoom }`, que viaja por JSON;
  `view.set(estado)` es exacto (lo que no se pasa queda como está). Comandos relativos:
  `orbit(dYaw, dPitch, { around })`, `pan(dx, dy, { unit: 'px' | 'world' })`,
  `zoom(factor, { at })` (el punto bajo `at` queda quieto: zoom al cursor), `dolly(distancia)` y
  `lookAt(punto)`. Todos aceptan `{ animate: true | { duration, easing } }` y devuelven una
  Promise (true si llegó, false si otro comando o el usuario la cortó); un comando nuevo corta
  la animación en curso sin salto, y los relativos se suman a donde iba.
  `view.limits({ minDistance, maxDistance, minPitch, maxPitch, floor })` vale para el mouse, los
  comandos y las animaciones. `view.onChange`, `onStart` y `onEnd` (este, con la inercia ya
  terminada). La matemática es pura (`src/view.js`) y está probada en Node.
- Justo arriba o justo abajo la vista es exacta: `up` dice hacia dónde queda la pantalla, sin un
  `0.0001` escondido, y orbitar desde ahí (con un comando o con el mouse) no la hace girar.
- Sección `camera` nueva en los presets: `{ duration, easing, damping }`. El `damping` de los
  OrbitControls (0.12) ahora sale de ahí; con 0, sin inercia. Un preset propio que no la tiene
  la toma de `studio`.
- **Vistas con nombre y encuadre por caja** (#6). `VIEWS` (también `motor.VIEWS`): front, back,
  right, left, top, bottom e iso, cada una `{ dir, up }`; arriba y abajo con su propio `up`.
  `view.go(vista, { fit, margin, animate })` va a una vista y encuadra (`fit`: una caja
  `{ min, max }` de arrays, unos objetos, por defecto todo el contenido; `false`: sin encuadrar).
  Una vista propia (una esquina, un ViewCube) es un `{ dir, up }`. `view.fit(caja | objetos)`
  encuadra sin cambiar de dirección.
- **Arreglo:** el encuadre usaba solo el fov vertical y una esfera de la diagonal: en una ventana
  más alta que ancha (un teléfono parado) cortaba los costados. Ahora usa el fov que limita y los
  8 vértices de la caja, con un margen (`preset.camera.margin`, 1.15). `frame(objects)` es
  `view.fit(objects)`: el encuadre queda más justo que antes. Sin objetos, encuadra las mallas
  visibles sin el estudio ni lo marcado con `userData.noRender` (guías, cotas).

## 0.6.0

- `render()` ya no falla si la escena tiene un espejo (`Reflector` de three) o una malla con material
  de shader propio (`ShaderMaterial`, `RawShaderMaterial`): el path tracer no los entiende y quedan
  afuera de la imagen, como las líneas y los sprites (#1).
- La oclusión ambiental esconde lo marcado con `userData.noAO`, y los espejos se dejan afuera solos
  de las pasadas auxiliares (AO, aristas y contornos de selección): cada pasada que vuelve a dibujar
  la escena disparaba otra vez el reflejo (en calidad alta con una selección con detalle, 4 por
  cuadro); ahora es uno (#2).
- `motor.onResize(fn)`: avisa cuando cambian los píxeles del visor (la ventana, el contenedor o la
  resolución, también la automática) con `{ width, height, pixelRatio, drawingWidth, drawingHeight }`,
  para ajustar lo que la app dimensiona según el visor, como el render target de un espejo (#3).

## 0.5.0

- **Calidad, como en un juego** (`src/quality.js`): lo que cuesta GPU va aparte de la apariencia.
  `motor.quality('baja' | 'media' | 'alta')` cambia antialiasing (0/4/8), tamaño de las sombras
  (1024/2048/4096), oclusión ambiental, bloom, muestras del render final y la pista de texturas
  SD/HD para la app. Un ajuste suelto (`motor.quality({ antialias: 8 })`, `motor.ao({ enabled })`,
  `motor.bloom({ enabled })`) la vuelve `'personalizada'`; `motor.quality()` la devuelve como objeto
  plano para guardarla y restaurarla. `motor.suggestQuality()` la sugiere según la placa, y
  `motor.onQualityChange(fn)` avisa (la app cambia sus texturas). La resolución sigue aparte.
- **Ruptura**: salen del preset de apariencia `sun.shadowMapSize`, `bloom.enabled`, `ao.enabled`,
  `ao.samples` y `render.samples` (son de la calidad), y la opción `antialias` de `createEngine`
  (va `quality`). `bloom()` y `ao()` siguen aceptando `enabled`.
- `render()`: en imágenes chicas hace varias muestras por cuadro (hasta 16): un render de 200×150
  a 512 muestras pasó de 35 s a 6 s. En grandes, una por cuadro, como antes.

## 0.4.0

- Oclusión ambiental (`GTAOPass`): rincones, uniones y el contacto con el piso se oscurecen
  donde casi no llega la luz del ambiente. Sección `ao` en los presets (apagada por defecto) y
  `motor.ao({ enabled, radius, intensity, samples })`; el radio va en fracción de `area`, como
  las sombras (0.03 de un taller de 250 cm son 7,5 cm). Va justo después de la escena, antes de
  los contornos y del bloom.

## 0.3.0

- Bloom (`UnrealBloomPass`): lo que pasa de `threshold` en lineal (un emisivo con intensidad
  mayor que 1, un reflejo fuerte) se derrama alrededor. Sección `bloom` en los presets (apagado
  por defecto) y `motor.bloom({ enabled, strength, radius, threshold })`. Va antes de los
  contornos, para que la selección no brille.

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

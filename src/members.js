// La tabla de help() del motor: una línea por miembro. Vive aparte (pura, sin three) para que
// la prueba en Node pueda compararla con la API de src/index.js.

/** @type {import('./help.js').Member[]} */
export const ENGINE_MEMBERS = [
  ['renderer', 'el WebGLRenderer'],
  ['scene', 'la escena: la app cuelga lo suyo acá o en content'],
  ['camera', 'la cámara (PerspectiveCamera)'],
  ['controls', 'los OrbitControls, o null si se creó con { controls: false }'],
  ['content', 'un grupo para lo de la app'],
  ['overlay', 'una escena que va encima de todo y fuera del post-proceso: gizmos, manijas'],
  ['composer', 'el EffectComposer (para sumar pases propios)'],
  ['preset', 'el preset puesto (una copia)'],
  ['setPreset(preset)', "cambiar cómo se ve: 'studio' | 'warm' | 'dark', un objeto, o { extends, … }"],
  ['tweak(over)', 'pisar algunos valores del preset actual: tweak({ sun: { intensity: 3 } })'],
  ['mode', "el modo de vista: 'render' | 'clay' | 'wireframe' | 'normals' | 'matcap' (se puede asignar)"],
  ['setMode(mode)', 'cambiar el modo de vista'],
  ['select(objects, { detail? })', 'contorno de selección; detail: además una línea fina por objeto'],
  ['selected', 'lo que está seleccionado'],
  ['show({ grid?, floor?, sky?, fog?, shadows? })', 'prender o apagar partes del estudio sin cambiar de preset; sin argumentos, cómo está'],
  ['edges({ enabled?, normalThreshold?, depthThreshold?, darken? })', 'contorno fino de geometría; sin argumentos, cómo está'],
  ['frame(objects?)', 'encuadrar la cámara en unos objetos, o en todo'],
  ['snapshot({ width?, height?, type?, quality? })', 'una foto rápida del visor, como data URL'],
  ['render({ samples?, width?, height?, bounces?, camera?, onProgress?, signal?, type? })', 'el render final con path tracing: una Promise de la imagen (Blob)'],
  ['gpu({ print? })', "en qué placa se dibuja: { name, vendor, kind: 'discrete' | 'integrated' | 'software' | 'unknown', buffer, pixelRatio, maxMSAA, antialias }; la imprime en la consola"],
  ['onFrame(fn)', 'algo que corre en cada cuadro, antes de dibujar; devuelve cómo sacarlo'],
  ['dispose()', 'soltar todo: loop, post-proceso y renderer'],
  ['help()', 'esta tabla'],
];

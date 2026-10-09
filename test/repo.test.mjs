// Las pruebas de la política del repo: que POLITICA.md, las etiquetas y las plantillas digan lo
// mismo, y que los enlaces entre los documentos lleguen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const leer = (f) => readFile(new URL(f, raiz), 'utf8');

test('cada etiqueta de labels.json está explicada en POLITICA.md, y las plantillas solo usan esas', async () => {
  const etiquetas = JSON.parse(await leer('.github/labels.json')).map((l) => l.name);
  const politica = await leer('POLITICA.md');
  for (const e of etiquetas) assert.match(politica, new RegExp(`\`${e}\``), `${e} no está en POLITICA.md`);
  for (const f of await readdir(new URL('.github/ISSUE_TEMPLATE/', raiz))) {
    const m = (await leer(`.github/ISSUE_TEMPLATE/${f}`)).match(/^labels:\s*\[(.*)\]/m);
    if (!m) continue;
    for (const e of m[1].split(',').map((x) => x.trim()).filter(Boolean)) assert.ok(etiquetas.includes(e), `${f} usa ${e}, que no está en labels.json`);
  }
});

test('los enlaces entre los documentos del repo llegan a un archivo', async () => {
  for (const f of ['README.md', 'POLITICA.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md']) {
    for (const [, destino] of (await leer(f)).matchAll(/\]\(([^):#]+\.md)\)/g)) {
      await assert.doesNotReject(access(new URL(destino, raiz)), `${f} enlaza ${destino}, que no existe`);
    }
  }
});

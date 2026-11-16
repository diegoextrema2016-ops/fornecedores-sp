import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_MODULES } from '../scripts/seo.mjs';
import { validateSupplier, validateUser } from '../js/utils.js';

const le = (nome) => readFile(new URL(`../js/${nome}.js`, import.meta.url), 'utf8');

// Módulos que js/app.js carrega de forma fixa: segue só "import ... from './x.js'" (o import() dinâmico não entra).
async function importacoesFixas(inicio) {
  const vistos = new Set();
  const fila = [inicio];
  while (fila.length) {
    const nome = fila.pop();
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const codigo = await le(nome);
    for (const m of codigo.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'\.\/([a-z-]+)\.js'/gm)) fila.push(m[1]);
  }
  return [...vistos].sort();
}

test('carga do visitante: o painel administrativo fica fora e só é baixado sob demanda', async () => {
  const fixos = await importacoesFixas('app');
  for (const soDoPainel of ['pages-admin', 'import', 'backup']) assert.ok(!fixos.includes(soDoPainel), `${soDoPainel} não pode ser carga fixa`);
  const app = await le('app');
  assert.match(app, /import\('\.\/pages-admin\.js'\)/);
  assert.ok(!/^import \* as adm from/m.test(app));
});

test('pré-carregamento: a lista do build é exatamente a carga fixa do site', async () => {
  assert.deepEqual([...APP_MODULES].sort(), await importacoesFixas('app'));
});

test('cada tela é montada num elemento novo, para os ouvintes não se acumularem entre páginas', async () => {
  const app = await le('app');
  assert.match(app, /main\.replaceChildren\(palco\)/);
  assert.match(app, /page\.mount\?\.\(palco\)/);
  assert.ok(!/page\.mount\?\.\(main\)/.test(app));
});

test('mensagens de campo obrigatório concordam com o nome do campo; nome tem tamanho mínimo', () => {
  const e = validateSupplier({}).errors;
  assert.equal(e.category, 'Categoria é obrigatória.');
  assert.equal(e.description, 'Descrição comercial é obrigatória.');
  assert.equal(e.address, 'Endereço é obrigatório.');
  assert.match(validateSupplier({ name: 'X' }, { required: false, requireTerms: false }).errors.name, /2 a 120/);
  assert.equal(validateSupplier({ name: 'Xy' }, { required: false, requireTerms: false }).ok, true);
  assert.ok(validateUser({ name: 'A', email: 'a@b.com', password: '12345678', confirm: '12345678' }).errors.name);
});

test('pagamento sem login responde que é preciso entrar, não "plano inválido"', async () => {
  const js = await readFile(new URL('../api/mercadopago/criar-pagamento.js', import.meta.url), 'utf8');
  assert.match(js, /if \(!token\) return res\.status\(401\)/);
});

test('migração 019: a contagem só aceita +1 e só dentro da função de contagem', async () => {
  const sql = await readFile(new URL('../supabase/migration-019-contador-de-visualizacoes.sql', import.meta.url), 'utf8');
  assert.match(sql, /new\.views := old\.views \+ 1;/);
  assert.match(sql, /set_config\('spf\.contando_visualizacao', '1', true\)/);
  assert.match(sql, /set_config\('spf\.contando_visualizacao', '', true\)/);
  assert.match(sql, /revoke all on function public\.increment_supplier_views\(uuid\) from public, anon/);
});

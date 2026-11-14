// Testes do catálogo fechado (assinantes): verificação do dist, colunas do app x banco,
// segurança das funções SQL e cabeçalhos de não indexação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const fixture = JSON.parse(ler('tests/fixtures-seo.json'));

function distFalso(conteudoPorArquivo) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-teste-'));
  for (const [nome, texto] of Object.entries(conteudoPorArquivo)) {
    const caminho = join(dir, nome);
    mkdirSync(join(caminho, '..'), { recursive: true });
    writeFileSync(caminho, texto, 'utf8');
  }
  return dir;
}

function verifica(dir) {
  return spawnSync(process.execPath, [join(raiz, 'scripts/verifica-dist.mjs')], {
    env: { ...process.env, DIST_DIR: dir, SEO_FIXTURE: join(raiz, 'tests/fixtures-seo.json') },
    encoding: 'utf8',
  });
}

test('nenhum código passa imagePathFromUrl direto para map (o índice iria para o parâmetro bucket)', () => {
  for (const f of readdirSync(join(raiz, 'js')).filter((x) => x.endsWith('.js'))) {
    assert.ok(!/\.map\(imagePathFromUrl\)/.test(ler(`js/${f}`)), `js/${f} usa .map(imagePathFromUrl)`);
  }
});

test('verificação do dist passa quando não há dado de fornecedor', () => {
  const dir = distFalso({ 'site/index.html': '<html><body><h1>Início</h1></body></html>', 'sitemap.xml': '<urlset></urlset>' });
  try {
    const r = verifica(dir);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('verificação do dist FALHA se houver nome de fornecedor, link de ficha ou URL de Storage', () => {
  const nome = fixture.suppliers[0].name;
  const casos = {
    'nome de fornecedor': `<p>${nome}</p>`,
    'link de ficha': '<a href="/fornecedor/algum-slug">x</a>',
    'URL de Storage': '<img src="https://abc.supabase.co/storage/v1/object/public/supplier-images/a.webp">',
    'cartão de fornecedor': '<article class="supplier-card">x</article>',
    'telefone': '<p>11 91234-5678</p>',
  };
  for (const [motivo, html] of Object.entries(casos)) {
    const dir = distFalso({ 'site/index.html': `<html><body>${html}</body></html>` });
    try {
      const r = verifica(dir);
      assert.equal(r.status, 1, `deveria falhar com ${motivo}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('verificação do dist FALHA se existir pasta de fichas de fornecedores', () => {
  const dir = distFalso({ 'fornecedor/x/index.html': '<html></html>' });
  try {
    assert.equal(verifica(dir).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('colunas de suppliers do app são as mesmas da migração 008 (owner_id fica de fora)', () => {
  const api = ler('js/api.js');
  const bloco = api.match(/export const SUPPLIER_COLUMNS = \[([\s\S]*?)\]\.join/);
  assert.ok(bloco, 'SUPPLIER_COLUMNS não encontrado');
  const doApp = [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const mig = ler('supabase/migration-008-protecao-owner-id.sql');
  const grant = mig.match(/grant select \(([\s\S]*?)\) on public\.suppliers/);
  assert.ok(grant, 'grant de colunas não encontrado na migração 008');
  const doBanco = grant[1].split(',').map((c) => c.trim()).filter(Boolean);
  assert.deepEqual([...doApp].sort(), [...doBanco].sort());
  assert.ok(!doApp.includes('owner_id'));
});

test('nenhuma leitura ou escrita de suppliers no app usa select(*) ou select() sem colunas', () => {
  const arquivos = readdirSync(join(raiz, 'js')).filter((f) => f.endsWith('.js'));
  for (const f of arquivos) {
    const linhas = ler(`js/${f}`).split('\n');
    linhas.forEach((l, i) => {
      if (!/from\('suppliers'\)/.test(l)) return;
      assert.ok(!/select\(\s*\)/.test(l) && !/select\('\*'/.test(l), `js/${f}:${i + 1} usa select sem colunas em suppliers`);
    });
  }
  const api = ler('js/api.js');
  assert.ok(api.includes(".select(SUPPLIER_COLUMNS)"), 'insert e update devem devolver colunas explícitas');
});

test('funções SQL das migrações 007 a 011 fixam o search_path (security definer seguro)', () => {
  for (const n of ['007-catalogo-fechado', '008-protecao-owner-id', '009-storage-privado', '010-sincroniza-email', '011-rpc-e-limites']) {
    const sql = ler(`supabase/migration-${n}.sql`);
    const blocos = sql.split(/create or replace function|create function/i).slice(1);
    for (const b of blocos) {
      const cabecalho = b.slice(0, b.indexOf('$$'));
      if (/security definer/i.test(cabecalho)) {
        assert.ok(/set search_path\s*(=|to)\s*'?public'?/i.test(cabecalho), `função sem search_path em migration-${n}`);
      }
    }
  }
});

test('endpoint de sugestões usa consume_limite_usuario, não consume_rate_limit', () => {
  const src = ler('api/sugerir-descricao.js');
  assert.ok(src.includes('rpc/consume_limite_usuario'));
  assert.ok(!src.includes('rpc/consume_rate_limit'), 'a chamada direta à RPC antiga não pode existir');
});

test('cabeçalhos X-Robots-Tag noindex cobrem as rotas do catálogo', () => {
  const cfg = JSON.parse(ler('vercel.json'));
  const regras = cfg.headers || [];
  const noindex = regras.filter((r) => r.headers.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)));
  const origens = noindex.map((r) => r.source);
  for (const rota of ['/fornecedor/:slug', '/fornecedores', '/categorias/:slug', '/regiao/:slug', '/mapa']) {
    assert.ok(origens.some((o) => o.startsWith(rota)), `falta X-Robots-Tag noindex em ${rota}`);
  }
});

test('migrações 007 a 011 existem e não tocam em produção por conta própria (sem comandos de dados apagados)', () => {
  for (const n of ['007-catalogo-fechado', '008-protecao-owner-id', '009-storage-privado', '010-sincroniza-email', '011-rpc-e-limites']) {
    const sql = ler(`supabase/migration-${n}.sql`).toLowerCase();
    assert.ok(!/\bdelete from public\.(suppliers|profiles|subscriptions|favorites)\b/.test(sql), `apaga dados em ${n}`);
    assert.ok(!/\btruncate\s+(table\s+)?public\./.test(sql), `truncate de tabela em ${n}`);
    assert.ok(!/disable row level security/.test(sql), `desativa RLS em ${n}`);
  }
});

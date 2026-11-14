// Build de DESENVOLVIMENTO: gera o site apontado somente para o projeto Supabase de teste.
// Não altera js/config.js do repositório: cria uma cópia em .dev-build/ e troca ali as três configurações.
//
// Uso (na sua máquina):
//   1. Copie dev.local.example.json para dev.local.json (arquivo ignorado pelo git) e preencha:
//      supabaseUrl (projeto DEV), anonKey (chave PUBLICÁVEL do projeto DEV) e siteUrl (http://localhost:8080).
//   2. node scripts/build-dev.mjs
//   3. node .dev-build/scripts/serve.mjs .dev-build/dist 8080   e abra http://localhost:8080
//
// Segurança: o build falha se qualquer referência ao projeto de PRODUÇÃO sobrar no resultado,
// e não usa o banco real para montar as páginas (usa um arquivo mínimo de dados).
import { readFile, writeFile, cp, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.dev-build');
const PROD_REF = 'fzjiixiqezvvfeybydie';
const PROD_SITE = 'https://www.fornecedoresdesp.com.br';

function fail(msg) {
  console.error(`\nBuild de desenvolvimento não gerado: ${msg}\n`);
  process.exit(1);
}

async function readDevConfig() {
  const file = join(ROOT, 'dev.local.json');
  if (!existsSync(file)) fail('crie o arquivo dev.local.json a partir de dev.local.example.json.');
  const cfg = JSON.parse(await readFile(file, 'utf8'));
  const { supabaseUrl = '', anonKey = '', siteUrl = '' } = cfg;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) fail('supabaseUrl deve ser https://<ref>.supabase.co');
  if (supabaseUrl.includes(PROD_REF)) fail('supabaseUrl aponta para o projeto de PRODUÇÃO. Use o projeto DEV.');
  if (!/^sb_publishable_/.test(anonKey) && !/^eyJ/.test(anonKey)) fail('anonKey deve ser a chave PUBLICÁVEL do projeto DEV (sb_publishable_...).');
  if (!/^http:\/\/localhost:\d+$/.test(siteUrl) && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/.test(siteUrl)) fail('siteUrl deve ser http://localhost:<porta> ou um endereço HTTPS de teste.');
  if (siteUrl.includes('fornecedoresdesp.com.br')) fail('siteUrl não pode ser o domínio de produção.');
  return { supabaseUrl, anonKey, siteUrl };
}

// Troca exatamente uma ocorrência; falha se o padrão não existir ou aparecer mais de uma vez.
function replaceOnce(src, pattern, replacement, label) {
  const matches = src.match(new RegExp(pattern.source, 'g')) || [];
  if (matches.length !== 1) fail(`não foi possível localizar "${label}" em js/config.js (${matches.length} ocorrências).`);
  return src.replace(pattern, replacement);
}

async function copyRepo() {
  await rm(BUILD, { recursive: true, force: true });
  await mkdir(BUILD, { recursive: true });
  const skip = new Set(['.git', 'node_modules', 'dist', '.dev-build', 'dev.local.json']);
  const entries = await readdir(ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    await cp(join(ROOT, entry.name), join(BUILD, entry.name), { recursive: true });
  }
}

async function writeDevConfig({ supabaseUrl, anonKey, siteUrl }) {
  const file = join(BUILD, 'js', 'config.js');
  let src = await readFile(file, 'utf8');
  // Domínio do site (SEO, sitemap, Open Graph e links de e-mail).
  src = replaceOnce(src, /(export const SITE = \{[\s\S]*?\n\s*url: )'[^']+'/, `$1'${siteUrl}'`, 'SITE.url');
  // URL e chave do Supabase.
  src = replaceOnce(src, /(export const SUPABASE = \{\s*url: )'[^']+'/, `$1'${supabaseUrl}'`, 'SUPABASE.url');
  src = replaceOnce(src, /(anonKey: )'[^']+'/, `$1'${anonKey}'`, 'SUPABASE.anonKey');
  await writeFile(file, src, 'utf8');
}

// Dados mínimos para as páginas públicas (sem ler o banco).
async function writeFixture() {
  const fixture = {
    categories: [{ id: 'dev-cat', slug: 'teste-dev', name: 'Teste (dev)', description: 'Dados de teste.', status: 'active', sort_order: 1 }],
    regions: [{ slug: 'teste-dev', name: 'Teste (dev)', description: 'Dados de teste.', sort_order: 1 }],
    suppliers: [],
  };
  const file = join(BUILD, 'dev-fixture.json');
  await writeFile(file, JSON.stringify(fixture, null, 2), 'utf8');
  return file;
}

// Procura os dois nomes de produção no resultado: o projeto Supabase (bloqueia) e o domínio do site (avisa).
async function scanForProd(dir) {
  const supabaseHits = [];
  const siteHits = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (/\.(js|html|json|xml|txt|css|mjs)$/.test(entry.name)) {
        const text = await readFile(p, 'utf8');
        if (text.includes(PROD_REF)) supabaseHits.push(relative(BUILD, p));
        if (text.includes(PROD_SITE)) siteHits.push(relative(BUILD, p));
      }
    }
  }
  await walk(dir);
  return { supabaseHits, siteHits };
}

// A landing de apresentação (/) traz o domínio de produção em canonical, og:url e JSON-LD.
// Na cópia de desenvolvimento esses endereços passam a apontar para o site de teste.
async function pointLandingToDev(siteUrl) {
  const file = join(BUILD, 'apresentacao', 'index.html');
  const src = await readFile(file, 'utf8');
  await writeFile(file, src.split(PROD_SITE).join(siteUrl), 'utf8');
}

async function main() {
  const dev = await readDevConfig();
  await copyRepo();
  await writeDevConfig(dev);
  await pointLandingToDev(dev.siteUrl);
  const fixture = await writeFixture();

  const run = spawnSync(process.execPath, ['scripts/build.mjs'], {
    cwd: BUILD,
    env: { ...process.env, SEO_FIXTURE: fixture },
    stdio: 'inherit',
  });
  if (run.status !== 0) fail('o build falhou (veja a mensagem acima).');

  const { supabaseHits, siteHits } = await scanForProd(join(BUILD, 'dist'));
  if (supabaseHits.length) fail(`referências ao Supabase de PRODUÇÃO encontradas em: ${supabaseHits.join(', ')}`);
  if (siteHits.length) console.warn(`Aviso: o domínio de produção ainda aparece em: ${siteHits.join(', ')} (revise antes de usar esses arquivos).`);

  console.log(`\nBuild DEV OK, apontado para ${dev.supabaseUrl} (site: ${dev.siteUrl}).`);
  console.log('Sirva com: node .dev-build/scripts/serve.mjs .dev-build/dist 8080');
}

main().catch((err) => fail(err.message));

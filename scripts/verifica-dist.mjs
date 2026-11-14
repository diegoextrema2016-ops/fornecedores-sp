// Conferência do dist/ depois do build: falha (exit 1) se algum dado de fornecedor estiver publicado.
// Varre só HTML, XML e TXT (o código do app em js/ pode citar nomes de tabelas, então fica de fora).
//
// Usa como amostra os fornecedores do arquivo de teste (tests/fixtures-seo.json): nomes e slugs.
// Também procura padrões que nunca devem aparecer em páginas estáticas: URLs de Storage,
// nomes de colunas e tabelas, cartões de fornecedor e links para fichas.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST_DIR || join(ROOT, 'dist');
const FIXTURE = process.env.SEO_FIXTURE || join(ROOT, 'tests', 'fixtures-seo.json');
const EXTENSOES = new Set(['.html', '.xml', '.txt']);

// Padrões que nunca podem existir no HTML estático (sem fornecedor real).
const PADROES = [
  { nome: 'URL de Storage', re: /supabase\.co\/storage|\/object\/(public|sign)\//i },
  { nome: 'coluna ou tabela de fornecedor', re: /owner_id|supplier_photos|supplier_contacts/ },
  { nome: 'cartão de fornecedor', re: /class="[^"]*supplier-card/ },
  { nome: 'link para ficha de fornecedor', re: /href="\/fornecedor\// },
  { nome: 'ficha de fornecedor no sitemap', re: /<loc>[^<]*\/fornecedor\//i },
  { nome: 'telefone (WhatsApp)', re: /\b(?:55)?\s?\(?\d{2}\)?\s?9\d{4}-?\d{4}\b/ },
];

const normaliza = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function arquivos(dir) {
  const saida = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) saida.push(...await arquivos(caminho));
    else if (EXTENSOES.has(extname(item.name))) saida.push(caminho);
  }
  return saida;
}

async function main() {
  const fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const fornecedores = fixture.suppliers || [];
  const termos = fornecedores.flatMap((s) => [
    { tipo: 'nome de fornecedor', texto: s.name, re: null },
    { tipo: 'slug de fornecedor', texto: s.slug, re: null },
  ]).filter((t) => t.texto && t.texto.length >= 4);

  const falhas = [];
  const lista = await arquivos(DIST);
  for (const arq of lista) {
    const rel = relative(DIST, arq);
    const conteudo = await readFile(arq, 'utf8');
    const semAcento = normaliza(conteudo);
    for (const p of PADROES) {
      if (p.re.test(conteudo)) falhas.push({ rel, motivo: p.nome, trecho: conteudo.match(p.re)[0].slice(0, 60) });
    }
    for (const t of termos) {
      const alvo = normaliza(t.texto);
      if (semAcento.includes(alvo)) falhas.push({ rel, motivo: t.tipo, trecho: t.texto });
    }
  }

  // Nenhuma pasta de ficha de fornecedor pode existir no dist.
  const fichas = await readdir(DIST).catch(() => []);
  if (fichas.includes('fornecedor')) falhas.push({ rel: 'fornecedor/', motivo: 'pasta de fichas de fornecedores', trecho: '' });

  if (falhas.length) {
    console.error(`Conferência do dist FALHOU: ${falhas.length} ocorrência(s) de dado de fornecedor.`);
    for (const f of falhas.slice(0, 50)) console.error(`  - ${f.rel}: ${f.motivo}${f.trecho ? ` ("${f.trecho}")` : ''}`);
    process.exit(1);
  }
  console.log(`Conferência do dist OK: ${lista.length} arquivos verificados, ${termos.length} termos de fornecedores de amostra e ${PADROES.length} padrões, nenhum encontrado.`);
}

main().catch((err) => {
  console.error(`Conferência do dist falhou: ${err.message}`);
  process.exit(1);
});

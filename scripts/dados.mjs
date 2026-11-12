// Dados usados pelo build e pela verificação de alterações: somente slugs.
// Nome, descrição, foto, contato e demais dados de fornecedor NÃO entram aqui. As páginas do catálogo são
// cascas genéricas com noindex; só o slug aparece na URL. Assim, o build não tem como publicar dado que não lê.
//
// Leitura: banco, pelo papel build_publico (ver pg-slugs.mjs).
// Teste local: SEO_FIXTURE=arquivo.json lê um fixture com as mesmas regras do banco, sem rede.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lerSlugsDoCatalogo, validarSlugs } from './pg-slugs.mjs';

// Mesmas regras de public.catalogo_slugs() (migração 007).
export function slugsDoFixture(dados) {
  const linhas = [
    ...(dados.categories || []).filter((c) => c.status !== 'inactive').map((c) => ['categoria', c.slug]),
    ...(dados.regions || []).map((r) => ['regiao', r.slug]),
    ...(dados.suppliers || []).filter((s) => s.approval_status === 'approved' && s.is_demo === false).map((s) => ['fornecedor', s.slug]),
  ];
  return validarSlugs(linhas);
}

export async function loadData(env = process.env) {
  const grupos = env.SEO_FIXTURE
    ? slugsDoFixture(JSON.parse(await readFile(env.SEO_FIXTURE, 'utf8')))
    : await lerSlugsDoCatalogo(env);
  return { categories: grupos.categoria, regions: grupos.regiao, suppliers: grupos.fornecedor };
}

// Impressão digital dos slugs publicados. Muda só quando entra, sai ou muda um slug do catálogo público.
// Ordena antes de gerar o texto, para que a mesma base sempre dê o mesmo resultado.
export function fingerprint({ categories = [], regions = [], suppliers = [] }) {
  const ordenados = (lista) => lista.map((x) => x.slug).sort();
  const base = { categorias: ordenados(categories), bairros: ordenados(regions), fornecedores: ordenados(suppliers) };
  return createHash('sha256').update(JSON.stringify(base)).digest('hex');
}

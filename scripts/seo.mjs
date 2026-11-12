// Geração do HTML público para mecanismos de busca (usado pelo build na Vercel).
// Funções puras: recebem dados já lidos do banco e devolvem texto HTML, XML ou JSON.
// Regra: só usa informações que existem nos dados. O que estiver vazio não aparece.
import { SITE, BANNERS, SUPABASE } from '../js/config.js';
import { SUPPLIER_TYPES } from '../js/data.js';
import { bannersMarkup, bannerPreloadLinks as preloadBanners } from '../js/banners.js';
import { planosMainHtml, guiasIndexMainHtml, guiaMainHtml, REGIAO_TEXTO, regiaoPrep } from '../js/conteudo.js';

// Categorias com restrição legal (venda proibida pela Anvisa, por exemplo) ficam fora do Google.
export const RESTRICTED_CATEGORY_SLUGS = ['vapers-e-acessorios'];

// Conexões antecipadas (banco e biblioteca do Supabase) e módulos do site baixados em paralelo, para abrir mais rápido.
const APP_MODULES = ['access', 'api', 'app', 'backup', 'config', 'data', 'extract', 'forms', 'import', 'mapping', 'nav',
  'pages-account', 'pages-admin', 'pages-public', 'paywall', 'search', 'store', 'ui', 'utils'];
const SUPABASE_HOST = (() => { try { return new URL(SUPABASE.url).origin; } catch { return ''; } })();
export const SHARED_HEAD_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${SUPABASE_HOST ? `<link rel="preconnect" href="${SUPABASE_HOST}" crossorigin>` : ''}
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/css/styles.css">
  ${APP_MODULES.map((m) => `<link rel="modulepreload" href="/js/${m}.js">`).join('\n  ')}`;

// Imagem principal da home (banner): pré-carregada para aparecer logo (mesma lógica do site).
function bannerPreloadLinks() {
  return preloadBanners(BANNERS, esc);
}

// Ícone da página (o mesmo do index.html), preenchido pelo build.
let FAVICON = '';
export function setFavicon(link) {
  FAVICON = link || '';
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const BASE = SITE.url.replace(/\/$/, '');
export const absUrl = (path = '/') => BASE + (path.startsWith('/') ? path : `/${path}`);
const DEFAULT_OG_IMAGE = absUrl('/img/og-banner-2.jpg');
// Imagem de compartilhamento (WhatsApp, Facebook) só da home. Nome novo para não usar a versão em cache.
const HOME_OG_IMAGE = absUrl('/img/og-home-1.jpg');

// Trava de exibição: o HTML pré-gerado fica escondido até o app desenhar a tela oficial (js/app.js remove a classe).
// Assim nenhum conteúdo antigo ou diferente aparece por trás. Se o app não carregar, libera após 8 s e o HTML aparece.
// Quem não tem JavaScript vê o HTML normalmente (o script não roda).
// O script fica em arquivo próprio (js/guard.js) para a Política de Segurança (CSP) não precisar liberar script inline.
export const PENDING_GUARD = `<style>html.spf-pending #header,html.spf-pending #main,html.spf-pending #footer{visibility:hidden}</style>
  <script src="/js/guard.js"></script>`;

// Remove marcas de tamanho e espaços desnecessários de um texto livre.
const clean = (v = '') => String(v ?? '').replace(/\s+/g, ' ').trim();
const truncate = (text, max = 155) => {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : cut.length).replace(/[,;:\s]+$/, '') + '…';
};

export const typeLabel = (value) => SUPPLIER_TYPES.find((t) => t.value === value)?.label || '';

// ---------- Dados estruturados (schema.org) ----------

export const organizationJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: absUrl('/site'),
  email: SITE.contactEmail,
  description: SITE.description,
});

export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: absUrl('/site'),
  inLanguage: 'pt-BR',
  description: SITE.description,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: absUrl('/fornecedores?q={search_term_string}') },
    'query-input': 'required name=search_term_string',
  },
});

export const breadcrumbJsonLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.label,
    ...(it.path ? { item: absUrl(it.path) } : {}),
  })),
});

// Não usamos lista de fornecedores em dados estruturados: ela publicaria nomes e links para fichas que não são indexadas.
export const articleJsonLd = ({ title, description, path }) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: title,
  description,
  inLanguage: 'pt-BR',
  mainEntityOfPage: absUrl(path),
  author: { '@type': 'Organization', name: SITE.name },
  publisher: { '@type': 'Organization', name: SITE.name, url: absUrl('/site') },
});

// Região só é indexada se tiver fornecedores de São Paulo (algumas regiões do banco são de outros estados).
export const isSpRegion = (suppliers) => suppliers.some((s) => s.state === 'SP');

// ---------- Cabeçalho e documento ----------

// faviconLink vem do index.html, para manter o mesmo ícone em todas as páginas.
export function documentHtml({ title, description, path, noindex = false, jsonld = [], image = path === '/site' ? HOME_OG_IMAGE : DEFAULT_OG_IMAGE, mainHtml = '', nav = '', footer = '', ogType = 'website' }) {
  const canonical = absUrl(path);
  const jsonScripts = jsonld
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`)
    .join('\n  ');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  ${PENDING_GUARD}
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}">
  <meta name="theme-color" content="#2457f5">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="${esc(ogType)}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="${esc(SITE.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${image ? `<meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(image)}">` : ''}
  ${FAVICON}
  ${SHARED_HEAD_LINKS}
  ${path === '/site' ? bannerPreloadLinks() : ''}
  ${jsonScripts}
</head>
<body>
  <div id="header">${nav}</div>
  <main id="main" tabindex="-1">${mainHtml}</main>
  <div id="footer">${footer}</div>
  <div id="toasts" class="toasts" aria-live="polite"></div>
  <div id="modal-root"></div>
  <noscript>Este portal precisa de JavaScript habilitado para funcionar.</noscript>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
`;
}

// Navegação simples em HTML puro. O app substitui pelo cabeçalho completo quando carrega.
// Cabeçalho da versão pré-gerada: igual ao do site (marca, menu e Entrar), para a troca na carga ser invisível.
export function staticHeader() {
  return `<header class="site-header" id="site-header">
    <div class="container header-inner">
      <a class="brand" href="/site" aria-label="${esc(SITE.name)} - início">
        <span class="brand-mark" aria-hidden="true">SP</span>
        <span class="brand-text"><strong>FORNECEDORES</strong><small>ATACADO SP</small></span>
      </a>
      ${staticNav()}
      <div class="header-actions">
        <a class="btn btn-ghost" href="/login">Entrar</a>
        <a class="btn btn-primary hide-sm" href="/cadastro">Cadastrar fornecedor</a>
        <button class="icon-btn menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menu">☰</button>
      </div>
    </div>
  </header>`;
}

// Faixa de banners igual à do site (mesmo markup de js/banners.js).
export function staticBanners() {
  return bannersMarkup(BANNERS, esc);
}

export function staticNav() {
  return `<nav class="main-nav" aria-label="Principal">
  <a href="/site">Início</a> <a href="/categorias">Categorias</a> <a href="/fornecedores">Fornecedores</a> <a href="/mapa">Mapa</a> <a href="/sobre">Como funciona</a> <a href="/cadastro">Cadastrar fornecedor</a>
</nav>`;
}

export function staticFooter() {
  return `<footer class="site-footer">
  <nav aria-label="Rodapé">
    <a href="/categorias">Categorias</a> <a href="/fornecedores">Fornecedores</a> <a href="/mapa">Mapa</a> <a href="/cadastro">Cadastre sua loja</a> <a href="/sobre">Sobre</a> <a href="/contato">Contato</a> <a href="/privacidade">Privacidade</a> <a href="/termos">Termos de uso</a>
  </nav>
  <p>${esc(SITE.name)} · São Paulo</p>
</footer>`;
}

function breadcrumbHtml(items) {
  return `<nav class="breadcrumbs" aria-label="Você está em"><ol>${items
    .map((it) => (it.path ? `<li><a href="${esc(it.path)}">${esc(it.label)}</a></li>` : `<li aria-current="page">${esc(it.label)}</li>`))
    .join('')}</ol></nav>`;
}

// Ícones iguais aos do site (js/ui.js).
const ICON = {
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.1C1 8.6 3 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5 19 5 21 8.6 21.5 11.9 19.5 16.4 12 21 12 21z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8.9-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.8c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 2 4.5 4.5 0 0 0 .9 2.4 10.4 10.4 0 0 0 4 3.5c1.5.6 2.1.7 2.8.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3z"/></svg>',
};

// Cartão da listagem pré-gerada: só o que não identifica o fornecedor (bairro, categoria e selo).
// Nome, descrição, tipo de venda, horário e contatos ficam na ficha (noindex) e com assinantes.
// Não há link para a ficha aqui, para que os rastreadores não sigam o catálogo pelas listagens.
function visitorCardHtml(s, { categoryName = () => '', regionName = () => '' } = {}) {
  const region = s.bairro ? regionName(s.bairro) : '';
  const label = `Fornecedor${region ? ` em ${region}` : ' de atacado'}`;
  return `<article class="supplier-card">
    <div class="supplier-card-top">
      <div class="logo-box" aria-hidden="true"><span class="logo-mask">SP</span></div>
      <div class="supplier-title">
        <h3>${esc(label)}</h3>
        <div class="badges">
          ${s.verified ? `<span class="badge badge-verified">${ICON.check} Verificado</span>` : ''}
          <span class="badge">${esc(categoryName(s.category_id))}</span>
        </div>
      </div>
    </div>
    <p class="contact-line small">${ICON.wa} <span>WhatsApp para assinantes</span></p>
    <div class="supplier-actions">
      <button class="btn btn-primary" type="button" data-action="unlock">Ver contato completo</button>
    </div>
  </article>`;
}

function visitorGridHtml(list, ctx = {}) {
  if (!list.length) return '<p>Ainda não há fornecedores aprovados nesta lista.</p>';
  return `<div class="grid grid-3">${list.map((s) => visitorCardHtml(s, ctx)).join('')}</div>`;
}

// Lista com o mesmo borrão do site: cartões embaçados e o aviso de planos por cima.
function listingGateHtml(list, ctx = {}) {
  if (!list.length) return visitorGridHtml(list, ctx);
  return `<div class="blur-gate">
    <div class="card blur-banner">
      <p><strong>Assine para ver os contatos dos fornecedores</strong></p>
      <p class="small muted">WhatsApp, Instagram e endereço completos são liberados após o pagamento via Pix.</p>
      <button class="btn btn-primary" type="button" data-action="unlock">Ver planos de acesso</button>
    </div>
    <div class="blur-content" aria-hidden="true">${visitorGridHtml(list, ctx)}</div>
  </div>`;
}

// Mesma ordem de "relevância" do site, sem busca: destaque, verificado, acessos e nome.
const byRelevance = (a, b) =>
  (b.featured === true) - (a.featured === true)
  || (b.verified === true) - (a.verified === true)
  || (b.views || 0) - (a.views || 0)
  || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');

// ---------- Textos originais por categoria e região (com números reais) ----------

// O texto é montado com contagens e nomes reais do banco. Não há afirmações sobre fornecedores específicos.
export function categorySeoText(cat, suppliers, regionNames) {
  const n = suppliers.length;
  const wholesale = suppliers.filter((s) => s.sale_wholesale).length;
  const ships = suppliers.filter((s) => s.ships_other_cities).length;
  const regions = [...new Set(suppliers.map((s) => regionNames(s.bairro)).filter(Boolean))];
  const paragraphs = [];
  paragraphs.push(`Nesta página estão ${n === 1 ? 'o fornecedor aprovado' : `os ${n} fornecedores aprovados`} de ${cat.name.toLowerCase()} do ${SITE.shortName}.${regions.length ? ` Eles estão em ${regions.length === 1 ? 'um bairro' : 'bairros'} como ${listJoin(regions)}.` : ''}`);
  if (n) {
    const parts = [];
    if (wholesale) parts.push(`${wholesale} ${wholesale === 1 ? 'vende' : 'vendem'} no atacado`);
    if (ships) parts.push(`${ships} ${ships === 1 ? 'envia' : 'enviam'} para outras cidades`);
    if (parts.length) paragraphs.push(`Entre eles, ${listJoin(parts)}. As informações de cada loja, como tipo de fornecedor, pedido mínimo e horário, aparecem na ficha de cada fornecedor.`);
  }
  paragraphs.push('Para ver WhatsApp, Instagram e endereço completo, é preciso ter acesso aos contatos. Os dados de cada fornecedor são cadastrados e conferidos pela equipe antes de publicar.');
  return paragraphs;
}

export function regionSeoText(region, suppliers, categoryNames) {
  const n = suppliers.length;
  const cats = [...new Set(suppliers.map((s) => categoryNames(s.category_id)).filter(Boolean))];
  const paragraphs = [];
  paragraphs.push(`${n === 1 ? 'Há 1 fornecedor aprovado' : `Há ${n} fornecedores aprovados`} no bairro ${region.name}, em São Paulo.${region.description ? ` ${clean(region.description)}` : ''}`);
  if (cats.length) paragraphs.push(`As categorias representadas aqui são ${listJoin(cats.slice(0, 8))}${cats.length > 8 ? ' e outras' : ''}.`);
  return paragraphs;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// ---------- Páginas ----------

// Catálogo protegido: quem não é assinante não vê nenhum dado do catálogo nestas páginas
// (nomes, descrições, fotos, contagens, bairros ou categorias). O app mostra o catálogo só a assinantes.
const PROTEGIDO_DESCRICAO = 'Catálogo exclusivo para assinantes do Fornecedores Atacado SP.';

export function catalogoProtegidoHtml() {
  return `<section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Catálogo' }])}
    <h1>Catálogo exclusivo para assinantes</h1>
    <p class="lead">O catálogo de fornecedores do ${esc(SITE.shortName)} é liberado para quem tem assinatura ativa.</p>
    <p><a class="btn btn-primary" href="/planos">Ver planos de acesso</a></p>
  </section>`;
}

function catalogoProtegidoPagina(path, title = 'Catálogo exclusivo | Fornecedores Atacado SP') {
  return documentHtml({
    title, description: PROTEGIDO_DESCRICAO, path, noindex: true,
    mainHtml: catalogoProtegidoHtml(), nav: staticNav(), footer: staticFooter(),
  });
}

// Home completa (/site): não lista categorias, bairros nem fornecedores. Fica fora do Google.
export function homePage() {
  const main = `
  <section class="hero">
    <div class="container hero-inner">
      <h1>Fornecedores de atacado em São Paulo</h1>
      <p class="lead">Catálogo de fornecedores para revendedores, exclusivo para assinantes.</p>
      <p><a class="btn btn-primary" href="/planos">Ver planos de acesso</a></p>
    </div>
  </section>`;
  return documentHtml({
    title: 'Fornecedores Atacado SP | Fornecedores de atacado em São Paulo', description: PROTEGIDO_DESCRICAO,
    path: '/site', noindex: true, mainHtml: main, nav: staticHeader(), footer: staticFooter(),
  });
}

// Índice de categorias, categorias e regiões: sem nomes, contagens ou textos sobre fornecedores. Fora do Google.
export function categoriesIndexPage() {
  return catalogoProtegidoPagina('/categorias', 'Catálogo | Fornecedores Atacado SP');
}

export function categoryPage({ category }) {
  return catalogoProtegidoPagina(`/categorias/${category.slug}`);
}

export function regionPage({ region }) {
  return catalogoProtegidoPagina(`/regiao/${region.slug}`);
}

// Listagem de fornecedores (/fornecedores): fora do Google e sem dados de fornecedores.
export function suppliersIndexPage() {
  return catalogoProtegidoPagina('/fornecedores', 'Catálogo | Fornecedores Atacado SP');
}

// Ficha individual: fora do Google, sem nome, descrição, fotos, contatos nem dados de horário ou pedido mínimo.
export function supplierPage({ supplier: s }) {
  return catalogoProtegidoPagina(`/fornecedor/${s.slug}`);
}

// Mapa por bairro: fora do Google e sem bairros nem contagens.
export function mapPage() {
  return catalogoProtegidoPagina('/mapa', 'Catálogo | Fornecedores Atacado SP');
}

// Páginas institucionais: título, descrição e título na página. O conteúdo completo é carregado pelo app.
export function staticInfoPage({ path, title, description, h1, noindex = false }) {
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: h1 }])}
    <h1>${esc(h1)}</h1>
    <p>${esc(description)}</p>
  </section>`;
  return documentHtml({
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex, mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: h1, path }])],
  });
}

// Páginas que dependem de login ou só fazem sentido para o usuário logado: nunca indexadas.
export function noindexShell({ path, title, description = 'Área restrita do Fornecedores Atacado SP.' }) {
  return documentHtml({
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex: true,
    mainHtml: '<section class="container section-tight"><h1>Carregando…</h1></section>', nav: '', footer: '',
  });
}

export function planosPage() {
  const title = 'Planos de acesso aos contatos | Fornecedores Atacado SP';
  const description = 'Conheça os planos do Fornecedores Atacado SP e tenha acesso ao WhatsApp, Instagram e endereço dos fornecedores de São Paulo.';
  return documentHtml({
    title, description, path: '/planos', mainHtml: planosMainHtml(), nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Planos', path: '/planos' }])],
  });
}

export function guiasIndexPage() {
  const title = 'Guias de fornecedores e atacado em São Paulo | Fornecedores Atacado SP';
  const description = 'Guias práticos para encontrar fornecedores de atacado em São Paulo, comprar roupas no atacado e escolher fornecedores para revenda.';
  return documentHtml({
    title, description, path: '/guias', mainHtml: guiasIndexMainHtml(), nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Guias', path: '/guias' }])],
  });
}

export function guiaPage(g) {
  const path = `/guias/${g.slug}`;
  return documentHtml({
    title: g.title, description: truncate(g.description), path, mainHtml: guiaMainHtml(g), nav: staticNav(), footer: staticFooter(),
    ogType: 'article',
    jsonld: [
      articleJsonLd({ title: g.h1, description: truncate(g.description), path }),
      breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Guias', path: '/guias' }, { label: g.h1, path }]),
    ],
  });
}

export function notFoundPage() {
  return documentHtml({
    title: 'Página não encontrada | Fornecedores Atacado SP',
    description: 'Página não encontrada.',
    path: '/404.html',
    noindex: true,
    mainHtml: `<section class="container section-tight"><h1>Página não encontrada</h1><p>O endereço pode estar errado ou a página foi removida.</p><p><a class="btn btn-primary" href="/site">Voltar ao início</a></p></section>`,
    nav: staticNav(), footer: staticFooter(),
  });
}

// ---------- sitemap e robots ----------

export function sitemapXml(urls) {
  const body = urls.map((u) => `  <url><loc>${esc(absUrl(u.path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /login
Disallow: /registro
Disallow: /cadastro
Disallow: /favoritos
Disallow: /sair

Sitemap: ${absUrl('/sitemap.xml')}
`;
}

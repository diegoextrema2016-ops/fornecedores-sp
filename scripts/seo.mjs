// Geração do HTML público para mecanismos de busca (usado pelo build na Vercel).
// Funções puras: recebem dados já lidos do banco e devolvem texto HTML, XML ou JSON.
// Regra: só usa informações que existem nos dados. O que estiver vazio não aparece.
import { SITE, BANNERS, SUPABASE } from '../js/config.js';
import { SUPPLIER_TYPES } from '../js/data.js';
import { bannersMarkup, bannerPreloadLinks as preloadBanners } from '../js/banners.js';
import {
  planosMainHtml, guiasIndexMainHtml, guiaMainHtml, REGIAO_TEXTO, regiaoPrep,
  RESTRICTED_CATEGORY_SLUGS, ordenarCategorias, tituloHome, deveSerIndexado,
} from '../js/conteudo.js';

// Categorias restritas (RESTRICTED_CATEGORY_SLUGS, em js/conteudo.js) ficam fora do Google. Reexportado para os testes.
export { RESTRICTED_CATEGORY_SLUGS };

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
  <meta name="robots" content="${!noindex && deveSerIndexado(path) ? 'index, follow' : 'noindex, nofollow'}">
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
    <a href="/categorias">Categorias</a> <a href="/fornecedores">Fornecedores</a> <a href="/cadastro">Cadastre sua loja</a> <a href="/sobre">Sobre</a> <a href="/contato">Contato</a> <a href="/privacidade">Privacidade</a> <a href="/termos">Termos de uso</a>
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

// Cartão igual ao que o visitante vê no site: sem nome real, logo, WhatsApp nem Instagram.
// Assim a página pré-renderizada e o site ficam iguais, e nenhum nome ou @ aparece antes do carregamento.
// ctx.categoryName(id) e ctx.regionName(bairroSlug) devolvem os nomes para o cartão.
function visitorCardHtml(s, { categoryName = () => '', regionName = () => '' } = {}) {
  const region = s.bairro ? regionName(s.bairro) : '';
  const label = `Fornecedor${region ? ` em ${region}` : ' de atacado'}`;
  const location = [region, s.city || 'São Paulo'].filter(Boolean).join(' · ');
  const sales = [
    s.sale_wholesale && 'Atacado',
    s.sale_retail && 'Varejo',
    s.sale_resellers && 'Lojistas',
    s.ships_other_cities && 'Envio para outras cidades',
  ].filter(Boolean);
  return `<article class="supplier-card">
    <div class="supplier-card-top">
      <div class="logo-box" aria-hidden="true"><span class="logo-mask">SP</span></div>
      <div class="supplier-title">
        <h3><a href="/fornecedor/${esc(s.slug)}">${esc(label)}</a></h3>
        <div class="badges">
          ${s.verified ? `<span class="badge badge-verified">${ICON.check} Verificado</span>` : ''}
          <span class="badge">${esc(categoryName(s.category_id))}</span>
        </div>
      </div>
      <button class="fav-btn" type="button" aria-label="Salvar nos favoritos">${ICON.heart}</button>
    </div>
    <p class="supplier-location muted small">${ICON.pin} ${esc(location)}</p>
    <p class="supplier-desc">${esc(s.description || 'Descrição não informada.')}</p>
    <p class="supplier-sale small">${sales.map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</p>
    <p class="contact-line small">${ICON.wa} <span>WhatsApp para assinantes</span></p>
    <div class="supplier-actions">
      <a class="btn btn-secondary" href="/fornecedor/${esc(s.slug)}">Ver fornecedor</a>
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

export function homePage({ categories, regions, suppliers, featured }) {
  // Só categorias com fornecedores entram no título e nos atalhos (igual ao app).
  const nomesVisiveis = ordenarCategorias(categories).map((c) => c.name);
  const title = tituloHome(nomesVisiveis);
  const description = 'Encontre fornecedores de atacado em São Paulo, Brás e 25 de Março. Explore lojas de roupas, moda feminina, eletrônicos e muito mais.';
  const catLinks = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('');
  const regLinks = regions.map((r) => `<li><a href="/regiao/${esc(r.slug)}">${esc(r.name)}</a></li>`).join('');
  // Mesma ordem e mesmo texto da home do app (js/pages-public.js): hero, banners, categorias.
  // Assim a troca da versão pré-gerada para o app não mexe no topo da página (banner não pula nem muda).
  const main = `
  <section class="hero">
    <div class="container hero-inner">
      <p class="eyebrow">25 de Março · Brás · Pari · Bom Retiro</p>
      <h1>Encontre fornecedores de atacado em São Paulo</h1>
      <p class="lead">Compare lojas e distribuidores por categoria, subcategoria e bairro, e encontre o fornecedor certo para o seu negócio.</p>
      <form class="search-hero" role="search" action="/fornecedores" method="get">
        <label class="sr-only" for="hero-q">Buscar</label>
        <input id="hero-q" name="q" type="search" placeholder="Busque produtos, fornecedores ou categorias..." autocomplete="off">
        <button class="btn btn-primary" type="submit">Buscar</button>
      </form>
      <div class="chips" aria-label="Pesquisas populares">
        <span class="muted small">Populares:</span>
        ${['Eletrônicos', 'Moda feminina', 'Tênis', 'Acessórios', 'Perfumes'].filter((t) => nomesVisiveis.includes(t)).map((t) => `<a class="chip" href="/fornecedores?q=${encodeURIComponent(t)}&origem=popular">${esc(t)}</a>`).join('')}
      </div>
    </div>
  </section>
  ${staticBanners()}
  <section class="container section-tight">
    <h2>Categorias</h2>
    <ul class="plain-list two-col">${catLinks}</ul>
    <h2>Bairros e regiões</h2>
    <ul class="plain-list two-col">${regLinks}</ul>
    ${featured.length ? `<h2>Fornecedores em destaque</h2>${visitorGridHtml(featured, {
      categoryName: (id) => categories.find((c) => c.id === id)?.name || '',
      regionName: (slug) => regions.find((r) => r.slug === slug)?.name || '',
    })}` : ''}
  </section>`;
  return documentHtml({
    title, description, path: '/site', mainHtml: main, nav: staticHeader(), footer: staticFooter(),
    jsonld: [organizationJsonLd(), websiteJsonLd()],
  });
}

export function categoriesIndexPage({ categories, counts }) {
  const title = 'Categorias de fornecedores | Fornecedores Atacado SP';
  const description = 'Fornecedores por categoria em São Paulo: moda feminina, moda masculina, roupas infantis, eletrônicos, bolsas, perfumes e mais.';
  const items = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}"><strong>${esc(c.name)}</strong></a> <span class="muted small">${counts[c.id] || 0} fornecedores</span>${c.description ? `<br><span class="small">${esc(clean(c.description))}</span>` : ''}</li>`).join('');
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Categorias' }])}
    <h1>Categorias de fornecedores</h1>
    <p>Escolha uma categoria para ver os fornecedores aprovados de São Paulo.</p>
    <ul class="plain-list">${items}</ul>
  </section>`;
  return documentHtml({
    title, description, path: '/categorias', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }])],
  });
}

export function categoryPage({ category, suppliers, regionName }) {
  const restricted = RESTRICTED_CATEGORY_SLUGS.includes(category.slug);
  const noindex = restricted || suppliers.length === 0;
  const title = `Fornecedores de ${category.name} em São Paulo | Atacado`;
  const base = category.description ? clean(category.description) : `Fornecedores de ${category.name} em São Paulo.`;
  const description = truncate(`${base} Fornecedores de ${category.name} no atacado de São Paulo.`);
  const paragraphs = categorySeoText(category, suppliers, regionName);
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }, { label: category.name }])}
    <h1>Fornecedores de ${esc(category.name)} em São Paulo</h1>
    ${category.description ? `<p>${esc(clean(category.description))}</p>` : ''}
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>Fornecedores</h2>
    ${listingGateHtml(suppliers, { categoryName: () => category.name, regionName })}
  </section>`;
  return documentHtml({
    title, description, path: `/categorias/${category.slug}`, noindex, mainHtml: main,
    nav: staticNav(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }]),
    ],
  });
}

export function regionPage({ region, suppliers, categoryName }) {
  // Sem fornecedores de SP a página não é indexada (o texto fala de São Paulo).
  const noindex = suppliers.length === 0 || !isSpRegion(suppliers);
  const prep = regiaoPrep(region.name);
  const title = `Fornecedores ${prep} ${region.name} | São Paulo`;
  const description = truncate(`${region.name}, São Paulo: fornecedores de atacado aprovados no bairro. ${region.description ? clean(region.description) : ''}`);
  const paragraphs = regionSeoText(region, suppliers, categoryName);
  const own = REGIAO_TEXTO[region.slug];
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Mapa', path: '/mapa' }, { label: region.name }])}
    <h1>Fornecedores ${prep} ${esc(region.name)}, São Paulo</h1>
    ${own ? `<p>${esc(own)}</p>` : ''}
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>Fornecedores</h2>
    ${listingGateHtml(suppliers, { categoryName, regionName: () => region.name })}
  </section>`;
  return documentHtml({
    title, description, path: `/regiao/${region.slug}`, noindex, mainHtml: main,
    nav: staticNav(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Mapa', path: '/mapa' }, { label: region.name, path: `/regiao/${region.slug}` }]),
    ],
  });
}

export function suppliersIndexPage({ suppliers, regionName, categoryName }) {
  const title = 'Todos os fornecedores de São Paulo | Fornecedores Atacado SP';
  const description = 'Lista de fornecedores de atacado de São Paulo, com filtros por categoria, bairro, tipo de venda e WhatsApp.';
  const ctx = { categoryName: categoryName || (() => ''), regionName: regionName || (() => '') };
  const shown = [...suppliers].sort(byRelevance).slice(0, SITE.pageSize);
  // Mesmo layout da página de fornecedores do site (título, texto, filtros e cartões), para a troca ser imperceptível.
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Fornecedores' }])}
    <h1>Fornecedores</h1>
    <p class="lead">Pesquise por nome, produto, categoria ou localização. Use os filtros para refinar.</p>
    <div class="listing">
      <aside class="filters" aria-label="Filtros">
        <details class="filters-details"><summary class="filters-summary">Filtros</summary></details>
      </aside>
      <div class="listing-main">
        <div class="listing-toolbar">
          <p class="muted">${new Intl.NumberFormat('pt-BR').format(suppliers.length)} ${suppliers.length === 1 ? 'fornecedor encontrado' : 'fornecedores encontrados'}</p>
        </div>
        ${listingGateHtml(shown, ctx)}
      </div>
    </div>
  </section>`;
  return documentHtml({
    title, description, path: '/fornecedores', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Fornecedores', path: '/fornecedores' }])],
  });
}

export function supplierPage({ supplier: s, category, regionName, related }) {
  const place = regionName(s.bairro) || s.city || 'São Paulo';
  const title = `${s.name} | Fornecedor em ${place}`;
  const description = truncate(s.description || `${s.name}, fornecedor de ${category?.name || 'atacado'} em ${place}, São Paulo.`);
  const yesNo = (v) => (v ? 'Sim' : 'Não');
  const facts = [
    ['Tipo de fornecedor', typeLabel(s.supplier_type)],
    ['Bairro', regionName(s.bairro)],
    ['Cidade', [s.city, s.state].filter(Boolean).join(' - ')],
    ['Venda no atacado', yesNo(s.sale_wholesale)],
    ['Venda no varejo', yesNo(s.sale_retail)],
    ['Venda para lojistas', yesNo(s.sale_resellers)],
    ['Envio para outras cidades', yesNo(s.ships_other_cities)],
    ['Pedido mínimo', s.min_order],
    ['Horário de funcionamento', s.hours],
  ].filter(([, v]) => v);
  const photos = (s.supplier_photos || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((p) => p.url).filter(Boolean);
  const logo = s.logo_url || '';
  const image = logo || photos[0] || '';
  const tags = Array.isArray(s.tags) ? s.tags.filter(Boolean) : [];
  const main = `
  <article class="container supplier-profile">
    ${breadcrumbHtml([
      { label: 'Início', path: '/site' },
      ...(category ? [{ label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }] : []),
      { label: s.name },
    ])}
    <header>
      <p class="eyebrow">${esc(category?.name || '')}${s.subcategory ? ` · ${esc(s.subcategory)}` : ''}</p>
      <h1>${esc(s.name)}</h1>
      ${s.verified ? '<p class="badge">Fornecedor verificado</p>' : ''}
    </header>
    ${logo ? `<img src="${esc(logo)}" alt="Logo de ${esc(s.name)}" width="160" loading="lazy">` : ''}
    ${s.description ? `<p>${esc(clean(s.description))}</p>` : ''}
    <h2>Informações</h2>
    <dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${tags.length ? `<p class="small">Palavras-chave: ${esc(tags.join(', '))}</p>` : ''}
    ${photos.length ? `<h2>Fotos</h2><div class="photo-grid">${photos.map((u) => `<img src="${esc(u)}" alt="Foto de ${esc(s.name)}" loading="lazy">`).join('')}</div>` : ''}
    <p class="muted small">WhatsApp, Instagram e endereço completo ficam disponíveis para quem tem acesso aos contatos.</p>
    ${related.length ? `<h2>Outros fornecedores de ${esc(category?.name || '')}</h2>${visitorGridHtml(related, { categoryName: (id) => (id === category?.id ? category.name : ''), regionName })}` : ''}
  </article>`;
  // Fichas não são indexadas: a página continua acessível a quem tem o link, mas não aparece no Google.
  return documentHtml({
    title, description, path: `/fornecedor/${s.slug}`, noindex: true, mainHtml: main, nav: staticNav(), footer: staticFooter(),
    image, ogType: 'website',
    jsonld: [breadcrumbJsonLd([
      { label: 'Início', path: '/site' },
      ...(category ? [{ label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }] : []),
      { label: s.name, path: `/fornecedor/${s.slug}` },
    ])],
  });
}

// Mapa público: só bairros e quantidades. Os nomes dos fornecedores ficam fora (são protegidos).
export function mapPage({ regions, suppliersByRegion }) {
  const title = 'Mapa de fornecedores por bairro | Fornecedores Atacado SP';
  const description = 'Encontre fornecedores por bairro em São Paulo: 25 de Março, Brás, Pari, Bom Retiro e Santa Ifigênia.';
  const sections = regions.map((r) => {
    const n = (suppliersByRegion[r.slug] || []).length;
    const linha = n === 0 ? 'Nenhum fornecedor aprovado ainda.' : `${n} ${n === 1 ? 'fornecedor aprovado' : 'fornecedores aprovados'}.`;
    return `<h2><a href="/regiao/${esc(r.slug)}">${esc(r.name)}</a></h2><p class="muted small">${esc(linha)}</p>`;
  }).join('');
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Mapa' }])}
    <h1>Mapa de fornecedores por bairro</h1>
    ${sections}
  </section>`;
  return documentHtml({
    title, description, path: '/mapa', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Mapa', path: '/mapa' }])],
  });
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
  const title = 'Planos de acesso aos fornecedores | Fornecedores Atacado SP';
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

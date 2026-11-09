// Geração do HTML público para mecanismos de busca (usado pelo build na Vercel).
// Funções puras: recebem dados já lidos do banco e devolvem texto HTML, XML ou JSON.
// Regra: só usa informações que existem nos dados. O que estiver vazio não aparece.
import { SITE, BANNERS, SUPABASE } from '../js/config.js';
import { SUPPLIER_TYPES } from '../js/data.js';

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

// Imagem principal da home (banner): pré-carregada para aparecer logo.
function bannerPreloadLinks() {
  const b = BANNERS[0];
  if (!b) return '';
  const webp = (src) => src.replace(/\.(jpe?g|png)$/i, '.webp');
  return [
    b.mobileSrc ? `<link rel="preload" as="image" type="image/webp" href="${esc(webp(b.mobileSrc))}" media="(max-width: 820px)" fetchpriority="high">` : '',
    `<link rel="preload" as="image" type="image/webp" href="${esc(webp(b.src))}" media="(min-width: 821px)" fetchpriority="high">`,
  ].join('\n  ');
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
const DEFAULT_OG_IMAGE = absUrl('/img/og-banner.jpg');

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
  url: absUrl('/'),
  email: SITE.contactEmail,
  description: SITE.description,
});

export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: absUrl('/'),
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

export const itemListJsonLd = (name, suppliers) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name,
  numberOfItems: suppliers.length,
  itemListElement: suppliers.map((s, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: s.name,
    url: absUrl(`/fornecedor/${s.slug}`),
  })),
});

// ---------- Cabeçalho e documento ----------

// faviconLink vem do index.html, para manter o mesmo ícone em todas as páginas.
export function documentHtml({ title, description, path, noindex = false, jsonld = [], image = DEFAULT_OG_IMAGE, mainHtml = '', nav = '', footer = '', ogType = 'website' }) {
  const canonical = absUrl(path);
  const jsonScripts = jsonld
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`)
    .join('\n  ');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
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
  ${path === '/' ? bannerPreloadLinks() : ''}
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
      <a class="brand" href="/" aria-label="${esc(SITE.name)} - início">
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

// Faixa de banners igual à do site (mesmo markup de js/pages-public.js).
export function staticBanners() {
  if (!BANNERS.length) return '';
  const webp = (src) => src.replace(/\.(jpe?g|png)$/i, '.webp');
  return `
    <section class="banner-section" aria-label="Destaques">
      <div class="banner-track">
        ${BANNERS.map((b, i) => {
          const sources = [
            b.mobileSrc ? `<source media="(max-width: 820px)" type="image/webp" srcset="${esc(webp(b.mobileSrc))}">` : '',
            b.mobileSrc ? `<source media="(max-width: 820px)" srcset="${esc(b.mobileSrc)}">` : '',
            `<source type="image/webp" srcset="${esc(webp(b.src))}">`,
          ].join('');
          const img = `<picture>${sources}<img src="${esc(b.src)}" alt="${esc(b.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
          return `<div class="banner-slide">${b.href ? `<a href="${esc(b.href)}">${img}</a>` : img}</div>`;
        }).join('')}
      </div>
    </section>`;
}

export function staticNav() {
  return `<nav class="main-nav" aria-label="Principal">
  <a href="/">Início</a> <a href="/categorias">Categorias</a> <a href="/fornecedores">Fornecedores</a> <a href="/mapa">Mapa</a> <a href="/sobre">Como funciona</a> <a href="/cadastro">Cadastrar fornecedor</a>
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

function supplierListHtml(suppliers, regionName) {
  if (!suppliers.length) return '<p>Ainda não há fornecedores aprovados nesta lista.</p>';
  return `<ul class="plain-list supplier-list">${suppliers
    .map((s) => {
      const meta = [typeLabel(s.supplier_type), regionName ? regionName(s.bairro) : ''].filter(Boolean).join(' · ');
      return `<li><a href="/fornecedor/${esc(s.slug)}"><strong>${esc(s.name)}</strong></a>${meta ? `<br><span class="muted small">${esc(meta)}</span>` : ''}${s.description ? `<p class="small">${esc(truncate(s.description, 160))}</p>` : ''}</li>`;
    })
    .join('')}</ul>`;
}

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
  const n = suppliers.length;
  const title = 'Fornecedores Atacado SP | Brás, Moda, Tênis e Eletrônicos';
  const description = 'Encontre fornecedores de atacado em São Paulo, Brás e 25 de Março. Explore lojas de roupas, moda feminina, tênis, eletrônicos e muito mais.';
  const catLinks = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('');
  const regLinks = regions.map((r) => `<li><a href="/regiao/${esc(r.slug)}">${esc(r.name)}</a></li>`).join('');
  // Mesma ordem da home do site: banners, destaque (hero), categorias, bairros e destaques.
  const main = `
  ${staticBanners()}
  <section class="hero">
    <div class="container hero-inner">
      <p class="eyebrow">25 de Março · Brás · Pari · Bom Retiro</p>
      <h1>Os melhores fornecedores de São Paulo em um só lugar.</h1>
      <p class="lead">Descubra lojas, distribuidores e fornecedores para comprar no atacado e abastecer seu negócio.</p>
      <p class="muted small">Fornecedores de atacado em São Paulo. ${n ? `Reunimos ${n} fornecedores aprovados em ${categories.length} categorias,` : 'Reunimos fornecedores de atacado de São Paulo,'} com destaque para o Brás, a 25 de Março e outros polos comerciais da cidade.</p>
      <p><a class="btn btn-primary" href="/fornecedores">Ver todos os fornecedores</a> <a class="btn btn-secondary" href="/categorias">Ver categorias</a></p>
    </div>
  </section>
  <section class="container section-tight">
    <h2>Categorias</h2>
    <ul class="plain-list two-col">${catLinks}</ul>
    <h2>Bairros e regiões</h2>
    <ul class="plain-list two-col">${regLinks}</ul>
    ${featured.length ? `<h2>Fornecedores em destaque</h2>${supplierListHtml(featured, (b) => regions.find((r) => r.slug === b)?.name)}` : ''}
  </section>`;
  return documentHtml({
    title, description, path: '/', mainHtml: main, nav: staticHeader(), footer: staticFooter(),
    jsonld: [organizationJsonLd(), websiteJsonLd()],
  });
}

export function categoriesIndexPage({ categories, counts }) {
  const title = 'Categorias de fornecedores | Fornecedores Atacado SP';
  const description = 'Fornecedores por categoria em São Paulo: moda feminina, moda masculina, roupas infantis, tênis, eletrônicos, bolsas, perfumes e mais.';
  const items = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}"><strong>${esc(c.name)}</strong></a> <span class="muted small">${counts[c.id] || 0} fornecedores</span>${c.description ? `<br><span class="small">${esc(clean(c.description))}</span>` : ''}</li>`).join('');
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Categorias' }])}
    <h1>Categorias de fornecedores</h1>
    <p>Escolha uma categoria para ver os fornecedores aprovados de São Paulo.</p>
    <ul class="plain-list">${items}</ul>
  </section>`;
  return documentHtml({
    title, description, path: '/categorias', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: 'Categorias', path: '/categorias' }])],
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
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Categorias', path: '/categorias' }, { label: category.name }])}
    <h1>Fornecedores de ${esc(category.name)} em São Paulo</h1>
    ${category.description ? `<p>${esc(clean(category.description))}</p>` : ''}
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>Fornecedores</h2>
    ${supplierListHtml(suppliers, regionName)}
  </section>`;
  return documentHtml({
    title, description, path: `/categorias/${category.slug}`, noindex, mainHtml: main,
    nav: staticNav(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }]),
      ...(suppliers.length ? [itemListJsonLd(`Fornecedores de ${category.name}`, suppliers)] : []),
    ],
  });
}

export function regionPage({ region, suppliers, categoryName }) {
  const noindex = suppliers.length === 0;
  const title = `Fornecedores no ${region.name} | São Paulo`;
  const description = truncate(`${region.name}, São Paulo: fornecedores de atacado aprovados no bairro. ${region.description ? clean(region.description) : ''}`);
  const paragraphs = regionSeoText(region, suppliers, categoryName);
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Mapa', path: '/mapa' }, { label: region.name }])}
    <h1>Fornecedores no ${esc(region.name)}, São Paulo</h1>
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>Fornecedores</h2>
    ${supplierListHtml(suppliers, () => region.name)}
  </section>`;
  return documentHtml({
    title, description, path: `/regiao/${region.slug}`, noindex, mainHtml: main,
    nav: staticNav(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: 'Mapa', path: '/mapa' }, { label: region.name, path: `/regiao/${region.slug}` }]),
      ...(suppliers.length ? [itemListJsonLd(`Fornecedores no ${region.name}`, suppliers)] : []),
    ],
  });
}

export function suppliersIndexPage({ suppliers, regionName }) {
  const title = 'Todos os fornecedores de São Paulo | Fornecedores Atacado SP';
  const description = 'Lista de fornecedores de atacado de São Paulo, com filtros por categoria, bairro, tipo de venda e WhatsApp.';
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Fornecedores' }])}
    <h1>Todos os fornecedores</h1>
    <p>${suppliers.length} fornecedores aprovados.</p>
    ${supplierListHtml(suppliers, regionName)}
  </section>`;
  return documentHtml({
    title, description, path: '/fornecedores', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: 'Fornecedores', path: '/fornecedores' }]), itemListJsonLd('Fornecedores de São Paulo', suppliers)],
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
      { label: 'Início', path: '/' },
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
    ${related.length ? `<h2>Outros fornecedores de ${esc(category?.name || '')}</h2>${supplierListHtml(related, regionName)}` : ''}
  </article>`;
  return documentHtml({
    title, description, path: `/fornecedor/${s.slug}`, mainHtml: main, nav: staticNav(), footer: staticFooter(),
    image, ogType: 'website',
    jsonld: [breadcrumbJsonLd([
      { label: 'Início', path: '/' },
      ...(category ? [{ label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }] : []),
      { label: s.name, path: `/fornecedor/${s.slug}` },
    ])],
  });
}

export function mapPage({ regions, suppliersByRegion }) {
  const title = 'Mapa de fornecedores por bairro | Fornecedores Atacado SP';
  const description = 'Encontre fornecedores por bairro em São Paulo: 25 de Março, Brás, Pari, Bom Retiro e Santa Ifigênia.';
  const sections = regions.map((r) => {
    const list = suppliersByRegion[r.slug] || [];
    return `<h2><a href="/regiao/${esc(r.slug)}">${esc(r.name)}</a></h2>${list.length ? `<ul class="plain-list">${list.map((s) => `<li><a href="/fornecedor/${esc(s.slug)}">${esc(s.name)}</a></li>`).join('')}</ul>` : '<p class="muted small">Nenhum fornecedor aprovado ainda.</p>'}`;
  }).join('');
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: 'Mapa' }])}
    <h1>Mapa de fornecedores por bairro</h1>
    ${sections}
  </section>`;
  return documentHtml({
    title, description, path: '/mapa', mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: 'Mapa', path: '/mapa' }])],
  });
}

// Páginas institucionais: título, descrição e título na página. O conteúdo completo é carregado pelo app.
export function staticInfoPage({ path, title, description, h1, noindex = false }) {
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/' }, { label: h1 }])}
    <h1>${esc(h1)}</h1>
    <p>${esc(description)}</p>
  </section>`;
  return documentHtml({
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex, mainHtml: main, nav: staticNav(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/' }, { label: h1, path }])],
  });
}

// Páginas que dependem de login ou só fazem sentido para o usuário logado: nunca indexadas.
export function noindexShell({ path, title, description = 'Área restrita do Fornecedores Atacado SP.' }) {
  return documentHtml({
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex: true,
    mainHtml: '<section class="container section-tight"><h1>Carregando…</h1></section>', nav: '', footer: '',
  });
}

export function notFoundPage() {
  return documentHtml({
    title: 'Página não encontrada | Fornecedores Atacado SP',
    description: 'Página não encontrada.',
    path: '/404.html',
    noindex: true,
    mainHtml: `<section class="container section-tight"><h1>Página não encontrada</h1><p>O endereço pode estar errado ou a página foi removida.</p><p><a class="btn btn-primary" href="/">Voltar ao início</a></p></section>`,
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

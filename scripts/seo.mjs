// Geração do HTML público para mecanismos de busca (usado pelo build na Vercel).
// Funções puras: recebem dados já lidos do banco e devolvem texto HTML, XML ou JSON.
//
// Regra do catálogo fechado (decisões D1 a D4): o HTML estático NÃO contém fornecedores, fotos,
// contatos, endereços, contagens por categoria ou região, nem fichas individuais. O build só usa
// nomes de categorias e bairros (públicos) e páginas institucionais. O catálogo é entregue pelo app,
// depois do login e da verificação de assinatura, pelo banco.
import { SITE, BANNERS, SUPABASE } from '../js/config.js';
import { bannersMarkup, bannerPreloadLinks as preloadBanners } from '../js/banners.js';
import { planosMainHtml, guiasIndexMainHtml, guiaMainHtml, REGIAO_TEXTO, regiaoPrep } from '../js/conteudo.js';
import { headerHtml, footerHtml, icon as svgIcon, iconeDaCategoria } from '../js/visual.js';
const svgSeta = () => svgIcon('arrow', 16);

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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@600;700;800&display=swap">
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

// ---------- Dados estruturados (schema.org) ----------

export const organizationJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: absUrl('/site'),
  email: SITE.contactEmail,
  description: SITE.description,
});

// Sem SearchAction: a busca de fornecedores fica atrás do login e da assinatura, não há URL pública para indexar.
export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: absUrl('/site'),
  inLanguage: 'pt-BR',
  description: SITE.description,
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
  return headerHtml({ session: null, route: '', pularConteudo: false });
}

export function staticBanners() {
  return bannersMarkup(BANNERS, esc);
}

export function staticNav() {
  return staticHeader();
}

export function staticFooter() {
  return footerHtml();
}

function breadcrumbHtml(items) {
  return `<nav class="breadcrumbs" aria-label="Você está em"><ol>${items
    .map((it) => (it.path ? `<li><a href="${esc(it.path)}">${esc(it.label)}</a></li>` : `<li aria-current="page">${esc(it.label)}</li>`))
    .join('')}</ol></nav>`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// ---------- Páginas ----------

// Home pré-gerada: textos e links para categorias e bairros (só nomes). Sem fornecedores, sem destaques.
export function homePage({ categories, regions }) {
  const title = 'Fornecedores Atacado SP | Brás, Moda, Tênis e Eletrônicos';
  const description = 'Encontre fornecedores de atacado em São Paulo, Brás e 25 de Março. Explore lojas de roupas, moda feminina, tênis, eletrônicos e muito mais.';
  const catLinks = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('');
  const regLinks = regions.map((r) => `<li><a href="/regiao/${esc(r.slug)}">${esc(r.name)}</a></li>`).join('');
  // Mesma ordem e mesmo texto da home do app (js/pages-public.js): hero, banners, categorias.
  // Assim a troca da versão pré-gerada para o app não mexe no topo da página (banner não pula nem muda).
  const mosaico = categories.slice(0, 6).map((c) => `<a class="mosaic-tile" href="/categorias/${esc(c.slug)}"><span class="mosaic-ico" aria-hidden="true">${iconeDaCategoria(c.slug, 20)}</span><strong>${esc(c.name)}</strong><span class="mosaic-go" aria-hidden="true">${svgSeta()}</span></a>`).join('');
  // Mesma ordem e mesmo texto da home do app (js/pages-public.js): hero, banners, categorias.
  // Assim a troca da versão pré-gerada para o app não mexe no topo da página (banner não pula nem muda).
  const main = `
  <section class="hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow-pill"><span class="dot" aria-hidden="true"></span>Atacado em São Paulo · 25 de Março, Brás, Pari e Bom Retiro</p>
        <h1>Encontre fornecedores de atacado em São Paulo</h1>
        <p class="lead">Compare lojas e distribuidores por categoria, subcategoria e bairro. Veja tipo de venda e pedido mínimo antes de falar com cada um.</p>
        <div class="hero-actions">
          <a class="btn btn-ghost-light btn-lg" href="/categorias">Explorar categorias</a>
          <a class="btn btn-primary btn-lg" href="/planos">Ver planos de acesso</a>
        </div>
        <p class="small muted">O catálogo de fornecedores é exclusivo para assinantes.</p>
      </div>
      <aside class="hero-visual" aria-label="Categorias em destaque">
        <div class="hero-mosaic">${mosaico}</div>
      </aside>
    </div>
  </section>
  <section class="container banner-block">${staticBanners()}</section>
  <section class="section-tight container">
    <h2>Categorias</h2>
    <ul class="plain-list two-col">${catLinks}</ul>
    <h2>Bairros e regiões</h2>
    <ul class="plain-list two-col">${regLinks}</ul>
  </section>`;
  return documentHtml({
    title, description, path: '/site', mainHtml: main, nav: staticHeader(), footer: staticFooter(),
    jsonld: [organizationJsonLd(), websiteJsonLd()],
  });
}

// Lista de categorias: só o nome e a descrição da categoria. Sem contagem (decisão D2).
// Fica fora do Google (noindex): sem fornecedores, a página seria pobre em conteúdo.
export function categoriesIndexPage({ categories }) {
  const title = 'Categorias de fornecedores | Fornecedores Atacado SP';
  const description = 'Categorias de fornecedores de atacado em São Paulo. O catálogo é exclusivo para assinantes.';
  const items = categories.map((c) => `<li><a href="/categorias/${esc(c.slug)}"><strong>${esc(c.name)}</strong></a>${c.description ? `<br><span class="small">${esc(clean(c.description))}</span>` : ''}</li>`).join('');
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Categorias' }])}
    <h1>Categorias de fornecedores</h1>
    <p>O catálogo de fornecedores é exclusivo para assinantes. <a href="/planos">Conheça os planos</a>.</p>
    <ul class="plain-list">${items}</ul>
  </section>`;
  return documentHtml({
    title, description, path: '/categorias', noindex: true, mainHtml: main, nav: staticHeader(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }])],
  });
}

// Página de categoria: nome e descrição. Sem fornecedores, fotos, contagens nem texto sobre eles.
// Fora do Google (noindex), como a lista do catálogo.
export function categoryPage({ category }) {
  const title = `Fornecedores de ${category.name} | Catálogo para assinantes`;
  const base = category.description ? clean(category.description) : `Fornecedores de ${category.name}.`;
  const description = truncate(`${base} O catálogo de fornecedores é exclusivo para assinantes.`);
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }, { label: category.name }])}
    <h1>Fornecedores de ${esc(category.name)}</h1>
    ${category.description ? `<p>${esc(clean(category.description))}</p>` : ''}
    <p>Os fornecedores desta categoria aparecem para assinantes. <a href="/planos">Conheça os planos</a>.</p>
  </section>`;
  return documentHtml({
    title, description, path: `/categorias/${category.slug}`, noindex: true, mainHtml: main,
    nav: staticHeader(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Categorias', path: '/categorias' }, { label: category.name, path: `/categorias/${category.slug}` }]),
    ],
  });
}

// Página de bairro: nome e descrição. Sem fornecedores nem contagens. Fora do Google (noindex).
export function regionPage({ region }) {
  const prep = regiaoPrep(region.name);
  const title = `Fornecedores ${prep} ${region.name} | Catálogo para assinantes`;
  const description = truncate(`${region.name}, São Paulo. ${region.description ? clean(region.description) : ''} O catálogo é exclusivo para assinantes.`);
  const own = REGIAO_TEXTO[region.slug];
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: 'Mapa', path: '/mapa' }, { label: region.name }])}
    <h1>Fornecedores ${prep} ${esc(region.name)}, São Paulo</h1>
    ${own ? `<p>${esc(own)}</p>` : (region.description ? `<p>${esc(clean(region.description))}</p>` : '')}
    <p>Os fornecedores deste bairro aparecem para assinantes. <a href="/planos">Conheça os planos</a>.</p>
  </section>`;
  return documentHtml({
    title, description, path: `/regiao/${region.slug}`, noindex: true, mainHtml: main, nav: staticHeader(), footer: staticFooter(),
    jsonld: [
      breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Mapa', path: '/mapa' }, { label: region.name, path: `/regiao/${region.slug}` }]),
    ],
  });
}

// Lista de fornecedores e mapa: só a apresentação do catálogo, sem nenhum dado. Fora do Google (noindex).
export function catalogShellPage({ path, title, h1, description }) {
  const main = `
  <section class="container section-tight">
    ${breadcrumbHtml([{ label: 'Início', path: '/site' }, { label: h1 }])}
    <h1>${esc(h1)}</h1>
    <p>O catálogo de fornecedores é exclusivo para assinantes. <a href="/planos">Conheça os planos</a>.</p>
  </section>`;
  return documentHtml({
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex: true, mainHtml: main,
    nav: staticHeader(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: h1, path }])],
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
    title: `${title} | Fornecedores Atacado SP`, description, path, noindex, mainHtml: main, nav: staticHeader(), footer: staticFooter(),
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
  const title = 'Planos de acesso ao catálogo | Fornecedores Atacado SP';
  const description = 'Conheça os planos do Fornecedores Atacado SP e tenha acesso ao catálogo de fornecedores de São Paulo, com contatos e endereços.';
  return documentHtml({
    title, description, path: '/planos', mainHtml: planosMainHtml(), nav: staticHeader(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Planos', path: '/planos' }])],
  });
}

export function guiasIndexPage() {
  const title = 'Guias de fornecedores e atacado em São Paulo | Fornecedores Atacado SP';
  const description = 'Guias práticos para encontrar fornecedores de atacado em São Paulo, comprar roupas no atacado e escolher fornecedores para revenda.';
  return documentHtml({
    title, description, path: '/guias', mainHtml: guiasIndexMainHtml(), nav: staticHeader(), footer: staticFooter(),
    jsonld: [breadcrumbJsonLd([{ label: 'Início', path: '/site' }, { label: 'Guias', path: '/guias' }])],
  });
}

export function guiaPage(g) {
  const path = `/guias/${g.slug}`;
  return documentHtml({
    title: g.title, description: truncate(g.description), path, mainHtml: guiaMainHtml(g), nav: staticHeader(), footer: staticFooter(),
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
    nav: staticHeader(), footer: staticFooter(),
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

// Não bloqueamos as rotas do catálogo aqui: o Google precisa rastrear a página para ver o "noindex"
// (se já estiverem indexadas, a remoção depende disso). Só áreas privadas ficam fora do rastreamento.
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

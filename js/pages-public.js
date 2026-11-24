// Páginas públicas. Cada página exporta uma função (params, query) => { title, description, html, mount? }.
import { SITE } from './config.js';
import { api } from './api.js';
import { CATEGORIES, REGIONS, SUPPLIER_TYPES } from './data.js';
import { store } from './store.js';
import { go } from './nav.js';
import { canSeeCatalog } from './access.js';
import { filterSuppliers, sortSuppliers, paginate, rankCategoriesByAccess } from './search.js';
import { escapeHtml as e, formatCount, mapsLink, whatsappTarget, instagramHandle, normalizeUrl, formatPhone, maskPhone, maskHandle } from './utils.js';
import {
  icon, categoryCard, supplierCard, pagination, emptyState, breadcrumbs, skeletonCards, demoBanner,
  saleLabels, supplierMapLinks, toast, photosCarousel,
} from './ui.js';
import { planosMainHtml, guiasIndexMainHtml, guiaMainHtml, guiaPorSlug, REGIAO_TEXTO, regiaoPrep } from './conteudo.js';
import { icon as svg, iconeDaCategoria } from './visual.js';
import { validaContato, erroDeContato, LIMITES_CONTATO } from './contato.js';
import { avisoDoRetorno } from './pagamento.js';
import { rastreamentoNesteSite } from './rastreamento.js';

// Planos, índice de guias e guias: o mesmo conteúdo que o build gera em HTML (js/conteudo.js).
export function plansPage(query) {
  // Volta do checkout sem aprovação (?pagamento=recusado): avisa antes dos planos.
  const aviso = avisoDoRetorno(query?.get('pagamento') === 'recusado' ? 'recusado' : '');
  return {
    title: 'Planos de acesso aos contatos | Fornecedores de SP',
    description: 'Conheça os planos do Fornecedores de SP e tenha acesso ao WhatsApp, Instagram e endereço dos fornecedores de São Paulo.',
    html: (aviso ? `<div class="container"><div class="notice notice-warn" role="alert"><span><strong>${e(aviso.titulo)}.</strong> ${e(aviso.texto)}</span></div></div>` : '') + planosMainHtml(),
  };
}

export function guidesIndexPage() {
  return {
    title: 'Guias de fornecedores e atacado em São Paulo | Fornecedores de SP',
    description: 'Guias práticos para encontrar fornecedores de atacado em São Paulo, comprar roupas no atacado e escolher fornecedores para revenda.',
    html: guiasIndexMainHtml(),
  };
}

export function guidePage({ slug }) {
  const g = guiaPorSlug(slug);
  if (!g) return notFound();
  return { title: g.title, description: g.description, html: guiaMainHtml(g) };
}

// Nomes lidos do store na hora (inclui categorias criadas pelo admin ou importadas).
const CAT_FALLBACK = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.name]));
const catName = new Proxy({}, { get: (_t, slug) => store.categories.get(String(slug))?.name || CAT_FALLBACK[slug] });
// Nomes lidos do store na hora (inclui bairros e cidades criados pelo admin).
const REG_FALLBACK = Object.fromEntries(REGIONS.map((r) => [r.slug, r.name]));
const regName = new Proxy({}, { get: (_t, slug) => store.regions.get(String(slug))?.name || REG_FALLBACK[slug] });
const ctx = { categoryNames: catName, regionNames: regName };

function allCategories() {
  return store.categories.list({ includeInactive: false })
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

function countByCategory() {
  const counts = {};
  for (const s of store.suppliers.approved()) counts[s.category] = (counts[s.category] || 0) + 1;
  return counts;
}

// Catálogo fechado: sem assinatura ativa a página não mostra fornecedores, fotos nem contagens
// (decisões D1 e D2). Mostra só o convite aos planos.
function catalogGate({ title, description, crumbs, heading, intro = '' }) {
  return {
    title,
    description,
    html: `
    ${breadcrumbs(crumbs)}
    <section class="container section-tight">
      <h1>${e(heading)}</h1>
      ${intro ? `<p class="lead">${e(intro)}</p>` : ''}
      <div class="card blur-banner">
        <p><strong>O catálogo de fornecedores é exclusivo para assinantes.</strong></p>
        <p class="small muted">Com a assinatura ativa você vê fornecedores, fotos, WhatsApp, Instagram e endereços. O pagamento é feito por Pix ou cartão.</p>
        <a class="btn btn-primary" href="/planos">Ver planos de acesso</a>
      </div>
    </section>`,
  };
}

// Categorias da home: com assinatura, só as que têm fornecedores (com contagem); sem, todas, só com nome.
function categoriasDaHome(counts) {
  if (canSeeCatalog()) {
    return allCategories().filter((c) => (counts[c.slug] || 0) > 0).slice(0, 9).map((c) => categoryCard(c, counts[c.slug] || 0)).join('');
  }
  return allCategories().slice(0, 9).map((c) => categoryCard(c, null)).join('');
}

// Mantém o botão de favorito sincronizado em toda a página.
function wireFavorites(root, { aoRemover } = {}) {
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action="fav"]');
    if (!btn) return;
    const on = store.favorites.toggle(btn.dataset.id);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Remover dos favoritos' : 'Salvar nos favoritos');
    toast(on ? 'Fornecedor salvo nos favoritos.' : 'Removido dos favoritos.');
    if (!on) aoRemover?.();
  });
}

// ---------- Início ----------
// Borrão para quem não tem assinatura: o conteúdo fica embaçado e um aviso leva aos planos.
// Visual apenas; a proteção real dos contatos fica no banco (RLS).
function blurGate(html) {
  if (canSeeCatalog()) return html;
  return `<div class="blur-gate">
    <div class="card blur-banner">
      <p><strong>Assine para ver os contatos dos fornecedores</strong></p>
      <p class="small muted">WhatsApp, Instagram e endereço completos são liberados após o pagamento por Pix ou cartão.</p>
      <button class="btn btn-primary" type="button" data-action="unlock">Ver planos de acesso</button>
    </div>
    <div class="blur-content" aria-hidden="true">${html}</div>
  </div>`;
}

// Logos dos destaques para visitantes. O banco libera a leitura só dos logos de fornecedores em destaque
// e aprovados (migração 017); fotos e logos dos demais continuam restritos a assinantes.
function carregaLogosDosDestaques(box, linhas) {
  api.signImageUrls(linhas.map((s) => s.logo_url)).then((assinadas) => {
    for (const s of linhas) {
      const url = assinadas.get(s.logo_url);
      const alvo = [...box.querySelectorAll('[data-logo-destaque]')].find((el) => el.dataset.logoDestaque === String(s.id));
      if (!url || !alvo) continue;
      const img = new Image(56, 56);
      img.alt = '';
      img.decoding = 'async';
      img.onload = () => alvo.replaceChildren(img);
      img.src = url;
    }
  }).catch(() => {});
}

// Card de destaque para visitantes: só dados públicos (migração 014). Sem WhatsApp, Instagram nem endereço.
function cardDestaquePublico(s, nomeCategoria) {
  // O card nasce com a inicial do nome. O logo entra depois, por link assinado (o depósito de imagens é privado),
  // e só troca a inicial quando a imagem carrega de fato: sem logo ou com falha, a inicial fica.
  const logo = `<span class="dp-inicial" aria-hidden="true">${e((s.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
  const tags = (s.tags || []).slice(0, 3).map((x) => `<span class="dp-tag">${e(x)}</span>`).join('');
  const meta = [nomeCategoria, regName[s.bairro] || s.city].filter(Boolean).map((x) => e(x)).join(' · ');
  return `<article class="dp-card">
    <div class="dp-head">
      <span class="dp-logo" data-logo-destaque="${e(s.id)}">${logo}</span>
      <div class="dp-title">
        <strong>${e(s.name)}</strong>
        ${s.verified ? '<span class="dp-verif">Verificado</span>' : ''}
        <span class="dp-meta">${meta}</span>
      </div>
    </div>
    ${s.description ? `<p class="dp-desc">${e(s.description)}</p>` : ''}
    ${tags ? `<div class="dp-tags">${tags}</div>` : ''}
    <a class="btn btn-ghost btn-sm dp-ficha" href="/fornecedor/${e(s.slug)}">Ver fornecedor ${svg('arrow', 16)}</a>
  </article>`;
}

export function home() {
  const counts = countByCategory();
  const featured = store.suppliers.approved().filter((s) => s.featured);
  const blurred = !canSeeCatalog();
  const popular = ['Eletrônicos', 'Moda feminina', 'Tênis', 'Acessórios', 'Perfumes'];
  return {
    title: 'Fornecedores de SP | Brás, Moda, Tênis e Eletrônicos',
    description: 'Encontre fornecedores de atacado em São Paulo, Brás e 25 de Março. Explore lojas de roupas, moda feminina, tênis, eletrônicos e muito mais.',
    html: `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="eyebrow-pill"><span class="dot" aria-hidden="true"></span>Atacado em São Paulo · 25 de Março, Brás, Pari e Bom Retiro</p>
          <h1>Encontre fornecedores para o seu negócio.</h1>
          <p class="lead">Descubra lojas e distribuidores de atacado nos principais polos comerciais de São Paulo.</p>
          <form class="search-hero" role="search" data-search-form data-target="/fornecedores">
            <label class="sr-only" for="hero-q">Buscar</label>
            <span class="search-icon" aria-hidden="true">${icon.search}</span>
            <input id="hero-q" name="q" type="search" placeholder="Busque produto, fornecedor ou categoria" autocomplete="off">
            <button class="btn btn-primary" type="submit">Buscar ${svg('arrow', 16)}</button>
          </form>
          <div class="hero-tools">
            <div class="chips" aria-label="Pesquisas populares" data-populares>
              <span class="muted small">Populares:</span>
              ${popular.map(chipPopular).join('')}
            </div>
          </div>
          <div class="hero-actions">
            <a class="btn btn-ghost-light btn-lg" href="/categorias">Explorar categorias</a>
            ${blurred
              ? '<a class="btn btn-primary btn-lg" href="/planos">Ver planos de acesso</a>'
              : '<a class="btn btn-primary btn-lg" href="/fornecedores">Ver todos os fornecedores</a>'}
          </div>
        </div>
        <aside class="hero-visual" aria-label="Categorias em destaque">
          <p class="hero-note">${icon.lock}<span>Contatos, WhatsApp e endereços completos são exclusivos para assinantes.</span></p>
        </aside>
      </div>
    </section>

    <section class="section container" id="categorias">
      <div class="section-head">
        <div><p class="eyebrow">Segmentos</p><h2>Categorias de fornecedores</h2><p class="muted">Escolha um segmento e veja quem vende nele.</p></div>
        <a href="/categorias" class="link-arrow">Ver todas as categorias ${svg('arrow', 16)}</a>
      </div>
      <div class="grid grid-categories">
        ${topCategoryCard()}
        ${categoriasDaHome(counts)}
      </div>
    </section>

    ${featured.length || blurred ? `
    <section class="section container">
      <div class="section-head"><div><p class="eyebrow">Seleção da equipe</p><h2>Fornecedores em destaque</h2><p class="muted">Escolhidos pela equipe do portal.</p></div></div>
      ${blurred ? `<div class="carousel-wrap featured-wrap" data-carousel>
        <button class="carousel-arrow carousel-prev" type="button" data-carousel-prev aria-label="Anterior" hidden>&#8249;</button>
        <div class="carousel-track featured-track" data-destaques-publicos></div>
        <button class="carousel-arrow carousel-next" type="button" data-carousel-next aria-label="Próximo" hidden>&#8250;</button>
      </div>
      <p class="small muted">Contatos completos, WhatsApp e endereço são liberados para assinantes. <button class="btn btn-ghost btn-sm" type="button" data-action="unlock">Ver planos de acesso</button></p>` : `
      <div class="carousel-wrap featured-wrap" data-carousel>
        ${featured.length > 1 ? '<button class="carousel-arrow carousel-prev" type="button" data-carousel-prev aria-label="Anterior">&#8249;</button>' : ''}
        <div class="carousel-track featured-track">${featured.map((s) => `<div class="featured-item">${supplierCard(s, {
          categoryName: catName[s.category], regionName: regName[s.bairro], favorite: store.favorites.has(s.id),
        })}</div>`).join('')}</div>
        ${featured.length > 1 ? '<button class="carousel-arrow carousel-next" type="button" data-carousel-next aria-label="Próximo">&#8250;</button>' : ''}
      </div>`}
    </section>` : ''}

    <section class="section container" id="como-funciona-resumo">
      <div class="section-head"><div><p class="eyebrow">Como funciona</p><h2>Do primeiro contato à negociação</h2></div></div>
      <div class="steps">
        <div><span class="step-n">01</span><span class="step-ico" aria-hidden="true">${icon.search}</span><h3>Pesquise</h3><p class="muted">Por produto, fornecedor, categoria ou bairro.</p></div>
        <div><span class="step-n">02</span><span class="step-ico" aria-hidden="true">${svg('filter', 22)}</span><h3>Compare</h3><p class="muted">Veja tipo de venda, atacado, varejo e pedido mínimo.</p></div>
        <div><span class="step-n">03</span><span class="step-ico" aria-hidden="true">${icon.wa}</span><h3>Fale com o fornecedor</h3><p class="muted">Com o acesso de assinante, o WhatsApp e o endereço de cada fornecedor ficam liberados.</p></div>
      </div>
    </section>

    <section class="container">
      <div class="unlock-band">
        <div>
          <h2>Quer o WhatsApp e o endereço de cada fornecedor?</h2>
          <p class="muted">Os contatos completos ficam disponíveis para assinantes. Veja os planos e libere o acesso.</p>
        </div>
        <button class="btn btn-primary btn-lg" type="button" data-action="unlock">Ver planos de acesso</button>
      </div>
    </section>

    <section class="cta-band container">
      <div>
        <h2>Tem uma loja ou distribuidora?</h2>
        <p class="muted">Cadastre seu negócio e seja encontrado por compradores de todo o Brasil. Os cadastros passam por aprovação.</p>
      </div>
      <a class="btn btn-primary btn-lg" href="/cadastro">Cadastrar fornecedor ${svg('arrow', 18)}</a>
    </section>`,
    mount: (root) => {
      root.querySelectorAll('[data-search-form]').forEach((f) => wireSearchForm(f));
      if (blurred) {
        const box = root.querySelector('[data-destaques-publicos]');
        if (box) {
          api.loadFeaturedPublic().then((linhas) => {
            if (!linhas.length) { box.closest('section')?.remove(); return; }
            const categorias = store.categories.list();
            box.innerHTML = linhas.map((s) => `<div class="featured-item dp-item">${cardDestaquePublico(s, categorias.find((c) => c.id === s.category_id)?.name || '')}</div>`).join('');
            box.closest('[data-carousel]').querySelectorAll('[data-carousel-prev], [data-carousel-next]').forEach((b) => { b.hidden = linhas.length < 2; });
            carregaLogosDosDestaques(box, linhas);
          }).catch(() => box.closest('section')?.remove());
        }
      }
      wireFavorites(root);
      // Troca a lista inicial pelas buscas mais feitas no site, quando houver buscas suficientes.
      // O banco só libera essa lista para quem está logado: visitante fica com a lista inicial, sem chamada.
      if (store.session.get()) api.buscasPopulares(5).then((termos) => {
        const box = root.querySelector('[data-populares]');
        if (!box || termos.length < 3) return;
        box.innerHTML = `<span class="muted small">Populares:</span>${termos.map((t) => chipPopular(t.charAt(0).toUpperCase() + t.slice(1))).join('')}`;
      }).catch(() => {});
    },
  };
}

// Registra a busca digitada pelo visitante: uma vez por termo em cada visita, sem contar paginação nem atalhos da home.
function registraBusca(query) {
  const termo = (query.get('q') || '').trim();
  if (!termo || query.get('pagina') || query.get('origem') === 'popular') return;
  const chave = termo.toLowerCase();
  let feitas = [];
  try { feitas = JSON.parse(sessionStorage.getItem('spf:buscas') || '[]'); } catch { feitas = []; }
  if (feitas.includes(chave)) return;
  try { sessionStorage.setItem('spf:buscas', JSON.stringify([...feitas, chave].slice(-50))); } catch { /* sem armazenamento: segue sem o controle */ }
  api.registraBusca(termo).catch(() => {});
}

// Atalho de busca da home. Vai para a lista com origem=popular, para não contar o clique como busca nova.
function chipPopular(termo) {
  return `<a class="chip" href="/fornecedores?q=${encodeURIComponent(termo)}&origem=popular">${e(termo)}</a>`;
}

function wireSearchForm(form) {
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = new FormData(form).get('q')?.toString().trim() || '';
    go(`${form.dataset.target}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  });
}

// ---------- Categorias ----------
export function categoriesIndex() {
  const counts = countByCategory();
  return {
    title: `Categorias de fornecedores | ${SITE.shortName}`,
    description: 'Fornecedores por categoria: eletrônicos, moda feminina, tênis, perfumes, cosméticos e mais.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Categorias' }])}
    <section class="container section-tight">
      <h1>Categorias</h1>
      <p class="lead">Encontre fornecedores pelo segmento do seu negócio.</p>
      <div class="grid grid-categories">
        ${topCategoryCard()}
        ${allCategories().map((c) => categoryCard(c, canSeeCatalog() ? counts[c.slug] || 0 : null)).join('')}
      </div>
    </section>`,
  };
}

// Cartão "Mais acessados", sempre o primeiro da lista de categorias.
function topCategoryCard() {
  if (!canSeeCatalog()) return ''; // o ranking depende de acessos e fornecedores: só para assinantes
  const n = rankCategoriesByAccess(allCategories(), store.suppliers.approved()).length;
  return `
  <a class="category-card category-card-top" href="/categorias/mais-acessados">
    <span class="category-icon" aria-hidden="true">${svg('spark', 22)}</span>
    <span class="category-body">
      <strong>Mais acessados</strong>
      <span class="category-desc">As categorias com mais acessos aos fornecedores do site.</span>
      <span class="category-count">${n} ${n === 1 ? 'categoria com fornecedores' : 'categorias com fornecedores'}</span>
    </span>
    <span class="category-go" aria-hidden="true">${icon.arrow}</span>
  </a>`;
}

// Categorias ordenadas pelos acessos dos seus fornecedores.
export function mostAccessedPage() {
  if (!canSeeCatalog()) {
    return catalogGate({ title: `Categorias mais acessadas | ${SITE.shortName}`, description: 'Categorias mais acessadas do catálogo.', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Categorias', href: '/categorias' }, { label: 'Mais acessados' }], heading: 'Mais acessados' });
  }
  const ranked = rankCategoriesByAccess(allCategories(), store.suppliers.approved());
  const items = ranked.map((r, i) => `
      <li class="ranked-item">
        <span class="rank-badge" aria-hidden="true">${i + 1}</span>
        <a class="ranked-link" href="/categorias/${e(r.category.slug)}">
          <strong>${e(r.category.name)}</strong>
          <span class="muted small">${formatCount(r.accesses)} ${r.accesses === 1 ? 'acesso' : 'acessos'} · ${formatCount(r.suppliers)} ${r.suppliers === 1 ? 'fornecedor' : 'fornecedores'}</span>
        </a>
      </li>`).join('');
  return {
    title: `Categorias mais acessadas | ${SITE.shortName}`,
    description: 'Veja as categorias de fornecedores de São Paulo com mais acessos no site.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Categorias', href: '/categorias' }, { label: 'Mais acessados' }])}
    <section class="container section-tight">
      <h1>Categorias mais acessadas</h1>
      <p class="lead">Ordenadas pelo total de acessos aos fornecedores de cada categoria.</p>
      ${items ? `<ol class="plain-list ranked-list">${items}</ol>` : emptyState('Ainda não há acessos', 'Assim que os fornecedores começarem a receber visitas, as categorias aparecem aqui.', '<a class="btn btn-primary" href="/categorias">Ver todas as categorias</a>')}
    </section>`,
  };
}

export function categoryPage({ slug }, query) {
  const cat = store.categories.get(slug);
  if (!cat) return notFound();
  if (!canSeeCatalog()) {
    return catalogGate({ title: `${cat.name} | Categorias`, description: cat.description || '', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Categorias', href: '/categorias' }, { label: cat.name }], heading: `Fornecedores de ${cat.name}`, intro: cat.description });
  }
  return listingPage({
    title: `Fornecedores de ${cat.name} em São Paulo | Atacado`,
    description: `${cat.description || ''} Fornecedores de ${cat.name} no atacado de São Paulo.`.trim(),
    crumbs: [{ label: 'Início', href: '/site' }, { label: 'Categorias', href: '/categorias' }, { label: cat.name }],
    // Mesmo H1 da página pré-gerada (scripts/seo.mjs), para o Google ver o mesmo título antes e depois do JavaScript.
    heading: `Fornecedores de ${cat.name} em São Paulo`,
    intro: cat.description,
    fixed: { category: slug },
    base: `/categorias/${slug}`,
    query,
  });
}

export function regionPage({ slug }, query) {
  const region = store.regions.get(slug);
  if (!region) return notFound();
  if (!canSeeCatalog()) {
    return catalogGate({ title: `${region.name} | Mapa de fornecedores`, description: region.description || '', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Mapa', href: '/mapa' }, { label: region.name }], heading: `Fornecedores em ${region.name}`, intro: region.description });
  }
  const prep = regiaoPrep(region.name);
  return listingPage({
    title: `Fornecedores ${prep} ${region.name} | São Paulo`,
    description: `${region.description} Encontre fornecedores ${prep} ${region.name}, São Paulo.`,
    crumbs: [{ label: 'Início', href: '/site' }, { label: 'Mapa', href: '/mapa' }, { label: region.name }],
    heading: `Fornecedores ${prep} ${region.name}, São Paulo`,
    intro: REGIAO_TEXTO[slug] || region.description,
    fixed: { bairro: slug },
    base: `/regiao/${slug}`,
    query,
  });
}

export function suppliersPage(_params, query) {
  if (!canSeeCatalog()) {
    return catalogGate({ title: `Todos os fornecedores | ${SITE.shortName}`, description: 'Catálogo de fornecedores de São Paulo, para assinantes.', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Fornecedores' }], heading: 'Fornecedores' });
  }
  return listingPage({
    title: `Todos os fornecedores | ${SITE.shortName}`,
    description: 'Lista de fornecedores de São Paulo com filtros por categoria, subcategoria, tipo de venda e WhatsApp.',
    crumbs: [{ label: 'Início', href: '/site' }, { label: 'Fornecedores' }],
    heading: 'Fornecedores',
    intro: 'Pesquise por nome, produto, categoria ou localização. Use os filtros para refinar.',
    fixed: {},
    base: '/fornecedores',
    query,
  });
}

// Lista com busca, filtros e ordenação. Estado fica na URL (compartilhável e reversível pelo botão Voltar).
function listingPage({ title, description, crumbs, heading, intro, fixed, base, query }) {
  const f = {
    q: query.get('q') || '',
    category: query.get('categoria') || '',
    subcategory: query.get('subcategoria') || '',
    bairro: query.get('bairro') || '',
    wholesale: query.get('atacado') === '1',
    retail: query.get('varejo') === '1',
    whatsapp: query.get('whatsapp') === '1',
    verified: query.get('verificado') === '1',
  };
  const sort = query.get('ordem') || 'relevance';
  const page = Number(query.get('pagina')) || 1;
  const effective = { ...f, query: f.q, ...fixed };
  const filtersHtml = filterForm({ f, fixed, base, sort });

  const rows = sortSuppliers(filterSuppliers(store.suppliers.approved(), effective, ctx), sort);
  const p = paginate(rows, page, SITE.pageSize);
  const favs = store.favorites.list();
  const makeHref = (n) => hrefWith(base, query, { pagina: n === 1 ? null : String(n) });

  return {
    title,
    description,
    html: `
    ${breadcrumbs(crumbs)}
    <section class="container section-tight">
      <div class="page-head">
        <h1>${e(heading)}</h1>
        ${intro ? `<p class="lead">${e(intro)}</p>` : ''}
      </div>
      <div class="listing">
        <aside class="filters" aria-label="Filtros">
          <details class="filters-details" ${window.matchMedia('(min-width: 1025px)').matches ? 'open' : ''}>
            <summary class="filters-summary">Filtros</summary>
            ${filtersHtml}
          </details>
        </aside>
        <div class="listing-main">
          <div class="listing-toolbar">
            <p class="count-pill" role="status" aria-live="polite">${formatCount(p.total)} ${p.total === 1 ? 'fornecedor encontrado' : 'fornecedores encontrados'}</p>
          </div>
          ${p.items.length
            ? `${blurGate(`<div class="grid grid-3">${p.items.map((s) => supplierCard(s, {
              categoryName: catName[s.category], regionName: regName[s.bairro], favorite: favs.includes(s.id),
            })).join('')}</div>`)}
               ${pagination(p, makeHref)}`
            : emptyState('Nenhum fornecedor encontrado', 'Tente outros termos ou remova alguns filtros.',
              `<a class="btn btn-secondary" href="${e(base)}">Limpar filtros</a>`)}
        </div>
      </div>
    </section>`,
    mount: (root) => {
      registraBusca(query);
      const form = root.querySelector('[data-filter-form]');
      // Trocar a categoria atualiza a lista de subcategorias na hora (sem recarregar a página).
      const catSel = root.querySelector('#f-cat');
      const subSel = root.querySelector('#f-sub');
      if (catSel && subSel) {
        catSel.addEventListener('change', () => {
          const op = subcategoriaOpcoes(catSel.value);
          subSel.innerHTML = op.html;
          subSel.disabled = !op.temAlguma;
        });
      }
      if (form) {
        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          const params = new URLSearchParams();
          const put = (k, v) => v && params.set(k, v);
          put('q', fd.get('q')?.toString().trim());
          // Sem categoria escolhida, a subcategoria vem como "slug||nome": separa os dois.
          const sub = String(fd.get('subcategoria') || '');
          const partes = sub.split('||');
          const slugSub = partes.length > 1 ? partes[0] : null;
          const nomeSub = partes.length > 1 ? partes[1] : sub;
          if (!fixed.category) put('categoria', slugSub || fd.get('categoria'));
          put('subcategoria', nomeSub);
          if (!fixed.bairro) put('bairro', fd.get('bairro'));
          for (const k of ['atacado', 'varejo', 'whatsapp', 'verificado']) if (fd.get(k)) params.set(k, '1');
          put('ordem', fd.get('ordem') !== 'relevance' ? fd.get('ordem') : '');
          const qs = params.toString();
          go(qs ? `${base}?${qs}` : base);
        });
      }
      wireFavorites(root);
    },
  };
}

// Opções do campo Subcategoria.
// Com categoria escolhida: só as dela, com o nome como valor.
// Sem categoria: todas, agrupadas por categoria, com valor "slug||nome" (o envio separa os dois).
function subcategoriaOpcoes(catAtual, atual = '') {
  const cats = allCategories();
  if (catAtual) {
    const lista = cats.find((c) => c.slug === catAtual)?.subcategories || [];
    return {
      temAlguma: lista.length > 0,
      html: `<option value="">${lista.length ? 'Todas' : 'Sem subcategorias'}</option>`
        + lista.map((n) => `<option value="${e(n)}" ${atual === n ? 'selected' : ''}>${e(n)}</option>`).join(''),
    };
  }
  const grupos = cats.filter((c) => (c.subcategories || []).length);
  let marcado = false;
  const grupoHtml = grupos.map((c) => `<optgroup label="${e(c.name)}">${c.subcategories.map((n) => {
    const sel = !marcado && atual === n;
    if (sel) marcado = true;
    return `<option value="${e(c.slug)}||${e(n)}" ${sel ? 'selected' : ''}>${e(n)}</option>`;
  }).join('')}</optgroup>`).join('');
  return {
    temAlguma: grupos.length > 0,
    html: `<option value="">${grupos.length ? 'Todas as subcategorias' : 'Sem subcategorias'}</option>${grupoHtml}`,
  };
}

function filterForm({ f, fixed, base, sort }) {
  const catAtual = fixed.category || f.category;
  const op = subcategoriaOpcoes(catAtual, f.subcategory);
  const subcategoriaCampo = `
    <div class="field">
      <label for="f-sub">Subcategoria</label>
      <select id="f-sub" name="subcategoria" ${op.temAlguma ? '' : 'disabled'}>${op.html}</select>
    </div>`;
  const check =(name, label, checked) => `
    <label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> <span>${label}</span></label>`;
  return `
  <form class="filter-form" data-filter-form aria-label="Filtrar fornecedores">
    <div class="field">
      <label for="f-q">Buscar</label>
      <input id="f-q" name="q" type="search" value="${e(f.q)}" placeholder="Nome, produto, bairro...">
    </div>
    ${fixed.category ? '' : `
    <div class="field">
      <label for="f-cat">Categoria</label>
      <select id="f-cat" name="categoria">
        <option value="">Todas</option>
        ${allCategories().map((c) => `<option value="${e(c.slug)}" ${f.category === c.slug ? 'selected' : ''}>${e(c.name)}</option>`).join('')}
      </select>
    </div>`}
    ${subcategoriaCampo}
    ${fixed.bairro ? '' : `
    <div class="field">
      <label for="f-bairro">Bairro</label>
      <select id="f-bairro" name="bairro">
        <option value="">Todos os bairros</option>
        ${store.regions.list().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((r) => `<option value="${e(r.slug)}" ${f.bairro === r.slug ? 'selected' : ''}>${e(r.name)}</option>`).join('')}
      </select>
    </div>`}
    <fieldset class="field">
      <legend>Venda</legend>
      ${check('atacado', 'Venda no atacado', f.wholesale)}
      ${check('varejo', 'Venda no varejo', f.retail)}
      ${check('whatsapp', 'WhatsApp disponível', f.whatsapp)}
      ${check('verificado', 'Fornecedor verificado', f.verified)}
    </fieldset>
    <div class="field">
      <label for="f-ord">Ordenar por</label>
      <select id="f-ord" name="ordem">
        ${[['relevance', 'Mais relevantes'], ['recent', 'Mais recentes'], ['name', 'Nome'], ['views', 'Mais visualizados']]
          .map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="filter-actions">
      <button class="btn btn-primary" type="submit">Aplicar</button>
      <a class="btn btn-ghost" href="${e(base)}">Limpar</a>
    </div>
  </form>`;
}

// Monta href preservando filtros e trocando/removendo chaves.
function hrefWith(base, query, changes) {
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ---------- Página do fornecedor ----------
export function supplierPage({ slug }) {
  // Fichas individuais só para assinantes (e dono/administrador): visitantes não recebem nem o nome.
  if (!canSeeCatalog()) {
    return catalogGate({ title: `Fornecedor | ${SITE.shortName}`, description: 'Ficha de fornecedor, para assinantes.', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Fornecedores', href: '/fornecedores' }], heading: 'Ficha de fornecedor' });
  }
  const s = store.suppliers.findBySlug(slug);
  if (!s || s.status !== 'approved') return notFound();
  const viewedKey = `spf:viewed:${s.id}`;
  if (!sessionStorage.getItem(viewedKey)) {
    sessionStorage.setItem(viewedKey, '1');
    store.suppliers.incrementViews(s.id);
  }
  const unlocked = canSeeCatalog();
  // Dado escondido do visitante não é "não informado": ele existe, só está reservado a assinantes.
  const semDado = unlocked ? 'Não informado' : 'Disponível para assinantes';
  const links = supplierMapLinks(s);
  const wa = whatsappTarget(s, `${SITE.whatsappDefaultMessage} (${s.name})`);
  const fav = store.favorites.has(s.id);
  const fullAddress = unlocked
    ? [s.address && `${s.address}${s.number ? `, ${s.number}` : ''}`, s.complement, s.bairro && regName[s.bairro], s.city, s.state, s.cep].filter(Boolean).join(' · ')
    : [s.bairro && regName[s.bairro], s.city].filter(Boolean).join(' · ') + ' · endereço completo para assinantes';
  const shareUrl = `${SITE.url}/fornecedor/${s.slug}`;
  const pageTitle = `${s.name} | Fornecedor em ${regName[s.bairro] || s.city || 'São Paulo'}`;

  return {
    title: pageTitle,
    description: (s.description || `${s.name}, fornecedor de ${catName[s.category]} em ${regName[s.bairro] || 'São Paulo'}.`).slice(0, 155),
    html: `
    ${breadcrumbs([
      { label: 'Início', href: '/site' },
      { label: catName[s.category] || 'Categoria', href: `/categorias/${s.category}` },
      { label: s.name },
    ])}
    <article class="container supplier-profile">
      <header class="profile-head">
        <div class="logo-box logo-lg" aria-hidden="true">${store.images.url(s.logo) ? `<img src="${e(store.images.url(s.logo))}" alt="">` : e((s.name || '?').slice(0, 2).toUpperCase())}</div>
        <div>
          <p class="eyebrow">${e(catName[s.category] || '')}${s.subcategory ? ` · ${e(s.subcategory)}` : ''}</p>
          <h1>${e(s.name)}</h1>
          <div class="badges">
            ${s.verified ? `<span class="badge badge-verified">${icon.check} Verificado</span>` : ''}
            ${s.featured ? '<span class="badge">Em destaque</span>' : ''}
            ${SUPPLIER_TYPES.find((t) => t.value === s.supplierType) ? `<span class="badge">${e(SUPPLIER_TYPES.find((t) => t.value === s.supplierType).label)}</span>` : ''}
          </div>
        </div>
      </header>

      <div class="profile-actions">
        ${unlocked && wa ? `<a class="btn btn-whatsapp btn-lg" href="${e(wa)}" target="_blank" rel="noopener noreferrer">${icon.wa} Conversar pelo WhatsApp</a>` : (unlocked ? '<span class="btn btn-disabled btn-lg">WhatsApp não cadastrado</span>' : '<button class="btn btn-primary btn-lg" type="button" data-action="unlock">Ver contato completo</button>')}
        ${unlocked && links.ig ? `<a class="btn btn-secondary" href="${e(links.ig)}" target="_blank" rel="noopener noreferrer">Ver Instagram</a>` : ''}
        ${unlocked && links.maps ? `<a class="btn btn-secondary" href="${e(links.maps)}" target="_blank" rel="noopener noreferrer">${icon.pin} Como chegar</a>` : ''}
        <button class="btn btn-ghost" type="button" data-action="share">Compartilhar</button>
        <button class="btn btn-ghost ${fav ? 'is-on' : ''}" type="button" data-action="fav-profile" data-id="${e(s.id)}" aria-pressed="${fav}">${icon.heart} ${fav ? 'Salvo' : 'Favoritar'}</button>
      </div>

      <div class="profile-grid">
        <section class="card">
          <h2>Sobre</h2>
          <p>${e(s.description || 'Descrição não informada.')}</p>
          ${s.minOrder ? `<p><strong>Pedido mínimo:</strong> ${e(s.minOrder)}</p>` : ''}
          ${s.hours ? `<p><strong>Horário:</strong> ${e(s.hours)}</p>` : ''}
          <p class="tags">${saleLabels(s).map((l) => `<span class="tag">${e(l)}</span>`).join('') || '<span class="muted">Tipo de venda não informado</span>'}</p>
          ${s.tags?.length ? `<p class="tags">${s.tags.map((t) => `<span class="tag tag-soft">${e(t)}</span>`).join('')}</p>` : ''}
        </section>
        ${blurGate(`<section class="card">
          <h2>Contato e localização</h2>
          <dl class="info-list">
            <dt>Endereço</dt><dd>${e(fullAddress || semDado)}</dd>
            <dt>WhatsApp</dt><dd>${s.whatsapp ? e(unlocked ? formatPhone(s.whatsapp) : maskPhone(s.whatsapp)) : (s.whatsappUrl ? (unlocked ? `<a href="${e(wa)}" target="_blank" rel="noopener noreferrer">Abrir link do WhatsApp</a>` : 'Disponível para assinantes') : semDado)}</dd>
            <dt>Instagram</dt><dd>${links.ig ? (unlocked ? `<a href="${e(links.ig)}" target="_blank" rel="noopener noreferrer">@${e(instagramHandle(s.instagram))}</a>` : e(maskHandle(s.instagram))) : semDado}</dd>
            <dt>Site</dt><dd>${links.site ? (unlocked ? `<a href="${e(links.site)}" target="_blank" rel="noopener noreferrer">${e(s.site)}</a>` : 'Disponível para assinantes') : semDado}</dd>
            <dt>Envio</dt><dd>${s.shipsOtherCities ? 'Envia para outras cidades' : 'Somente retirada/local'}</dd>
          </dl>
        </section>`)}
      </div>
      ${photosCarousel(s)}
      <p class="muted small">Informações fornecidas pelo próprio fornecedor. Confirme preços, pedido mínimo e disponibilidade diretamente com a loja.</p>
    </article>`,
    mount: (root) => {
      wireFavorites(root);
      root.querySelector('[data-action="share"]')?.addEventListener('click', async () => {
        try {
          if (navigator.share) await navigator.share({ title: s.name, url: shareUrl });
          else {
            await navigator.clipboard.writeText(shareUrl);
            toast('Link copiado para a área de transferência.');
          }
        } catch {
          toast('Não foi possível compartilhar agora.', 'error');
        }
      });
      root.querySelector('[data-action="fav-profile"]')?.addEventListener('click', (ev) => {
        const btn = ev.currentTarget;
        const on = store.favorites.toggle(s.id);
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.lastChild.textContent = on ? ' Salvo' : ' Favoritar';
        toast(on ? 'Salvo nos favoritos.' : 'Removido dos favoritos.');
      });
    },
  };
}

// ---------- Mapa ----------
export function mapPage() {
  if (!canSeeCatalog()) {
    return catalogGate({ title: `Mapa de fornecedores | ${SITE.shortName}`, description: 'Fornecedores por região, para assinantes.', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Mapa' }], heading: 'Mapa de fornecedores por bairro' });
  }
  const groups = store.regions.list().map((r) => ({
    region: r,
    list: store.suppliers.approved().filter((s) => s.bairro === r.slug),
  }));
  const key = SITE.googleMapsApiKey;
  const embed = key
    ? `<iframe class="map-embed" title="Mapa da região comercial" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
         src="https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent('25 de Março, São Paulo')}"></iframe>`
    : `<div class="map-placeholder card">
         <p><strong>Mapa interativo não configurado.</strong> Adicione sua chave em <code>js/config.js</code> (googleMapsApiKey) para exibir o mapa aqui.
         Enquanto isso, use os links abaixo para abrir cada endereço no Google Maps.</p>
         <a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('25 de Março, São Paulo')}">Abrir 25 de Março no Google Maps</a>
       </div>`;
  return {
    title: `Mapa de fornecedores | ${SITE.shortName}`,
    description: 'Encontre fornecedores por região: 25 de Março, Brás, Pari, Bom Retiro e Santa Ifigênia.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Mapa' }])}
    <section class="container section-tight">
      <h1>Mapa de fornecedores por bairro</h1>
      <p class="lead">Veja os fornecedores por bairro e abra a rota no Google Maps.</p>
      ${embed}
      <div class="map-groups">
        ${groups.map(({ region, list }) => `
          <section class="card">
            <h2><a href="/regiao/${e(region.slug)}">${e(region.name)}</a></h2>
            <p class="muted small">${e(region.description)}</p>
            ${!canSeeCatalog() ? `<p class="muted small">${list.length === 0 ? 'Nenhum fornecedor aprovado ainda.' : `${list.length} ${list.length === 1 ? 'fornecedor aprovado' : 'fornecedores aprovados'}.`} Os nomes e as rotas aparecem para assinantes.</p>`
              : list.length ? `<ul class="plain-list">${list.map((s) => `
              <li>
                <a href="/fornecedor/${e(s.slug)}"><strong>${e(s.name)}</strong></a>
                <span class="muted small"> · ${canSeeCatalog() ? e(s.address ? `${s.address}${s.number ? `, ${s.number}` : ''}` : 'Endereço a confirmar') : 'endereço para assinantes'}</span>
                ${canSeeCatalog() ? `<a class="small" target="_blank" rel="noopener noreferrer" href="${e(mapsLink({ address: s.address, number: s.number, bairro: region.name, cep: s.cep }))}">Rota</a>` : ''}
              </li>`).join('')}</ul>`
              : '<p class="muted">Nenhum fornecedor cadastrado nesta região ainda.</p>'}
          </section>`).join('')}
      </div>
    </section>`,
  };
}

// ---------- Favoritos ----------
export function favoritesPage() {
  // Favoritos são só para assinantes ativos (decisão D6).
  if (!canSeeCatalog()) {
    return catalogGate({ title: `Meus fornecedores favoritos | ${SITE.shortName}`, description: 'Favoritos, para assinantes.', crumbs: [{ label: 'Início', href: '/site' }, { label: 'Favoritos' }], heading: 'Meus fornecedores favoritos', intro: 'Os favoritos ficam disponíveis com a assinatura ativa.' });
  }
  const ids = store.favorites.list();
  const list = ids.map((id) => store.suppliers.get(id)).filter((s) => s && s.status === 'approved');
  const loggedIn = Boolean(store.session.get());
  return {
    title: `Meus fornecedores favoritos | ${SITE.shortName}`,
    description: 'Seus fornecedores salvos.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Favoritos' }])}
    <section class="container section-tight">
      <h1>Meus fornecedores favoritos</h1>
      <p class="lead">${loggedIn
        ? 'Seus favoritos ficam salvos na sua conta.'
        : 'Você não está logado. Os favoritos ficam salvos apenas neste navegador e não são sincronizados com uma conta.'}</p>
      ${list.length
        ? blurGate(`<div class="grid grid-3">${list.map((s) => supplierCard(s, { categoryName: catName[s.category], regionName: regName[s.bairro], favorite: true })).join('')}</div>`)
        : emptyState('Nenhum favorito ainda', 'Toque no coração de um fornecedor para salvá-lo aqui.',
          '<a class="btn btn-primary" href="/fornecedores">Ver fornecedores</a>')}
    </section>`,
    // Nesta tela, o fornecedor removido sai da lista na hora.
    mount: (root) => wireFavorites(root, { aoRemover: () => go('/favoritos', { replace: true }) }),
  };
}

// ---------- Institucionais ----------
export function aboutPage() {
  return {
    title: `Sobre o portal | ${SITE.shortName}`,
    description: 'Conheça o Fornecedores de SP e como funciona o portal.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Como funciona' }])}
    <section class="container prose" id="como-funciona">
      <h1>Como funciona</h1>
      <p>O ${e(SITE.name)} reúne fornecedores de atacado e varejo de São Paulo, com foco nos polos da 25 de Março, Brás, Pari e regiões vizinhas.</p>
      <h2>Para compradores</h2>
      <ol>
        <li>Pesquise por produto, nome do fornecedor, categoria ou bairro.</li>
        <li>Use os filtros para ver quem vende no atacado, no varejo ou tem WhatsApp.</li>
        <li>Abra a página do fornecedor e fale com ele diretamente.</li>
      </ol>
      <h2>Para fornecedores</h2>
      <ol>
        <li>Preencha o cadastro com os dados reais do seu negócio.</li>
        <li>Nossa equipe revisa as informações antes da publicação.</li>
        <li>Após a aprovação, sua loja aparece nas buscas e nas categorias.</li>
      </ol>
      <p class="muted">Não garantimos preços, estoque nem a conduta de nenhum fornecedor. Verifique sempre antes de comprar.</p>
    </section>`,
  };
}

export function contactPage() {
  return {
    title: `Contato | ${SITE.shortName}`,
    description: 'Fale com a equipe do Fornecedores de SP.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Contato' }])}
    <section class="container section-tight narrow">
      <h1>Contato</h1>
      <p class="lead">Dúvidas, sugestões ou problemas com o seu cadastro.</p>
      <div id="contact-area">
      <form class="card form" id="contact-form" novalidate>
        <div class="field"><label for="c-name">Nome</label><input id="c-name" name="nome" required maxlength="${LIMITES_CONTATO.nome.max}" autocomplete="name"><span class="field-error" id="err-nome" role="alert"></span></div>
        <div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" required maxlength="${LIMITES_CONTATO.email.max}" autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <div class="field"><label for="c-subject">Assunto</label><input id="c-subject" name="assunto" required maxlength="${LIMITES_CONTATO.assunto.max}"><span class="field-error" id="err-assunto" role="alert"></span></div>
        <div class="field"><label for="c-msg">Mensagem</label><textarea id="c-msg" name="mensagem" rows="5" required maxlength="${LIMITES_CONTATO.mensagem.max}"></textarea><span class="field-error" id="err-mensagem" role="alert"></span></div>
        <div class="sr-only" aria-hidden="true"><label for="c-site">Não preencha este campo</label><input id="c-site" name="site" tabindex="-1" autocomplete="off"></div>
        <button class="btn btn-primary" type="submit">Enviar</button>
        <p class="muted small">Respondemos pelo e-mail informado. Seus dados são usados só para este atendimento.</p>
      </form>
      </div>
      <p class="muted">Também: <a href="mailto:${e(SITE.contactEmail)}">${e(SITE.contactEmail)}</a></p>
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#contact-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { ok, errors, dados } = validaContato(Object.fromEntries(new FormData(form)));
        form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
        form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
        if (!ok) {
          let primeiro = null;
          for (const [campo, msg] of Object.entries(errors)) {
            form.querySelector(`#err-${campo}`).textContent = msg;
            const input = form.querySelector(`[name="${campo}"]`);
            input.setAttribute('aria-invalid', 'true');
            primeiro ||= input;
          }
          primeiro?.focus();
          return;
        }
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        botao.textContent = 'Enviando…';
        try {
          await api.enviaContato(dados);
          root.querySelector('#contact-area').innerHTML = `
            <div class="card success" role="status">
              <h2>Mensagem enviada</h2>
              <p>Recebemos sua mensagem e vamos responder pelo e-mail <strong>${e(dados.email)}</strong>.</p>
              <a class="btn btn-primary" href="/site">Voltar ao início</a>
            </div>`;
        } catch (err) {
          toast(erroDeContato(err, SITE.contactEmail), 'error');
          botao.disabled = false;
          botao.textContent = 'Enviar';
        }
      });
    },
  };
}

export function privacyPage() {
  return legalPage('Política de privacidade', `
    <h2>Dados coletados</h2>
    <p>Nome e e-mail de contas; a senha é guardada pelo serviço de autenticação, nunca em texto puro; dados informados em cadastros de fornecedores; pedidos de assinatura; os favoritos; e as mensagens enviadas pelo formulário de contato (nome, e-mail, assunto e texto).</p>
    <h2>Armazenamento</h2>
    <p>Os dados ficam em banco de dados hospedado no Supabase, com regras de acesso por usuário. Os contatos completos dos fornecedores só são liberados a administradores, donos do cadastro e assinantes ativos. Os favoritos de quem não tem conta ficam apenas neste navegador. O site carrega fontes do Google Fonts, que recebe o endereço IP do seu navegador.</p>
    <h2>Cookies e armazenamento no seu navegador</h2>
    <p>Este site usa dois tipos de armazenamento no seu navegador: o necessário, que não depende de consentimento, e o de medição e publicidade, que só é usado se você aceitar.</p>
    <h3>Necessários</h3>
    <p>A sessão de login, guardada pelo serviço de autenticação, mantém você conectado à sua conta. A preferência de cookies registra a sua escolha. Sem eles, o login e a escolha de cookies não funcionam.</p>
    <h3>Medição e publicidade (Meta Pixel)</h3>
    <p>Com o seu aceite, usamos o Meta Pixel, da Meta, para medir as visitas ao site e o resultado dos nossos anúncios: páginas visitadas, visualização dos planos, início de pagamento e assinatura aprovada. A Meta pode usar esses dados para entregar e otimizar anúncios, conforme a política dela.</p>
    <p>Os eventos enviados não contêm nome, e-mail, CPF, telefone, dados de pagamento nem o número do pedido. Antes de cada envio, o site remove do endereço da página os termos de busca, os parâmetros e os tokens. Além disso, o navegador envia à Meta o endereço IP e informações técnicas do navegador, e a Meta grava cookies, como o _fbp, neste site e em facebook.com. Os eventos incluem o valor, a moeda e o nome do produto (Assinatura Fornecedores de SP). Cada tentativa de compra recebe um identificador aleatório, que não é o número do pedido.</p>
    <p>Também guardamos neste navegador a tentativa de pagamento para reconhecer a compra quando ela for aprovada. A tentativa é apagada depois de 48 horas ou quando você rejeita os cookies. Depois que a compra é registrada, guardamos o identificador dela neste navegador para não contá-la duas vezes, até você rejeitar os cookies ou apagar os dados do site.</p>
    <p>Os pagamentos são processados pelo Mercado Pago. O site não envia dados de pagamento à Meta. Estornos e contestações feitos depois da compra não são informados à Meta.</p>
    <h3>Sua escolha</h3>
    <p>No aviso de cookies, você pode aceitar todos os cookies ou rejeitar os não essenciais. Se rejeitar, o Meta Pixel não é carregado, nenhum evento é enviado, os dados de medição guardados neste navegador são apagados e os cookies _fbp e _fbc que o site consegue apagar são removidos. Cookies gravados pela Meta em facebook.com não podem ser removidos pelo site: use as configurações do seu navegador para isso. O site continua funcionando normalmente.</p>
    <p>Você pode alterar a sua escolha a qualquer momento${rastreamentoNesteSite() ? ' pelo botão abaixo' : ''}, ou apagando os dados do site no seu navegador.</p>
    ${rastreamentoNesteSite() ? '<p><button class="btn btn-ghost" type="button" data-abrir-cookies>Alterar preferências de cookies</button></p>' : ''}
    <h2>Seus direitos</h2>
    <p>Você pode solicitar acesso, correção ou exclusão dos seus dados pelo contato do portal.</p>`);
}

export function termsPage() {
  return legalPage('Termos de uso', `
    <p>Ao usar o portal, você concorda que as informações de fornecedores são fornecidas por terceiros e não são verificadas integralmente pelo portal.</p>
    <h2>Cadastro de fornecedores</h2>
    <p>O fornecedor declara que as informações são verdadeiras, que vende apenas produtos lícitos e que cumpre a legislação aplicável. Cadastros passam por análise antes da publicação.</p>
    <h2>Responsabilidade</h2>
    <p>O portal é um canal de contato. Negociações, pagamentos e entregas são de responsabilidade das partes envolvidas.</p>`);
}

function legalPage(title, body) {
  return {
    title: `${title} | ${SITE.shortName}`,
    description: title,
    html: `${breadcrumbs([{ label: 'Início', href: '/site' }, { label: title }])}
      <section class="container prose"><h1>${e(title)}</h1>${body}</section>`,
  };
}

export function notFound() {
  return {
    title: `Página não encontrada | ${SITE.shortName}`,
    description: 'Página não encontrada.',
    status: 404,
    html: `<section class="container section-tight">${emptyState('Página não encontrada', 'O endereço pode estar errado ou a página foi removida.',
      '<a class="btn btn-primary" href="/site">Voltar ao início</a>')}</section>`,
  };
}

export { skeletonCards, icon };


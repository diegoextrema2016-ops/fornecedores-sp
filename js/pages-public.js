// Páginas públicas. Cada página exporta uma função (params, query) => { title, description, html, mount? }.
import { SITE, BANNERS } from './config.js';
import { CATEGORIES, REGIONS, SUPPLIER_TYPES } from './data.js';
import { store } from './store.js';
import { go } from './nav.js';
import { canSeeContacts } from './access.js';
import { filterSuppliers, sortSuppliers, paginate, rankCategoriesByAccess } from './search.js';
import { escapeHtml as e, formatCount, mapsLink, whatsappTarget, instagramHandle, normalizeUrl, formatPhone, maskPhone, maskHandle } from './utils.js';
import {
  icon, categoryCard, supplierCard, pagination, emptyState, breadcrumbs, skeletonCards, demoBanner,
  saleLabels, supplierMapLinks, toast, photosCarousel,
} from './ui.js';

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

// Mantém o botão de favorito sincronizado em toda a página.
function wireFavorites(root) {
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action="fav"]');
    if (!btn) return;
    const on = store.favorites.toggle(btn.dataset.id);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Remover dos favoritos' : 'Salvar nos favoritos');
    toast(on ? 'Fornecedor salvo nos favoritos.' : 'Removido dos favoritos.');
  });
}

// ---------- Início ----------
// Borrão para quem não tem assinatura: o conteúdo fica embaçado e um aviso leva aos planos.
// Visual apenas; a proteção real dos contatos fica no banco (RLS).
function blurGate(html) {
  if (canSeeContacts()) return html;
  return `<div class="blur-gate">
    <div class="card blur-banner">
      <p><strong>Assine para ver os contatos dos fornecedores</strong></p>
      <p class="small muted">WhatsApp, Instagram e endereço completos são liberados após o pagamento via Pix.</p>
      <button class="btn btn-primary" type="button" data-action="unlock">Ver planos de acesso</button>
    </div>
    <div class="blur-content" aria-hidden="true">${html}</div>
  </div>`;
}

export function home() {
  const counts = countByCategory();
  const featured = store.suppliers.approved().filter((s) => s.featured);
  const blurred = !canSeeContacts();
  const popular = ['Eletrônicos', 'Moda feminina', 'Tênis', 'Acessórios', 'Perfumes'];
  return {
    title: 'Fornecedores Atacado SP | Brás, Moda, Tênis e Eletrônicos',
    description: 'Encontre fornecedores de atacado em São Paulo, Brás e 25 de Março. Explore lojas de roupas, moda feminina, tênis, eletrônicos e muito mais.',
    html: `
    ${bannersHtml()}
    <section class="hero">
      <div class="container hero-inner">
        <p class="eyebrow">25 de Março · Brás · Pari · Bom Retiro</p>
        <h1>Os melhores fornecedores de São Paulo em um só lugar.</h1>
        <p class="lead">Descubra lojas, distribuidores e fornecedores para comprar no atacado e abastecer seu negócio.</p>
        <form class="search-hero" role="search" data-search-form data-target="/fornecedores">
          <label class="sr-only" for="hero-q">Buscar</label>
          <span class="search-icon">${icon.search}</span>
          <input id="hero-q" name="q" type="search" placeholder="Busque produtos, fornecedores ou categorias..." autocomplete="off">
          <button class="btn btn-primary" type="submit">Buscar</button>
        </form>
        <div class="chips" aria-label="Pesquisas populares">
          <span class="muted small">Populares:</span>
          ${popular.map((p) => `<a class="chip" href="/fornecedores?q=${encodeURIComponent(p)}">${e(p)}</a>`).join('')}
        </div>
      </div>
    </section>

    <section class="section container">
      <div class="section-head">
        <div><h2>Categorias</h2><p class="muted">Escolha um segmento e veja os fornecedores.</p></div>
        <a href="/categorias" class="link-arrow">Ver todas →</a>
      </div>
      <div class="grid grid-categories">
        ${topCategoryCard()}
        ${allCategories().slice(0, 9).map((c) => categoryCard(c, counts[c.slug] || 0)).join('')}
      </div>
    </section>

    ${featured.length ? `
    <section class="section container">
      <div class="section-head"><div><h2>Conheça fornecedores em destaque.</h2><p class="muted">Seleção feita pela equipe do portal.</p></div></div>
      <div class="carousel-wrap featured-wrap${blurred ? ' is-blurred' : ''}" data-carousel>
        ${featured.length > 1 && !blurred ? '<button class="carousel-arrow carousel-prev" type="button" data-carousel-prev aria-label="Anterior">&#8249;</button>' : ''}
        <div class="carousel-track featured-track">${featured.map((s) => `<div class="featured-item">${supplierCard(s, {
          categoryName: catName[s.category], regionName: regName[s.bairro], favorite: store.favorites.has(s.id),
        })}</div>`).join('')}</div>
        ${featured.length > 1 && !blurred ? '<button class="carousel-arrow carousel-next" type="button" data-carousel-next aria-label="Próximo">&#8250;</button>' : ''}
        ${blurred ? `<div class="blur-cta">
          <p><strong>Assine para ver os fornecedores em destaque</strong></p>
          <p class="small muted">Contatos completos, WhatsApp e endereço liberados após o pagamento via Pix.</p>
          <button class="btn btn-primary" type="button" data-action="unlock">Ver planos de acesso</button>
        </div>` : ''}
      </div>
    </section>` : ''}

    <section class="section container" id="como-funciona-resumo">
      <div class="steps">
        <div><span class="step-n">1</span><h3>Pesquise</h3><p class="muted">Por produto, fornecedor, categoria ou bairro.</p></div>
        <div><span class="step-n">2</span><h3>Compare</h3><p class="muted">Veja tipo de venda, atacado, varejo e pedido mínimo.</p></div>
        <div><span class="step-n">3</span><h3>Converse</h3><p class="muted">Fale direto com o fornecedor pelo WhatsApp.</p></div>
      </div>
    </section>

    <section class="unlock-band container">
      <div>
        <h2>Quer o WhatsApp e o endereço de cada fornecedor?</h2>
        <p class="muted">Os contatos completos ficam disponíveis para assinantes. Veja os planos e libere o acesso.</p>
      </div>
      <button class="btn btn-primary btn-lg" type="button" data-action="unlock">Ver planos de acesso</button>
    </section>

    <section class="cta-band container">
      <div>
        <h2>Tem uma loja ou distribuidora?</h2>
        <p class="muted">Cadastre seu negócio e seja encontrado por compradores de todo o Brasil. Os cadastros passam por aprovação.</p>
      </div>
      <a class="btn btn-primary btn-lg" href="/cadastro">Cadastrar fornecedor</a>
    </section>`,
    mount: (root) => {
      root.querySelectorAll('[data-search-form]').forEach((f) => wireSearchForm(f));
      wireFavorites(root);
    },
  };
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
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Categorias' }])}
    <section class="container section-tight">
      <h1>Categorias</h1>
      <p class="lead">Encontre fornecedores pelo segmento do seu negócio.</p>
      <div class="grid grid-categories">
        ${topCategoryCard()}
        ${allCategories().map((c) => categoryCard(c, counts[c.slug] || 0)).join('')}
      </div>
    </section>`,
  };
}

// Cartão "Mais acessados", sempre o primeiro da lista de categorias.
function topCategoryCard() {
  const n = rankCategoriesByAccess(allCategories(), store.suppliers.approved()).length;
  return `
  <a class="category-card category-card-top" href="/categorias/mais-acessados">
    <span class="category-icon" aria-hidden="true">🔥</span>
    <span class="category-body">
      <strong>Mais acessados</strong>
      <span class="muted small">As categorias com mais acessos aos fornecedores do site.</span>
      <span class="category-count">${n} ${n === 1 ? 'categoria com fornecedores' : 'categorias com fornecedores'}</span>
    </span>
  </a>`;
}

// Categorias ordenadas pelos acessos dos seus fornecedores.
export function mostAccessedPage() {
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
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Categorias', href: '/categorias' }, { label: 'Mais acessados' }])}
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
  return listingPage({
    title: `Fornecedores de ${cat.name} em São Paulo | Atacado`,
    description: `${cat.description || ''} Fornecedores de ${cat.name} no atacado de São Paulo.`.trim(),
    crumbs: [{ label: 'Início', href: '/' }, { label: 'Categorias', href: '/categorias' }, { label: cat.name }],
    heading: `${cat.name}`,
    intro: cat.description,
    fixed: { category: slug },
    base: `/categorias/${slug}`,
    query,
  });
}

export function regionPage({ slug }, query) {
  const region = store.regions.get(slug);
  if (!region) return notFound();
  return listingPage({
    title: `Fornecedores no ${region.name} | São Paulo`,
    description: `${region.description} Encontre fornecedores na ${region.name}, São Paulo.`,
    crumbs: [{ label: 'Início', href: '/' }, { label: 'Regiões' }, { label: region.name }],
    heading: `Fornecedores na ${region.name}`,
    intro: region.description,
    fixed: { bairro: slug },
    base: `/regiao/${slug}`,
    query,
  });
}

export function suppliersPage(_params, query) {
  return listingPage({
    title: `Todos os fornecedores | ${SITE.shortName}`,
    description: 'Lista de fornecedores de São Paulo com filtros por categoria, região, tipo de venda e WhatsApp.',
    crumbs: [{ label: 'Início', href: '/' }, { label: 'Fornecedores' }],
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
    supplierType: query.get('tipo') || '',
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
      <h1>${e(heading)}</h1>
      ${intro ? `<p class="lead">${e(intro)}</p>` : ''}
      <div class="listing">
        <aside class="filters" aria-label="Filtros">
          <details class="filters-details" ${window.matchMedia('(min-width: 1025px)').matches ? 'open' : ''}>
            <summary class="filters-summary">Filtros</summary>
            ${filtersHtml}
          </details>
        </aside>
        <div class="listing-main">
          <div class="listing-toolbar">
            <p class="muted" role="status" aria-live="polite">${formatCount(p.total)} ${p.total === 1 ? 'fornecedor encontrado' : 'fornecedores encontrados'}</p>
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
      const form = root.querySelector('[data-filter-form]');
      // Trocar a categoria atualiza a lista de subcategorias na hora (sem recarregar a página).
      const catSel = root.querySelector('#f-cat');
      const subSel = root.querySelector('#f-sub');
      if (catSel && subSel) {
        catSel.addEventListener('change', () => {
          const mapa = JSON.parse(subSel.dataset.subcats || '{}');
          const lista = mapa[catSel.value] || [];
          subSel.innerHTML = `<option value="">${catSel.value ? (lista.length ? 'Todas' : 'Sem subcategorias') : 'Escolha uma categoria'}</option>`
            + lista.map((n) => `<option value="${e(n)}">${e(n)}</option>`).join('');
          subSel.disabled = !lista.length;
        });
      }
      if (form) {
        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          const params = new URLSearchParams();
          const put = (k, v) => v && params.set(k, v);
          put('q', fd.get('q')?.toString().trim());
          if (!fixed.category) put('categoria', fd.get('categoria'));
          put('subcategoria', fd.get('subcategoria'));
          if (!fixed.bairro) put('bairro', fd.get('bairro'));
          put('tipo', fd.get('tipo'));
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

function filterForm({ f, fixed, base, sort }) {
  // Subcategorias por categoria: o dropdown mostra só as da categoria escolhida.
  const subMap = Object.fromEntries(store.categories.list().map((c) => [c.slug, c.subcategories || []]));
  const catAtual = fixed.category || f.category;
  const subs = catAtual ? (subMap[catAtual] || []) : [];
  const subcategoriaCampo = `
    <div class="field">
      <label for="f-sub">Subcategoria</label>
      <select id="f-sub" name="subcategoria" data-subcats="${e(JSON.stringify(subMap))}" ${subs.length ? '' : 'disabled'}>
        <option value="">${catAtual ? (subs.length ? 'Todas' : 'Sem subcategorias') : 'Escolha uma categoria'}</option>
        ${subs.map((n) => `<option value="${e(n)}" ${f.subcategory === n ? 'selected' : ''}>${e(n)}</option>`).join('')}
      </select>
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
      <label for="f-bairro">Região / bairro</label>
      <select id="f-bairro" name="bairro">
        <option value="">Todas</option>
        ${store.regions.list().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((r) => `<option value="${e(r.slug)}" ${f.bairro === r.slug ? 'selected' : ''}>${e(r.name)}</option>`).join('')}
      </select>
    </div>`}
    <div class="field">
      <label for="f-tipo">Tipo de fornecedor</label>
      <select id="f-tipo" name="tipo">
        <option value="">Todos</option>
        ${SUPPLIER_TYPES.map((t) => `<option value="${e(t.value)}" ${f.supplierType === t.value ? 'selected' : ''}>${e(t.label)}</option>`).join('')}
      </select>
    </div>
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
  const s = store.suppliers.findBySlug(slug);
  if (!s || s.status !== 'approved') return notFound();
  const viewedKey = `spf:viewed:${s.id}`;
  if (!sessionStorage.getItem(viewedKey)) {
    sessionStorage.setItem(viewedKey, '1');
    store.suppliers.incrementViews(s.id);
  }
  const unlocked = canSeeContacts();
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
      { label: 'Início', href: '/' },
      { label: catName[s.category] || 'Categoria', href: `/categorias/${s.category}` },
      { label: s.name },
    ])}
    <article class="container supplier-profile">
      <header class="profile-head">
        <div class="logo-box logo-lg" aria-hidden="true">${s.logo ? `<img src="${e(s.logo)}" alt="">` : e((s.name || '?').slice(0, 2).toUpperCase())}</div>
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
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Mapa' }])}
    <section class="container section-tight">
      <h1>Encontre fornecedores pelo mapa.</h1>
      <p class="lead">Veja os fornecedores por bairro e abra a rota no Google Maps.</p>
      ${embed}
      <div class="map-groups">
        ${groups.map(({ region, list }) => `
          <section class="card">
            <h2><a href="/regiao/${e(region.slug)}">${e(region.name)}</a></h2>
            <p class="muted small">${e(region.description)}</p>
            ${list.length ? `<ul class="plain-list">${list.map((s) => `
              <li>
                <a href="/fornecedor/${e(s.slug)}"><strong>${e(s.name)}</strong></a>
                <span class="muted small"> · ${canSeeContacts() ? e(s.address ? `${s.address}${s.number ? `, ${s.number}` : ''}` : 'Endereço a confirmar') : 'endereço para assinantes'}</span>
                ${canSeeContacts() ? `<a class="small" target="_blank" rel="noopener noreferrer" href="${e(mapsLink({ address: s.address, number: s.number, bairro: region.name, cep: s.cep }))}">Rota</a>` : ''}
              </li>`).join('')}</ul>`
              : '<p class="muted">Nenhum fornecedor cadastrado nesta região ainda.</p>'}
          </section>`).join('')}
      </div>
    </section>`,
  };
}

// ---------- Favoritos ----------
export function favoritesPage() {
  const ids = store.favorites.list();
  const list = ids.map((id) => store.suppliers.get(id)).filter((s) => s && s.status === 'approved');
  const loggedIn = Boolean(store.session.get());
  return {
    title: `Meus fornecedores favoritos | ${SITE.shortName}`,
    description: 'Seus fornecedores salvos.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Favoritos' }])}
    <section class="container section-tight">
      <h1>Meus fornecedores favoritos</h1>
      <p class="lead">${loggedIn
        ? 'Seus favoritos ficam salvos na sua conta neste navegador.'
        : 'Você não está logado. Os favoritos ficam salvos apenas neste navegador e não são sincronizados com uma conta.'}</p>
      ${list.length
        ? blurGate(`<div class="grid grid-3">${list.map((s) => supplierCard(s, { categoryName: catName[s.category], regionName: regName[s.bairro], favorite: true })).join('')}</div>`)
        : emptyState('Nenhum favorito ainda', 'Toque no coração de um fornecedor para salvá-lo aqui.',
          '<a class="btn btn-primary" href="/fornecedores">Ver fornecedores</a>')}
    </section>`,
    mount: (root) => wireFavorites(root),
  };
}

// ---------- Institucionais ----------
export function aboutPage() {
  return {
    title: `Sobre o portal | ${SITE.shortName}`,
    description: 'Conheça o Fornecedores Atacado SP e como funciona o portal.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Como funciona' }])}
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
    description: 'Fale com a equipe do Fornecedores Atacado SP.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/' }, { label: 'Contato' }])}
    <section class="container section-tight narrow">
      <h1>Contato</h1>
      <p class="lead">Dúvidas, sugestões ou problemas com o seu cadastro.</p>
      <form class="card form" id="contact-form" novalidate>
        <div class="field"><label for="c-name">Nome</label><input id="c-name" name="name" required autocomplete="name"></div>
        <div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="c-msg">Mensagem</label><textarea id="c-msg" name="message" rows="5" required></textarea></div>
        <button class="btn btn-primary" type="submit">Enviar</button>
        <p class="muted small">Nesta versão, a mensagem não é enviada a nenhum servidor. Ligue a integração de e-mail ou o Supabase (ver README) para receber.</p>
      </form>
      <p class="muted">Também: <a href="mailto:${e(SITE.contactEmail)}">${e(SITE.contactEmail)}</a></p>
    </section>`,
    mount: (root) => {
      root.querySelector('#contact-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = ev.currentTarget;
        if (!f.checkValidity()) return f.reportValidity();
        toast('Mensagem registrada. Configure o envio para receber de fato.');
        f.reset();
      });
    },
  };
}

export function privacyPage() {
  return legalPage('Política de privacidade', `
    <p>Esta é uma política de modelo. Revise com um profissional jurídico antes de publicar (LGPD).</p>
    <h2>Dados coletados</h2>
    <p>Nome e e-mail de contas; a senha é guardada pelo serviço de autenticação, nunca em texto puro; dados informados em cadastros de fornecedores; pedidos de assinatura; e os favoritos.</p>
    <h2>Armazenamento</h2>
    <p>Os dados ficam em banco de dados hospedado no Supabase, com regras de acesso por usuário. Os contatos completos dos fornecedores só são liberados a administradores, donos do cadastro e assinantes ativos. Os favoritos de quem não tem conta ficam apenas neste navegador.</p>
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
    html: `${breadcrumbs([{ label: 'Início', href: '/' }, { label: title }])}
      <section class="container prose"><h1>${e(title)}</h1>${body}</section>`,
  };
}

export function notFound() {
  return {
    title: `Página não encontrada | ${SITE.shortName}`,
    description: 'Página não encontrada.',
    status: 404,
    html: `<section class="container section-tight">${emptyState('Página não encontrada', 'O endereço pode estar errado ou a página foi removida.',
      '<a class="btn btn-primary" href="/">Voltar ao início</a>')}</section>`,
  };
}

export { skeletonCards, icon };

// Faixa de banners da home: um por vez, rola para o lado (swipe).
function bannersHtml() {
  if (!BANNERS.length) return '';
  return `
    <section class="banner-section" aria-label="Destaques">
      <div class="banner-track">
        ${BANNERS.map((b, i) => {
          // WebP primeiro (menor); JPG como reserva. Celular usa a versão vertical.
          const webp = (src) => src.replace(/\.(jpe?g|png)$/i, '.webp');
          const sources = [
            b.mobileSrc ? `<source media="(max-width: 820px)" type="image/webp" srcset="${e(webp(b.mobileSrc))}">` : '',
            b.mobileSrc ? `<source media="(max-width: 820px)" srcset="${e(b.mobileSrc)}">` : '',
            `<source type="image/webp" srcset="${e(webp(b.src))}">`,
          ].join('');
          const img = `<picture>${sources}<img src="${e(b.src)}" alt="${e(b.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
          return `<div class="banner-slide">${b.href ? `<a href="${e(b.href)}">${img}</a>` : img}</div>`;
        }).join('')}
      </div>
    </section>`;
}

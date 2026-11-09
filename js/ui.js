// Componentes de interface que devolvem HTML (strings). Todo texto vindo do usuário passa por escapeHtml.
import { SITE } from './config.js';
import { escapeHtml as e, whatsappTarget, mapsLink, formatCount, instagramHandle, normalizeUrl, formatPhone, maskPhone, maskHandle } from './utils.js';
import { canSeeContacts } from './access.js';

export const icon = {
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.1C1 8.6 3 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5 19 5 21 8.6 21.5 11.9 19.5 16.4 12 21 12 21z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8.9-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.8c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 2 4.5 4.5 0 0 0 .9 2.4 10.4 10.4 0 0 0 4 3.5c1.5.6 2.1.7 2.8.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3z"/></svg>',
};

export function escapeAttr(v) {
  return e(v);
}

export function header({ session, route }) {
  const is = (path) => (route === path ? 'is-active' : '');
  const isAdmin = session?.role === 'admin';
  const account = session
    ? `<a class="btn btn-ghost" href="/favoritos" aria-label="Meus favoritos">${icon.heart}<span class="hide-sm">Favoritos</span></a>
       <a class="btn btn-ghost hide-sm" href="/sair">Sair</a>`
    : `<a class="btn btn-ghost" href="/login">Entrar</a>`;
  return `
  <a class="skip-link" href="#main">Pular para o conteúdo</a>
  <header class="site-header" id="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="${e(SITE.name)} - início">
        <span class="brand-mark" aria-hidden="true">SP</span>
        <span class="brand-text"><strong>FORNECEDORES</strong><small>ATACADO SP</small></span>
      </a>
      <nav class="main-nav" id="main-nav" aria-label="Principal">
        <a class="${is('/')}" href="/">Início</a>
        <a class="${is('/categorias')}" href="/categorias">Categorias</a>
        <a class="${is('/fornecedores')}" href="/fornecedores">Fornecedores</a>
        <a class="${is('/mapa')}" href="/mapa">Mapa</a>
        <a class="${is('/sobre')}" href="/sobre">Como funciona</a>
        <a class="nav-cta" href="/cadastro">Cadastrar fornecedor</a>
        ${isAdmin ? '<a href="/admin">Painel</a>' : ''}
      </nav>
      <div class="header-actions">
        ${account}
        <a class="btn btn-primary hide-sm" href="/cadastro">Cadastrar fornecedor</a>
        <button class="icon-btn menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menu">${icon.menu}</button>
      </div>
    </div>
  </header>`;
}

export function footer() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <strong class="footer-brand">${e(SITE.name)}</strong>
        <p class="muted">${e(SITE.tagline)}</p>
      </div>
      <nav aria-label="Rodapé">
        <a href="/categorias">Categorias</a>
        <a href="/fornecedores">Fornecedores</a>
        <a href="/mapa">Mapa</a>
        <a href="/cadastro">Cadastre sua loja</a>
      </nav>
      <nav aria-label="Institucional">
        <a href="/sobre">Sobre</a>
        <a href="/contato">Contato</a>
        <a href="/privacidade">Privacidade</a>
        <a href="/termos">Termos de uso</a>
      </nav>
    </div>
    <div class="container footer-bottom muted">© ${year} ${e(SITE.name)}.</div>
  </footer>`;
}

export function demoBanner() {
  return `<div class="demo-banner" role="note">Modo demonstração: os fornecedores exibidos são fictícios. Cadastre dados reais pelo painel.</div>`;
}

export function categoryCard(cat, count) {
  return `
  <a class="category-card" href="/categorias/${e(cat.slug)}">
    <span class="category-icon" aria-hidden="true">${e(cat.icon || '📦')}</span>
    <span class="category-body">
      <strong>${e(cat.name)}</strong>
      <span class="muted small">${e(cat.description || '')}</span>
      <span class="category-count">${formatCount(count)} ${count === 1 ? 'fornecedor' : 'fornecedores'}</span>
    </span>
  </a>`;
}

// Carrossel com até 4 fotos cadastradas pelo fornecedor (rolagem horizontal com setas).
export function photosCarousel(s = {}, max = 4) {
  const photos = (s.photos || []).filter(Boolean).slice(0, max);
  if (!photos.length) return '';
  return `
  <section class="card carousel" aria-label="Fotos da loja" data-carousel>
    <h2>Fotos da loja</h2>
    <div class="carousel-wrap">
      ${photos.length > 1 ? '<button class="carousel-arrow carousel-prev" type="button" data-carousel-prev aria-label="Foto anterior">&#8249;</button>' : ''}
      <div class="carousel-track">
        ${photos.map((src, i) => `<figure class="carousel-slide"><button class="photo-zoom" type="button" data-photo-open="${i}" aria-label="Ampliar foto ${i + 1} de ${e(s.name)}"><img src="${e(src)}" alt="Foto ${i + 1} de ${e(s.name)}" loading="lazy"></button></figure>`).join('')}
      </div>
      ${photos.length > 1 ? '<button class="carousel-arrow carousel-next" type="button" data-carousel-next aria-label="Próxima foto">&#8250;</button>' : ''}
    </div>
  </section>`;
}

// Visualizador de fotos em tela cheia. Setas passam de foto; Esc, o X ou um clique fora da imagem fecham.
let viewerCleanup = null;

export function closePhotoViewer() {
  if (viewerCleanup) viewerCleanup();
}

export function openPhotoViewer(srcs, index = 0, alt = 'Foto') {
  closePhotoViewer();
  if (!srcs.length) return;
  const total = srcs.length;
  let current = Math.min(Math.max(index, 0), total - 1);
  const host = document.createElement('div');
  host.className = 'photo-viewer';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'Foto ampliada');
  host.innerHTML = `
    <button class="photo-viewer-close" type="button" aria-label="Fechar">&times;</button>
    ${total > 1 ? '<button class="photo-viewer-arrow prev" type="button" aria-label="Foto anterior">&#8249;</button>' : ''}
    <figure class="photo-viewer-figure"><img alt=""><figcaption></figcaption></figure>
    ${total > 1 ? '<button class="photo-viewer-arrow next" type="button" aria-label="Próxima foto">&#8250;</button>' : ''}`;
  const img = host.querySelector('img');
  const caption = host.querySelector('figcaption');
  const show = (i) => {
    current = (i + total) % total;
    img.src = srcs[current];
    img.alt = `${alt} (${current + 1} de ${total})`;
    caption.textContent = total > 1 ? `${current + 1} de ${total}` : '';
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
    if (ev.key === 'ArrowRight') show(current + 1);
    if (ev.key === 'ArrowLeft') show(current - 1);
  };
  const onClick = (ev) => {
    if (ev.target === host || ev.target.classList.contains('photo-viewer-figure') || ev.target.closest('.photo-viewer-close')) return close();
    if (ev.target.closest('.photo-viewer-arrow.next')) return show(current + 1);
    if (ev.target.closest('.photo-viewer-arrow.prev')) return show(current - 1);
  };
  const previousOverflow = document.body.style.overflow;
  function close() {
    host.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    viewerCleanup = null;
  }
  viewerCleanup = close;
  host.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(host);
  show(current);
  host.querySelector('.photo-viewer-close').focus();
}

export function supplierCard(s, { categoryName = '', regionName = '', favorite = false, unlocked = canSeeContacts() } = {}) {
  const wa = whatsappTarget(s, SITE.whatsappDefaultMessage);
  const ig = instagramHandle(s.instagram);
  const location = [s.bairro && regionName ? regionName : '', s.city].filter(Boolean).join(' · ');
  const hasPhone = Boolean(s.whatsapp || s.whatsappUrl);
  const waText = s.whatsapp
    ? (unlocked ? formatPhone(s.whatsapp) : maskPhone(s.whatsapp))
    : (unlocked ? 'Abrir link do WhatsApp' : 'Link do WhatsApp');
  const contactLine = !hasPhone
    ? ''
    : unlocked && wa
      ? `<a class="contact-line small wa-link" href="${e(wa)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp de ${e(s.name)}">${icon.wa} <span>${e(waText)}</span></a>`
      : `<p class="contact-line small">${icon.wa} <span>${e(waText)}</span>${!unlocked ? ' <span class="lock-hint">· contato completo para assinantes</span>' : ''}</p>`;
  const igLine = ig
    ? `<p class="small muted">Instagram: ${e(unlocked ? '@' + ig : maskHandle(s.instagram))}</p>`
    : '';
  const primaryAction = unlocked && wa
    ? `<a class="btn btn-whatsapp" href="${e(wa)}" target="_blank" rel="noopener noreferrer">${icon.wa} WhatsApp</a>`
    : (hasPhone
      ? `<button class="btn btn-primary" type="button" data-action="unlock">Ver contato completo</button>`
      : '<span class="btn btn-disabled" aria-disabled="true">Sem WhatsApp</span>');
  return `
  <article class="supplier-card">
    <div class="supplier-card-top">
      <div class="logo-box" aria-hidden="true">${s.logo ? `<img src="${e(s.logo)}" alt="" loading="lazy">` : e((s.name || '?').slice(0, 2).toUpperCase())}</div>
      <div class="supplier-title">
        <h3><a href="/fornecedor/${e(s.slug)}">${e(s.name)}</a></h3>
        <div class="badges">
          ${s.verified ? `<span class="badge badge-verified">${icon.check} Verificado</span>` : ''}
          ${s.isDemo ? '<span class="badge badge-demo">Demonstração</span>' : ''}
          <span class="badge">${e(categoryName)}</span>
        </div>
      </div>
      <button class="fav-btn ${favorite ? 'is-on' : ''}" type="button" data-action="fav" data-id="${e(s.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}">${icon.heart}</button>
    </div>
    <p class="supplier-location muted small">${icon.pin} ${e(location)}</p>
    <p class="supplier-desc">${e(s.description || 'Descrição não informada.')}</p>
    <p class="supplier-sale small">${saleLabels(s).map((l) => `<span class="tag">${e(l)}</span>`).join('')}</p>
    ${contactLine}
    ${igLine}
    <div class="supplier-actions">
      <a class="btn btn-secondary" href="/fornecedor/${e(s.slug)}">Ver fornecedor</a>
      ${primaryAction}
    </div>
  </article>`;
}

export function saleLabels(s) {
  const out = [];
  if (s.saleWholesale) out.push('Atacado');
  if (s.saleRetail) out.push('Varejo');
  if (s.saleResellers) out.push('Lojistas');
  if (s.shipsOtherCities) out.push('Envio para outras cidades');
  return out;
}

export function pagination(p, makeHref) {
  if (p.totalPages <= 1) return '';
  const pages = [];
  for (let i = 1; i <= p.totalPages; i++) {
    if (i === 1 || i === p.totalPages || Math.abs(i - p.page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return `
  <nav class="pagination" aria-label="Paginação">
    ${p.page > 1 ? `<a class="btn btn-ghost" href="${e(makeHref(p.page - 1))}" rel="prev">← Anterior</a>` : ''}
    ${pages.map((n) => (n === '…'
      ? '<span class="muted">…</span>'
      : `<a class="page-num ${n === p.page ? 'is-current' : ''}" href="${e(makeHref(n))}" ${n === p.page ? 'aria-current="page"' : ''}>${n}</a>`)).join('')}
    ${p.page < p.totalPages ? `<a class="btn btn-ghost" href="${e(makeHref(p.page + 1))}" rel="next">Próxima →</a>` : ''}
  </nav>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty-state"><h3>${e(title)}</h3><p class="muted">${e(text)}</p>${actionHtml}</div>`;
}

export function skeletonCards(n = 6) {
  return `<div class="grid grid-3" aria-busy="true" aria-label="Carregando">${Array.from({ length: n })
    .map(() => '<div class="skeleton-card"></div>')
    .join('')}</div>`;
}

export function breadcrumbs(items) {
  // items: [{label, href?}]
  return `<div class="container"><nav aria-label="Você está em" class="breadcrumbs"><ol>${items
    .map((it, i) => (it.href && i < items.length - 1
      ? `<li><a href="${e(it.href)}">${e(it.label)}</a></li>`
      : `<li aria-current="page">${e(it.label)}</li>`))
    .join('')}</ol></nav></div>`;
}

export function fieldError(errors, key) {
  return errors?.[key] ? `<span class="field-error" role="alert">${e(errors[key])}</span>` : '';
}

export function supplierMapLinks(s) {
  return {
    maps: mapsLink({ address: s.address, number: s.number, bairro: s.bairro, city: s.city, state: s.state, cep: s.cep }),
    site: s.site ? normalizeUrl(s.site) : '',
    ig: instagramHandle(s.instagram) ? `https://www.instagram.com/${instagramHandle(s.instagram)}/` : '',
  };
}

// ---------- Feedback: toast e modal ----------
export function toast(message, type = 'info') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

export function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-root');
    host.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${e(title)}</h3>
        <p class="muted">${e(text)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" id="modal-ok">${e(confirmLabel)}</button>
        </div>
      </div>`;
    const done = (value) => {
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => ev.key === 'Escape' && done(false);
    document.addEventListener('keydown', onKey);
    host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => done(false)));
    host.querySelector('#modal-ok').addEventListener('click', () => done(true));
    host.querySelector('#modal-ok').focus();
  });
}

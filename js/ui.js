// Componentes de interface que devolvem HTML (strings). Todo texto vindo do usuário passa por escapeHtml.
import { SITE } from './config.js';
import { escapeHtml as e, whatsappTarget, mapsLink, formatCount, instagramHandle, normalizeUrl, formatPhone, maskPhone, maskHandle } from './utils.js';
import { canSeeCatalog } from './access.js';
import { store } from './store.js';
import { subcategoriasDoFornecedor } from './search.js';
import { icon as svg, iconeDaCategoria, headerHtml, footerHtml } from './visual.js';

// Ícones de uso geral (mesmos nomes de antes; o desenho agora vem de js/visual.js).
export const icon = {
  search: svg('search', 20),
  menu: svg('menu', 22),
  heart: svg('heart', 18),
  pin: svg('pin', 16),
  check: svg('check', 14),
  arrow: svg('arrow', 16),
  lock: svg('lock', 16),
  wa: svg('wa', 18),
  instagram: svg('instagram', 16),
};

export function escapeAttr(v) {
  return e(v);
}

export function header({ session, route }) {
  return headerHtml({ session, route });
}

export function footer() {
  return footerHtml();
}

export function demoBanner() {
  return `<div class="demo-banner" role="note">Modo demonstração: os fornecedores exibidos são fictícios. Cadastre dados reais pelo painel.</div>`;
}

// Cartão de categoria: ícone em destaque, nome, descrição, contagem (só para assinantes) e seta.
export function categoryCard(cat, count) {
  return `
  <a class="category-card" href="/categorias/${e(cat.slug)}">
    <span class="category-icon" aria-hidden="true">${iconeDaCategoria(cat.slug, 22)}</span>
    <span class="category-body">
      <strong>${e(cat.name)}</strong>
      <span class="category-desc">${e(cat.description || '')}</span>
      ${count == null ? '' : `<span class="category-count">${formatCount(count)} ${count === 1 ? 'fornecedor' : 'fornecedores'}</span>`}
    </span>
    <span class="category-go" aria-hidden="true">${icon.arrow}</span>
  </a>`;
}

// Carrossel com até 4 fotos cadastradas pelo fornecedor (rolagem horizontal com setas).
export function photosCarousel(s = {}, max = 4) {
  // Fotos são referências no banco; aqui viram URLs assinadas (quem não pode ver recebe lista vazia).
  const photos = (s.photos || []).map((ref) => store.images.url(ref)).filter(Boolean).slice(0, max);
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

// Cartão de fornecedor: faixa de capa (foto ou ícone da categoria), logo sobreposta, dados e contato.
export function supplierCard(s, { categoryName = '', regionName = '', favorite = false, unlocked = canSeeCatalog() } = {}) {
  // Para visitantes, o cartão não mostra logo nem nome reais: aparece um rótulo genérico.
  // (Visual apenas; o link da ficha ainda tem o endereço público do fornecedor.)
  const masked = !unlocked;
  const shownName = masked ? `Fornecedor${regionName ? ` em ${regionName}` : ' de atacado'}` : (s.name || '');
  const wa = whatsappTarget(s, SITE.whatsappDefaultMessage);
  const ig = instagramHandle(s.instagram);
  const location = [s.bairro && regionName ? regionName : '', s.city].filter(Boolean).join(' · ');
  const hasPhone = Boolean(s.whatsapp || s.whatsappUrl);
  const waText = s.whatsapp
    ? (unlocked ? formatPhone(s.whatsapp) : maskPhone(s.whatsapp))
    : (unlocked ? 'Abrir link do WhatsApp' : 'Link do WhatsApp');
  // Visitante não recebe o contato, então não dá para saber se o fornecedor tem WhatsApp: nunca dizemos "Sem WhatsApp".
  const contactLine = !unlocked
    ? `<p class="contact-line small">${icon.lock} <span>WhatsApp para assinantes</span></p>`
    : !hasPhone
    ? ''
    : unlocked && wa
      ? `<a class="contact-line small wa-link" href="${e(wa)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp de ${e(s.name)}">${icon.wa} <span>${e(waText)}</span></a>`
      : `<p class="contact-line small">${icon.wa} <span>${e(waText)}</span></p>`;
  const igLine = ig
    ? `<p class="contact-line small">${icon.instagram} <span>${e(unlocked ? '@' + ig : maskHandle(s.instagram))}</span></p>`
    : '';
  const unlockButton = '<button class="btn btn-primary" type="button" data-action="unlock">Ver contato completo</button>';
  const primaryAction = unlocked && wa
    ? `<a class="btn btn-whatsapp" href="${e(wa)}" target="_blank" rel="noopener noreferrer">${icon.wa} WhatsApp</a>`
    : (!unlocked || hasPhone
      ? unlockButton
      : '<span class="btn btn-disabled" aria-disabled="true">Sem WhatsApp</span>');
  const foto = unlocked ? store.images.url((s.photos || [])[0]) : '';
  const logo = unlocked ? store.images.url(s.logo) : '';
  const capa = foto
    ? `<img class="sc-cover" src="${e(foto)}" alt="" loading="lazy">`
    : `<span class="sc-placeholder" aria-hidden="true">${iconeDaCategoria(s.category, 40)}</span>`;
  return `
  <article class="supplier-card">
    <div class="sc-media">
      ${capa}
      <div class="sc-top">
        <div class="badges">
          ${s.verified ? `<span class="badge badge-verified">${icon.check} Verificado</span>` : ''}
          ${s.isDemo ? '<span class="badge badge-demo">Demonstração</span>' : ''}
        </div>
        <button class="fav-btn ${favorite ? 'is-on' : ''}" type="button" data-action="fav" data-id="${e(s.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}">${icon.heart}</button>
      </div>
    </div>
    <div class="sc-body">
      <div class="sc-head">
        <div class="logo-box" aria-hidden="true">${masked ? '<span class="logo-mask">SP</span>' : (logo ? `<img src="${e(logo)}" alt="">` : e((s.name || '?').slice(0, 2).toUpperCase()))}</div>
        <div class="supplier-title">
          <h3><a href="/fornecedor/${e(s.slug)}">${e(shownName)}</a></h3>
          <p class="supplier-location">${icon.pin} <span>${e(location)}</span></p>
        </div>
      </div>
      <div class="sc-meta">
        <span class="badge badge-cat">${e(categoryName)}</span>
        ${subcategoriasTags(s)}
      </div>
      ${s.description ? `<p class="supplier-desc">${e(s.description)}</p>` : ''}
      <p class="supplier-sale">${saleLabels(s).map((l) => `<span class="tag">${e(l)}</span>`).join('')}</p>
      <div class="sc-contact">${contactLine}${igLine}</div>
      <div class="supplier-actions">
        <a class="btn btn-secondary" href="/fornecedor/${e(s.slug)}">Ver ficha ${icon.arrow}</a>
        ${primaryAction}
      </div>
    </div>
  </article>`;
}

// Subcategorias do fornecedor, até 3 (o restante aparece como "+n").
function subcategoriasTags(s) {
  const lista = subcategoriasDoFornecedor(s.subcategory);
  if (!lista.length) return '';
  const mostra = lista.slice(0, 3).map((n) => `<span class="tag tag-sub">${e(n)}</span>`).join('');
  const resto = lista.length > 3 ? `<span class="tag tag-sub">+${lista.length - 3}</span>` : '';
  return `<span class="supplier-subs" aria-label="Subcategorias">${mostra}${resto}</span>`;
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
    ${p.page > 1 ? `<a class="btn btn-ghost btn-sm" href="${e(makeHref(p.page - 1))}" rel="prev">${svg('arrow', 16).replace('<svg', '<svg style="transform:rotate(180deg)"')} Anterior</a>` : ''}
    ${pages.map((n) => (n === '…'
      ? '<span class="muted page-gap">…</span>'
      : `<a class="page-num ${n === p.page ? 'is-current' : ''}" href="${e(makeHref(n))}" ${n === p.page ? 'aria-current="page"' : ''}>${n}</a>`)).join('')}
    ${p.page < p.totalPages ? `<a class="btn btn-ghost btn-sm" href="${e(makeHref(p.page + 1))}" rel="next">Próxima ${icon.arrow}</a>` : ''}
  </nav>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty-state"><span class="empty-ico" aria-hidden="true">${svg('search', 26)}</span><h3>${e(title)}</h3><p class="muted">${e(text)}</p>${actionHtml}</div>`;
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

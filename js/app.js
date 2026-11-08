// Ponto de entrada: roteamento por hash (#/rota?query), proteção das rotas do painel e renderização.
import { SITE } from './config.js';
import { store } from './store.js';
import { header, footer, toast } from './ui.js';
import * as pub from './pages-public.js';
import * as acc from './pages-account.js';
import * as adm from './pages-admin.js';
import { openPaywall } from './paywall.js';

const main = document.getElementById('main');
const headerHost = document.getElementById('header');
const footerHost = document.getElementById('footer');

const isAdmin = () => store.session.get()?.role === 'admin';

// Rotas: [regex, handler(params, query), opções]. Handler retorna { title, description, html, mount? } ou null (redirecionamento).
const routes = [
  [/^\/$/, () => pub.home()],
  [/^\/categorias$/, () => pub.categoriesIndex()],
  [/^\/categorias\/([^/]+)$/, (p, q) => pub.categoryPage({ slug: p[1] }, q)],
  [/^\/fornecedores$/, (_p, q) => pub.suppliersPage({}, q)],
  [/^\/fornecedor\/([^/]+)$/, (p) => pub.supplierPage({ slug: p[1] })],
  [/^\/regiao\/([^/]+)$/, (p, q) => pub.regionPage({ slug: p[1] }, q)],
  [/^\/mapa$/, () => pub.mapPage()],
  [/^\/cadastro$/, () => acc.cadastroPage()],
  [/^\/login$/, () => acc.loginPage()],
  [/^\/registro$/, () => acc.registerPage()],
  [/^\/sair$/, () => { acc.logout(); return null; }],
  [/^\/favoritos$/, () => pub.favoritesPage()],
  [/^\/sobre$/, () => pub.aboutPage()],
  [/^\/contato$/, () => pub.contactPage()],
  [/^\/privacidade$/, () => pub.privacyPage()],
  [/^\/termos$/, () => pub.termsPage()],

  // Painel administrativo: exige sessão de administrador.
  [/^\/admin$/, () => adm.adminDashboard(), { admin: true }],
  [/^\/admin\/pendentes$/, (_p, q) => withMount(adm.adminSuppliers(q, { preset: 'pending' }), (r) => adm.mountAdminSuppliers(r, render)), { admin: true }],
  [/^\/admin\/fornecedores$/, (_p, q) => withMount(adm.adminSuppliers(q), (r) => adm.mountAdminSuppliers(r, render)), { admin: true }],
  [/^\/admin\/novo$/, () => withMount(adm.adminSupplierForm(null), (r) => adm.mountAdminSupplierForm(r, null)), { admin: true }],
  [/^\/admin\/fornecedor\/([^/]+)\/editar$/, (p) => withMount(adm.adminSupplierForm(p[1]), (r) => adm.mountAdminSupplierForm(r, p[1])), { admin: true }],
  [/^\/admin\/categorias$/, () => withMount(adm.adminCategories(), (r) => adm.mountAdminCategories(r, render)), { admin: true }],
  [/^\/admin\/regioes$/, () => withMount(adm.adminRegions(), (r) => adm.mountAdminRegions(r, render)), { admin: true }],
  [/^\/admin\/usuarios$/, () => withMount(adm.adminUsers(), (r) => adm.mountAdminUsers(r, render)), { admin: true }],
  [/^\/admin\/pagamentos$/, () => withMount(adm.adminPayments(), (r) => adm.mountAdminPayments(r, render)), { admin: true }],
  [/^\/admin\/migracao$/, () => withMount(adm.adminBackup(), (r) => adm.mountAdminBackup(r, render)), { admin: true }],
];

// Acrescenta uma função de montagem (eventos) a uma página já gerada.
function withMount(page, mount) {
  return { ...page, mount };
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(qs) };
}

function setMeta(page) {
  document.title = page.title || SITE.name;
  document.querySelector('meta[name="description"]')?.setAttribute('content', page.description || SITE.description);
}

// Evita que uma renderização antiga sobrescreva a mais recente (cliques rápidos ou atualizações em sequência).
let renderId = 0;

async function render() {
  const id = ++renderId;
  const { path, query } = parseHash();

  try {
    await store.refresh();
  } catch (err) {
    if (id !== renderId) return;
    headerHost.innerHTML = header({ session: null, route: '/' });
    footerHost.innerHTML = footer();
    main.innerHTML = `<section class="container section-tight narrow">
      <div class="card">
        <h1>Não foi possível carregar o site</h1>
        <p>Verifique sua conexão com a internet e tente de novo.</p>
        <p class="muted small">${String(err?.message || err)}</p>
        <button class="btn btn-primary" type="button" onclick="location.reload()">Tentar novamente</button>
      </div>
    </section>`;
    return;
  }
  if (id !== renderId) return;

  let route = null;
  let match = null;
  for (const r of routes) {
    match = path.match(r[0]);
    if (match) {
      route = r;
      break;
    }
  }

  // Rota de admin sem permissão: pede login.
  if (route?.[2]?.admin && !isAdmin()) {
    toast('Entre como administrador para acessar o painel.', 'error');
    location.hash = '#/login';
    return;
  }

  const isAdminRoute = Boolean(route?.[2]?.admin);
  const navKey = '/' + (path.split('/')[1] || '');
  headerHost.innerHTML = header({ session: store.session.get(), route: navKey === '/' ? '/' : navKey });
  footerHost.innerHTML = isAdminRoute ? '' : footer();
  document.body.classList.toggle('is-admin', isAdminRoute);

  const page = route ? route[1](match, query) : pub.notFound();
  if (page === null) return;

  main.innerHTML = page.html;
  setMeta(page);
  page.mount?.(main);
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

// Setas do carrossel de fotos da ficha
document.addEventListener('click', (ev) => {
  const arrow = ev.target.closest('[data-carousel-prev], [data-carousel-next]');
  if (!arrow) return;
  const track = arrow.closest('[data-carousel]')?.querySelector('.carousel-track');
  if (!track) return;
  const dir = arrow.hasAttribute('data-carousel-next') ? 1 : -1;
  track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
});

// Botões "Ver contato completo" abrem a janela de assinatura
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="unlock"]')) {
    ev.preventDefault();
    openPaywall();
  }
});

// Menu mobile
document.addEventListener('click', (ev) => {
  const toggle = ev.target.closest('.menu-toggle');
  if (toggle) {
    const hdr = document.getElementById('site-header');
    const open = !hdr.classList.contains('nav-open');
    hdr.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    return;
  }
  if (ev.target.closest('.main-nav a')) {
    document.getElementById('site-header')?.classList.remove('nav-open');
  }
});

window.addEventListener('scroll', () => {
  document.getElementById('site-header')?.classList.toggle('is-scrolled', window.scrollY > 8);
}, { passive: true });

// Erros de gravação em segundo plano (ex.: favorito) aparecem como aviso.
window.addEventListener('spf:error', (ev) => toast(ev.detail, 'error'));

window.addEventListener('hashchange', render);
render();

// Acesso no console para depuração (não expõe segredos).
window.SPF = { store, render };

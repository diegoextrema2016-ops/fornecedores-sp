// Ponto de entrada: roteamento por endereço limpo (/rota?query), proteção das rotas do painel e renderização.
import { SITE } from './config.js';
import { store } from './store.js';
import { header, footer, toast, openPhotoViewer } from './ui.js';
import * as pub from './pages-public.js';
import * as acc from './pages-account.js';
import * as adm from './pages-admin.js';
import { openPaywall } from './paywall.js';
import { go, currentLocation, normalizeTarget } from './nav.js';

// Páginas que não devem aparecer no Google (também marcadas no HTML gerado pelo build).
const NOINDEX_PATH = /^\/(admin|login|registro|cadastro|favoritos|sair)(\/|$)/;

const main = document.getElementById('main');
const headerHost = document.getElementById('header');
const footerHost = document.getElementById('footer');

const isAdmin = () => store.session.get()?.role === 'admin';

// Rotas: [regex, handler(params, query), opções]. Handler retorna { title, description, html, mount? } ou null (redirecionamento).
const routes = [
  [/^\/$/, () => pub.home()],
  [/^\/categorias$/, () => pub.categoriesIndex()],
  [/^\/categorias\/mais-acessados$/, () => pub.mostAccessedPage()],
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
  [/^\/admin\/pendentes$/, (_p, q) => withMount(adm.adminSuppliers(q, { preset: 'pending' }), (r) => adm.mountAdminSuppliers(r, renderLocal)), { admin: true }],
  [/^\/admin\/fornecedores$/, (_p, q) => withMount(adm.adminSuppliers(q), (r) => adm.mountAdminSuppliers(r, renderLocal)), { admin: true }],
  [/^\/admin\/novo$/, () => withMount(adm.adminSupplierForm(null), (r) => adm.mountAdminSupplierForm(r, null)), { admin: true }],
  [/^\/admin\/fornecedor\/([^/]+)\/editar$/, (p) => withMount(adm.adminSupplierForm(p[1]), (r) => adm.mountAdminSupplierForm(r, p[1])), { admin: true }],
  [/^\/admin\/categorias$/, () => withMount(adm.adminCategories(), (r) => adm.mountAdminCategories(r, renderLocal)), { admin: true }],
  [/^\/admin\/regioes$/, () => withMount(adm.adminRegions(), (r) => adm.mountAdminRegions(r, renderLocal)), { admin: true }],
  [/^\/admin\/usuarios$/, () => withMount(adm.adminUsers(), (r) => adm.mountAdminUsers(r, renderLocal)), { admin: true }],
  [/^\/admin\/pagamentos$/, () => withMount(adm.adminPayments(), (r) => adm.mountAdminPayments(r, renderLocal)), { admin: true }],
  [/^\/admin\/migracao$/, () => withMount(adm.adminBackup(), (r) => adm.mountAdminBackup(r, render)), { admin: true }],
];

// Acrescenta uma função de montagem (eventos) a uma página já gerada.
function withMount(page, mount) {
  return { ...page, mount };
}

function parseLocation() {
  const { path, search } = currentLocation();
  return { path, query: new URLSearchParams(search) };
}

// Endereços antigos com # (ex.: /#/fornecedor/x, já compartilhados) viram endereço limpo.
// Retorno do link de confirmação do e-mail (tokens depois do #) fica na página inicial.
function migrateLegacyHash() {
  const hash = location.hash;
  if (hash.startsWith('#/')) {
    history.replaceState(null, '', normalizeTarget(hash));
  } else if (hash.startsWith('#access_token=') || hash.startsWith('#error=')) {
    history.replaceState(null, '', '/' + location.search);
  }
}

function setMeta(page, path) {
  document.title = page.title || SITE.name;
  document.querySelector('meta[name="description"]')?.setAttribute('content', page.description || SITE.description);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', SITE.url + (path === '/' ? '/' : path));
  const robots = document.querySelector('meta[name="robots"]');
  const noindex = Boolean(page.noindex) || NOINDEX_PATH.test(path);
  if (robots) robots.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow');
}

// Evita que uma renderização antiga sobrescreva a mais recente (cliques rápidos ou atualizações em sequência).
let renderId = 0;

// Redesenha a tela só com a cópia que já está na memória (sem baixar tudo do banco de novo).
// Usado depois de cada ação do painel, que já atualiza a cópia local antes de gravar.
function renderLocal() {
  return render({ fromMemory: true });
}

async function render({ fromMemory = false } = {}) {
  const id = ++renderId;
  const { path, query } = parseLocation();
  // Só a primeira visita espera os dados. Nas seguintes a tela aparece na hora, com a cópia da memória.
  const primeiraVez = !fromMemory && !store.loaded();

  try {
    if (primeiraVez) await store.refresh({ maxAgeMs: 30000 });
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
    go('/login', { replace: true });
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
  setMeta(page, path);
  page.mount?.(main);
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });

  // Atualiza os dados em segundo plano e redesenha só se algo mudou (sem atrasar o clique).
  if (!fromMemory && !primeiraVez) atualizarEmSegundoPlano(id);
}

function atualizarEmSegundoPlano(id) {
  const antes = store.fingerprint();
  store.refresh({ maxAgeMs: 30000 })
    .then(() => {
      if (id !== renderId || store.fingerprint() === antes) return;
      // Tela com formulário não é redesenhada: isso apagaria o que a pessoa está digitando ou editando.
      if (main.querySelector('form')) return;
      renderLocal();
    })
    .catch(() => {});
}

// Clique numa foto da ficha abre a imagem inteira
document.addEventListener('click', (ev) => {
  const zoom = ev.target.closest('[data-photo-open]');
  if (!zoom) return;
  const carousel = zoom.closest('[data-carousel]');
  const buttons = [...(carousel?.querySelectorAll('[data-photo-open]') || [])];
  const srcs = buttons.map((b) => b.querySelector('img')?.getAttribute('src')).filter(Boolean);
  openPhotoViewer(srcs, Number(zoom.dataset.photoOpen) || 0, zoom.querySelector('img')?.alt || 'Foto');
});

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

// Outras abas do painel: quando um fornecedor muda em uma aba, esta aba recarrega a lista.
// Se houver formulário aberto aqui, não redesenha, para não apagar o que está sendo editado.
try {
  const canal = new BroadcastChannel('spf-dados');
  canal.onmessage = () => {
    if (main.querySelector('form')) return;
    store.refresh().then(() => renderLocal()).catch(() => {});
  };
} catch {
  // navegador sem BroadcastChannel: segue normal
}

// Navegação interna: links do próprio site trocam a tela sem recarregar a página.
document.addEventListener('click', (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('//')) return;
  ev.preventDefault();
  go(href);
});

// Voltar/avançar do navegador.
window.addEventListener('popstate', render);

migrateLegacyHash();
render();

// Acesso no console para depuração (não expõe segredos).
window.SPF = { store, render, go };

// Componentes visuais em HTML puro: ícones, marca, cabeçalho, rodapé e moldura das telas de conta.
// Módulo puro (sem DOM e sem rede): usado pelo app (js/ui.js) e pelo gerador de páginas do Google (scripts/seo.mjs),
// para que as duas versões tenham exatamente a mesma estrutura.
import { SITE } from './config.js';

const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Traço de 2 px, cantos arredondados, cor herdada do texto. Um só estilo para o site inteiro.
const TRACO = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  arrow: '<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  heart: '<path d="M12 20s-7.5-4.5-9.2-9.1C1.7 8.2 3.6 5 7 5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.3 3.2 4.2 5.9C19.5 15.5 12 20 12 20z"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".7" fill="currentColor"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.8 4-5.8 7.5-5.8s6.3 2 7.5 5.8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 15h2"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 15c1.6.6 2.6 2.2 3 5"/>',
  chart: '<path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  spark: '<path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.5l-1.6-5.3L5 10.6 10.4 9z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  // Categorias
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  shirt: '<path d="M8.5 3.5 4 6l-1.5 4 2.5 1V20h12v-9l2.5-1L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>',
  sneaker: '<path d="M3 16.5h18"/><path d="M3 16.5V12c0-.6.4-1 1-1h3.5l3 2.6c.8.7 1.8 1.1 2.9 1.1H21v1.8"/><path d="M8 11V7"/>',
  bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  gem: '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  glasses: '<circle cx="6.5" cy="13.5" r="3.5"/><circle cx="17.5" cy="13.5" r="3.5"/><path d="M10 13.5h4M3 12l1.5-6.5h4L10 12M21 12l-1.5-6.5h-4L14 12"/>',
  watch: '<circle cx="12" cy="13" r="5.5"/><path d="M9 7.5 10 3h4l1 4.5M9 18.5 10 23h4l1-4.5M12 10.5v2.8l1.8 1.2"/>',
  puzzle: '<path d="M9 4.5a2.5 2.5 0 0 1 5 0V6h3.5a1.5 1.5 0 0 1 1.5 1.5V11h-1.5a2.5 2.5 0 0 0 0 5H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2.5 2.5 0 0 0-5 0V21H5.5A1.5 1.5 0 0 1 4 19.5V16h1.5a2.5 2.5 0 0 0 0-5H4V7.5A1.5 1.5 0 0 1 5.5 6H9z"/>',
  baby: '<circle cx="12" cy="8.5" r="4.5"/><path d="M7.5 6c1.5-2 7.5-2 9 0"/><path d="M5 20c1-3 3.5-4.5 7-4.5s6 1.5 7 4.5"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  box: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
};
const PREENCHIDO = { wa: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8.9-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.8c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 2 4.5 4.5 0 0 0 .9 2.4 10.4 10.4 0 0 0 4 3.5c1.5.6 2.1.7 2.8.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3z"/>', heart: '<path d="M12 20s-7.5-4.5-9.2-9.1C1.7 8.2 3.6 5 7 5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.3 3.2 4.2 5.9C19.5 15.5 12 20 12 20z"/>' };

// Ícone: name é a chave de TRACO ou PREENCHIDO. Sempre decorativo (aria-hidden); o texto ao lado dá o significado.
export function icon(name, size = 20) {
  const preenchido = PREENCHIDO[name];
  const corpo = preenchido || TRACO[name] || TRACO.box;
  const estilo = preenchido ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" ${estilo} aria-hidden="true" focusable="false">${corpo}</svg>`;
}

// Ícone da categoria a partir do endereço (slug). Categorias novas caem no ícone genérico.
const ICONE_DA_CATEGORIA = [
  [/capinha|celular/, 'phone'],
  [/informatica/, 'laptop'],
  [/eletron/, 'cpu'],
  [/infantil|bebe/, 'baby'],
  [/moda|roupa|vestu/, 'shirt'],
  [/tenis|calcado/, 'sneaker'],
  [/bolsa/, 'bag'],
  [/bijuter|acessor/, 'gem'],
  [/relogio/, 'watch'],
  [/oculos/, 'glasses'],
  [/perfume|cosmet/, 'spark'],
  [/brinquedo/, 'puzzle'],
  [/utilidade|casa|domest/, 'home'],
  [/vaper/, 'box'],
];
export function iconeDaCategoria(slug = '', size = 22) {
  const achado = ICONE_DA_CATEGORIA.find(([re]) => re.test(slug));
  return icon(achado ? achado[1] : 'box', size);
}

// Marca: símbolo em azul com alfinete (encontrar fornecedores no mapa) e o nome.
export function marca() {
  return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="22" height="22" focusable="false"><path d="M16 4.5c-4.9 0-8.8 3.8-8.8 8.7 0 6.2 8.8 14.3 8.8 14.3s8.8-8.1 8.8-14.3c0-4.9-3.9-8.7-8.8-8.7z" fill="#fff"/><circle cx="16" cy="13" r="3.4" fill="#2457f5"/><circle cx="24.5" cy="6.5" r="2.6" fill="#22d3ee"/></svg></span>`;
}

const link = (href, texto, ativo = false, classe = '') => `<a class="${[ativo ? 'is-active' : '', classe].filter(Boolean).join(' ')}" href="${esc(href)}">${esc(texto)}</a>`;

// Cabeçalho: mesmo para o app e para o build. session e route só existem no app.
export function headerHtml({ session = null, route = '', pularConteudo = true } = {}) {
  const is = (p) => route === p;
  const admin = session?.role === 'admin';
  const contaAcoes = session
    ? `<a class="btn btn-ghost btn-sm hide-sm" href="/favoritos" aria-label="Meus favoritos">${icon('heart', 17)}<span>Favoritos</span></a>
       <a class="btn btn-ghost btn-sm hide-sm" href="/sair">Sair</a>`
    : `<a class="btn btn-ghost btn-sm" href="/login">Entrar</a>`;
  return `
  ${pularConteudo ? '<a class="skip-link" href="#main">Pular para o conteúdo</a>' : ''}
  <header class="site-header" id="site-header">
    <div class="container header-inner">
      <a class="brand" href="/site" aria-label="${esc(SITE.name)}: início">${marca()}
        <span class="brand-text"><strong>FORNECEDORES DE SP</strong><small>O Maior Guia de Fornecedores</small></span>
      </a>
      <nav class="main-nav" id="main-nav" aria-label="Principal">
        ${link('/categorias', 'Categorias', is('/categorias'))}
        ${link('/fornecedores', 'Fornecedores', is('/fornecedores'))}
        ${link('/mapa', 'Mapa', is('/mapa'))}
        ${link('/planos', 'Planos', is('/planos'))}
        ${link('/guias', 'Guias', is('/guias'))}
        ${link('/sobre', 'Como funciona', is('/sobre'))}
        <div class="nav-mobile">
          ${session ? link('/conta', 'Minha conta', false, 'nav-account') : ''}
          ${session ? link('/sair', 'Sair da conta', false, 'nav-account') : link('/login', 'Entrar', false, 'nav-account')}
          ${admin ? link('/admin', 'Painel administrativo') : ''}
          <a class="btn btn-primary btn-block nav-cta" href="/cadastro">${icon('store', 18)} Cadastrar fornecedor</a>
        </div>
      </nav>
      <div class="header-actions">
        ${contaAcoes}
        <a class="btn btn-primary btn-sm btn-cadastro hide-sm" href="/cadastro">Cadastrar fornecedor ${icon('arrow', 16)}</a>
        <button class="icon-btn menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menu">${icon('menu', 22)}</button>
      </div>
    </div>
  </header>`;
}

// Rodapé: mesmo para o app e para o build.
export function footerHtml({ ano = new Date().getFullYear() } = {}) {
  return `
  <footer class="site-footer">
    <div class="container footer-top">
      <div class="footer-brief">
        <a class="brand" href="/site">${marca()}<span class="brand-text"><strong>Fornecedores</strong><small>SP · Atacado</small></span></a>
        <p>Os fornecedores de atacado e varejo de São Paulo, organizados por categoria e bairro.</p>
        <a class="btn btn-primary btn-sm" href="/cadastro">Cadastre sua loja ${icon('arrow', 16)}</a>
      </div>
      <nav class="footer-col" aria-label="Explorar">
        <h2>Explorar</h2>
        <a href="/categorias">Categorias</a>
        <a href="/fornecedores">Fornecedores</a>
        <a href="/mapa">Mapa por bairro</a>
        <a href="/guias">Guias</a>
      </nav>
      <nav class="footer-col" aria-label="Para você">
        <h2>Para você</h2>
        <a href="/planos">Planos de acesso</a>
        <a href="/sobre">Como funciona</a>
        <a href="/cadastro">Cadastrar fornecedor</a>
        <a href="/login">Entrar</a>
      </nav>
      <div class="footer-col">
        <h2>Contato</h2>
        <a class="footer-mail" href="mailto:${esc(SITE.contactEmail)}">${icon('mail', 16)} ${esc(SITE.contactEmail)}</a>
        <p class="footer-place">${icon('pin', 16)} São Paulo · SP</p>
        <a href="/contato">Fale com a equipe</a>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© ${ano} ${esc(SITE.name)}. Todos os direitos reservados.</span>
      <nav aria-label="Institucional">
        <a href="/privacidade">Privacidade</a>
        <a href="/termos">Termos de uso</a>
        <a href="/contato">Contato</a>
      </nav>
    </div>
  </footer>`;
}

// Moldura das telas de conta (entrar, cadastro, senha): formulário de um lado, benefícios do outro.
export function authFrameHtml({ eyebrow = '', title, lead = '', corpo, id = '' }) {
  return `
  <section class="auth-wrap container">
    <div class="auth-main">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1>${esc(title)}</h1>
      ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
      <div class="auth-card" ${id ? `id="${esc(id)}"` : ''}>${corpo}</div>
    </div>
    <aside class="auth-aside" aria-label="Vantagens da conta">
      <div class="auth-aside-in">
        <span class="auth-badge">${icon('shield', 18)} Acesso seguro</span>
        <h2>Uma conta, todo o atacado de SP</h2>
        <ul class="benefits">
          <li>${icon('heart', 18)}<span><strong>Favoritos</strong> salvos na sua conta, em qualquer aparelho</span></li>
          <li>${icon('store', 18)}<span><strong>Cadastro da loja</strong> com acompanhamento de aprovação</span></li>
          <li>${icon('lock', 18)}<span><strong>Contatos completos</strong> para quem tem assinatura ativa</span></li>
        </ul>
      </div>
    </aside>
  </section>`;
}

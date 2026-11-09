// Navegação por endereços limpos (/fornecedor/nome, /categorias/slug...). Sem # no endereço.
// go() troca o endereço sem recarregar a página e avisa o roteador para desenhar a tela nova.

// Aceita "/rota?query" e também o formato antigo "#/rota?query" (links já compartilhados).
export function normalizeTarget(target = '/') {
  let t = String(target);
  if (t.startsWith('#')) t = t.slice(1);
  if (!t.startsWith('/')) t = '/' + t;
  return t;
}

export function go(target, { replace = false } = {}) {
  const url = normalizeTarget(target);
  const current = location.pathname + location.search;
  if (url !== current) {
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Caminho e parâmetros da URL atual (sem o #).
export function currentLocation() {
  return { path: location.pathname.replace(/\/+$/, '') || '/', search: location.search };
}

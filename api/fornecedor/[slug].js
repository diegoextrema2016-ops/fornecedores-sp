// Ficha de fornecedor: devolve a casca do site com status correto.
// - slug que existe: 200, com a casca do site (a tela de assinantes continua igual para visitantes).
// - slug que não existe: 404, com a página de não encontrada.
// Falha aberta: se a checagem no Supabase falhar ou demorar, responde 200 como antes. Nunca quebra a página.
// Só o sim/não sai do banco (função fornecedor_existe); nenhum dado de fornecedor passa por aqui.
import { SUPABASE } from '../../js/config.js';

const SLUG = /^[a-z0-9-]{1,120}$/;

async function existeFornecedor(slug) {
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/fornecedor_existe`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch {
    return true;
  }
}

async function pagina(origem, caminho) {
  const r = await fetch(`${origem}${caminho}`);
  if (!r.ok) throw new Error(`pagina ${caminho} ${r.status}`);
  return r.text();
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const slug = String(req.query?.slug || '');
  const origem = `https://${req.headers.host}`;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const existe = SLUG.test(slug) ? await existeFornecedor(slug) : false;
  try {
    if (!existe) {
      const html = await pagina(origem, '/404.html');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(404).send(html);
    }
    const html = await pagina(origem, '/fornecedores/index.html');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(200).send(html);
  } catch {
    // Se a casca não puder ser lida, o erro é do servidor, não do fornecedor: devolvemos erro controlado.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Página indisponível no momento. Tente novamente em instantes.');
  }
}

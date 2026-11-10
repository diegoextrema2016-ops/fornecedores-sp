// Refaz as páginas públicas (listagens, bairros, categorias, sitemap) quando o administrador
// salva ou aprova um fornecedor. Usa o Deploy Hook da Vercel, guardado na variável VERCEL_DEPLOY_HOOK.
// Só administradores podem chamar: o servidor confere o login e o tipo de perfil no Supabase.
import { SUPABASE } from '../js/config.js';

async function administradorLogado(token) {
  const cabecalhos = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` };
  const u = await fetch(`${SUPABASE.url}/auth/v1/user`, { headers: cabecalhos });
  if (!u.ok) return false;
  const usuario = await u.json().catch(() => ({}));
  if (!usuario.id) return false;
  const p = await fetch(`${SUPABASE.url}/rest/v1/profiles?select=type&id=eq.${encodeURIComponent(usuario.id)}`, { headers: cabecalhos });
  if (!p.ok) return false;
  const linhas = await p.json().catch(() => []);
  return linhas?.[0]?.type === 'admin';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !(await administradorLogado(token))) {
    return res.status(403).json({ error: 'Só administradores podem publicar.' });
  }

  if (!process.env.VERCEL_DEPLOY_HOOK) {
    return res.status(200).json({ ok: false, motivo: 'hook_nao_configurado' });
  }

  try {
    const r = await fetch(process.env.VERCEL_DEPLOY_HOOK, { method: 'POST', signal: AbortSignal.timeout(8000) });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch {
    return res.status(502).json({ error: 'Não foi possível pedir a nova publicação agora.' });
  }
}

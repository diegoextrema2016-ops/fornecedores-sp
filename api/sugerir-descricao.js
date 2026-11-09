// Sugestão de descrição comercial com IA (função da Vercel).
// Regras:
//  - só responde a quem está logado no site (confere o token no Supabase);
//  - a chave da IA fica em ANTHROPIC_API_KEY, nas variáveis de ambiente da Vercel (nunca no código);
//  - sem chave configurada, responde { fallback: true } e o site usa sugestões prontas.
import { SUPABASE } from '../js/config.js';

const MODEL = 'claude-haiku-5-5';
// Estilos sorteados a cada pedido: é isso que faz cada sugestão sair diferente.
const ESTILOS = [
  'direto e objetivo, indicando o que a loja vende',
  'acolhedor, falando com quem quer abastecer a loja',
  'focado em revenda, destacando margem e variedade para quem compra para vender de novo',
  'destacando a variedade de produtos e o atendimento direto',
  'curto e chamativo, com uma frase de convite no final',
  'profissional, falando de pedidos, orçamento e condições de compra',
];

function promptPara({ categoria, atacado, varejo, lojistas, outrasCidades }, estilo) {
  const vendas = [
    atacado && 'venda no atacado',
    varejo && 'venda no varejo',
    lojistas && 'atende lojistas e revendedores',
    outrasCidades && 'envia para outras cidades',
  ].filter(Boolean);
  return [
    'Escreva uma descrição comercial para um fornecedor de atacado de São Paulo.',
    `Categoria: ${categoria}.`,
    vendas.length ? `Dados que podem ser citados: ${vendas.join('; ')}.` : '',
    `Estilo desta vez: ${estilo}.`,
    'Regras: português do Brasil; entre 200 e 450 caracteres; um ou dois parágrafos curtos.',
    'Não invente tempo de mercado, prêmios, certificações, preços, endereço ou telefone.',
    'Responda somente com o texto da descrição, sem aspas e sem título.',
  ].filter(Boolean).join('\n');
}

async function usuarioLogado(token) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return res.status(200).json({ fallback: true });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !(await usuarioLogado(token))) {
    return res.status(401).json({ error: 'Entre na sua conta para usar a sugestão.' });
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const dados = {
    categoria: String(corpo.categoria || 'produtos para revenda').slice(0, 80),
    atacado: corpo.atacado === true,
    varejo: corpo.varejo === true,
    lojistas: corpo.lojistas === true,
    outrasCidades: corpo.outrasCidades === true,
  };
  const estilo = ESTILOS[Math.floor(Math.random() * ESTILOS.length)];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 1,
        messages: [{ role: 'user', content: promptPara(dados, estilo) }],
      }),
    });
    if (!r.ok) {
      // Mostra o motivo (sem chave): o erro que a própria IA devolve.
      const corpo = await r.json().catch(() => ({}));
      const detalhe = String(corpo?.error?.message || '').slice(0, 160);
      return res.status(502).json({ error: `A IA respondeu com erro ${r.status}${detalhe ? `: ${detalhe}` : '.'}` });
    }
    const json = await r.json();
    const texto = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!texto) return res.status(502).json({ error: 'A IA não devolveu texto. Tente de novo.' });
    return res.status(200).json({ texto: texto.slice(0, 600) });
  } catch (err) {
    return res.status(502).json({ error: `Não foi possível falar com a IA agora (${String(err?.message || err).slice(0, 120)}).` });
  }
}

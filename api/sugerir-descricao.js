// Sugestão de descrição comercial com IA (função da Vercel).
// Regras:
//  - só responde a quem está logado no site (confere o token no Supabase);
//  - as chaves ficam nas variáveis de ambiente da Vercel, nunca no código:
//      GEMINI_API_KEY (gratuita, Google AI Studio) tem prioridade;
//      ANTHROPIC_API_KEY (paga) é usada se a Gemini não estiver configurada;
//  - sem nenhuma chave, responde { fallback: true } e o site usa sugestões prontas.
import { SUPABASE } from '../js/config.js';

// Só a categoria entra no pedido: texto curto e rápido.
function promptPara({ categoria, instrucao }) {
  const partes = [
    `Escreva uma descrição comercial curta, em português do Brasil, com no máximo 2 frases, para um fornecedor de atacado de São Paulo da categoria "${categoria}".`,
  ];
  if (instrucao) {
    partes.push(
      `A orientação do fornecedor é a base principal do texto: "${instrucao}".`,
      'Use as ideias e informações dessa orientação, sem trocar nem acrescentar fatos que ela não traga.',
    );
  }
  partes.push(
    'Fale do produto e do atacado. Não invente tempo de mercado, prêmios, preços, endereço ou telefone.',
    'Responda somente com o texto, sem aspas e sem título.',
  );
  return partes.join(' ');
}

async function usuarioLogado(token) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

// Gemini (gratuita). Modelo pode ser trocado pela variável GEMINI_MODEL.
// Desliga o "pensamento" do modelo (mais rápido para um texto curto) e tem limite de tempo.
async function chamarGemini(prompt, comPensamento) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  // maxOutputTokens alto: se o modelo gastar tokens pensando, o texto não sai cortado/vazio.
  const generationConfig = { temperature: 1, maxOutputTokens: 400 };
  if (comPensamento) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
    // Tempo por tentativa (com a nova tentativa cabe nos 30 segundos da Vercel, ver vercel.json).
    signal: AbortSignal.timeout(12000),
  });
}

async function comGemini(prompt) {
  let pensamento = true;
  let r = await chamarGemini(prompt, pensamento);
  // Se o modelo não aceitar essa opção, tenta de novo sem ela.
  if (r.status === 400) {
    const texto = await r.clone().text();
    if (/thinking/i.test(texto)) {
      pensamento = false;
      r = await chamarGemini(prompt, pensamento);
    }
  }
  // Modelo ocupado (503/429/500): espera 2 segundos e tenta mais uma vez.
  if ([429, 500, 503].includes(r.status)) {
    await new Promise((ok) => setTimeout(ok, 2000));
    r = await chamarGemini(prompt, pensamento);
  }
  const json = await r.json().catch(() => ({}));
  if (r.status === 503 || r.status === 429) {
    return { erro: 'A IA (Gemini) está muito ocupada agora. Tente de novo em alguns instantes.' };
  }
  if (!r.ok) return { erro: `A IA (Gemini) respondeu com erro ${r.status}${json?.error?.message ? `: ${String(json.error.message).slice(0, 160)}` : '.'}` };
  const texto = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return texto ? { texto } : { erro: 'A IA (Gemini) não devolveu texto. Tente de novo.' };
}

// Anthropic (paga). Usada só se a Gemini não estiver configurada.
async function comAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 400,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: `A IA (Anthropic) respondeu com erro ${r.status}${json?.error?.message ? `: ${String(json.error.message).slice(0, 160)}` : '.'}` };
  const texto = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return texto ? { texto } : { erro: 'A IA (Anthropic) não devolveu texto. Tente de novo.' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ fallback: true });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !(await usuarioLogado(token))) {
    return res.status(401).json({ error: 'Entre na sua conta para usar a sugestão.' });
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const dados = {
    categoria: String(corpo.categoria || 'produtos para revenda').slice(0, 80),
    instrucao: String(corpo.instrucao || '').replace(/["\n\r]/g, ' ').trim().slice(0, 300),
  };
  const prompt = promptPara(dados);

  try {
    const resultado = process.env.GEMINI_API_KEY ? await comGemini(prompt) : await comAnthropic(prompt);
    if (resultado.erro) return res.status(502).json({ error: resultado.erro });
    return res.status(200).json({ texto: resultado.texto.slice(0, 600) });
  } catch (err) {
    const demorou = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return res.status(502).json({ error: demorou ? 'A IA demorou demais para responder. Tente de novo.' : `Não foi possível falar com a IA agora (${String(err?.message || err).slice(0, 120)}).` });
  }
}

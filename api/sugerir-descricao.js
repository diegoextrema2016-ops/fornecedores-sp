// Sugestão de descrição comercial com IA (função da Vercel).
// Regras:
//  - só responde a quem está logado no site (confere o token no Supabase);
//  - limite de uso por conta (função consume_rate_limit no banco); se o banco não responder, bloqueia;
//  - as chaves ficam nas variáveis de ambiente da Vercel, nunca no código:
//      GROQ_API_KEY (gratuita, console.groq.com) tem prioridade;
//      GEMINI_API_KEY (gratuita, Google AI Studio) é usada se a Groq não estiver configurada;
//      ANTHROPIC_API_KEY (paga) é usada se nenhuma das outras estiver configurada;
//  - sem nenhuma chave, responde { fallback: true } e o site usa sugestões prontas;
//  - erros para o usuário são genéricos; o detalhe técnico vai só para o log da Vercel.
import { SUPABASE } from '../js/config.js';

// Quantas sugestões cada conta pode pedir por hora.
const LIMITE_POR_HORA = 20;

const MSG_IA_INDISPONIVEL = 'A IA não respondeu agora. Tente de novo em alguns instantes.';

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

// Palavras-chave: lista curta, separada por vírgula, só com o que está nos textos do fornecedor.
function promptPalavras({ categoria, instrucao, descricao }) {
  return [
    `Crie de 5 a 8 palavras-chave curtas, em português do Brasil, para um fornecedor de atacado da categoria "${categoria}".`,
    descricao ? `Descrição do fornecedor: "${descricao}".` : '',
    instrucao ? `Orientação do fornecedor: "${instrucao}".` : '',
    'Use somente palavras ligadas aos produtos citados. Não invente marcas. Responda somente com as palavras separadas por vírgula, em minúsculas, sem frases.',
  ].filter(Boolean).join(' ');
}

// Devolve os dados do usuário logado, ou null se o token não for válido.
// Erro de rede com o Supabase é lançado e tratado no handler (vira 503).
async function identificarUsuario(token) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) return null;
  const usuario = await r.json().catch(() => null);
  return usuario?.id ? usuario : null;
}

// Conta uma sugestão para este usuário.
// true = dentro do limite; false = limite atingido; null = banco indisponível (o pedido é recusado).
async function consumirLimite(token, uid) {
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_chave: `sugerir:${uid}`, p_limite: LIMITE_POR_HORA, p_janela_segundos: 3600 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.error('consume_rate_limit respondeu', r.status);
      return null;
    }
    return (await r.json()) === true;
  } catch (err) {
    console.error('consume_rate_limit falhou', err?.message);
    return null;
  }
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

// Groq (gratuita, muito rápida). Usa o formato da OpenAI. Modelo pode ser trocado por GROQ_MODEL.
async function chamarGroq(prompt) {
  const modelo = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      // Modelo de raciocínio: "low" deixa a resposta rápida; o limite maior evita texto cortado.
      reasoning_effort: 'low',
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(12000),
  });
}

async function comGroq(prompt) {
  let r = await chamarGroq(prompt);
  // Serviço ocupado: espera 2 segundos e tenta mais uma vez.
  if ([429, 500, 503].includes(r.status)) {
    await new Promise((ok) => setTimeout(ok, 2000));
    r = await chamarGroq(prompt);
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Groq respondeu', r.status, String(json?.error?.message || '').slice(0, 300));
    return { erro: MSG_IA_INDISPONIVEL };
  }
  const texto = String(json?.choices?.[0]?.message?.content || '').trim();
  return texto ? { texto } : { erro: 'A IA não devolveu texto. Tente de novo.' };
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
  if (!r.ok) {
    console.error('Gemini respondeu', r.status, String(json?.error?.message || '').slice(0, 300));
    return { erro: MSG_IA_INDISPONIVEL };
  }
  const texto = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return texto ? { texto } : { erro: 'A IA não devolveu texto. Tente de novo.' };
}

// Anthropic (paga). Usada só se a Groq e a Gemini não estiverem configuradas.
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
  if (!r.ok) {
    console.error('Anthropic respondeu', r.status, String(json?.error?.message || '').slice(0, 300));
    return { erro: MSG_IA_INDISPONIVEL };
  }
  const texto = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return texto ? { texto } : { erro: 'A IA não devolveu texto. Tente de novo.' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(200).json({ fallback: true });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const usuario = token ? await identificarUsuario(token) : null;
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta para usar a sugestão.' });

    const dentroDoLimite = await consumirLimite(token, usuario.id);
    if (dentroDoLimite === null) return res.status(503).json({ error: 'Serviço indisponível agora. Tente de novo em instantes.' });
    if (!dentroDoLimite) return res.status(429).json({ error: 'Muitas sugestões em pouco tempo. Aguarde alguns minutos e tente de novo.' });

    let corpo;
    try {
      corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'Pedido inválido.' });
    }
    const dados = {
      categoria: String(corpo.categoria || 'produtos para revenda').slice(0, 80),
      instrucao: String(corpo.instrucao || '').replace(/["\n\r]/g, ' ').trim().slice(0, 300),
      descricao: String(corpo.descricao || '').replace(/["\n\r]/g, ' ').trim().slice(0, 600),
    };
    const prompt = corpo.tipo === 'palavras' ? promptPalavras(dados) : promptPara(dados);

    const resultado = process.env.GROQ_API_KEY
      ? await comGroq(prompt)
      : process.env.GEMINI_API_KEY
        ? await comGemini(prompt)
        : await comAnthropic(prompt);
    if (resultado.erro) return res.status(502).json({ error: resultado.erro });
    return res.status(200).json({ texto: resultado.texto.slice(0, 600) });
  } catch (err) {
    // Detalhe técnico só no log; para o usuário, mensagem genérica.
    console.error('sugerir-descricao falhou', err?.name, err?.message);
    const demorou = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return res.status(502).json({ error: demorou ? 'A IA demorou demais para responder. Tente de novo.' : MSG_IA_INDISPONIVEL });
  }
}

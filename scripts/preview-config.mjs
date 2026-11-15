// Prévia da Vercel (ambiente Preview): o site só pode falar com o projeto Supabase DE TESTE.
//
// Regra de segurança (falha fechada): se o build roda no ambiente Preview, as três configurações
// vêm das variáveis SUPABASE_DEV_URL, SUPABASE_DEV_ANON_KEY e o endereço da própria prévia (VERCEL_URL).
// Se faltar qualquer uma, ou se qualquer valor apontar para o projeto de PRODUÇÃO, o build falha
// e nada é publicado. Esta função não lê nem grava dados: só valida e devolve a configuração.

export const PROD_REF = 'fzjiixiqezvvfeybydie';
export const PROD_SUPABASE_URL = `https://${PROD_REF}.supabase.co`;
export const PROD_SITE = 'https://www.fornecedoresdesp.com.br';

export function ehPrevia(env) {
  return env.VERCEL_ENV === 'preview';
}

// prodAnonKey: chave pública de produção (vem de js/config.js). Nunca pode ser usada na prévia.
export function configuracaoDePrevia(env, prodAnonKey) {
  const supabaseUrl = String(env.SUPABASE_DEV_URL || '').trim().replace(/\/$/, '');
  const anonKey = String(env.SUPABASE_DEV_ANON_KEY || '').trim();
  const host = String(env.VERCEL_URL || '').trim();

  if (!supabaseUrl) throw new Error('prévia: falta a variável SUPABASE_DEV_URL (projeto DEV).');
  if (!anonKey) throw new Error('prévia: falta a variável SUPABASE_DEV_ANON_KEY (chave publicável do projeto DEV).');
  if (!host) throw new Error('prévia: a Vercel não informou VERCEL_URL.');

  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) {
    throw new Error('prévia: SUPABASE_DEV_URL deve ser https://<ref>.supabase.co');
  }
  if (supabaseUrl.includes(PROD_REF)) {
    throw new Error('prévia: SUPABASE_DEV_URL aponta para o projeto de PRODUÇÃO. Build recusado.');
  }
  if (!/^sb_publishable_/.test(anonKey) && !/^eyJ/.test(anonKey)) {
    throw new Error('prévia: SUPABASE_DEV_ANON_KEY deve ser a chave PUBLICÁVEL do projeto DEV.');
  }
  if (prodAnonKey && anonKey === prodAnonKey) {
    throw new Error('prévia: SUPABASE_DEV_ANON_KEY é a chave de PRODUÇÃO. Build recusado.');
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(host)) {
    throw new Error('prévia: VERCEL_URL deve ser um endereço *.vercel.app.');
  }
  return { supabaseUrl, anonKey, siteUrl: `https://${host}` };
}

// Procura referências de produção no resultado. Lista os arquivos com problema (vazio = seguro).
export function referenciasDeProducao(arquivos, prodAnonKey) {
  const achados = [];
  for (const { nome, texto } of arquivos) {
    if (texto.includes(PROD_REF) || texto.includes(PROD_SITE) || (prodAnonKey && texto.includes(prodAnonKey))) {
      achados.push(nome);
    }
  }
  return achados;
}

// Para onde a pessoa volta depois de entrar na conta. Módulo puro: recebe o armazenamento e o relógio,
// por isso é testável no Node.
//
// Quem chega ao login vindo de "Cadastrar fornecedor" ou do botão de assinar deve voltar para lá, e não
// cair sempre em Favoritos. O destino fica guardado no navegador por até 2 horas (a confirmação de e-mail
// pode abrir em outra aba) e só aceita endereços internos do próprio site.
const CHAVE = 'spf:voltar';
const VALIDADE_MS = 2 * 60 * 60 * 1000;

// Telas de entrada: enquanto a pessoa está nelas, o destino guardado continua valendo.
export const ROTA_DE_ENTRADA = /^\/(login|registro|esqueci-senha|redefinir-senha|reenviar-confirmacao|conta\/retorno)$/;

// Só caminho interno ("/algo"), nunca outro site ("//x", "/\x", "http:"), nem tela de entrada, saída ou painel.
export function destinoValido(caminho) {
  if (typeof caminho !== 'string' || caminho.length > 200) return false;
  if (!/^\/(?![/\\])[^\s\\]*$/.test(caminho)) return false;
  const rota = caminho.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (ROTA_DE_ENTRADA.test(rota) || rota === '/sair' || rota === '/' || /^\/admin(\/|$)/.test(rota)) return false;
  return true;
}

const armazenamentoPadrao = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export function guardaDestino(caminho, storage = armazenamentoPadrao(), agora = Date.now()) {
  if (!storage || !destinoValido(caminho)) return false;
  try {
    storage.setItem(CHAVE, JSON.stringify({ caminho, em: agora }));
    return true;
  } catch {
    return false;
  }
}

export function leDestino(storage = armazenamentoPadrao(), agora = Date.now()) {
  if (!storage) return '';
  try {
    const { caminho, em } = JSON.parse(storage.getItem(CHAVE) || '{}');
    if (!destinoValido(caminho) || typeof em !== 'number' || agora - em > VALIDADE_MS || agora < em) return '';
    return caminho;
  } catch {
    return '';
  }
}

export function limpaDestino(storage = armazenamentoPadrao()) {
  try {
    storage?.removeItem(CHAVE);
  } catch { /* armazenamento indisponível: nada a limpar */ }
}

// Tela depois do login: administrador vai ao painel; os demais voltam para onde estavam.
// Sem destino guardado: assinante vai aos favoritos; quem ainda não assina vai para a própria conta.
export function destinoDepoisDoLogin({ admin = false, assinante = false, destino = '' } = {}) {
  if (admin) return '/admin';
  if (destinoValido(destino)) return destino;
  return assinante ? '/favoritos' : '/conta';
}

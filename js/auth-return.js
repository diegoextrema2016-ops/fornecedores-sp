// Leitura do retorno dos links de e-mail do Supabase Auth (confirmação, recuperação e troca de e-mail).
// O Supabase devolve os dados depois do # do endereço: tokens (sucesso) ou error/error_code (falha).
// Este módulo não importa nada da rede, para poder ser testado com node --test.

// Tipos de ação que o Supabase informa no retorno: signup, recovery, email_change, invite, magiclink.
export const AUTH_TYPES = ['signup', 'recovery', 'email_change', 'invite', 'magiclink'];

// Lê o # do endereço. Devolve null quando não há nada de autenticação no link.
export function parseAuthReturn(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw || !/(access_token|error|error_code|type)=/.test(raw)) return null;
  const params = new URLSearchParams(raw);
  const type = AUTH_TYPES.includes(params.get('type')) ? params.get('type') : null;
  const errorCode = params.get('error_code') || (params.get('error') ? 'access_denied' : null);
  if (errorCode) {
    return { kind: 'error', type, errorCode, errorDescription: params.get('error_description') || '' };
  }
  if (params.get('access_token')) {
    return { kind: 'success', type };
  }
  return null;
}

// Mensagem clara para o usuário quando o link falhou.
// Links expirados, já usados ou inválidos recebem orientação para pedir um novo link.
export function authReturnErrorMessage(ret) {
  if (!ret || ret.kind !== 'error') return null;
  if (ret.errorCode === 'otp_expired') {
    return 'Este link expirou. Por segurança, os links valem por tempo limitado. Solicite um novo e tente de novo.';
  }
  if (ret.errorCode === 'access_denied') {
    return 'Este link é inválido ou já foi usado. Solicite um novo link e use o mais recente que chegar.';
  }
  return 'Não foi possível validar este link. Solicite um novo e tente de novo.';
}

// Chave de sessão que marca "a próxima tela é de troca de senha". Sobrevive ao recarregamento da página.
export const RECOVERY_MARK_KEY = 'spf:recovery-pending';

// Regras da nova senha (iguais às do cadastro).
export function validateNewPassword(password = '', confirm = '') {
  if (String(password).length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (password !== confirm) return 'As senhas não coincidem. Digite a mesma senha nos dois campos.';
  return null;
}

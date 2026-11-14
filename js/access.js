// Regra de acesso ao catálogo (fornecedores, fotos, contatos). Administrador sempre tem acesso;
// demais usuários precisam de assinatura ativa, que expira na data exata (sem carência).
// Esta checagem roda no navegador só para a interface. A proteção real está no banco: fornecedores,
// fotos, contatos e imagens só são lidos por assinante ativo, dono e administrador (supabase/migration-007 a 009).
import { store } from './store.js';

export function canSeeCatalog() {
  const session = store.session.get();
  if (!session) return false;
  if (session.role === 'admin') return true;
  return store.subscriptions.isActive();
}

export function subscriptionInfo() {
  const session = store.session.get();
  if (!session || session.role === 'admin') return null;
  return store.subscriptions.get();
}

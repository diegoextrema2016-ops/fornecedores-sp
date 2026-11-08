// Regra de acesso aos contatos. Administrador sempre tem acesso; demais usuários precisam de assinatura ativa.
// Esta checagem roda no navegador, então serve à experiência, não à segurança.
// A proteção real deve ficar no banco (RLS), ver README, seção "Banco de dados".
import { store } from './store.js';

export function canSeeContacts() {
  const session = store.session.get();
  if (!session) return false;
  if (session.role === 'admin') return true;
  return store.subscriptions.isActive(session.email);
}

export function subscriptionInfo() {
  const session = store.session.get();
  if (!session || session.role === 'admin') return null;
  return store.subscriptions.get(session.email);
}

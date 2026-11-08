// Regra de acesso aos contatos. Administrador sempre tem acesso; demais usuários precisam de assinatura ativa.
// Esta checagem roda no navegador só para a interface (botões, borrão). A proteção real está no banco:
// a tabela supplier_contacts só é lida por dono, administrador e assinante ativo (ver supabase/schema.sql).
import { store } from './store.js';

export function canSeeContacts() {
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

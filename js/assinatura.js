// Regra de assinatura ativa. Funções puras (sem rede, sem navegador): o store usa e os testes conferem.
// Sem carência (decisão D5): a assinatura ativa vale até o instante de vencimento, e depois disso o acesso acaba.

// Assinatura que vale agora: a ativa com vencimento mais distante; senão, a mais recente da lista.
export function bestSubscription(list = [], now = Date.now()) {
  const active = list
    .filter((s) => s.status === 'active' && new Date(s.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];
  return active || list[0] || null;
}

// Tem assinatura ativa neste instante? Pendente, cancelada, expirada ou sem assinatura: não.
export function hasActiveSubscription(list = [], now = Date.now()) {
  const sub = bestSubscription(list, now);
  return Boolean(sub) && sub.status === 'active' && new Date(sub.expiresAt).getTime() > now;
}

// Instante (ms) em que a assinatura atual vence. Infinity se não houver assinatura com prazo.
export function accessExpiresAt(list = [], now = Date.now()) {
  const sub = bestSubscription(list, now);
  return sub?.expiresAt ? new Date(sub.expiresAt).getTime() : Infinity;
}

// Decide se o site precisa de publicação nova, com debounce de duas leituras seguidas.
// Estado = { publicado, pendente }: o hash do que está no ar e o último hash visto que ainda não foi confirmado.
//   - igual ao publicado: nada a fazer.
//   - igual ao pendente (visto duas vezes seguidas): publica e marca como publicado.
//   - diferente dos dois: guarda como pendente e espera a próxima leitura (evita build por edição isolada).
//   - sem estado anterior: publica uma vez para alinhar o site com o banco.
export function decidir(estado, atual) {
  if (!estado) return { publicar: true, estado: { publicado: atual, pendente: null }, motivo: 'sem estado anterior' };
  if (estado.publicado === atual) return { publicar: false, estado: { publicado: atual, pendente: null }, motivo: 'sem alterações' };
  if (estado.pendente === atual) return { publicar: true, estado: { publicado: atual, pendente: null }, motivo: 'alteração confirmada em duas leituras' };
  return { publicar: false, estado: { publicado: estado.publicado, pendente: atual }, motivo: 'alteração vista; aguarda confirmação' };
}

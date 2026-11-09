// Sugestões de descrição comercial para o formulário de fornecedor.
// Frases neutras: não afirmam tempo de mercado, prêmios ou dados que a loja ainda não informou.
// Quem cadastra lê, ajusta e confirma o texto antes de enviar.
const ABERTURAS_COM_CATEGORIA = [
  'Loja de {cat} em São Paulo, com peças para quem compra no atacado.',
  'Trabalhamos com {cat} para quem quer abastecer a loja com bons preços.',
  'Fornecedor de {cat} com foco em revenda e atendimento direto.',
  'Seu fornecedor de {cat} para comprar com preço de atacado.',
];
const ABERTURAS_GERAIS = [
  'Fornecedor de atacado em São Paulo, com produtos para revenda.',
  'Produtos para quem vende e quer comprar com preço de atacado.',
  'Fornecedor com opções variadas para abastecer o seu negócio.',
  'Para quem compra para revender: preço de atacado e produtos prontos para vender.',
  'Abastecimento para lojas e revendedores, com atendimento direto pelo WhatsApp.',
];
const PRODUTOS = [
  'peças prontas para revenda',
  'coleções novas com frequência',
  'boa variedade de modelos',
  'produtos com bom custo-benefício',
  'itens selecionados para revenda',
  'opções para diferentes públicos',
  'novidades que giram rápido na loja',
  'peças com boa saída para revenda',
  'estoque variado para repor sua prateleira',
  'produtos escolhidos a dedo para revenda',
];
const VENDA_ATACADO = ['Vendemos no atacado.', 'Atendemos compras no atacado.'];
const VENDA_VAREJO = ['Também atendemos no varejo.', 'Vendemos também no varejo.'];
const FECHAMENTOS = [
  'Fale com a gente e peça seu orçamento.',
  'Chame no WhatsApp e confira as condições.',
  'Atendimento direto para pedidos e orçamentos.',
  'Entre em contato e confira as condições de compra.',
  'Fale com a equipe e veja os modelos disponíveis.',
  'Manda uma mensagem e receba a tabela de preços.',
];

// Monta uma descrição aleatória a partir da categoria e das opções de venda marcadas.
// rand é injetável para teste (padrão: Math.random). O resultado tem no máximo 600 caracteres.
export function sugerirDescricao(
  { categoria = '', atacado = false, varejo = false, lojistas = false, outrasCidades = false } = {},
  rand = Math.random,
) {
  const pick = (lista) => lista[Math.floor(rand() * lista.length)];
  const cat = String(categoria || '').trim().toLowerCase();
  const abertura = cat
    ? pick(ABERTURAS_COM_CATEGORIA).replace('{cat}', cat)
    : pick(ABERTURAS_GERAIS);
  const frases = [abertura, `Oferecemos ${pick(PRODUTOS)}.`];
  if (atacado) frases.push(pick(VENDA_ATACADO));
  if (varejo) frases.push(pick(VENDA_VAREJO));
  if (lojistas) frases.push('Atendemos lojistas e revendedores.');
  if (outrasCidades) frases.push('Enviamos para outras cidades.');
  frases.push(pick(FECHAMENTOS));
  return frases.join(' ').slice(0, 600);
}

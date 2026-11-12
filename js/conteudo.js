// Conteúdo público de SEO: guias, textos das regiões e a página de planos.
// Usado pelo build (páginas pré-geradas) e pelo app, para o texto ser o mesmo nas duas versões.
// Regra: nada aqui cita número, preço ou dado de fornecedor específico. Preços vêm de js/config.js (PLANS).
import { PLANS, SITE } from './config.js';

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ENT[c]);

// Preposição certa antes do nome da região ("no Brás", "na 25 de Março").
export const regiaoPrep = (nome) => (/^(25 de Março|Santa Ifigênia)$/.test(nome) ? 'na' : 'no');

// Nomes das regiões de SP usados em links de texto (o banco guarda o slug).
export const REGIAO_NOME = { 'bras': 'Brás', '25-de-marco': '25 de Março', 'bom-retiro': 'Bom Retiro', 'pari': 'Pari', 'santa-ifigenia': 'Santa Ifigênia' };

// Textos próprios das regiões comerciais de São Paulo (chave = slug da região no banco).
export const REGIAO_TEXTO = {
  'bras': 'O Brás é um dos bairros de comércio atacadista mais conhecidos de São Paulo. Concentra lojas de roupas, calçados, acessórios e outros produtos voltados para quem revende, e muitas delas atendem lojistas de todo o país.',
  'bom-retiro': 'O Bom Retiro tem tradição na confecção e no comércio de moda. Muitas lojas da região trabalham com peças para revenda, em diferentes faixas de preço e estilos.',
  '25-de-marco': 'A Rua 25 de Março e o entorno são conhecidos pelo comércio atacadista de variados produtos. É um dos pontos mais procurados por quem compra para revender no centro da cidade.',
  'pari': 'O Pari fica perto de outros polos de atacado da capital e tem lojas de produtos variados para revenda. É uma opção para comparar fornecedores sem sair da região central.',
  'santa-ifigenia': 'A Santa Ifigênia e o centro de São Paulo reúnem comércio atacadista e varejista em diversos segmentos. Vale comparar fornecedores da região com os de outros bairros antes de comprar.',
};

// Guias públicos. Cada guia tem seções com parágrafos e itens de lista.
export const GUIAS = [
  {
    slug: 'como-encontrar-fornecedores-no-bras',
    title: 'Como encontrar fornecedores no Brás | Guia de atacado SP',
    description: 'Guia prático para encontrar fornecedores de atacado no Brás: onde procurar, o que perguntar antes de comprar e como comparar lojas.',
    h1: 'Como encontrar fornecedores no Brás',
    intro: 'O Brás é um dos polos de atacado mais conhecidos de São Paulo. Para quem revende, o desafio não é achar lojas, e sim encontrar as que vendem no atacado, têm o produto certo e atendem o volume que você precisa.',
    sections: [
      { h2: 'Defina o que você precisa vender', paragraphs: ['Antes de procurar, escreva o tipo de produto, a faixa de preço e o público da sua loja. Um fornecedor de moda feminina pode não trabalhar com moda infantil, e saber isso antes economiza tempo de visita e de conversa.'] },
      { h2: 'Pesquise por categoria e bairro', paragraphs: ['Use as categorias para ver quem trabalha com o seu segmento e os bairros para comparar regiões. Assim você monta uma lista curta antes de falar com alguém.'] },
      { h2: 'Pergunte antes de comprar', list: ['Vende no atacado ou só para lojistas?', 'Qual é o pedido mínimo?', 'Envia para outras cidades?', 'Quais são as formas de pagamento e a política de troca?', 'Qual é o horário de atendimento e por onde se fala com a loja?'] },
      { h2: 'Compare antes de decidir', paragraphs: ['Peça amostras, confira o acabamento das peças, compare preço e prazo e veja se o fornecedor responde com clareza. Quem demora ou não explica as condições merece cautela.'] },
      { h2: 'Cuidado com golpes', paragraphs: ['Evite pagamento antecipado para quem você não conhece, confira o endereço da loja e desconfie de preços muito abaixo do mercado. Se possível, visite o local ou peça referências de outros lojistas.'] },
    ],
    related: { categorias: true, regioes: ['bras', '25-de-marco', 'bom-retiro'] },
  },
  {
    slug: 'como-comprar-roupas-no-atacado-em-sao-paulo',
    title: 'Como comprar roupas no atacado em São Paulo | Guia',
    description: 'Passo a passo para comprar roupas no atacado em São Paulo: planejamento da compra, pedido mínimo, giro de estoque e reposição.',
    h1: 'Como comprar roupas no atacado em São Paulo',
    intro: 'Comprar roupas no atacado exige planejamento. Quem compra sem uma base costuma ficar com peças paradas no estoque. Este guia mostra como organizar a compra do início ao fim.',
    sections: [
      { h2: 'Planejamento da compra', paragraphs: ['Defina antes o orçamento, os modelos que vai testar e a quantidade de cada tamanho. Ter essas informações por escrito ajuda a não comprar por impulso.'] },
      { h2: 'Entenda o pedido mínimo', paragraphs: ['Cada fornecedor tem seu pedido mínimo, em peças ou em valor. Pergunte sempre antes de escolher, porque ele muda muito de uma loja para outra e afeta o custo por peça.'] },
      { h2: 'Organize o giro', paragraphs: ['Compre mais dos modelos que já vendem bem e menos dos que são apenas aposta. Uma parte pequena do estoque para testes ajuda a descobrir novidades sem arriscar a compra toda.'] },
      { h2: 'Reposição e relacionamento', paragraphs: ['Fornecedores confiáveis facilitam a reposição e às vezes avisam de novidades. Mantenha contato com os que deram bons resultados e registre o que comprou de cada um.'] },
      { h2: 'Erros comuns', list: ['Comprar sem conferir tamanhos e costuras.', 'Ignorar o prazo de entrega e o custo do frete.', 'Estocar peças que não combinam com o público da loja.', 'Não comparar pelo menos três opções antes de fechar.'] },
    ],
    related: { categorias: true, regioes: ['bras', 'bom-retiro'] },
  },
  {
    slug: 'como-escolher-fornecedores-para-revenda',
    title: 'Como escolher bons fornecedores para revenda | Guia',
    description: 'Critérios para escolher fornecedores para revenda: qualidade, condições de venda, atendimento, prazo e confiança antes de comprar.',
    h1: 'Como escolher bons fornecedores para revenda',
    intro: 'Um bom fornecedor deixa o seu negócio mais previsível: entrega no prazo, mantém a qualidade e explica as condições com clareza. Estes critérios ajudam a separar as opções.',
    sections: [
      { h2: 'Qualidade do produto', paragraphs: ['Peça amostras e observe o acabamento, o tecido e as costuras. Compare com o que você vê em outras lojas do mesmo segmento para ter uma referência justa.'] },
      { h2: 'Condições de venda', paragraphs: ['Confirme se a loja vende no atacado, qual o pedido mínimo, as formas de pagamento e a política de troca. Condições escritas evitam conflitos depois.'] },
      { h2: 'Atendimento e prazo', paragraphs: ['Veja se as respostas são rápidas e claras antes da compra, porque o atendimento costuma piorar depois de fechar o pedido. Confirme o prazo de entrega por escrito.'] },
      { h2: 'Confiança', list: ['Endereço e canais de contato informados.', 'Histórico de clientes que indicam a loja.', 'Condições que não mudam a cada conversa.', 'Nenhuma pressão para pagar antes de conhecer o produto.'] },
    ],
    related: { categorias: true, regioes: ['bras', '25-de-marco', 'pari'] },
  },
  {
    slug: 'atacado-ou-varejo-diferencas',
    title: 'Atacado ou varejo: diferenças para quem revende',
    description: 'Entenda as diferenças entre comprar no atacado e no varejo, quando cada opção compensa e como isso afeta o preço e o estoque.',
    h1: 'Atacado ou varejo: diferenças para quem revende',
    intro: 'Quem está começando a revender costuma se perguntar se vale mais comprar no varejo ou no atacado. A resposta depende do volume, do capital disponível e do tipo de produto.',
    sections: [
      { h2: 'O que muda no preço', paragraphs: ['No atacado, o preço por peça costuma ser menor, mas exige um pedido mínimo. No varejo, a compra é menor e mais flexível, porém o custo unitário é mais alto.'] },
      { h2: 'Capital e estoque', paragraphs: ['O atacado pede mais dinheiro de uma vez e mais espaço para guardar. Comece com um estoque que você consiga girar, para não ficar com mercadoria parada.'] },
      { h2: 'Quando cada opção compensa', list: ['Varejo: para testar produtos e começar com pouco capital.', 'Atacado: para lojas com giro conhecido e volume previsível.', 'Mistura: comprar a base no atacado e testar novidades no varejo.'] },
      { h2: 'Como decidir', paragraphs: ['Calcule o custo de cada peça, somando frete e taxas, e compare com o preço de venda. Assim você vê se a margem cobre o trabalho e o risco de cada opção.'] },
    ],
    related: { categorias: true, regioes: ['bras'] },
  },
];

export const guiaPorSlug = (slug) => GUIAS.find((g) => g.slug === slug) || null;

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
export const planosOferecidos = () => PLANS.filter((p) => p.offered !== false);

// Marcação do conteúdo principal (sem cabeçalho e rodapé). Mesma marcação serve para o app e para o build.
export function planosMainHtml() {
  const cards = planosOferecidos().map((p) => `
      <article class="card">
        <h2>${esc(p.name)}</h2>
        <p class="plan-price"><strong>${esc(brl(p.price))}</strong> <span class="muted">por ${esc(String(p.days))} dias</span></p>
        <p>${esc(p.description)}</p>
      </article>`).join('');
  return `
    <section class="container section-tight">
      <nav class="breadcrumbs" aria-label="Você está em"><ol><li><a href="/site">Início</a></li><li aria-current="page">Planos</li></ol></nav>
      <h1>Planos de acesso aos fornecedores</h1>
      <p class="lead">Qualquer visitante vê a descrição e as principais informações de cada fornecedor. Os contatos completos (WhatsApp, Instagram e endereço) são liberados por assinatura.</p>
      <div class="grid grid-2">${cards}</div>
      <p><button class="btn btn-primary btn-lg" type="button" data-action="unlock">Ver planos de acesso</button></p>
      <p class="small muted">O pagamento é feito por Pix. Depois da confirmação, o acesso aos contatos é liberado.</p>
    </section>`;
}

export function guiasIndexMainHtml() {
  const items = GUIAS.map((g) => `<li><a href="/guias/${esc(g.slug)}"><strong>${esc(g.h1)}</strong></a><br><span class="small">${esc(g.description)}</span></li>`).join('');
  return `
    <section class="container section-tight">
      <nav class="breadcrumbs" aria-label="Você está em"><ol><li><a href="/site">Início</a></li><li aria-current="page">Guias</li></ol></nav>
      <h1>Guias para quem compra no atacado em São Paulo</h1>
      <p class="lead">Textos práticos para quem quer encontrar fornecedores de atacado e revenda em São Paulo.</p>
      <ul class="plain-list">${items}</ul>
    </section>`;
}

export function guiaMainHtml(g) {
  const sections = g.sections.map((s) => `
      <h2>${esc(s.h2)}</h2>
      ${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${s.list ? `<ul>${s.list.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}`).join('');
  const regioes = (g.related?.regioes || []).map((slug) => `<li><a href="/regiao/${esc(slug)}">${esc(REGIAO_NOME[slug] || slug)}</a></li>`).join('');
  return `
    <article class="container section-tight prose">
      <nav class="breadcrumbs" aria-label="Você está em"><ol><li><a href="/site">Início</a></li><li><a href="/guias">Guias</a></li><li aria-current="page">${esc(g.h1)}</li></ol></nav>
      <h1>${esc(g.h1)}</h1>
      <p class="lead">${esc(g.intro)}</p>
      ${sections}
      <h2>Continue pesquisando</h2>
      <ul>
        <li><a href="/categorias">Ver as categorias de fornecedores</a></li>
        ${regioes ? `<li>Bairros: <ul>${regioes}</ul></li>` : ''}
        <li><a href="/planos">Conheça os planos de acesso aos contatos</a></li>
      </ul>
      <p><a class="btn btn-primary" href="/planos">Conhecer os planos</a></p>
    </article>`;
}

// Texto de apoio da região (usado no topo da página da região, antes da lista).
export const regiaoTexto = (slug) => REGIAO_TEXTO[slug] || '';

export const SITE_NAME = SITE.name;

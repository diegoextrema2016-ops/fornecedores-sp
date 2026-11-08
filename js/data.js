// Dados iniciais.
// ATENÇÃO: os fornecedores abaixo são FICTÍCIOS e servem apenas para demonstração (isDemo: true).
// Nomes, descrições e segmentos são inventados. Não há telefones, endereços de rua, Instagram nem avaliações reais.
// Para publicar fornecedores reais, cadastre-os pelo painel administrativo e remova os demos.

export const CATEGORIES = [
  { slug: 'eletronicos', name: 'Eletrônicos', icon: '🔌', description: 'Eletroeletrônicos, áudio, games e pequenos aparelhos.' },
  { slug: 'vapers-e-acessorios', name: 'Vapers e acessórios', icon: '🧩', description: 'Acessórios relacionados. Veja o aviso de conformidade no cadastro.', restricted: true },
  { slug: 'moda-feminina', name: 'Moda feminina', icon: '👗', description: 'Vestuário feminino para lojas e revendas.' },
  { slug: 'moda-masculina', name: 'Moda masculina', icon: '👔', description: 'Camisetas, calças, camisas e peças masculinas.' },
  { slug: 'roupas-infantis', name: 'Roupas infantis', icon: '🧸', description: 'Roupas para bebês, crianças e adolescentes.' },
  { slug: 'tenis', name: 'Tênis', icon: '👟', description: 'Tênis esportivos, casuais e de moda.' },
  { slug: 'calcados', name: 'Calçados', icon: '👞', description: 'Sapatos, sandálias, botas e chinelos.' },
  { slug: 'bolsas', name: 'Bolsas', icon: '👜', description: 'Bolsas, mochilas e carteiras.' },
  { slug: 'perfumes', name: 'Perfumes', icon: '🧴', description: 'Perfumes e fragrâncias para revenda.' },
  { slug: 'cosmeticos', name: 'Cosméticos', icon: '💄', description: 'Maquiagem, skincare e higiene pessoal.' },
  { slug: 'acessorios', name: 'Acessórios', icon: '🕶️', description: 'Acessórios de moda e de uso diário.' },
  { slug: 'bijuterias', name: 'Bijuterias', icon: '💍', description: 'Bijuterias, semijoias e acessórios de metal.' },
  { slug: 'relogios', name: 'Relógios', icon: '⌚', description: 'Relógios analógicos e digitais.' },
  { slug: 'oculos', name: 'Óculos', icon: '👓', description: 'Armações, óculos de sol e acessórios.' },
  { slug: 'utilidades-domesticas', name: 'Utilidades domésticas', icon: '🏠', description: 'Cozinha, limpeza e organização da casa.' },
  { slug: 'importados', name: 'Importados', icon: '🌎', description: 'Produtos importados e de origem internacional.' },
  { slug: 'brinquedos', name: 'Brinquedos', icon: '🪀', description: 'Brinquedos, jogos e itens de papelaria infantil.' },
  { slug: 'informatica', name: 'Informática', icon: '💻', description: 'Componentes, periféricos e acessórios de computador.' },
  { slug: 'capinhas-celular', name: 'Capinhas e acessórios para celular', icon: '📱', description: 'Capinhas, películas, cabos e carregadores.' },
  { slug: 'outros-segmentos', name: 'Outros segmentos', icon: '📦', description: 'Outros tipos de fornecedores.' },
];

// Regiões comerciais. "bairro" é o valor usado nos filtros e nos endereços.
export const REGIONS = [
  { slug: '25-de-marco', name: '25 de Março', description: 'Um dos maiores polos de comércio popular e atacado da América Latina.' },
  { slug: 'bras', name: 'Brás', description: 'Polo tradicional de confecções, calçados e variedades.' },
  { slug: 'pari', name: 'Pari', description: 'Região de atacado, distribuição e logística de mercadorias.' },
  { slug: 'bom-retiro', name: 'Bom Retiro', description: 'Confecção e moda, com forte presença de malharias e atacadistas.' },
  { slug: 'santa-ifigenia', name: 'Santa Ifigênia', description: 'Eletrônicos, informática e acessórios.' },
];

export const SUPPLIER_TYPES = [
  { value: 'fabricante', label: 'Fabricante' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'atacadista', label: 'Atacadista' },
  { value: 'varejista', label: 'Varejista' },
];

// Fornecedores de demonstração foram removidos. O site começa sem fornecedores de exemplo.
export const DEMO_SUPPLIERS = [];

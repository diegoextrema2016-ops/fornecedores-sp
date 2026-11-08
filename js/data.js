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

// Fornecedores de demonstração (fictícios).
const demo = (o) => ({
  name: '', description: '', category: 'outros-segmentos', subcategory: '', supplierType: 'atacadista',
  tags: [], whatsapp: '', instagram: '', site: '', address: '', number: '', complement: '', bairro: '25-de-marco',
  city: 'São Paulo', state: 'SP', cep: '', saleWholesale: true, saleRetail: false, saleResellers: true,
  shipsOtherCities: false, minOrder: '', hours: '', logo: '', photos: [],
  status: 'approved', verified: false, featured: false, views: 0,
  createdAt: '2026-01-15T10:00:00.000Z', ownerEmail: '', isDemo: true, ...o,
});

export const DEMO_SUPPLIERS = [
  demo({ name: 'Vitrine Feminina Demo Brás', category: 'moda-feminina', subcategory: 'Vestidos e blusas', bairro: 'bras', supplierType: 'atacadista', tags: ['vestido', 'blusa', 'atacado'], description: 'Fornecedor fictício de vestuário feminino para revendedoras. Coleções semanais.', verified: true, featured: true, views: 320, createdAt: '2026-10-01T10:00:00.000Z' }),
  demo({ name: 'Tênis Central Demo Pari', category: 'tenis', subcategory: 'Esportivo', bairro: 'pari', supplierType: 'distribuidor', tags: ['tênis', 'corrida', 'caixa fechada'], description: 'Distribuidor fictício de tênis esportivos e casuais em grade fechada.', verified: true, views: 280, createdAt: '2026-09-20T10:00:00.000Z' }),
  demo({ name: 'Eletro Norte Demo', category: 'eletronicos', subcategory: 'Pequenos aparelhos', bairro: '25-de-marco', supplierType: 'distribuidor', tags: ['caixa de som', 'fone', 'eletrônicos'], description: 'Distribuidor fictício de pequenos eletrônicos e acessórios de áudio.', views: 210, createdAt: '2026-08-11T10:00:00.000Z' }),
  demo({ name: 'Essência Perfumaria Demo', category: 'perfumes', subcategory: 'Importados e nacionais', bairro: 'bras', supplierType: 'atacadista', tags: ['perfume', 'fragrância', 'kit'], description: 'Atacadista fictício de perfumes para revenda em lojas e feiras.', views: 190, createdAt: '2026-07-05T10:00:00.000Z' }),
  demo({ name: 'Capinhas & Cia Demo', category: 'capinhas-celular', subcategory: 'Capinhas e películas', bairro: '25-de-marco', supplierType: 'atacadista', tags: ['capinha', 'película', 'cabo', 'carregador'], description: 'Atacadista fictício de capinhas, películas e cabos para celular.', verified: true, views: 175, createdAt: '2026-10-18T10:00:00.000Z' }),
  demo({ name: 'Bijuterias Aurora Demo', category: 'bijuterias', subcategory: 'Semijoias', bairro: 'bom-retiro', supplierType: 'fabricante', tags: ['brinco', 'colar', 'semijoia'], description: 'Fabricante fictício de bijuterias e semijoias em pequenos lotes.', views: 130, createdAt: '2026-06-22T10:00:00.000Z' }),
  demo({ name: 'Moda Masculina Vértice Demo', category: 'moda-masculina', subcategory: 'Camisetas e calças', bairro: 'bras', supplierType: 'fabricante', tags: ['camiseta', 'calça jeans', 'masculina'], description: 'Fabricante fictício de camisetas e calças masculinas.', saleRetail: true, views: 240, createdAt: '2026-10-25T10:00:00.000Z' }),
  demo({ name: 'Brinquedos Pequeno Mundo Demo', category: 'brinquedos', subcategory: 'Brinquedos e papelaria', bairro: 'pari', supplierType: 'distribuidor', tags: ['brinquedo', 'jogos', 'papelaria'], description: 'Distribuidor fictício de brinquedos e itens de papelaria infantil.', views: 150, createdAt: '2026-05-30T10:00:00.000Z' }),
  demo({ name: 'Óculos Horizonte Demo', category: 'oculos', subcategory: 'Óculos de sol', bairro: '25-de-marco', supplierType: 'atacadista', tags: ['óculos de sol', 'armação'], description: 'Atacadista fictício de óculos de sol e armações.', views: 95, createdAt: '2026-04-14T10:00:00.000Z' }),
  demo({ name: 'Lar Prático Demo', category: 'utilidades-domesticas', subcategory: 'Cozinha e organização', bairro: 'bras', supplierType: 'distribuidor', tags: ['cozinha', 'organização', 'limpeza'], description: 'Distribuidor fictício de utilidades para casa e cozinha.', shipsOtherCities: true, views: 160, createdAt: '2026-03-09T10:00:00.000Z' }),
  demo({ name: 'Porto Franco Importados Demo', category: 'importados', subcategory: 'Diversos', bairro: '25-de-marco', supplierType: 'varejista', tags: ['importado', 'variedades'], description: 'Loja fictícia de produtos importados em pequenas quantidades.', saleRetail: true, saleWholesale: false, views: 85, createdAt: '2026-02-17T10:00:00.000Z' }),
  demo({ name: 'Tempo Certo Relógios Demo', category: 'relogios', subcategory: 'Analógicos e digitais', bairro: 'santa-ifigenia', supplierType: 'distribuidor', tags: ['relógio', 'digital', 'analógico'], description: 'Distribuidor fictício de relógios analógicos e digitais.', verified: true, views: 110, createdAt: '2026-01-28T10:00:00.000Z' }),
];

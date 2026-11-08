// Dados FICTÍCIOS usados apenas pelos testes automatizados (não vão para o site).
// Antes estavam em js/data.js; o site não carrega mais esses fornecedores.
const demo = (o) => ({
  name: '', description: '', category: 'outros-segmentos', subcategory: '', supplierType: 'atacadista',
  tags: [], whatsapp: '', instagram: '', site: '', address: '', number: '', complement: '', bairro: '25-de-marco',
  city: 'São Paulo', state: 'SP', cep: '', saleWholesale: true, saleRetail: false, saleResellers: true,
  shipsOtherCities: false, minOrder: '', hours: '', logo: '', photos: [],
  status: 'approved', verified: false, featured: false, views: 0,
  createdAt: '2026-01-15T10:00:00.000Z', ownerEmail: '', isDemo: true, ...o,
});

export const DEMO_FIXTURES = [
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

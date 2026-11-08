// Configuração central do site. Edite aqui: nome, cores de marca (no CSS), chaves e contatos.
// NUNCA coloque chaves secretas (service_role do Supabase, senhas de banco) neste arquivo.

export const SITE = {
  name: 'FORNECEDORES ATACADO SP',
  shortName: 'Fornecedores Atacado SP',
  tagline: 'Os melhores fornecedores de São Paulo em um só lugar.',
  description:
    'Encontre fornecedores de atacado e varejo na 25 de Março, Brás, Pari e outros polos comerciais de São Paulo.',
  url: 'https://fornecedoresdesp.com.br', // domínio do site (usado em SEO, sitemap e Open Graph)
  locale: 'pt_BR',
  contactEmail: 'contato@exemplo.com.br', // placeholder
  whatsappDefaultMessage:
    'Olá! Encontrei o fornecedor no Fornecedores Atacado SP e gostaria de mais informações.',
  // Opcional: chave da Google Maps Embed API. Deixe vazio para usar apenas links do Google Maps (sem chave).
  googleMapsApiKey: '',
  pageSize: 12,
};

// Modo de dados.
//  - 'local'    : dados guardados no navegador (localStorage). Use para demonstração e testes.
//  - 'supabase' : (preparado, ainda não implementado nesta versão) ver README.md, seção "Banco de dados".
export const DATA_MODE = 'local';

export const SUPABASE = {
  url: '', // ex.: https://xyzcompany.supabase.co
  anonKey: '', // chave pública "anon" (pode ir no frontend; a proteção vem das políticas RLS)
};

// Administrador de demonstração.
// Senha do administrador guardada como SHA-256 (não em texto puro).
// Para trocar: gere o hash da nova senha e cole aqui.
// Em produção, a autenticação deve ser feita pelo Supabase Auth, não aqui.
export const ADMIN = {
  email: 'admin@spfornecedores.local',
  passwordSha256: '81c1d0cb3a6b323b9fd0ebe332f86bc33bdfebd76b63679671d7a65029e93ace',
};

// Planos de acesso aos contatos (WhatsApp, Instagram, endereço completo).
// Ajuste nomes, valores e prazos aqui. O preço é exibido ao cliente antes do pagamento.
export const PLANS = [
  {
    id: 'anual',
    name: 'Acesso completo anual',
    price: 29.9,
    days: 365,
    description: 'Contatos e endereços completos de todos os fornecedores por 1 ano.',
  },
];

// Pagamento por Pix estático (QR code e código "copia e cola").
// Sem integração automática: o acesso é liberado depois que o pagamento é conferido.
export const PIX = {
  keyType: 'CPF',
  key: '11568638485',
  name: 'FORNECEDORES ATACADO SP',
  city: 'SAO PAULO',
  qrImage: 'img/pix-29-90.png', // QR do valor de R$ 29,90; regere se o preço mudar
};

// 'pix' = mostra o Pix ao cliente. 'simulacao' = libera o acesso sem pagamento (apenas para testes).
export const PAYMENT_MODE = 'pix';

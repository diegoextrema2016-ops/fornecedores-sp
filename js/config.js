// Configuração central do site. Edite aqui: nome, chaves públicas, planos e contatos.
// NUNCA coloque chaves secretas (service_role do Supabase, senhas de banco) neste arquivo.

export const SITE = {
  name: 'FORNECEDORES ATACADO SP',
  shortName: 'Fornecedores Atacado SP',
  tagline: 'Os melhores fornecedores de São Paulo em um só lugar.',
  description:
    'Encontre fornecedores de atacado e varejo na 25 de Março, Brás, Pari e outros polos comerciais de São Paulo.',
  url: 'https://www.fornecedoresdesp.com.br', // domínio do site (usado em SEO, sitemap, Open Graph e links de e-mail)
  locale: 'pt_BR',
  contactEmail: 'fornecedorespoficial@gmail.com',
  whatsappDefaultMessage:
    'Olá! Encontrei o fornecedor no Fornecedores Atacado SP e gostaria de mais informações.',
  // Opcional: chave da Google Maps Embed API. Deixe vazio para usar apenas links do Google Maps (sem chave).
  googleMapsApiKey: '',
  pageSize: 12,
};

// Banco de dados e autenticação (Supabase). A chave publicável é segura no navegador:
// quem protege os dados são as regras de acesso (RLS) configuradas no banco.
export const SUPABASE = {
  url: 'https://fzjiixiqezvvfeybydie.supabase.co',
  anonKey: 'sb_publishable_Ax9dowVsMkcsX2JjGS8aBQ_p537TLK7',
  // Bucket público de imagens (logos e fotos). Deve existir no projeto (ver supabase/schema.sql).
  imageBucket: 'supplier-images',
};

// Planos de acesso aos contatos (WhatsApp, Instagram, endereço completo).
// O preço é exibido ao cliente antes do pagamento.
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
// Sem integração automática: o administrador confere o Pix e libera o acesso no banco.
export const PIX = {
  keyType: 'CPF',
  key: '11568638485',
  name: 'FORNECEDORES ATACADO SP',
  city: 'SAO PAULO',
  qrImage: '/img/pix-29-90.png', // QR do valor de R$ 29,90; regere se o preço mudar
};

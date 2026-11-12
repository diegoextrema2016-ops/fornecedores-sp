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
  googleMapsApiKey: 'AIzaSyDlw-gg-zqtvYWyTneMFSt8-h1pEjIDEag',
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
// offered: false = plano antigo, mantido só para assinaturas já existentes (renovação e nomes), sem venda.
export const PLANS = [
  {
    id: 'mensal',
    name: 'Acesso completo mensal',
    price: 29.9,
    days: 30,
    description: 'Contatos e endereços completos de todos os fornecedores por 30 dias.',
  },
  {
    id: 'anual',
    name: 'Acesso completo anual (antigo)',
    price: 29.9,
    days: 365,
    description: 'Plano anterior, mantido para assinaturas já existentes.',
    offered: false,
  },
];

// Pagamento por Pix estático (QR code e código "copia e cola").
// Sem integração automática: o administrador confere o Pix e libera o acesso no banco.
export const PIX = {
  keyType: 'Chave aleatória',
  key: '00b688a6-06bc-43d1-babe-89c49f8878ba',
  name: 'FORNECEDORES ATACADO SP',
  city: 'SAO PAULO',
  qrImage: '/img/pix-29-90.png', // QR do valor de R$ 29,90; regere se o preço mudar
};

// Banners da home, em faixa que rola para o lado (um por vez no celular).
// src: imagem para computador. mobileSrc: imagem para celular (opcional, até 820px). href: para onde leva ao clicar (opcional).
// blur / blurMobile: miniatura borrada (poucos bytes), mostrada na hora enquanto a imagem grande carrega.
export const BANNERS = [
  {
    src: '/img/banners/banner-3.jpg', mobileSrc: '/img/banners/banner-3-celular.jpg',
    alt: 'Fornecedores de SP: o maior guia de fornecedores de São Paulo', href: '/categorias',
    blur: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAQADADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAABAUDAf/EACMQAAICAgAGAwEAAAAAAAAAAAECAwQAEQUSEyEiQTFCUaH/xAAXAQADAQAAAAAAAAAAAAAAAAABAgME/8QAGxEBAAICAwAAAAAAAAAAAAAAAQACEjERQVH/2gAMAwEAAhEDEQA/ALESoitFGNAdxr3h1j4jLJoeK/u8NUWzMQwbSgd8eL5RiOk+/jeaQs9SIkS8U4roNhm9neZ9GwD8f3Mxebk10nOs7HeaeUIInBPvBgmyNkSfNYeS8WcAiPsN+smG7alklCklSfLLtvh5aeORjyp9h+4YSVKCyRhgQTvHrcdV5YGvrP/Z',
    blurMobile: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAtACQDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAwUAAgQGAf/EACgQAAIBAwQBAwQDAAAAAAAAAAECAwAEEQUSITETIkFRFBUyQ2Fjof/EABcBAAMBAAAAAAAAAAAAAAAAAAECAwT/xAAhEQACAgICAQUAAAAAAAAAAAABAgAREiEDBEEUMUJRYf/aAAwDAQACEQMRAD8AZ2lv9K3iA9TD8qpcXUls3j3kkDuhQXrzPG20sWPeKPPDF5j5YyxPvWpWyJLbkcaFCZDqkzSBEbJIznNM9LuJZSTMGBHFCQQwOdsOP520cXDGByiYOOBjugwB9hGuvMBd69HBO0YXdt96lLvsFzOTIxALHODUrSE640TI58n1HohW3IWGLge9FmfG30E574qsN2s8W5DxQReN9VsJBU1io3UvYqaJs4Xan+V6z+kbFzSTUNfKNJHECCOM0v0vVLoSOEy6nk5+accbwZCdgj5UZ4NSuQuL+fytvlYN8CpVx0yd3Ieo/I7tbRra28IfDHsms1hYPbyyvPIHz+PPVA06WTUlxK5UqMZFbvt+P3PSOlMcjuVVtaETS6NPLe8sPGxyT8UysbM2JZF2lSe6KbH+5qqdN9zO9IyA/KMrEeJivNMlmuGdBwaldLboBCo7wKlFew6ihAUBNz//2Q==',
  },
];

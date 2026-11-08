# FORNECEDORES ATACADO SP

Portal de fornecedores de atacado e varejo de São Paulo (25 de Março, Brás, Pari, Bom Retiro, Santa Ifigênia e outros polos).

- **Site:** https://fornecedoresdesp.com.br (domínio ainda a conectar na Vercel, veja abaixo)
- **Publicação:** Vercel, a partir da branch `main` no GitHub
- **Banco, login e fotos:** Supabase

**Tecnologia:** site estático em HTML, CSS e JavaScript (módulos ES). Não usa React, Next.js nem outro framework, e não precisa de build nem de `npm install`. O cliente do Supabase é carregado do CDN.

---

## Como o site funciona

- **Visitantes** veem categorias, fornecedores aprovados e a página de cada fornecedor. Os contatos (WhatsApp, Instagram e endereço completo) aparecem mascarados.
- **Clientes** criam conta (com confirmação de e-mail), salvam favoritos e, com um plano ativo, liberam os contatos completos.
- **Fornecedores** cadastram o próprio negócio. O cadastro entra como **pendente** e só aparece no site depois de aprovado pelo administrador.
- **Administrador** aprova cadastros, edita fornecedores, mantém categorias e bairros, confirma pagamentos Pix e controla os acessos.

Toda gravação vai ao Supabase. O próprio banco aplica as regras de acesso (RLS), então esconder um contato no navegador não é a proteção: a proteção é o banco não entregar o contato a quem não pode vê-lo.

---

## Estrutura do projeto

```
fornecedores-sp/
├── index.html              # casca da aplicação, metas de SEO e dados estruturados
├── css/styles.css          # identidade visual (variáveis no topo)
├── img/pix-29-90.png       # QR code do Pix de R$ 29,90
├── js/
│   ├── config.js           # nome, domínio, e-mail de contato, Supabase (chave pública), planos e Pix
│   ├── api.js              # única camada que fala com o Supabase (banco, login, imagens)
│   ├── mapping.js          # conversão entre o banco (snake_case) e a tela (camelCase); funções puras
│   ├── store.js            # cópia em memória dos dados e ações (salvar, aprovar, confirmar Pix...)
│   ├── access.js           # quem pode ver contatos
│   ├── app.js              # roteamento (#/rota?query) e proteção do painel
│   ├── pages-public.js     # home, categorias, listagens, fornecedor, mapa, favoritos, institucionais
│   ├── pages-account.js    # login, cadastro de conta, sair, cadastro de fornecedor
│   ├── pages-admin.js      # painel: visão geral, pendentes, fornecedores, pagamentos, categorias, regiões, usuários, backup
│   ├── paywall.js          # planos e pagamento por Pix (QR code e código copia e cola)
│   ├── forms.js            # formulário de fornecedor e envio de imagens
│   ├── import.js           # importação de planilha CSV de fornecedores
│   ├── backup.js           # leitura e restauração do backup antigo do navegador
│   ├── search.js           # busca, filtros, ordenação e paginação (lógica pura)
│   ├── ui.js, utils.js     # componentes e funções auxiliares
│   └── data.js             # categorias e regiões de referência
├── supabase/
│   ├── schema.sql                      # estrutura base do banco (projeto novo)
│   ├── migration-002-fase1.sql         # perfil automático, regiões no banco, pedidos Pix
│   └── migration-003-site-conectado.sql# subcategoria em texto e leitura pública das categorias
├── tests/                  # testes automatizados (node --test)
├── robots.txt
└── sitemap.xml
```

---

## Publicação na Vercel

**O deploy é automático.** Quando um commit chega à branch `main` no GitHub, a Vercel publica a nova versão sozinha, se o projeto estiver ligado ao repositório.

1. Antes de publicar uma mudança, rode o banco (veja "Migrações do banco") se ela depender de SQL novo.
2. Faça commit e push para `main`. A Vercel publica.
3. Confira no painel da Vercel se o deploy terminou sem erro.

**Domínio próprio:** na Vercel, abra o projeto, vá em **Settings → Domains**, adicione `fornecedoresdesp.com.br` e siga as instruções de DNS. O domínio já está configurado no código (`SITE.url` em `js/config.js`, `index.html`, `robots.txt` e `sitemap.xml`). Depois de conectado, envie o `sitemap.xml` ao Google Search Console.

**O que não vai para a internet:** o `.vercelignore` impede a publicação de `tests/`, `supabase/` e `abrir-site.bat`. Eles continuam no repositório.

---

## Configuração (`js/config.js`)

| Chave | Para que serve |
|---|---|
| `SITE.name`, `SITE.shortName`, `SITE.tagline`, `SITE.url` | Nome, subtítulo e domínio (usados em SEO e links). |
| `SITE.contactEmail` | E-mail de contato exibido no site (`fornecedorespoficial@gmail.com`). |
| `SITE.googleMapsApiKey` | Opcional. Com uma chave da Google Maps Embed API, o mapa aparece embutido. Sem chave, a página usa links. |
| `SUPABASE.url`, `SUPABASE.anonKey` | Projeto e chave **publicável** (anon). **Nunca** coloque a `service_role` aqui. |
| `SUPABASE.imageBucket` | Bucket de imagens (`supplier-images`). |
| `PLANS` | Planos de acesso. Hoje há um: R$ 29,90 por 365 dias. |
| `PIX` | Chave Pix (CPF) e dados mostrados no pagamento. |

Se o preço mudar, também regere o QR code (`img/pix-29-90.png`) e ajuste `PLANS`.

---

## Banco de dados (Supabase)

### Projeto novo

Rode os arquivos **nesta ordem**, no SQL Editor:

1. `supabase/schema.sql`
2. `supabase/migration-002-fase1.sql`
3. `supabase/migration-003-site-conectado.sql`

As migrações 002 e 003 podem ser rodadas mais de uma vez sem erro.

### Projeto que já existe

Se o banco já tem a Fase 1 aplicada, rode só `migration-003-site-conectado.sql`.

### Criar a conta do administrador

1. Em **Authentication → Users → Add user**, crie a conta com e-mail e senha forte. Confirme o e-mail, se o provedor pedir.
2. Promova a conta a administrador no SQL Editor:
   ```sql
   update public.profiles set type = 'admin' where email = 'seu-admin@dominio.com';
   ```
   Se a linha ainda não existir, faça login no site uma vez com essa conta, ou crie o perfil com `insert`.

**Nunca** coloque a senha do administrador no código, no README ou no chat.

### Configurações de autenticação (painel do Supabase)

- **Authentication → Providers → Email:** "Confirm email" ligado (o cadastro exige confirmação).
- **Authentication → URL Configuration:** Site URL `https://fornecedoresdesp.com.br`. Inclua também a URL da Vercel na lista de redirecionamento, se quiser testar por ela.

---

## Fluxo de pagamento (Pix)

1. O cliente abre um fornecedor, clica em **Ver contato completo**, escolhe o plano e paga por Pix (QR code ou copia e cola).
2. Depois de pagar, ele confirma que já pagou. O site registra um pedido **pendente**.
3. O administrador confere o Pix na conta bancária e abre **Pagamentos** no painel:
   - **Confirmar Pix:** ativa a assinatura por 365 dias. Se o cliente já tinha uma assinatura válida, o prazo começa quando ela termina.
   - **Recusar:** marca o pedido como recusado (use se o Pix não chegou).
   - **Cancelar acesso:** tira o acesso de um cliente com assinatura ativa. O registro fica no histórico.

Não há confirmação automática. Hoje o administrador confere cada Pix manualmente.

---

## Painel administrativo

Rotas (só com sessão de administrador):

- `#/admin`: visão geral.
- `#/admin/pendentes`: cadastros aguardando aprovação.
- `#/admin/fornecedores`: lista com busca, status, verificado, destaque, editar e excluir.
- `#/admin/novo`: cadastro manual de fornecedor, com logo e fotos.
- `#/admin/pagamentos`: pedidos Pix, assinaturas ativas e histórico (veja o fluxo acima).
- `#/admin/categorias`: criar, editar, ativar/desativar e excluir (categorias com fornecedores não podem ser excluídas).
- `#/admin/regioes`: bairros e cidades.
- `#/admin/usuarios`: alterar o tipo de conta.
- `#/admin/migracao`: backup e restauração (veja abaixo).

---

## Backup e migração de dados antigos

A versão anterior do site guardava cadastros no navegador. Para trazê-los para o banco:

1. Abra o site **no mesmo navegador onde os cadastros antigos foram feitos** (no computador, pelo endereço local).
2. Entre como administrador e vá em **Backup e migração**. Baixe o arquivo JSON.
3. Abra o site publicado, entre como administrador, vá em **Backup e migração** e restaure o arquivo.

Se não houver dados antigos no navegador, a página avisa e não faz nada.

**Restaure o arquivo só uma vez.** A restauração não verifica duplicados: cada fornecedor do arquivo vira um cadastro novo, então rodar duas vezes cria cópias. Se isso acontecer, apague as cópias em `#/admin/fornecedores`.

---

## Rodar no seu computador

Basta um servidor estático. Com Python: `python3 -m http.server 8080` dentro da pasta, depois abra http://localhost:8080. No Windows, use o `abrir-site.bat` ou `py -m http.server 8080`.

Os testes automatizados rodam com `npm test` (Node.js 18 ou superior, sem dependências). Eles não acessam o Supabase: a lógica de acesso e de prazo é testada com funções puras e um Supabase simulado.

---

## Limitações conhecidas

- **Apagar contas:** o painel não apaga contas de login. Isso é feito no painel de Authentication do Supabase.
- **Favoritos de visitante:** quem não tem conta guarda os favoritos só no próprio navegador. Ao entrar, eles vão para a conta.
- **Carregamento:** o site carrega de uma vez todos os fornecedores aprovados. Isso vai pesar quando houver muitos cadastros. Paginar no banco é o próximo passo técnico.
- **Limpeza de imagens:** quando uma foto é removida, a remoção no Storage é feita, mas se falhar o arquivo pode ficar órfão no bucket.
- **Versão do Supabase no CDN:** o site usa `@supabase/supabase-js@2.45.4`. Confirme que essa versão existe antes de atualizar.
- **Contato:** o formulário de contato não envia e-mail.
- **Avaliações:** não existem.
- **Stack:** o site não usa framework. As rotas são `#/`, então o SEO de páginas individuais é limitado.

---

## Conformidade (importante)

- **Vapers:** a comercialização de dispositivos e refis de cigarro eletrônico é proibida no Brasil pela Anvisa (RDC 46/2009, com normas posteriores). A categoria "Vapers e acessórios" está marcada como restrita. **Confirme com um advogado quais produtos desse segmento podem ser anunciados** e, se necessário, desative a categoria em `#/admin/categorias`.
- **LGPD:** a política de privacidade é um modelo. Revise com um profissional jurídico antes de lançar.
- **Termos:** o cadastro exige aceite. Revise o texto antes do lançamento.
- **Preço e cancelamento:** revise o texto de preço, cancelamento e reembolso com um advogado (Código de Defesa do Consumidor).
- **Dados reais:** publique só dados informados pelos próprios fornecedores ou verificados.

---

## Checklist antes do lançamento

- [ ] Conectar o domínio `fornecedoresdesp.com.br` na Vercel e confirmar o HTTPS.
- [ ] Confirmar "Confirm email" e a Site URL no Supabase.
- [ ] Testar cadastro, login, aprovação e Pix com o Supabase real.
- [ ] Migrar os dados antigos, se houver, pelo painel de backup.
- [ ] Revisar a política de privacidade, os termos e a lista de produtos permitidos.
- [ ] Testar em celular Android e iPhone.

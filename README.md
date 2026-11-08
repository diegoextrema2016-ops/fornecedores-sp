# FORNECEDORES ATACADO SP

Portal de fornecedores de atacado e varejo de São Paulo (25 de Março, Brás, Pari, Bom Retiro, Santa Ifigênia e outros polos).

**Tecnologia:** site estático em HTML, CSS e JavaScript (módulos ES). Não usa React, Next.js, Vite nem outro framework, e não precisa de build nem de `npm install`. A Vercel publica a pasta como ela está.

---

## Publicação na Vercel (passo a passo)

### Antes de subir
1. **Domínio:** o site está configurado para `fornecedoresdesp.com.br` em `index.html`, `robots.txt`, `sitemap.xml` e `js/config.js` (`SITE.url`). Se o domínio mudar, troque nesses arquivos.
2. **Senha do administrador:** o site guarda só o hash SHA-256 em `ADMIN.passwordSha256` (`js/config.js`). Como o código fica público no GitHub, use uma senha forte e **nunca** escreva a senha em texto neste README ou no código. Para trocar, veja a seção 4 abaixo.
3. Leia a seção **"Importante: o que este site faz e não faz"** logo abaixo, as seções 10 (limitações) e 11 (conformidade).

### 1. Enviar ao GitHub
**Opção A, pelo navegador (sem linha de comando):**
1. Em github.com, clique em **New repository** e crie um repositório vazio.
2. Clique em **uploading an existing file** e arraste os arquivos **de dentro** desta pasta (não a pasta em si).
3. Clique em **Commit changes**.

**Opção B, pelo terminal:**
```bash
cd fornecedores-atacado-sp-vercel
git init
git add .
git commit -m "Primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

### 2. Publicar na Vercel
1. Entre em **vercel.com** com a conta do GitHub.
2. Clique em **Add New → Project** e importe o repositório.
3. Em **Framework Preset**, deixe **Other**. Deixe **Build Command** e **Output Directory** em branco.
4. Clique em **Deploy**. Em alguns segundos o site fica no ar em um endereço `*.vercel.app`.

As rotas usam `#/` (por exemplo, `/#/mapa`), então não é preciso configurar redirecionamentos.

### 3. Domínio próprio
Na Vercel, abra o projeto e vá em **Settings → Domains**, adicione seu domínio e siga as instruções de DNS. Depois, troque o domínio nos arquivos da seção "Antes de subir" e envie o `sitemap.xml` ao Google Search Console.

### 4. Trocar a senha do administrador
1. Gere o hash da nova senha, trocando `SUA_SENHA` pela senha escolhida:
   `python -c "import hashlib; print(hashlib.sha256('SUA_SENHA'.encode()).hexdigest())"`
   (no Windows, use `py` no lugar de `python`).
2. Cole o resultado em `ADMIN.passwordSha256` em `js/config.js` e faça commit.

### Atualizar o site depois
Altere os arquivos, faça commit e push no GitHub. A Vercel publica a nova versão sozinha.

### Rodar no seu computador
Basta um servidor estático. Com Python, rode `python -m http.server 8080` dentro da pasta e abra http://localhost:8080. No Windows, use o `abrir-site.bat`. Os testes automatizados rodam com `npm test` (Node.js 18 ou superior).

### O que não vai para a internet
O arquivo `.vercelignore` impede a publicação de `tests/`, `supabase/` e `abrir-site.bat`. Eles continuam no projeto e no GitHub.

---

## Importante: o que este site faz e não faz

- **Os dados não são compartilhados.** Cadastros, fornecedores adicionados no painel, fotos e importações ficam guardados **no navegador de cada pessoa** (localStorage). Quem acessar o site publicado vê apenas os dados de demonstração de `js/data.js`, e não o que você cadastrou no seu computador.
- **Para dados reais e compartilhados** é preciso ligar o **Supabase** (seção 7 abaixo). Isso ainda não foi feito.
- **O pagamento é simulado** (`PAYMENT_MODE = 'simulacao'` em `js/config.js`). Qualquer visitante consegue liberar os contatos sem pagar. Não há cobrança real antes de integrar um provedor de pagamento (seção 11b).
- **A senha do administrador fica no código publicado**, mesmo em forma de hash. Ela protege contra acesso casual, mas não é segurança de verdade. A proteção real depende do Supabase Auth.

---

# Referência técnica original (SP FORNECEDORES)

Portal de fornecedores de São Paulo (25 de Março, Brás, Pari, Bom Retiro, Santa Ifigênia e outros polos).
Inclui: home, categorias, listagem com busca/filtros/ordenação/paginação, página do fornecedor,
regiões, mapa, cadastro com validação e aprovação, favoritos, login de usuário, painel administrativo,
institucionais (sobre, contato, privacidade, termos) e base de banco pronta para Supabase.

> **Versão atual:** aplicação **sem dependências** (HTML + CSS + JavaScript modular), que roda direto
> no navegador. Os dados ficam no `localStorage` (modo `local`). Veja "Limitações" antes de publicar.

---

## 1. Estrutura do projeto

```
sp-fornecedores/
├── index.html              # casca da aplicação, metas de SEO e dados estruturados
├── package.json            # scripts: start (servidor local) e test
├── css/styles.css          # identidade visual (variáveis no topo: cores, raios, sombras)
├── js/
│   ├── app.js              # ponto de entrada, roteamento (#/rota?query) e proteção do painel
│   ├── config.js           # nome do site, chave do Google Maps, modo de dados, admin demo
│   ├── data.js             # categorias, regiões e fornecedores FICTÍCIOS de demonstração
│   ├── store.js            # camada de dados (localStorage) — ponto de troca para o Supabase
│   ├── search.js           # busca, filtros, ordenação e paginação (lógica pura, testada)
│   ├── utils.js            # slug, WhatsApp, Google Maps, validações, hash SHA-256
│   ├── ui.js               # componentes: header, footer, cards, paginação, toast, modal
│   ├── forms.js            # formulário de fornecedor (cadastro e edição) + upload de imagens
│   ├── pages-public.js     # home, categorias, listagens, fornecedor, mapa, favoritos, institucionais
│   ├── pages-account.js    # login, cadastro de usuário, sair, cadastro público de fornecedor
│   └── pages-admin.js      # painel: visão geral, pendentes, fornecedores, categorias, usuários
├── tests/
│   ├── search.test.mjs     # testes de busca, filtros, validação e links
│   └── store.test.mjs      # testes de cadastro, aprovação, favoritos e sessão
├── supabase/schema.sql     # tabelas, RLS, trigger de proteção de colunas, bucket de imagens
├── robots.txt
└── sitemap.xml
```

## 2. Tecnologias

- HTML5, CSS3 (variáveis, grid, flexbox) e JavaScript ES Modules, sem frameworks.
- Fonte Inter via Google Fonts (com fallback para fontes do sistema).
- Ícones em SVG inline (sem biblioteca).
- Testes com o runner nativo do Node (`node --test`).
- Banco de dados preparado para **Supabase** (PostgreSQL + Auth + Storage + RLS).

## 3. Como executar localmente

Requisitos: Node.js 18+ (para os testes) ou Python 3 (para o servidor estático).

```bash
cd sp-fornecedores
npm start            # sobe em http://localhost:8080 (usa python3 -m http.server)
npm test             # roda os testes automatizados
```

Abra `http://localhost:8080`. Não é necessário `npm install`: o projeto não tem dependências.

**Painel administrativo (demonstração):** entre em `#/login` com
`admin@spfornecedores.local` e a senha que você definiu. O site guarda só o hash dela (veja a seção "Trocar a senha do administrador" acima).

## 4. Configuração

Tudo fica em `js/config.js`:

| Chave | Para que serve |
|---|---|
| `SITE.name`, `SITE.tagline`, `SITE.url` | Nome, subtítulo e domínio real (usado em SEO e Open Graph). |
| `SITE.contactEmail` | E-mail exibido na página de contato. |
| `SITE.googleMapsApiKey` | Opcional. Com uma chave da **Google Maps Embed API**, o mapa é exibido embutido. Sem chave, a página usa links para o Google Maps (sem chave). |
| `DATA_MODE` | `'local'` (hoje) ou `'supabase'` (ver seção 7). |
| `SUPABASE.url`, `SUPABASE.anonKey` | Somente a chave **anon** (pública). **Nunca** coloque a `service_role` aqui. |
| `ADMIN` | E-mail e hash SHA-256 da senha do administrador de demonstração. |

Para gerar o hash de uma nova senha:

```bash
python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" "sua-senha-forte"
```

Cores e identidade visual: altere as variáveis no início de `css/styles.css` (`--primary`, `--text`, etc.).
O logotipo é tipográfico (bloco "SP" + texto) e está em `js/ui.js` (função `header`) e `index.html` (favicon).

## 5. Dados de demonstração

- O site não traz fornecedores de exemplo. Os dados fictícios usados pelos testes ficam em `tests/fixtures-demo.mjs`.
- Não há telefones, Instagram, sites nem endereços de rua nesses dados.
- Como não têm e-mail, responsável, endereço, número nem CEP, ao **editar** um demonstrativo o painel vai pedir esses campos obrigatórios antes de salvar.
- Para começar a usar de verdade: entre no painel, **exclua** os demonstrativos (ou apague o `localStorage`
  do site) e cadastre os fornecedores reais em **Adicionar fornecedor**.
- Para resetar os dados no navegador: abra o console e rode `localStorage.clear()`, depois recarregue.

## 6. Painel administrativo

Rotas (acessíveis só com sessão de administrador):

- `#/admin`: visão geral (totais, cadastros recentes, categorias com mais visualizações).
- `#/admin/pendentes`: cadastros aguardando análise. Botões **Aprovar** e **Rejeitar**.
- `#/admin/fornecedores`: lista com busca, abas por status, switches de **verificado** e **destaque**, editar e excluir.
- `#/admin/novo`: cadastro manual, com status, verificado, destaque e upload de logo e fotos.
- `#/admin/categorias`: criar, editar, ativar/desativar e excluir (categorias com fornecedores não podem ser excluídas).
- `#/admin/usuarios`: alterar o tipo da conta e remover usuários.

**Segurança desta versão:** a proteção do painel é feita no navegador. Isso serve para demonstrar o fluxo,
mas **não é segurança real**: qualquer pessoa com acesso ao código consegue ver o hash e tentar a senha.
Para produção, use o **Supabase Auth** (seção 7), que faz a checagem no servidor.

## 7. Banco de dados (Supabase)

O arquivo `supabase/schema.sql` cria:

- Tabelas: `profiles`, `categories`, `subcategories`, `suppliers`, `supplier_photos`, `favorites`.
- Políticas de **Row Level Security**: visitantes só leem fornecedores **aprovados**; cada usuário edita só os próprios cadastros; administradores acessam tudo.
- Trigger que impede o fornecedor de se auto-aprovar, de marcar o próprio selo de verificado ou de se colocar em destaque.
- Função `increment_supplier_views` para contar visualizações sem liberar UPDATE público.
- Bucket `supplier-images` (público para leitura, 500 KB, somente JPG/PNG/WebP, upload só na própria pasta).
- As 20 categorias iniciais.

**Passo a passo:**

1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute.
3. Crie a conta do administrador em **Authentication → Users → Add user** (e-mail e senha forte).
4. Promova essa conta a administrador no SQL Editor (depois que o perfil existir):
   ```sql
   insert into public.profiles (id, name, email, type)
   select id, 'Administrador', email, 'admin' from auth.users where email = 'seu-admin@dominio.com'
   on conflict (id) do update set type = 'admin';
   ```
5. Copie **Project URL** e **anon public key** (Project Settings → API) para `SUPABASE` em `js/config.js`.
6. Troque `DATA_MODE` para `'supabase'` **somente depois** de implementar o repositório Supabase (seção 8).

**Nunca** exponha a `service_role` key no frontend.

## 8. O que falta para o modo Supabase

`js/store.js` concentra o acesso aos dados com métodos claros (`suppliers.list`, `suppliers.save`,
`categories.list`, `favorites.toggle`, `users.register`, etc.). Para ligar ao Supabase:

1. Criar `js/repo-supabase.js` com a mesma interface, usando `@supabase/supabase-js` via CDN
   (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`).
2. Trocar a exportação em `js/store.js` conforme `DATA_MODE`.
3. Trocar o login de administrador por `supabase.auth.signInWithPassword` e checar `profiles.type`.
4. Trocar o upload de imagens por `supabase.storage.from('supplier-images').upload(...)`.

As páginas não precisam mudar, porque conversam apenas com `store`.

## 9. Publicação

Como é um site estático, pode ser publicado em qualquer hospedagem de arquivos estáticos
(Netlify, Vercel, Cloudflare Pages, GitHub Pages ou Hostinger). Envie a pasta inteira.

- Configure o domínio em `index.html` (canonical e Open Graph), em `js/config.js` (`SITE.url`) e em `sitemap.xml`.
- Adicione um domínio personalizado e HTTPS na hospedagem.
- Para o Google: cadastre o site no **Google Search Console** e envie o `sitemap.xml`.

## 10. Limitações desta versão (leia antes de publicar)

- **Stack:** o pedido original mencionava Next.js, React, TypeScript e Tailwind. Esta versão foi feita
  sem dependências porque o ambiente não permitiu instalar pacotes. A migração para Next.js continua
  possível: as páginas e a lógica em `search.js`, `utils.js` e `store.js` podem ser reaproveitadas.
- **URLs:** as rotas usam `#/` (ex.: `/#/fornecedor/nome-da-loja`). URLs limpas como `/fornecedor/nome-da-loja`
  exigem roteamento no servidor (ou Next.js com SSR/SSG). Isso afeta o SEO: o Google indexa melhor URLs
  limpas, com conteúdo renderizado no servidor.
- **Dados:** no modo local, tudo fica no navegador de cada pessoa. Cadastros enviados não chegam a
  nenhum servidor até a ligação com o Supabase.
- **Imagens:** guardadas como texto (data URL) no navegador. Para produção, use o Supabase Storage.
- **Contato:** o formulário de contato não envia e-mail nesta versão.
- **Avaliações:** não existem. A estrutura para isso ainda não foi criada.
- **Subcategorias:** são guardadas por categoria no painel, mas o cadastro ainda usa campo de texto livre.

## 11. Conformidade (importante)

- **Vapers:** a comercialização de dispositivos e refis de cigarro eletrônico é proibida no Brasil pela Anvisa
  (RDC 46/2009, com normas posteriores). A categoria "Vapers e acessórios" foi mantida como pedido, mas
  está marcada como restrita, e o cadastro traz o aviso. **Antes de publicar, confirme com um advogado
  quais produtos desse segmento podem ser anunciados** e, se necessário, desative a categoria
  (`#/admin/categorias`).
- **LGPD:** a política de privacidade é um modelo. Revise com um profissional jurídico antes de publicar.
- **Termos:** o cadastro exige aceite dos termos. Revise o texto antes do lançamento.
- **Marcas:** nenhum logotipo de terceiros é usado.
- **Telefones e endereços:** só publique dados reais, informados pelos próprios fornecedores ou verificados.

## 11b. Contatos e assinatura

- Visitantes veem nome, categoria, bairro e descrição. WhatsApp, Instagram e endereço completo aparecem mascarados, por exemplo `(11) 9****-**21`.
- Para liberar os contatos, o cliente cria uma conta e assina um plano. Os planos ficam em `PLANS` no `js/config.js`.
- Administradores sempre têm acesso completo.
- Com `PAYMENT_MODE = 'pix'` (ativo), o cliente vê o QR code e o código copia e cola de R$ 29,90 da chave CPF configurada em `PIX` (`js/config.js`). Não há confirmação automática: o acesso é liberado depois de conferir o Pix. `'simulacao'` libera o acesso sem pagamento e serve só para testes.

**Antes de cobrar de verdade:**
1. Mover os dados para o Supabase (seção 7). Só assim o servidor consegue esconder os contatos de quem não pagou.
2. Criar a conta no provedor de pagamento (Mercado Pago, Asaas ou Pagar.me) e configurar Pix e cartão.
3. Criar uma função no servidor que recebe a confirmação do pagamento (webhook) e registra a assinatura no banco.
4. Trocar `PAYMENT_MODE` para `'provedor'` e implementar o checkout.
5. Revisar o texto de preço, cancelamento e reembolso com um advogado (Código de Defesa do Consumidor).

## 12. Checklist antes de lançar

- [ ] Trocar a senha do administrador de demonstração (ou migrar para o Supabase Auth).
- [ ] Trocar `SITE.url`, `SITE.contactEmail`, canonical e Open Graph para o domínio real.
- [ ] Remover os fornecedores de demonstração.
- [ ] Revisar a política de privacidade e os termos com um profissional.
- [ ] Confirmar a lista de produtos permitidos (categoria de vapers).
- [ ] Testar em celular Android e iPhone.
- [ ] Integrar o pagamento real e trocar `PAYMENT_MODE`.
- [ ] Revisar preço, cancelamento e reembolso com um advogado.

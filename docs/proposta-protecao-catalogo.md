# Proposta: proteger o catálogo exclusivo no Supabase

**Status: proposta, NÃO aplicada.** Nenhuma mudança foi feita no Supabase. Depende de aprovação explícita e de testes em ambiente de teste antes de produção.

## 1. Estado atual (após todas as migrações, lidas uma a uma)

Leitura anônima (chave publicável, sem login) hoje, conforme as políticas:

| Tabela | Política de leitura para visitante | Efeito |
|---|---|---|
| `suppliers` | `suppliers_public_read_approved`: `approval_status = 'approved'` | Qualquer um lê nome, descrição, bairro, horários, pedido mínimo, tags e logo de todo fornecedor aprovado. |
| `supplier_photos` | `photos_public_read_approved`: fornecedor aprovado | Qualquer um lê as fotos. |
| `categories` | `categories_public_read`: `using (true)` (migração 003) | Lê todas as categorias, inclusive as inativas. |
| `subcategories` | `subcategories_public_read`: `using (true)` | Lê todas as subcategorias. |
| `regions` | `regions_public_read`: `using (true)` (migração 002) | Lê todos os bairros. |
| `supplier_contacts` | só assinante ativo, admin ou dono | **Já protegido** (migração 006). |
| `subscriptions` | só o próprio usuário ou admin | Protegido. |
| `storage` `supplier-images` | bucket público: quem tem o link vê o arquivo; listagem bloqueada (migração 006) | Foto acessível por URL. A URL só chega a quem lê o banco. |

Fora do banco, no código público: `js/data.js` exporta as listas completas de `CATEGORIES` e `REGIONS`, e `js/pages-public.js` as usa como fallback. Qualquer visitante lê esse arquivo no navegador, mesmo com o banco fechado.

## 2. Regra de acesso

Assinante ativo = `public.has_active_subscription()` (já existe): `subscriptions.status = 'active'` e `expires_at > now()`, para o `auth.uid()` da sessão. A verificação é feita a cada consulta, então uma assinatura expirada perde o acesso na consulta seguinte.

Níveis:
- **Visitante** (sem login): nada do catálogo.
- **Cadastrado sem assinatura**: nada do catálogo.
- **Assinante ativo**: catálogo aprovado, fotos, categorias, bairros, subcategorias e contatos.
- **Fornecedor dono**: os próprios cadastros em qualquer status (já existe: `suppliers_owner_read`).
- **Admin**: tudo (já existe: políticas `*_admin_all` e `is_admin()`).

## 3. Políticas propostas (RASCUNHO, não aplicar)

```sql
-- RASCUNHO. Não aplicar sem aprovação. Testar antes em ambiente de teste.
begin;

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_subscriber_read" on public.categories
  for select using (public.has_active_subscription());

drop policy if exists "regions_public_read" on public.regions;
create policy "regions_subscriber_read" on public.regions
  for select using (public.has_active_subscription());

drop policy if exists "subcategories_public_read" on public.subcategories;
create policy "subcategories_subscriber_read" on public.subcategories
  for select using (public.has_active_subscription());

drop policy if exists "suppliers_public_read_approved" on public.suppliers;
create policy "suppliers_subscriber_read_approved" on public.suppliers
  for select using (approval_status = 'approved' and public.has_active_subscription());

drop policy if exists "photos_public_read_approved" on public.supplier_photos;
create policy "photos_subscriber_read_approved" on public.supplier_photos
  for select using (
    exists (select 1 from public.suppliers s
      where s.id = supplier_id and s.owner_id = auth.uid())
    or (public.has_active_subscription() and exists (
      select 1 from public.suppliers s
      where s.id = supplier_id and s.approval_status = 'approved'))
  );

commit;
```

Mantidas sem alteração: `suppliers_owner_read`, `suppliers_owner_update`, `suppliers_admin_all`, `photos_owner_write`, `photos_admin_all`, `categories_admin_write`, `subcategories_admin_write`, `regions_admin_write`, `contacts_read_subscribers`, `subscriptions_*`, `favorites_own`.

## 4. Preservar o painel administrativo

- Admin lê e escreve tudo pelas políticas `for all` com `is_admin()`. As políticas de leitura de visitante e de assinante não removem essas permissões.
- Teste obrigatório: admin lista fornecedores pendentes, rejeitados e suspensos; lê categorias e bairros inativos; salva e exclui categoria e região.
- O painel usa a sessão do admin (JWT), não a chave publicável, então o RLS trata o admin como admin.

**Ponto a decidir:** o cadastro de fornecedor usa a lista de categorias e bairros (`js/forms.js` lê `store.categories` e `store.regions`). Se a leitura for só de assinante, quem está se cadastrando não vê as opções. Opções:
- **A.** Liberar para usuário autenticado uma *view* só com `id`, `slug` e `name` de categorias e bairros ativos, sem dados de fornecedor. Quem tem conta, mas não assinatura, passa a ver os nomes das categorias e bairros.
- **B.** O cadastro usa campo de texto livre, e o admin classifica depois. Não expõe taxonomia a ninguém, mas muda o fluxo de cadastro.

## 5. Geração das páginas e credencial de leitura (Opção B, implementada no branch)

Decisões: cadastro com a **opção A** (categorias e bairros para autenticados, sem dados de fornecedor) e build com a **opção B** (credencial restrita aos slugs).

**Páginas.** Uma casca protegida por slug: `/categorias/{slug}`, `/regiao/{slug}`, `/fornecedor/{slug}`, mais `/categorias`, `/fornecedores`, `/mapa` e `/site`. Todas têm `noindex` e ficam fora do sitemap. Nenhuma contém nome, descrição, foto, contagem, bairro ou contato. O sitemap continua com 11 URLs comerciais (início, institucionais, planos, guias e os quatro guias de bairro).

**Como o build lê.** `scripts/pg-slugs.mjs` executa `select tipo, slug from public.catalogo_slugs()` com o papel `build_publico`. A chave anônima não lê mais o catálogo, e a `service_role` não é usada. O cliente não tem dependências, porque o npm não está acessível neste ambiente e o projeto não tem lockfile.

**Como a credencial é protegida.**
1. Papel de login `build_publico`, sem `BYPASSRLS`, sem `CREATEDB`, sem `CREATEROLE` e sem privilégio em tabela. Tem só `EXECUTE` em `catalogo_slugs()`.
2. `catalogo_slugs()` é `security definer` com `search_path` fixo e devolve apenas tipo e slug. Está revogada de `public`, `anon` e `authenticated`.
3. A sessão é somente leitura (`default_transaction_read_only=on`), com `statement_timeout` de 5 segundos, definido no startup.
4. Conexão TLS com verificação completa, com a CA fixada em `SUPABASE_DB_CA`. Sem a CA, o build não conecta. A única exceção sem TLS é teste local em loopback, com flag explícita.
5. Autenticação SCRAM-SHA-256, com verificação da assinatura do servidor. Qualquer outro método é recusado.
6. O cliente recusa qualquer usuário diferente de `build_publico`.
7. A senha é gerada com entropia alta e guardada só em variáveis de ambiente: `SUPABASE_BUILD_DB_URL` na Vercel (Preview e Production) e como secret no GitHub Actions. Não vai para o repositório nem para log. Testes garantem que mensagens de erro não exibem a senha.
8. Cada slug é validado com `^[a-z0-9][a-z0-9-]{0,99}$` antes de virar arquivo. Um valor fora do formato interrompe o build, e nada é publicado.
9. Rotação: `ALTER ROLE build_publico PASSWORD ...` e atualização das duas variáveis. Nenhuma outra parte do sistema depende da senha.

**Verificado no banco de teste** (`catalogo_alvo`, PostgreSQL 16, TLS com certificado de teste): a leitura por SCRAM devolve 20 categorias, 5 bairros e 2 fornecedores aprovados, o que bate com o `catalogo_slugs()`. Com a CA correta a conexão funciona. Com CA diferente ela é recusada (`DEPTH_ZERO_SELF_SIGNED_CERT`), e a senha não aparece no erro.

## 6. Impedir consulta direta pela API

- Com o RLS acima, a API devolve lista vazia para visitante e cadastrado sem assinatura, inclusive com `count=exact`, filtros, `or` e paginação. Não há consulta que contorne a política.
- Defesa em profundidade (opcional): `revoke select on public.suppliers, public.supplier_photos, public.categories, public.subcategories, public.regions from anon;`. Isso faz a API responder erro de permissão em vez de lista vazia, o que o app precisa tratar.
- `increment_supplier_views` (anon) só incrementa o contador de um fornecedor aprovado. Não devolve dados. Pode ser mantida.
- **Fase 2 (fora deste escopo):** fotos em bucket privado com URL assinada só para assinante; e IDs opacos nas URLs, porque os slugs atuais (`/fornecedor/eruthy-jeans`) revelam nomes.
- **Fase 1 (concluída no branch):** `CATEGORIES` e `REGIONS` foram removidos de `js/data.js`. `js/forms.js` lê categorias e bairros só do banco, que os libera a autenticados. `js/pages-public.js` não tem mais fallback com nomes: os chips de busca populares só aparecem com dados reais, e título e descrição da home não citam categorias.

## 7. Testes de permissão

Papéis (cada um com JWT real, em ambiente de teste):

| Papel | Como criar |
|---|---|
| Visitante | chave publicável, sem login |
| Cadastrado sem assinatura | conta nova, sem linha em `subscriptions` |
| Assinante ativo | `subscriptions` com `status='active'` e `expires_at` futuro |
| Assinante expirado | mesma linha, `expires_at` no passado |
| Fornecedor dono | conta com um fornecedor pendente e um aprovado |
| Admin | `profiles.type = 'admin'` |

Matriz esperada (após a mudança):

| Consulta | Visitante | Sem assinatura | Expirado | Ativo | Dono | Admin |
|---|---|---|---|---|---|---|
| `suppliers` aprovados | 0 | 0 | 0 | sim | sim | sim |
| `suppliers` pendentes de outro | 0 | 0 | 0 | 0 | 0 | sim |
| `suppliers` próprios (qualquer status) | 0 | 0 | 0 | 0 | sim | sim |
| `supplier_photos` aprovados | 0 | 0 | 0 | sim | sim | sim |
| `categories` | 0 | 0 | 0 | sim | (decisão A/B) | sim |
| `regions` | 0 | 0 | 0 | sim | (decisão A/B) | sim |
| `subcategories` | 0 | 0 | 0 | sim | (decisão A/B) | sim |
| `supplier_contacts` aprovados | 0 | 0 | 0 | sim | próprios | sim |
| `subscriptions` próprias | 0 | própria | própria | própria | própria | todas |
| `update` em fornecedor de outro | negado | negado | negado | negado | negado | permitido |
| `increment_supplier_views` | permitido | permitido | permitido | permitido | permitido | permitido |

Execução: script em `tests/rls/` que roda contra **Supabase local** (CLI com Docker) ou **projeto de teste** indicado por você. Nunca contra produção. O script aplica o rascunho, faz cada consulta acima com cada JWT e compara com a matriz.

## 8. Ordem de implantação e reversão

1. Você aprova as opções da seção 4 (cadastro) e 5 (build).
2. Testar as políticas em ambiente de teste, com a matriz acima.
3. Publicar no Preview o app com estados vazios para visitante e a tela de planos.
4. Aplicar no Supabase de produção, com aprovação, em horário de pouco uso.
5. Validar a matriz em produção com as contas de teste.

**Reversão:** guardar as políticas antigas num arquivo de migração. Reverter é recriar as quatro políticas `*_public_read` antigas e remover as novas.

## 9. Riscos

- **Slugs nas URLs (principal risco residual).** Cada categoria e fornecedor tem uma casca em URL previsível. Quem testa nomes consegue saber se existem, pelo status 200 ou 404, e a `canonical` e o `og:url` das cascas trazem o slug. Isso vai contra o objetivo de não deixar extrair a base. A correção definitiva são IDs opacos nas URLs (fase 2). Até lá, o risco é de confirmação de nomes, não de dados.
- **Fotos** continuam em bucket público, acessíveis por URL. Fase 2: bucket privado com URL assinada.
- **Enquanto a RLS não estiver em produção**, a API anônima ainda expõe o catálogo, e o site publicado também. Nada desta mudança entra em produção sem sua aprovação.
- **Guias** citam Brás, 25 de Março, Pari, Bom Retiro e Santa Ifigênia, por decisão sua (termos de SEO, não identificam o catálogo).
- **Ordem de implantação.** Se o build novo subir antes da variável `SUPABASE_BUILD_DB_URL` existir na Vercel, o build falha e a Vercel mantém a versão anterior. Se a migração 007 for aplicada antes do papel e da senha, o build também falha. A ordem está na seção 10.
- **Workflow de detecção.** Sem o secret, o passo de verificação falha a cada execução. Ele é fail closed: não publica, mas também não é silencioso. Não foi executado nem configurado.

## 10. Estado da implantação e próximos passos

Nada foi aplicado em produção. Não há merge, deploy de produção, mudança de RLS em produção, secret configurado nem workflow executado.

### Resultados no branch e no banco de teste

- `npm test`: 158 testes passam. Um teste de integração fica pulado sem banco e roda com `SPF_TESTE_BANCO_URL`.
- Matriz de permissões (89 verificações): no estado atual, 15 divergências, todas vazamentos que a migração 007 fecha. Na migração 007 aplicada: 0 divergências.
- Build contra o banco de teste: sitemap com 11 URLs; categorias, bairros e fichas com `noindex`; nenhum nome ou descrição de fornecedor no `dist/`. Os únicos termos de catálogo que restam são os slugs nas URLs e nos canonicals, já descritos na seção 9.

Por perfil, na matriz com a 007 aplicada:

| Perfil | Fornecedores | Fotos | Contatos | Observação |
|---|---|---|---|---|
| Visitante (sem login) | 0 ou negado | 0 ou negado | 0 ou negado | Categorias e bairros também negados |
| Cadastrado sem assinatura | 0 | 0 | 0 | |
| Assinante expirado | 0 | 0 | 0 | |
| Assinante ativo | só aprovados | só de aprovados | só de aprovados | |
| Dono do cadastro | só os próprios, em qualquer status | idem | idem | Não edita nem apaga os de outros |
| Admin | tudo | tudo | tudo | Políticas `*_admin_all` mantidas |
| Papel `build_publico` | negado | negado | negado | Só `catalogo_slugs()`: 27 linhas no banco de teste |

Também bloqueados: autopromoção a admin, ativação de assinatura pelo próprio usuário (o cadastro de assinatura entra sempre como `pending`) e leitura direta das tabelas pelo build.

### Painel administrativo depois da proteção

- As políticas de admin não mudam. O admin continua vendo e editando tudo pela API.
- Toda gravação do painel que altera o que aparece publicamente chama `publicarPaginas()` depois de salvar com sucesso (commit `cbc09e8`). Isso dispara o build pela Vercel.
- O build usa o papel `build_publico`, e não a sessão do admin. Por isso, a publicação não depende de quem clicou.
- O build só reage a entrada, saída ou mudança de slug. Nome, descrição e foto não mudam o site público, então não disparam publicação.

### Sequência de implantação (aguardando sua aprovação)

A função `catalogo_slugs()` só existe depois da migração 007. Sem ela, o build novo falha e a Vercel mantém a versão anterior. Por isso a ordem importa:

1. Aplicar a migração 007 no Supabase de produção, com aprovação expressa.
2. Criar o papel `build_publico` com senha gerada e `grant execute on function public.catalogo_slugs() to build_publico`. O script de criação não está no repositório: deve ser escrito e revisado antes.
3. Configurar `SUPABASE_BUILD_DB_URL` e `SUPABASE_DB_CA` na Vercel (Preview e Production) e como secrets do GitHub Actions.
4. Fazer o merge e o deploy de produção, com aprovação expressa.
5. Conferir: visitante e assinante, pelo app e pela API; sitemap; cascas com `noindex`; cadastro de fornecedor com categorias e bairros.

Janela de atenção: entre os passos 1 e 4, o app para visitantes mostra o catálogo vazio, que é o comportamento desejado. As páginas estáticas antigas continuam no ar, com os dados antigos, até o deploy. Por isso, os passos 1 e 4 devem ficar próximos.

Reversão: seção 8.

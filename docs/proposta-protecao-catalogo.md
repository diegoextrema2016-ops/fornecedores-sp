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

## 5. Gerar as páginas estáticas sem credencial privilegiada

Mudança já feita no branch: as páginas estáticas **não contêm mais nenhum dado do catálogo** (nomes, descrições, fotos, contagens, bairros, categorias). Elas só mostram uma página protegida com CTA para os planos.

O build ainda precisa da lista de slugs (para gerar os arquivos das rotas). Com as políticas novas, a chave anônima devolve listas vazias e o build aborta. A Vercel mantém a versão anterior, então não quebra o site, mas o workflow falharia a cada execução. Duas opções:

- **Opção A (recomendada): sem leitura do catálogo no build.** Remover a geração de arquivos por fornecedor, categoria e região. As rotas `/fornecedor/*`, `/categorias/*` e `/regiao/*` passam a receber a página protegida (status 200, `noindex`). Não há credencial no CI, e o workflow de detecção deixa de ser necessário. **Trade-off:** um endereço inexistente do catálogo responde 200 com `noindex`, e não 404 real. Isso contraria a garantia 4 (404 real para o inexistente), então precisa da sua decisão.
- **Opção B: função de slugs com papel dedicado.** Função `SECURITY DEFINER` que devolve só `slug`, revogada de `anon` e `authenticated`, com permissão para um papel de login próprio (`build_publico`). A senha ficaria no segredo do GitHub. **Trade-off:** os slugs são nomes de fornecedores, e a credencial fica no CI.

Em nenhuma das duas opções usar `service_role` no CI. Ela contorna o RLS inteiro.

## 6. Impedir consulta direta pela API

- Com o RLS acima, a API devolve lista vazia para visitante e cadastrado sem assinatura, inclusive com `count=exact`, filtros, `or` e paginação. Não há consulta que contorne a política.
- Defesa em profundidade (opcional): `revoke select on public.suppliers, public.supplier_photos, public.categories, public.subcategories, public.regions from anon;`. Isso faz a API responder erro de permissão em vez de lista vazia, o que o app precisa tratar.
- `increment_supplier_views` (anon) só incrementa o contador de um fornecedor aprovado. Não devolve dados. Pode ser mantida.
- **Fase 2 (fora deste escopo):** fotos em bucket privado com URL assinada só para assinante; e IDs opacos nas URLs, porque os slugs atuais (`/fornecedor/eruthy-jeans`) revelam nomes.
- **Fase 1:** remover `CATEGORIES` e `REGIONS` de `js/data.js` e dos fallbacks de `js/pages-public.js` (mudança de código, feita depois da sua aprovação, junto com a decisão de cadastro).

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

- O workflow de detecção (`.github/workflows/publicar-quando-mudar.yml`) **não pode ficar ativo** depois da mudança de RLS sem a opção B, porque o build vai receber listas vazias. Por isso ele fica fora do merge até a decisão.
- O app atual, para visitante, vai mostrar listas vazias. Precisa de estado vazio com CTA para planos antes da aplicação.
- Sem a fase 2, quem já tiver a URL de uma foto consegue abri-la, e um slug revela o nome de um fornecedor.

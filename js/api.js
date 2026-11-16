// Acesso ao Supabase (banco, autenticação e imagens). Todas as chamadas de rede passam por aqui.
// O cliente vem do CDN com versão fixa. Para atualizar, troque a versão e teste antes de publicar.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE, SITE } from './config.js';
import { parseAuthReturn, RECOVERY_MARK_KEY } from './auth-return.js';
import { imagePathFromUrl } from './imagens.js';

// Caminho do bucket a partir da referência (função pura em imagens.js; reexportada para quem já importava daqui).
export { imagePathFromUrl };

// Retorno do link de e-mail, lido ANTES de o cliente apagar os tokens do endereço.
export const authReturn = parseAuthReturn(typeof location !== 'undefined' ? location.hash : '');
// Marca a troca de senha para sobreviver ao recarregamento da página /redefinir-senha.
if (authReturn?.kind === 'success' && authReturn.type === 'recovery' && typeof sessionStorage !== 'undefined') {
  sessionStorage.setItem(RECOVERY_MARK_KEY, '1');
}

export const sb = createClient(SUPABASE.url, SUPABASE.anonKey, {
  // detectSessionInUrl: lê o retorno do link (tokens depois do #) e abre a sessão. authReturn guarda o tipo da ação.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Endereços de retorno dos links de e-mail. Precisam estar na lista de redirecionamentos do Supabase.
export const AUTH_REDIRECT = {
  signup: () => SITE.url + '/conta/retorno',
  recovery: () => SITE.url + '/redefinir-senha',
  emailChange: () => SITE.url + '/conta/retorno',
};

const BUCKET = SUPABASE.imageBucket;

// Lança o erro do Supabase como Error comum, mantendo a mensagem.
function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Colunas de "suppliers" que o site usa. owner_id NÃO está aqui: o banco não entrega esse campo à API
// (supabase/migration-008). Mantenha esta lista igual à da migração 008; tests/supabase-colunas.test.mjs confere.
export const SUPPLIER_COLUMNS = [
  'id', 'name', 'slug', 'description', 'category_id', 'subcategory_id', 'subcategory', 'supplier_type',
  'bairro', 'city', 'state', 'sale_wholesale', 'sale_retail', 'sale_resellers', 'ships_other_cities',
  'min_order', 'hours', 'tags', 'logo_url', 'approval_status', 'verified', 'featured', 'is_demo', 'views',
  'created_at', 'updated_at',
].join(', ');
// Lista com fotos e contatos embutidos. O banco filtra quem pode ver cada linha e cada coluna.
const SUPPLIER_SELECT = `${SUPPLIER_COLUMNS}, supplier_photos(url, position), supplier_contacts(*)`;

export const api = {
  // ----- Sessão e perfil -----
  async currentUser() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  },
  async loadProfile(userId) {
    return check(await sb.from('profiles').select('id, name, email, type, created_at').eq('id', userId).maybeSingle());
  },
  async loadUsers() {
    return check(await sb.from('profiles').select('id, name, email, type, created_at').order('created_at', { ascending: false }));
  },
  async setUserType(userId, type) {
    check(await sb.from('profiles').update({ type }).eq('id', userId));
  },

  // ----- Autenticação -----
  async signUp({ name, email, password, redirectTo }) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    // Com confirmação de e-mail ligada, o Supabase não devolve sessão até o clique no link.
    return { needsConfirmation: !data.session };
  },
  async signIn(email, password) {
    check(await sb.auth.signInWithPassword({ email, password }));
  },
  async signOut() {
    // scope 'local' limpa a sessão deste navegador sem depender do servidor (que pode falhar com o token vencido).
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
  // Pede o e-mail de recuperação. A resposta é igual exista ou não a conta (não revela quem é cliente).
  async requestPasswordReset(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT.recovery() });
    if (error) throw error;
  },
  // Define a nova senha da sessão de recuperação aberta pelo link.
  async updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
  },
  // Reenvia o e-mail de confirmação de um cadastro ainda não confirmado.
  async resendConfirmation(email) {
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_REDIRECT.signup() } });
    if (error) throw error;
  },
  // Pede a troca de e-mail: o Supabase envia o link de confirmação para o NOVO endereço.
  async requestEmailChange(newEmail) {
    const { error } = await sb.auth.updateUser({ email: newEmail }, { emailRedirectTo: AUTH_REDIRECT.emailChange() });
    if (error) throw error;
  },

  // ----- Leitura do catálogo -----
  async loadCatalog() {
    const [categories, subcategories, regions] = await Promise.all([
      sb.from('categories').select('*').order('sort_order').order('name'),
      sb.from('subcategories').select('*').order('name'),
      sb.from('regions').select('*').order('sort_order').order('name'),
    ]);
    return {
      categories: check(categories),
      subcategories: check(subcategories),
      regions: check(regions),
    };
  },
  async loadSuppliers() {
    return check(await sb.from('suppliers').select(SUPPLIER_SELECT).order('created_at', { ascending: false }));
  },
  // Destaques para todos os visitantes: só colunas públicas, sem contatos (migração 014).
  async loadFeaturedPublic() {
    return check(await sb.from('destaques_publicos').select('id,name,slug,description,category_id,bairro,city,tags,logo_url,verified,created_at').order('created_at', { ascending: false }));
  },
  async loadFavorites(userId) {
    const rows = check(await sb.from('favorites').select('supplier_id').eq('user_id', userId));
    return rows.map((r) => r.supplier_id);
  },
  async loadSubscriptions(userId) {
    return check(await sb.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
  },

  // ----- Escrita: fornecedores -----
  // RETURNING com colunas explícitas: owner_id não é devolvido (select * falharia depois da migração 008).
  async insertSupplier(row) {
    return check(await sb.from('suppliers').insert(row).select(SUPPLIER_COLUMNS).single());
  },
  async updateSupplier(id, row) {
    return check(await sb.from('suppliers').update(row).eq('id', id).select(SUPPLIER_COLUMNS).single());
  },
  // Duplicado por Instagram ou WhatsApp (função no banco; ver supabase/migration-004-duplicados.sql).
  async findDuplicate({ instagram = null, whatsapp = null, excludeId = null }) {
    const rows = check(await sb.rpc('find_supplier_duplicate', {
      p_instagram: instagram || null,
      p_whatsapp: whatsapp || null,
      p_exclude: excludeId || null,
    }));
    return rows?.[0] || null;
  },
  async deleteSupplier(id) {
    check(await sb.from('suppliers').delete().eq('id', id));
  },
  async upsertContact(row) {
    check(await sb.from('supplier_contacts').upsert(row, { onConflict: 'supplier_id' }));
  },
  async replacePhotos(supplierId, urls) {
    check(await sb.from('supplier_photos').delete().eq('supplier_id', supplierId));
    if (!urls.length) return;
    check(await sb.from('supplier_photos').insert(urls.map((url, i) => ({ supplier_id: supplierId, url, position: i }))));
  },
  async incrementViews(supplierId) {
    check(await sb.rpc('increment_supplier_views', { p_supplier_id: supplierId }));
  },

  // ----- Buscas feitas no site (Populares da home) -----
  async registraBusca(termo) {
    check(await sb.rpc('registra_busca', { p_termo: termo }));
  },
  async buscasPopulares(limite = 5) {
    const linhas = check(await sb.rpc('buscas_populares', { p_limite: limite }));
    return (linhas || []).map((r) => r.termo);
  },

  // ----- Contato: o envio é público; ler, marcar e excluir é só do administrador (migração 018) -----
  async enviaContato({ nome, email, assunto, mensagem, site = '' }) {
    check(await sb.rpc('envia_mensagem_contato', { p_nome: nome, p_email: email, p_assunto: assunto, p_mensagem: mensagem, p_site: site }));
  },
  async loadContactMessages(limite = 200) {
    return check(await sb.from('contact_messages').select('id,name,email,subject,message,read_at,created_at').order('created_at', { ascending: false }).limit(limite));
  },
  async countUnreadMessages() {
    const { count, error } = await sb.from('contact_messages').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (error) throw error;
    return count || 0;
  },
  // .single(): se o banco não alterar nenhuma linha (sem permissão ou já excluída), vira erro em vez de sucesso falso.
  async setContactMessageRead(id, lida) {
    return check(await sb.from('contact_messages').update({ read_at: lida ? new Date().toISOString() : null }).eq('id', id).select('id,read_at').single());
  },
  async deleteContactMessage(id) {
    check(await sb.from('contact_messages').delete().eq('id', id).select('id').single());
  },

  // ----- Escrita: categorias e regiões (somente administrador, o banco confere) -----
  async upsertCategory(row, subcategoryNames = []) {
    const saved = check(await sb.from('categories').upsert(row, { onConflict: 'slug' }).select().single());
    check(await sb.from('subcategories').delete().eq('category_id', saved.id));
    if (subcategoryNames.length) {
      const rows = subcategoryNames.map((name) => ({ category_id: saved.id, name, slug: slugFor(name) }));
      check(await sb.from('subcategories').insert(rows));
    }
    return saved;
  },
  async deleteCategory(slug) {
    check(await sb.from('categories').delete().eq('slug', slug));
  },
  async upsertRegion(row) {
    return check(await sb.from('regions').upsert(row, { onConflict: 'slug' }).select().single());
  },
  async deleteRegion(slug) {
    check(await sb.from('regions').delete().eq('slug', slug));
  },

  // ----- Escrita: favoritos e assinaturas -----
  async addFavorites(userId, supplierIds) {
    if (!supplierIds.length) return;
    const rows = supplierIds.map((supplier_id) => ({ user_id: userId, supplier_id }));
    check(await sb.from('favorites').upsert(rows, { onConflict: 'user_id,supplier_id', ignoreDuplicates: true }));
  },
  async setFavorite(userId, supplierId, on) {
    if (on) {
      check(await sb.from('favorites').upsert({ user_id: userId, supplier_id: supplierId }, { onConflict: 'user_id,supplier_id', ignoreDuplicates: true }));
    } else {
      check(await sb.from('favorites').delete().eq('user_id', userId).eq('supplier_id', supplierId));
    }
  },
  // Inicia o pagamento pelo Mercado Pago (Pix ou cartão). Devolve o link do checkout.
  async criarPagamento(planId) {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Entre na sua conta para assinar.');
    const r = await fetch('/api/mercadopago/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || !corpo.url) throw new Error(corpo.error || 'Não foi possível iniciar o pagamento.');
    return corpo.url;
  },
  // Administrador: todos os pedidos e assinaturas, com nome e e-mail de quem pagou.
  async loadAllSubscriptions() {
    return check(await sb.from('subscriptions').select('*, profiles(name, email)').order('created_at', { ascending: false }));
  },
  async updateSubscription(id, patch) {
    check(await sb.from('subscriptions').update(patch).eq('id', id));
  },

  // ----- Imagens (bucket privado) -----
  // O upload grava a referência no formato /object/public/... que o banco aceita (migração 006).
  // Esse endereço NÃO é público: o bucket é privado. Para exibir, use signImageUrls.
  async uploadImage(path, blob) {
    check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false }));
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },
  // Converte referências em URLs assinadas (validade de 1 hora). O banco decide quem pode assinar:
  // assinante ativo, dono e administrador. Quem não pode recebe mapa vazio (sem imagem, sem vazamento).
  async signImageUrls(urls, ttl = 3600) {
    const mapa = new Map();
    const pares = [...new Set((urls || []).filter(Boolean))]
      .map((url) => ({ url, path: imagePathFromUrl(url) }))
      .filter((p) => p.path);
    if (!pares.length) return mapa;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(pares.map((p) => p.path), ttl);
    if (error) {
      console.warn('Não foi possível assinar imagens:', error.message);
      return mapa;
    }
    (data || []).forEach((item, i) => {
      if (item && item.signedUrl) mapa.set(pares[i].url, item.signedUrl);
    });
    return mapa;
  },
  // Remove arquivos do bucket. Não é fatal: se falhar, devolve a lista que ficou (quem chama decide).
  async removeImages(paths) {
    if (!paths.length) return [];
    const { data, error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) {
      console.warn('Imagens não removidas:', error.message);
      return paths;
    }
    const removidos = new Set((data || []).map((d) => d.name));
    return paths.filter((p) => !removidos.has(p));
  },
  // Administrador: lista todas as imagens do bucket (pasta dono/fornecedor/arquivo) com a data de envio.
  async listAllImages() {
    const arquivos = [];
    const donos = check(await sb.storage.from(BUCKET).list('', { limit: 1000 }));
    for (const dono of donos.filter((x) => x.id === null)) {
      const fornecedores = check(await sb.storage.from(BUCKET).list(dono.name, { limit: 1000 }));
      for (const forn of fornecedores.filter((x) => x.id === null)) {
        const pasta = `${dono.name}/${forn.name}`;
        const itens = check(await sb.storage.from(BUCKET).list(pasta, { limit: 1000 }));
        for (const f of itens.filter((x) => x.id)) {
          arquivos.push({ path: `${pasta}/${f.name}`, createdAt: f.created_at });
        }
      }
    }
    return arquivos;
  },
  // Administrador: caminhos de imagens que ainda são usadas por algum fornecedor (logo e fotos).
  async referencedImagePaths() {
    const linhas = check(await sb.from('suppliers').select('logo_url, supplier_photos(url)'));
    const usados = new Set();
    for (const s of linhas) {
      const refs = [s.logo_url, ...(s.supplier_photos || []).map((p) => p.url)];
      for (const r of refs) {
        const p = imagePathFromUrl(r);
        if (p) usados.add(p);
      }
    }
    return usados;
  },
};

function slugFor(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'subcategoria';
}

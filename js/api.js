// Acesso ao Supabase (banco, autenticação e imagens). Todas as chamadas de rede passam por aqui.
// O cliente vem do CDN com versão fixa. Para atualizar, troque a versão e teste antes de publicar.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE } from './config.js';

export const sb = createClient(SUPABASE.url, SUPABASE.anonKey, {
  // detectSessionInUrl: lê o retorno do link de confirmação (tokens no endereço depois do #) e abre a sessão.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const BUCKET = SUPABASE.imageBucket;

// Lança o erro do Supabase como Error comum, mantendo a mensagem.
function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Colunas da lista de fornecedores (com fotos e contatos embutidos; o banco filtra quem pode ver o quê).
const SUPPLIER_SELECT = '*, supplier_photos(url, position), supplier_contacts(*)';

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
  async loadFavorites(userId) {
    const rows = check(await sb.from('favorites').select('supplier_id').eq('user_id', userId));
    return rows.map((r) => r.supplier_id);
  },
  async loadSubscriptions(userId) {
    return check(await sb.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
  },

  // ----- Escrita: fornecedores -----
  async insertSupplier(row) {
    return check(await sb.from('suppliers').insert(row).select().single());
  },
  async updateSupplier(id, row) {
    return check(await sb.from('suppliers').update(row).eq('id', id).select().single());
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
  async requestSubscription({ userId, planId, amount }) {
    const now = new Date().toISOString();
    return check(await sb.from('subscriptions').insert({
      user_id: userId,
      plan: planId,
      amount,
      starts_at: now,
      expires_at: now,
      status: 'pending',
      payment_note: 'Pix informado pelo cliente; aguardando conferência',
    }).select().single());
  },
  // Administrador: todos os pedidos e assinaturas, com nome e e-mail de quem pagou.
  async loadAllSubscriptions() {
    return check(await sb.from('subscriptions').select('*, profiles(name, email)').order('created_at', { ascending: false }));
  },
  async updateSubscription(id, patch) {
    check(await sb.from('subscriptions').update(patch).eq('id', id));
  },

  // ----- Imagens -----
  async uploadImage(path, blob) {
    check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false }));
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },
  async removeImages(paths) {
    if (!paths.length) return;
    await sb.storage.from(BUCKET).remove(paths);
  },
};

// Caminho do arquivo dentro do bucket, a partir da URL pública (usado para limpar imagens antigas).
export function imagePathFromUrl(url = '') {
  const marker = `/object/public/${BUCKET}/`;
  const i = String(url).indexOf(marker);
  return i >= 0 ? decodeURIComponent(String(url).slice(i + marker.length)) : null;
}

function slugFor(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'subcategoria';
}

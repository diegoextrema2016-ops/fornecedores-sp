// Camada de dados do site. A fonte da verdade é o Supabase (Postgres, Auth e Storage).
//
// Como funciona:
//  - refresh() carrega do banco tudo o que este visitante pode ver (o próprio banco aplica as regras de acesso).
//    Isso roda antes de cada página, então as telas leem de uma cópia em memória, de forma síncrona.
//  - As escritas (salvar, aprovar, categorias...) vão ao banco primeiro. Só depois a cópia local é atualizada.
//  - Única exceção: os favoritos de quem ainda não tem conta ficam neste navegador (preferência, não dado de negócio).
//    Ao entrar na conta, são copiados para o banco.
import { api, imagePathFromUrl } from './api.js';
import { SITE, PLANS } from './config.js';
import { slugify } from './utils.js';
import * as M from './mapping.js';
import { instagramKey, phoneKey } from './extract.js';

const GUEST_FAV_KEY = 'spf:v2:guest-favorites';
const SESSION_CACHE_KEY = 'spf:session-cache';
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Cópia em memória, recarregada por refresh().
const state = {
  session: null,        // { id, email, name, type, role: 'admin' | 'user' } ou null
  categories: [],
  regions: [],
  suppliers: [],        // o que o banco devolve a este visitante (aprovados; e tudo, para o administrador)
  favorites: [],        // ids dos fornecedores favoritos
  subscriptions: [],    // assinaturas deste usuário, da mais recente para a mais antiga
  users: [],            // contas (somente administrador)
  allSubscriptions: [], // todos os pedidos e assinaturas, com quem pagou (somente administrador)
};

// Avisa a interface sobre erros de escrita que não bloqueiam a tela (ex.: falha ao salvar favorito).
function emitError(message) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spf:error', { detail: message }));
}

function guestFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(GUEST_FAV_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setGuestFavorites(list) {
  try {
    localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(list));
  } catch {
    // Armazenamento bloqueado (navegação privada, por exemplo): o favorito vale só nesta tela.
  }
}

const categorySlugMap = () => new Map(state.categories.map((c) => [c.id, c.slug]));
const categoryIdBySlug = (slug) => state.categories.find((c) => c.slug === slug)?.id || null;

// Substitui o item com a mesma chave ou acrescenta.
function upsertBy(list, item, key) {
  const i = list.findIndex((x) => x[key] === item[key]);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

// Assinatura que vale agora: a ativa com vencimento mais distante; senão, a mais recente.
function bestSubscription() {
  const now = Date.now();
  const active = state.subscriptions
    .filter((s) => s.status === 'active' && new Date(s.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];
  return active || state.subscriptions[0] || null;
}

// Envia uma imagem nova (data URL vinda do formulário) ao Storage. URLs já existentes são mantidas.
async function persistImage(value, supplierId, name) {
  if (!value) return '';
  if (!String(value).startsWith('data:')) return value;
  const blob = await (await fetch(value)).blob();
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
  const path = `${state.session.id}/${supplierId}/${name}-${Date.now()}.${ext}`;
  return api.uploadImage(path, blob);
}

// ---------- Carregamento ----------
let inFlight = null;
let lastRefreshAt = 0; // quando a cópia foi carregada pela última vez (ms)
let everLoaded = false; // a cópia já foi carregada ao menos uma vez nesta visita

// maxAgeMs: se a cópia é mais nova que isso e quem navega não é administrador, usa a cópia atual.
// Sem maxAgeMs (ou 0), sempre busca no banco. Login, logout e cadastros zeram a cópia.
// Janela mínima de 5 minutos: trocar de página não baixa a lista de fornecedores de novo a cada clique.
const JANELA_DE_CACHE_MS = 5 * 60 * 1000;
function refresh({ maxAgeMs = 0 } = {}) {
  const janela = Math.max(maxAgeMs, JANELA_DE_CACHE_MS);
  const usable = maxAgeMs > 0 && Date.now() - lastRefreshAt < janela && state.session?.role !== 'admin';
  if (usable && !inFlight) return Promise.resolve();
  if (!inFlight) inFlight = doRefresh().finally(() => { inFlight = null; });
  return inFlight;
}

async function doRefresh() {
  const user = await api.currentUser();
  // Catálogo e fornecedores são independentes: buscamos os dois ao mesmo tempo.
  const [catalog, rawSuppliers] = await Promise.all([api.loadCatalog(), api.loadSuppliers()]);
  const categories = catalog.categories.map((c) =>
    M.categoryFromRow(c, catalog.subcategories.filter((s) => s.category_id === c.id)));
  const slugMap = new Map(categories.map((c) => [c.id, c.slug]));
  const suppliers = rawSuppliers.map((r) => M.supplierFromRow(r, slugMap));

  let session = null;
  let favorites = guestFavorites();
  let subscriptions = [];
  let users = [];
  let allSubscriptions = [];

  if (user) {
    const [profile, loadedFavorites, subs] = await Promise.all([
      api.loadProfile(user.id),
      api.loadFavorites(user.id),
      api.loadSubscriptions(user.id),
    ]);
    const base = profile
      ? M.userFromRow(profile)
      : { id: user.id, name: user.user_metadata?.name || user.email, email: user.email, type: 'comprador' };
    session = { ...base, role: base.type === 'admin' ? 'admin' : 'user' };
    favorites = loadedFavorites;
    const guest = guestFavorites();
    if (guest.length) {
      await api.addFavorites(user.id, guest);
      setGuestFavorites([]);
      favorites = [...new Set([...favorites, ...guest])];
    }
    subscriptions = subs.map(M.subscriptionFromRow);
    if (session.role === 'admin') {
      const [allUsers, allSubs] = await Promise.all([api.loadUsers(), api.loadAllSubscriptions()]);
      users = allUsers.map(M.userFromRow);
      allSubscriptions = allSubs.map(M.subscriptionAdminFromRow);
    }
  }

  Object.assign(state, { session, categories, suppliers, favorites, subscriptions, users, allSubscriptions, regions: catalog.regions.map(M.regionFromRow) });
  lastRefreshAt = Date.now();
  everLoaded = true;
  saveAdminSnapshot();
  saveSessionCache();
}

// ---------- Autenticação ----------
const auth = {
  async signUp({ name, email, password }) {
    lastRefreshAt = 0;
    try {
      return await api.signUp({ name: name.trim(), email: email.trim().toLowerCase(), password, redirectTo: SITE.url });
    } catch (err) {
      throw new Error(M.authErrorMessage(err));
    }
  },
  async signIn(email, password) {
    lastRefreshAt = 0;
    try {
      await api.signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      throw new Error(M.authErrorMessage(err));
    }
  },
  async signOut() {
    lastRefreshAt = 0;
    // Espera uma atualização em andamento, para ela não devolver a sessão antiga depois do logout.
    if (inFlight) await inFlight.catch(() => {});
    try {
      await api.signOut();
    } catch {
      // Mesmo com erro, a sessão deste navegador é descartada abaixo.
    }
    state.session = null;
    state.favorites = [];
    state.subscriptions = [];
    state.users = [];
    state.allSubscriptions = [];
    clearAdminSnapshot();
  },
};

// ---------- Fornecedores ----------
async function saveSupplier(data, { asAdmin = false, checkDuplicates = false } = {}) {
  if (!state.session) throw new Error('Entre na sua conta para salvar fornecedores.');
  lastRefreshAt = 0;
  const existing = data.id ? state.suppliers.find((s) => s.id === data.id) : null;
  if (data.id && !existing) throw new Error('Fornecedor não encontrado.');

  const id = existing ? existing.id : crypto.randomUUID();
  const merged = { ...(existing || {}), ...data, id };

  // Duplicado (só no formulário; restauração e importação não passam por aqui): mesmo Instagram ou WhatsApp.
  // Checado no banco, porque os contatos dos outros fornecedores não ficam visíveis para quem está cadastrando.
  const igKey = instagramKey(merged.instagram);
  const waKey = phoneKey(merged.whatsapp);
  if (checkDuplicates && (igKey || waKey)) {
    const dup = await api.findDuplicate({ instagram: igKey, whatsapp: waKey, excludeId: existing ? id : null });
    if (dup) {
      const motivo = dup.field === 'instagram' ? 'este Instagram' : 'este WhatsApp';
      throw new Error(`Fornecedor duplicado: ${motivo} já está cadastrado em "${dup.name}".`);
    }
  }
  const categoryId = categoryIdBySlug(merged.category);
  if (merged.category && !categoryId) throw new Error('Categoria inexistente. Crie a categoria antes de usá-la.');
  const slug = M.uniqueSlug(state.suppliers, merged.slug || slugify(merged.name), id);

  const logo = await persistImage(merged.logo, id, 'logo');
  const photoUrls = [];
  let n = 0;
  for (const p of merged.photos || []) photoUrls.push(await persistImage(p, id, `foto-${++n}`));

  // Imagens antigas que saíram do cadastro são apagadas (sem bloquear o salvamento se falhar).
  const dropped = [...(existing?.photos || []), existing?.logo]
    .filter((u) => u && u !== logo && !photoUrls.includes(u))
    .map(imagePathFromUrl)
    .filter(Boolean);

  const supplierRow = M.supplierToRow({ ...merged, slug, logo }, { categoryId, asAdmin });
  const saved = existing
    ? await api.updateSupplier(id, supplierRow)
    : await api.insertSupplier({ id, ...supplierRow });
  const contactRow = M.contactToRow(merged, id);
  await api.upsertContact(contactRow);
  await api.replacePhotos(id, photoUrls);
  await api.removeImages(dropped);

  const app = M.supplierFromRow({
    ...saved,
    supplier_contacts: [contactRow],
    supplier_photos: photoUrls.map((url, position) => ({ url, position })),
  }, categorySlugMap());
  upsertBy(state.suppliers, app, 'id');
  return app;
}

// Muda a cópia local na hora (a tela já mostra o novo valor) e grava no banco em seguida.
// Se a gravação falhar, a cópia volta ao valor anterior e o erro segue para quem chamou.
async function patchSupplier(id, changes) {
  const current = state.suppliers.find((s) => s.id === id);
  if (!current) return null;
  const row = {};
  if ('status' in changes) row.approval_status = changes.status;
  if ('verified' in changes) row.verified = Boolean(changes.verified);
  if ('featured' in changes) row.featured = Boolean(changes.featured);
  if ('category' in changes) {
    const cat = state.categories.find((c) => c.slug === changes.category);
    if (!cat) throw new Error('Categoria não encontrada.');
    row.category_id = cat.id;
  }
  const before = Object.fromEntries(Object.keys(changes).map((k) => [k, current[k]]));
  Object.assign(current, changes);
  try {
    await api.updateSupplier(id, row);
  } catch (err) {
    Object.assign(current, before);
    throw err;
  }
  return current;
}

const suppliers = {
  list({ status } = {}) {
    return status ? state.suppliers.filter((s) => s.status === status) : state.suppliers.slice();
  },
  approved() {
    return state.suppliers.filter((s) => s.status === 'approved');
  },
  get(id) {
    return state.suppliers.find((s) => s.id === id) || null;
  },
  findBySlug(slug) {
    return state.suppliers.find((s) => s.slug === slug) || null;
  },
  save: saveSupplier,
  setStatus(id, status) {
    return patchSupplier(id, { status });
  },
  setCategory(id, slug) {
    return patchSupplier(id, { category: slug });
  },
  setFlag(id, flag, value) {
    if (!['verified', 'featured'].includes(flag)) throw new Error('Flag inválida');
    return patchSupplier(id, { [flag]: Boolean(value) });
  },
  // Visualização conta em segundo plano; falhas não atrapalham a página.
  incrementViews(id) {
    api.incrementViews(id).catch(() => {});
  },
  async remove(id) {
    // Some da cópia na hora; se o banco recusar, o fornecedor volta à lista.
    const anterior = state.suppliers;
    state.suppliers = anterior.filter((s) => s.id !== id);
    try {
      await api.deleteSupplier(id);
    } catch (err) {
      state.suppliers = anterior;
      throw err;
    }
  },
};

// ---------- Categorias ----------
async function saveCategory(data) {
  const slug = data.slug || slugify(data.name);
  const existing = state.categories.find((c) => c.slug === slug);
  const record = { subcategories: [], status: 'active', description: '', icon: '📦', sortOrder: 0, ...existing, ...data, slug };
  // Mostra na hora: a cópia local recebe a mudança antes da gravação; se falhar, volta ao que era.
  const anterior = existing ? { ...existing } : null;
  upsertBy(state.categories, {
    id: existing?.id, slug, name: record.name, description: record.description || '', icon: record.icon || '📦',
    status: record.status === 'inactive' ? 'inactive' : 'active', sortOrder: record.sortOrder ?? 0,
    subcategories: record.subcategories || [],
  }, 'slug');
  try {
    const saved = await api.upsertCategory(M.categoryToRow(record), record.subcategories || []);
    const mapped = M.categoryFromRow(saved, (record.subcategories || []).map((name) => ({ name })));
    upsertBy(state.categories, mapped, 'slug');
    return mapped;
  } catch (err) {
    if (anterior) upsertBy(state.categories, anterior, 'slug');
    else state.categories = state.categories.filter((c) => c.slug !== slug);
    throw err;
  }
}

const categories = {
  list({ includeInactive = true } = {}) {
    return includeInactive ? state.categories.slice() : state.categories.filter((c) => c.status !== 'inactive');
  },
  get(slug) {
    return state.categories.find((c) => c.slug === slug) || null;
  },
  save: saveCategory,
  // Muda só alguns campos (ordem, situação) já na cópia local e grava. Se falhar, desfaz.
  async setFields(slug, fields) {
    const current = state.categories.find((c) => c.slug === slug);
    if (!current) throw new Error('Categoria não encontrada.');
    const anterior = { ...current };
    const nova = { ...current, ...fields };
    upsertBy(state.categories, nova, 'slug');
    try {
      return await saveCategory(nova);
    } catch (err) {
      upsertBy(state.categories, anterior, 'slug');
      throw err;
    }
  },
  // Só remove se nenhum fornecedor usar a categoria. Caso contrário, retorna { ok:false }.
  async remove(slug) {
    if (state.suppliers.some((s) => s.category === slug)) {
      return { ok: false, reason: 'Há fornecedores nesta categoria. Mova-os antes de excluir.' };
    }
    await api.deleteCategory(slug);
    state.categories = state.categories.filter((c) => c.slug !== slug);
    return { ok: true };
  },
  countSuppliers(slug) {
    return state.suppliers.filter((s) => s.status === 'approved' && s.category === slug).length;
  },
};

// ---------- Bairros e cidades ----------
const regions = {
  list() {
    return state.regions.slice();
  },
  get(slug) {
    return state.regions.find((r) => r.slug === slug) || null;
  },
  async save(data) {
    const slug = data.slug || slugify(data.name);
    const existing = state.regions.find((r) => r.slug === slug);
    const record = { description: '', sortOrder: 0, ...existing, ...data, slug };
    const anterior = existing ? { ...existing } : null;
    upsertBy(state.regions, { slug, name: record.name, description: record.description || '', sortOrder: record.sortOrder ?? 0 }, 'slug');
    try {
      const saved = await api.upsertRegion(M.regionToRow(record));
      const mapped = M.regionFromRow(saved);
      upsertBy(state.regions, mapped, 'slug');
      return mapped;
    } catch (err) {
      if (anterior) upsertBy(state.regions, anterior, 'slug');
      else state.regions = state.regions.filter((r) => r.slug !== slug);
      throw err;
    }
  },
  // Só remove se nenhum fornecedor estiver nesta região. Caso contrário, retorna { ok:false }.
  async remove(slug) {
    if (state.suppliers.some((s) => s.bairro === slug)) {
      return { ok: false, reason: 'Há fornecedores nesta região. Mova-os antes de excluir.' };
    }
    await api.deleteRegion(slug);
    state.regions = state.regions.filter((r) => r.slug !== slug);
    return { ok: true };
  },
};

// ---------- Usuários (somente administrador) ----------
const users = {
  list() {
    return state.users.slice();
  },
  async setType(id, type) {
    const anterior = state.users.find((u) => u.id === id)?.type;
    state.users = state.users.map((u) => (u.id === id ? { ...u, type } : u));
    try {
      await api.setUserType(id, type);
    } catch (err) {
      state.users = state.users.map((u) => (u.id === id ? { ...u, type: anterior } : u));
      throw err;
    }
  },
};

// ---------- Sessão ----------
const session = {
  get() {
    return state.session;
  },
};

// ---------- Favoritos ----------
const favorites = {
  list() {
    return state.favorites.slice();
  },
  has(id) {
    return state.favorites.includes(id);
  },
  // Atualiza na hora (a tela responde sem esperar) e grava em segundo plano; desfaz se a gravação falhar.
  toggle(id) {
    const on = !state.favorites.includes(id);
    state.favorites = on ? [...state.favorites, id] : state.favorites.filter((x) => x !== id);
    if (state.session) {
      api.setFavorite(state.session.id, id, on).catch(() => {
        state.favorites = on ? state.favorites.filter((x) => x !== id) : [...state.favorites, id];
        emitError('Não foi possível salvar o favorito. Tente de novo.');
      });
    } else {
      setGuestFavorites(state.favorites);
    }
    return on;
  },
};

// ---------- Assinaturas (acesso aos contatos) ----------
const subscriptions = {
  // Assinatura mais relevante do usuário logado (ativa, ou a mais recente).
  get() {
    return bestSubscription();
  },
  isActive() {
    const sub = bestSubscription();
    return Boolean(sub) && sub.status === 'active' && new Date(sub.expiresAt).getTime() > Date.now();
  },
  // Registra o pedido de assinatura por Pix como pendente. Só o administrador confirma e ativa.
  async requestPix({ planId, amount }) {
    if (!state.session) throw new Error('Entre na sua conta para assinar.');
    lastRefreshAt = 0;
    const pending = state.subscriptions.find((s) =>
      s.status === 'pending' && Date.now() - new Date(s.createdAt || 0).getTime() < PENDING_TTL_MS);
    if (pending) return pending;
    const sub = M.subscriptionFromRow(await api.requestSubscription({ userId: state.session.id, planId, amount }));
    state.subscriptions = [sub, ...state.subscriptions];
    state.allSubscriptions = [sub, ...state.allSubscriptions];
    return sub;
  },
  // Administrador: todos os pedidos, com nome de quem pagou.
  adminList() {
    return state.allSubscriptions.slice();
  },
  // Confirma o Pix recebido: ativa a assinatura pelo prazo do plano.
  // Se o cliente já tinha uma assinatura válida, o prazo começa quando ela termina.
  async confirmPix(id) {
    const sub = state.allSubscriptions.find((s) => s.id === id);
    if (!sub) throw new Error('Pedido não encontrado. Atualize a página e tente de novo.');
    const plan = PLANS.find((p) => p.id === sub.planId) || PLANS[0];
    const now = new Date();
    const current = state.allSubscriptions
      .filter((s) => s.userId === sub.userId && s.id !== id && s.status === 'active' && new Date(s.expiresAt) > now)
      .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];
    const term = M.renewalWindow(now, plan.days, current?.expiresAt);
    const fields = {
      status: 'active',
      startsAt: term.startsAt,
      expiresAt: term.expiresAt,
      paymentNote: `Pix conferido pelo administrador em ${now.toLocaleDateString('pt-BR')}`,
    };
    await api.updateSubscription(id, {
      status: fields.status,
      starts_at: fields.startsAt,
      expires_at: fields.expiresAt,
      payment_note: fields.paymentNote,
    });
    patchSubscription(id, fields);
  },
  // Recusa um pedido pendente ou cancela uma assinatura ativa. Não apaga o registro.
  async cancel(id, reason) {
    const note = reason || 'Cancelada pelo administrador';
    await api.updateSubscription(id, { status: 'cancelled', payment_note: note });
    patchSubscription(id, { status: 'cancelled', paymentNote: note });
  },
};

// Atualiza um pedido nas duas listas (a do administrador e a do próprio usuário, se for o mesmo).
function patchSubscription(id, fields) {
  const apply = (list) => list.map((s) => (s.id === id ? { ...s, ...fields } : s));
  state.allSubscriptions = apply(state.allSubscriptions);
  state.subscriptions = apply(state.subscriptions);
}

// Cópia do painel guardada só nesta aba (sessionStorage, apagada ao fechar a aba). Assim, ao atualizar a página
// do painel, a tela aparece na hora com os últimos dados, e o banco atualiza em segundo plano.
const ADMIN_SNAPSHOT_KEY = 'spf:admin-snapshot';

function saveAdminSnapshot() {
  if (typeof sessionStorage === 'undefined' || state.session?.role !== 'admin') return;
  try {
    sessionStorage.setItem(ADMIN_SNAPSHOT_KEY, JSON.stringify({
      session: state.session, categories: state.categories, regions: state.regions, suppliers: state.suppliers,
      favorites: state.favorites, subscriptions: state.subscriptions, users: state.users, allSubscriptions: state.allSubscriptions,
    }));
  } catch {
    // Espaço cheio ou armazenamento bloqueado: segue sem a cópia.
  }
}

function clearAdminSnapshot() {
  try {
    sessionStorage.removeItem(ADMIN_SNAPSHOT_KEY);
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {}
}

function restoreAdminSnapshot() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const snap = JSON.parse(sessionStorage.getItem(ADMIN_SNAPSHOT_KEY) || 'null');
    if (!snap || snap.session?.role !== 'admin') return;
    Object.assign(state, {
      session: snap.session, categories: snap.categories || [], regions: snap.regions || [], suppliers: snap.suppliers || [],
      favorites: snap.favorites || [], subscriptions: snap.subscriptions || [], users: snap.users || [], allSubscriptions: snap.allSubscriptions || [],
    });
    everLoaded = true;
  } catch {
    clearAdminSnapshot();
  }
}
restoreAdminSnapshot();

// Cópia de quem não é administrador, guardada só nesta aba (sessionStorage): ao atualizar a página,
// o site abre na hora com os últimos dados. Some ao fechar a aba e ao sair da conta.
function saveSessionCache() {
  if (typeof sessionStorage === 'undefined' || state.session?.role === 'admin') return;
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      at: lastRefreshAt, session: state.session, categories: state.categories, regions: state.regions,
      suppliers: state.suppliers, favorites: state.favorites, subscriptions: state.subscriptions,
    }));
  } catch {
    // Espaço cheio ou armazenamento bloqueado: segue sem a cópia.
  }
}

function restoreSessionCache() {
  if (typeof sessionStorage === 'undefined' || state.session?.role === 'admin') return;
  try {
    const snap = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || 'null');
    if (!snap || snap.session?.role === 'admin' || !Array.isArray(snap.suppliers)) return;
    Object.assign(state, {
      session: snap.session || null, categories: snap.categories || [], regions: snap.regions || [],
      suppliers: snap.suppliers, favorites: snap.favorites || [], subscriptions: snap.subscriptions || [],
    });
    lastRefreshAt = Number(snap.at) || 0;
    everLoaded = true;
  } catch {
    try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch {}
  }
}
restoreSessionCache();

// Impressão do conteúdo da cópia: serve para saber se uma atualização em segundo plano trouxe mudanças.
function fingerprint() {
  return JSON.stringify([state.categories, state.regions, state.suppliers, state.favorites, state.subscriptions, state.users, state.allSubscriptions]);
}

export const store = {
  refresh,
  loaded: () => everLoaded,
  fingerprint,
  auth,
  session,
  suppliers,
  categories,
  regions,
  users,
  favorites,
  subscriptions,
};

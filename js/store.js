// Camada de dados do modo 'local'. Guarda tudo no navegador (localStorage).
// A interface de acesso (métodos) foi pensada para ser trocada por Supabase depois, sem mudar as páginas.
// O storage é injetado, para que os testes possam usar um storage falso no Node.

import { CATEGORIES, DEMO_SUPPLIERS, REGIONS } from './data.js';
import { slugify, uid } from './utils.js';

const KEYS = {
  suppliers: 'spf:v1:suppliers',
  demoCleaned: 'spf:v1:demo-limpo',
  categories: 'spf:v1:categories',
  regions: 'spf:v1:regions',
  users: 'spf:v1:users',
  favorites: 'spf:v1:favorites',
  session: 'spf:v1:session',
  subscriptions: 'spf:v1:subscriptions',
};

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function createStore(storage, { seedSuppliers = DEMO_SUPPLIERS, seedCategories = CATEGORIES, seedRegions = REGIONS } = {}) {
  // ---------- Inicialização ----------
  function init() {
    const hadSuppliers = storage.getItem(KEYS.suppliers) != null;
    if (!hadSuppliers) {
      writeJson(storage, KEYS.suppliers, seedSuppliers.map((s) => withDefaults(s)));
    }
    // Uma única vez: tira os fornecedores de demonstração de navegadores que já tinham dados.
    if (storage.getItem(KEYS.demoCleaned) == null) {
      if (hadSuppliers) {
        const current = readJson(storage, KEYS.suppliers, []);
        writeJson(storage, KEYS.suppliers, current.filter((s) => !s.isDemo));
      }
      writeJson(storage, KEYS.demoCleaned, true);
    }
    if (storage.getItem(KEYS.categories) == null) {
      writeJson(storage, KEYS.categories, seedCategories.map((c) => ({ subcategories: [], status: 'active', ...c })));
    }
    if (storage.getItem(KEYS.regions) == null) {
      writeJson(storage, KEYS.regions, seedRegions.map((r) => ({ description: '', ...r })));
    }
    if (storage.getItem(KEYS.users) == null) writeJson(storage, KEYS.users, []);
    if (storage.getItem(KEYS.favorites) == null) writeJson(storage, KEYS.favorites, {});
  }

  function withDefaults(s) {
    return {
      id: s.id || uid('sup'),
      slug: s.slug || slugify(s.name),
      status: 'pending',
      verified: false,
      featured: false,
      views: 0,
      createdAt: new Date().toISOString(),
      saleWholesale: false,
      saleRetail: false,
      saleResellers: false,
      shipsOtherCities: false,
      tags: [],
      photos: [],
      isDemo: false,
      ...s,
    };
  }

  // ---------- Fornecedores ----------
  const suppliers = {
    list({ status } = {}) {
      const all = readJson(storage, KEYS.suppliers, []);
      return status ? all.filter((s) => s.status === status) : all;
    },
    approved() {
      return this.list({ status: 'approved' });
    },
    get(id) {
      return this.list().find((s) => s.id === id) || null;
    },
    findBySlug(slug) {
      return this.list().find((s) => s.slug === slug) || null;
    },
    // Cria (sem id) ou atualiza (com id). Cadastros públicos entram como "pending".
    save(data, { asAdmin = false } = {}) {
      const all = readJson(storage, KEYS.suppliers, []);
      const idx = data.id ? all.findIndex((s) => s.id === data.id) : -1;
      if (idx >= 0) {
        const merged = { ...all[idx], ...data };
        if (!asAdmin) {
          // Usuário comum não altera status nem flags.
          merged.status = all[idx].status;
          merged.verified = all[idx].verified;
          merged.featured = all[idx].featured;
        }
        merged.slug = uniqueSlug(all, merged.slug || slugify(merged.name), merged.id);
        all[idx] = merged;
        writeJson(storage, KEYS.suppliers, all);
        return merged;
      }
      const created = withDefaults({
        ...data,
        status: asAdmin && data.status ? data.status : 'pending',
      });
      created.slug = uniqueSlug(all, created.slug, created.id);
      all.push(created);
      writeJson(storage, KEYS.suppliers, all);
      return created;
    },
    setStatus(id, status) {
      return this._patch(id, { status });
    },
    setFlag(id, flag, value) {
      if (!['verified', 'featured'].includes(flag)) throw new Error('Flag inválida');
      return this._patch(id, { [flag]: Boolean(value) });
    },
    incrementViews(id) {
      const s = this.get(id);
      if (!s) return null;
      return this._patch(id, { views: (s.views || 0) + 1 }, { silent: true });
    },
    remove(id) {
      const all = readJson(storage, KEYS.suppliers, []);
      writeJson(storage, KEYS.suppliers, all.filter((s) => s.id !== id));
    },
    _patch(id, changes) {
      const all = readJson(storage, KEYS.suppliers, []);
      const idx = all.findIndex((s) => s.id === id);
      if (idx < 0) return null;
      all[idx] = { ...all[idx], ...changes };
      writeJson(storage, KEYS.suppliers, all);
      return all[idx];
    },
  };

  function uniqueSlug(all, base, selfId) {
    let slug = base || 'fornecedor';
    let n = 2;
    const taken = (c) => all.some((s) => s.slug === c && s.id !== selfId);
    while (taken(slug)) slug = `${base}-${n++}`;
    return slug;
  }

  // ---------- Categorias ----------
  const categories = {
    list({ includeInactive = true } = {}) {
      const all = readJson(storage, KEYS.categories, []);
      return includeInactive ? all : all.filter((c) => c.status !== 'inactive');
    },
    get(slug) {
      return this.list().find((c) => c.slug === slug) || null;
    },
    save(data) {
      const all = readJson(storage, KEYS.categories, []);
      const slug = data.slug || slugify(data.name);
      const idx = all.findIndex((c) => c.slug === slug);
      const record = { subcategories: [], status: 'active', description: '', icon: '📦', ...all[idx], ...data, slug };
      if (idx >= 0) all[idx] = record;
      else all.push(record);
      writeJson(storage, KEYS.categories, all);
      return record;
    },
    // Só remove se nenhum fornecedor usar a categoria. Caso contrário, retorna { ok:false }.
    remove(slug) {
      const inUse = suppliers.list().some((s) => s.category === slug);
      if (inUse) return { ok: false, reason: 'Há fornecedores nesta categoria. Mova-os antes de excluir.' };
      const all = readJson(storage, KEYS.categories, []);
      writeJson(storage, KEYS.categories, all.filter((c) => c.slug !== slug));
      return { ok: true };
    },
    countSuppliers(slug) {
      return suppliers.approved().filter((s) => s.category === slug).length;
    },
  };

  // ---------- Bairros e cidades (regiões) ----------
  const regions = {
    list() {
      return readJson(storage, KEYS.regions, []);
    },
    get(slug) {
      return this.list().find((r) => r.slug === slug) || null;
    },
    save(data) {
      const all = readJson(storage, KEYS.regions, []);
      const slug = data.slug || slugify(data.name);
      const idx = all.findIndex((r) => r.slug === slug);
      const record = { description: '', ...all[idx], ...data, slug };
      if (idx >= 0) all[idx] = record;
      else all.push(record);
      writeJson(storage, KEYS.regions, all);
      return record;
    },
    // Só remove se nenhum fornecedor estiver nesta região. Caso contrário, retorna { ok:false }.
    remove(slug) {
      const inUse = suppliers.list().some((s) => s.bairro === slug);
      if (inUse) return { ok: false, reason: 'Há fornecedores nesta região. Mova-os antes de excluir.' };
      writeJson(storage, KEYS.regions, readJson(storage, KEYS.regions, []).filter((r) => r.slug !== slug));
      return { ok: true };
    },
  };

  // ---------- Usuários e sessão ----------
  const users = {
    list() {
      return readJson(storage, KEYS.users, []);
    },
    findByEmail(email) {
      const e = String(email).trim().toLowerCase();
      return this.list().find((u) => u.email === e) || null;
    },
    register({ name, email, passwordHash }) {
      const e = String(email).trim().toLowerCase();
      if (this.findByEmail(e)) return { ok: false, reason: 'Já existe uma conta com este e-mail.' };
      const all = this.list();
      const user = { id: uid('usr'), name: name.trim(), email: e, passwordHash, type: 'comprador', createdAt: new Date().toISOString() };
      all.push(user);
      writeJson(storage, KEYS.users, all);
      return { ok: true, user: publicUser(user) };
    },
    setType(id, type) {
      const all = this.list().map((u) => (u.id === id ? { ...u, type } : u));
      writeJson(storage, KEYS.users, all);
    },
    remove(id) {
      writeJson(storage, KEYS.users, this.list().filter((u) => u.id !== id));
    },
  };

  function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, type: u.type || 'comprador' };
  }

  const session = {
    get() {
      return readJson(storage, KEYS.session, null);
    },
    set(user, role = 'user') {
      writeJson(storage, KEYS.session, user ? { ...user, role } : null);
    },
    clear() {
      storage.removeItem(KEYS.session);
    },
  };

  // ---------- Favoritos (por conta; visitantes usam a chave "guest") ----------
  const favorites = {
    _key() {
      const s = session.get();
      return s?.email || 'guest';
    },
    list(userKey = this._key()) {
      const map = readJson(storage, KEYS.favorites, {});
      return map[userKey] || [];
    },
    has(id, userKey) {
      return this.list(userKey).includes(id);
    },
    toggle(id, userKey = this._key()) {
      const map = readJson(storage, KEYS.favorites, {});
      const list = new Set(map[userKey] || []);
      if (list.has(id)) list.delete(id);
      else list.add(id);
      map[userKey] = [...list];
      writeJson(storage, KEYS.favorites, map);
      return list.has(id);
    },
    // Mescla favoritos de visitante na conta ao fazer login.
    mergeGuestInto(userKey) {
      const map = readJson(storage, KEYS.favorites, {});
      const merged = new Set([...(map[userKey] || []), ...(map.guest || [])]);
      map[userKey] = [...merged];
      delete map.guest;
      writeJson(storage, KEYS.favorites, map);
    },
  };

  // ---------- Assinaturas (acesso aos contatos) ----------
  const subscriptions = {
    get(email) {
      if (!email) return null;
      const all = readJson(storage, KEYS.subscriptions, {});
      return all[String(email).trim().toLowerCase()] || null;
    },
    isActive(email) {
      const sub = this.get(email);
      return Boolean(sub) && new Date(sub.expiresAt).getTime() > Date.now();
    },
    // Soma o prazo ao que já resta, se a assinatura ainda estiver ativa.
    activate(email, planId, days) {
      const key = String(email).trim().toLowerCase();
      const all = readJson(storage, KEYS.subscriptions, {});
      const now = Date.now();
      const current = all[key] && new Date(all[key].expiresAt).getTime() > now
        ? new Date(all[key].expiresAt).getTime()
        : now;
      const expiresAt = new Date(current + days * 24 * 60 * 60 * 1000).toISOString();
      all[key] = { planId, activatedAt: new Date(now).toISOString(), expiresAt };
      writeJson(storage, KEYS.subscriptions, all);
      return all[key];
    },
  };

  return { init, suppliers, categories, regions, users, session, favorites, subscriptions, _storage: storage };
}

// Instância padrão para o navegador. Em testes, use createStore(fakeStorage).
export const store = typeof localStorage !== 'undefined' ? createStore(localStorage) : null;

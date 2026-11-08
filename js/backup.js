// Backup e migração dos dados guardados pela versão antiga do site (localStorage deste navegador).
// Exporta um arquivo JSON com categorias, bairros e fornecedores. Contas, senhas e favoritos NÃO são exportados.
// As contas devem ser criadas de novo pelo sistema de login, e os favoritos são pessoais.
// A importação grava tudo no banco (Supabase) e gera novos identificadores para cada fornecedor.

const LOCAL_KEYS = {
  suppliers: 'spf:v1:suppliers',
  categories: 'spf:v1:categories',
  regions: 'spf:v1:regions',
};

export const BACKUP_VERSION = 1;

// Lê os dados antigos do navegador. Retorna null se não houver fornecedores guardados aqui.
export function readLocalBackup(storage) {
  if (!storage) return null;
  const read = (key) => {
    try {
      const raw = storage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const suppliers = read(LOCAL_KEYS.suppliers);
  if (!Array.isArray(suppliers)) return null;
  const real = suppliers.filter((s) => s && !s.isDemo);
  if (!real.length) return null;
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: Array.isArray(read(LOCAL_KEYS.categories)) ? read(LOCAL_KEYS.categories) : [],
    regions: Array.isArray(read(LOCAL_KEYS.regions)) ? read(LOCAL_KEYS.regions) : [],
    suppliers: real,
  };
}

// Valida o arquivo de backup. Retorna { ok, data } ou { ok:false, reason }.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return { ok: false, reason: 'O arquivo não é um JSON válido.' };
  }
  if (!data || data.version !== BACKUP_VERSION || !Array.isArray(data.suppliers)) {
    return { ok: false, reason: 'Este arquivo não é um backup do site.' };
  }
  return {
    ok: true,
    data: {
      categories: Array.isArray(data.categories) ? data.categories.filter((c) => c && c.slug) : [],
      regions: Array.isArray(data.regions) ? data.regions.filter((r) => r && r.slug) : [],
      suppliers: data.suppliers.filter((s) => s && s.name),
    },
  };
}

// Grava o backup no banco, pelo store. Continua mesmo se um fornecedor falhar, e informa os erros.
export async function importBackup(store, backup) {
  const errors = [];
  let categories = 0;
  let regions = 0;
  let suppliers = 0;
  let skipped = 0;
  // Fornecedores que já estão no banco (mesmo slug) não são gravados de novo, para evitar cópias.
  const existingSlugs = new Set(store.suppliers.list().map((s) => s.slug).filter(Boolean));

  for (const c of backup.categories) {
    try {
      await store.categories.save({ slug: c.slug, name: c.name, description: c.description, icon: c.icon, status: c.status, subcategories: c.subcategories || [] });
      categories++;
    } catch (err) {
      errors.push(`Categoria "${c.name || c.slug}": ${err.message}`);
    }
  }
  for (const r of backup.regions) {
    try {
      await store.regions.save({ slug: r.slug, name: r.name, description: r.description || '' });
      regions++;
    } catch (err) {
      errors.push(`Bairro "${r.name || r.slug}": ${err.message}`);
    }
  }
  // Categorias citadas pelos fornecedores e ausentes do arquivo são criadas com o próprio slug como nome.
  const known = new Set(store.categories.list().map((c) => c.slug));
  for (const c of backup.categories) known.add(c.slug);
  for (const s of backup.suppliers) {
    if (s.category && !known.has(s.category)) {
      try {
        await store.categories.save({ slug: s.category, name: s.categoryName || s.category });
      } catch (err) {
        errors.push(`Categoria "${s.category}": ${err.message}`);
      }
      known.add(s.category);
    }
  }
  for (const s of backup.suppliers) {
    if (s.slug && existingSlugs.has(s.slug)) {
      skipped++;
      continue;
    }
    // O identificador antigo não serve no banco: o Supabase gera um novo.
    const { id, createdAt, views, ownerEmail, ...supplier } = s;
    try {
      await store.suppliers.save(supplier, { asAdmin: true });
      suppliers++;
    } catch (err) {
      errors.push(`Fornecedor "${s.name}": ${err.message}`);
    }
  }
  return { categories, regions, suppliers, skipped, errors };
}

// Conversões entre o formato do banco (snake_case) e o formato usado pelas páginas (camelCase).
// Módulo puro: sem rede e sem DOM, por isso é testado no Node (tests/mapping.test.mjs).
import { onlyDigits, instagramHandle } from './utils.js';

const first = (v) => (Array.isArray(v) ? v[0] : v) || null;

// ---------- Categorias ----------
export function categoryFromRow(row, subcategoryRows = []) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    icon: row.icon || '📦',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: row.sort_order ?? 0,
    subcategories: subcategoryRows.map((s) => s.name),
  };
}

export function categoryToRow(c) {
  return {
    slug: c.slug,
    name: c.name,
    description: c.description || '',
    icon: c.icon || '📦',
    status: c.status === 'inactive' ? 'inactive' : 'active',
    sort_order: c.sortOrder ?? 0,
  };
}

// ---------- Bairros e cidades ----------
export function regionFromRow(row) {
  return { slug: row.slug, name: row.name, description: row.description || '', sortOrder: row.sort_order ?? 0 };
}

export function regionToRow(r) {
  return { slug: r.slug, name: r.name, description: r.description || '', sort_order: r.sortOrder ?? 0 };
}

// ---------- Fornecedores ----------
// row: linha de "suppliers" com as relações embutidas (supplier_photos, supplier_contacts).
// categorySlugById: mapa id -> slug das categorias carregadas.
export function supplierFromRow(row, categorySlugById = new Map()) {
  const contact = first(row.supplier_contacts);
  const photos = (row.supplier_photos || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((p) => p.url);
  const s = {
    id: row.id,
    ownerId: row.owner_id || null,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    category: categorySlugById.get(row.category_id) || '',
    categoryId: row.category_id || null,
    subcategory: row.subcategory || '',
    supplierType: row.supplier_type || '',
    bairro: row.bairro || '',
    city: row.city || 'São Paulo',
    state: row.state || 'SP',
    saleWholesale: Boolean(row.sale_wholesale),
    saleRetail: Boolean(row.sale_retail),
    saleResellers: Boolean(row.sale_resellers),
    shipsOtherCities: Boolean(row.ships_other_cities),
    minOrder: row.min_order || '',
    hours: row.hours || '',
    tags: row.tags || [],
    logo: row.logo_url || '',
    photos,
    status: row.approval_status || 'pending',
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    isDemo: Boolean(row.is_demo),
    views: row.views || 0,
    createdAt: row.created_at || null,
    // Contatos só chegam quando o banco permite a leitura (assinante, dono ou administrador).
    contactsVisible: Boolean(contact),
  };
  if (contact) {
    Object.assign(s, {
      responsible: contact.responsible || '',
      email: contact.email || '',
      whatsapp: contact.whatsapp || '',
      whatsappUrl: contact.whatsapp_url || '',
      instagram: contact.instagram || '',
      site: contact.site || '',
      address: contact.address || '',
      number: contact.number || '',
      complement: contact.complement || '',
      cep: contact.cep || '',
    });
  }
  return s;
}

// Campos da tabela suppliers. approval_status, verified, featured e is_demo só entram com asAdmin:
// o banco também impede que um usuário comum altere esses campos (trigger guard_supplier_columns).
export function supplierToRow(s, { categoryId = null, asAdmin = false } = {}) {
  const row = {
    name: s.name,
    slug: s.slug,
    description: s.description || '',
    category_id: categoryId,
    subcategory: s.subcategory || '',
    supplier_type: s.supplierType || null,
    bairro: s.bairro || '',
    city: s.city || 'São Paulo',
    state: String(s.state || 'SP').toUpperCase().slice(0, 2),
    sale_wholesale: Boolean(s.saleWholesale),
    sale_retail: Boolean(s.saleRetail),
    sale_resellers: Boolean(s.saleResellers),
    ships_other_cities: Boolean(s.shipsOtherCities),
    min_order: s.minOrder || '',
    hours: s.hours || '',
    tags: Array.isArray(s.tags) ? s.tags : [],
    logo_url: s.logo || null,
  };
  if (asAdmin) {
    Object.assign(row, {
      approval_status: s.status || 'pending',
      verified: Boolean(s.verified),
      featured: Boolean(s.featured),
      is_demo: Boolean(s.isDemo),
    });
  }
  return row;
}

export function contactToRow(s, supplierId) {
  return {
    supplier_id: supplierId,
    responsible: s.responsible || '',
    email: s.email || '',
    whatsapp: onlyDigits(s.whatsapp) || null,
    whatsapp_url: s.whatsappUrl || null,
    instagram: s.instagram ? instagramHandle(s.instagram) || null : null,
    site: s.site || null,
    address: s.address || '',
    number: s.number || '',
    complement: s.complement || '',
    cep: onlyDigits(s.cep),
  };
}

// ---------- Usuários, assinaturas ----------
export function userFromRow(row) {
  return { id: row.id, name: row.name || '', email: row.email || '', type: row.type || 'comprador', createdAt: row.created_at || null };
}

export function subscriptionFromRow(row) {
  return {
    id: row.id,
    planId: row.plan,
    amount: Number(row.amount),
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    paymentNote: row.payment_note || '',
    createdAt: row.created_at || null,
  };
}

// ---------- Nomes de slug ----------
// Evita dois fornecedores com o mesmo endereço (slug): acrescenta -2, -3...
export function uniqueSlug(list, base, selfId) {
  let slug = base || 'fornecedor';
  let n = 2;
  const taken = (c) => list.some((s) => s.slug === c && s.id !== selfId);
  const root = slug;
  while (taken(slug)) slug = `${root}-${n++}`;
  return slug;
}

// ---------- Mensagens de erro de autenticação ----------
// Traduz as mensagens do Supabase Auth para o português do site.
export function authErrorMessage(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (msg.includes('password should be at least')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet.';
  return 'Não foi possível concluir agora. Tente novamente.';
}

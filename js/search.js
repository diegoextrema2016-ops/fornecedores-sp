// Lógica pura de busca, filtro, ordenação e paginação. Não depende do DOM, por isso é testável no Node.

export const normalize = (text = '') =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const tokenize = (query = '') =>
  normalize(query)
    .split(/[\s,;]+/)
    .filter((t) => t.length > 0);

// Pontua um fornecedor pelos termos buscados. 0 = não encontrado.
// Nome e tags pesam mais que descrição e localização.
export function scoreSupplier(supplier, tokens, categoryName = '', regionName = '') {
  if (tokens.length === 0) return 1;
  const fields = [
    { text: supplier.name, weight: 6 },
    { text: (supplier.tags || []).join(' '), weight: 5 },
    { text: supplier.subcategory, weight: 4 },
    { text: categoryName, weight: 4 },
    { text: supplier.bairro, weight: 3 },
    { text: regionName, weight: 3 },
    { text: supplier.description, weight: 1 },
  ].map((f) => ({ text: normalize(f.text), weight: f.weight }));

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const f of fields) {
      if (f.text.includes(token)) best = Math.max(best, f.weight);
    }
    if (best === 0) return 0; // todos os termos precisam aparecer em algum campo
    total += best;
  }
  return total;
}

// Aplica filtros. `ctx` traz nomes de categoria/região para a busca textual.
// filters: { query, category, bairro, supplierType, wholesale, retail, whatsapp, verified }
// Subcategorias do fornecedor ficam num texto só, separadas por vírgula (ex.: "Jeans, Vestidos").
export const subcategoriasDoFornecedor = (texto = '') =>
  String(texto).split(',').map((p) => p.trim()).filter(Boolean);

// Verdadeiro se o fornecedor tem a subcategoria (sem diferenciar maiúsculas e acentos).
export function temSubcategoria(supplier, nome) {
  const alvo = normalize(nome);
  return Boolean(alvo) && subcategoriasDoFornecedor(supplier.subcategory).some((p) => normalize(p) === alvo);
}

export function filterSuppliers(suppliers, filters = {}, ctx = {}) {
  const tokens = tokenize(filters.query);
  const categoryName = (slug) => ctx.categoryNames?.[slug] || '';
  const regionName = (bairro) => ctx.regionNames?.[bairro] || '';

  return suppliers
    .filter((s) => s.status === 'approved')
    .filter((s) => !filters.category || s.category === filters.category)
    .filter((s) => !filters.subcategory || temSubcategoria(s, filters.subcategory))
    .filter((s) => !filters.bairro || s.bairro === filters.bairro)
    .filter((s) => !filters.supplierType || s.supplierType === filters.supplierType)
    .filter((s) => !filters.wholesale || s.saleWholesale)
    .filter((s) => !filters.retail || s.saleRetail)
    .filter((s) => !filters.whatsapp || Boolean(s.whatsapp || s.whatsappUrl))
    .filter((s) => !filters.verified || s.verified)
    .map((s) => ({
      supplier: s,
      score: scoreSupplier(s, tokens, categoryName(s.category), regionName(s.bairro)),
    }))
    .filter((r) => r.score > 0)
    .map((r) => ({ ...r.supplier, _score: r.score }));
}

// Ordenação: relevance | recent | name | views
export function sortSuppliers(list, sort = 'relevance') {
  const copy = [...list];
  switch (sort) {
    case 'recent':
      return copy.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    case 'name':
      return copy.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), 'pt-BR'));
    case 'views':
      return copy.sort((a, b) => (b.views || 0) - (a.views || 0));
    case 'relevance':
    default:
      return copy.sort(
        (a, b) =>
          (b._score || 0) - (a._score || 0) ||
          (b.featured === true) - (a.featured === true) ||
          (b.verified === true) - (a.verified === true) ||
          (b.views || 0) - (a.views || 0),
      );
  }
}

export function paginate(list, page = 1, pageSize = 12) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: current,
    totalPages,
    total,
    pageSize,
  };
}

// Ranking de categorias por acessos: soma das visualizações dos fornecedores aprovados de cada categoria.
// Só entram categorias com pelo menos um fornecedor. Empate: ordem alfabética.
export function rankCategoriesByAccess(categories, suppliers) {
  const totals = {};
  for (const s of suppliers) {
    const t = totals[s.category] || (totals[s.category] = { accesses: 0, suppliers: 0 });
    t.accesses += Number(s.views) || 0;
    t.suppliers += 1;
  }
  return categories
    .filter((c) => totals[c.slug])
    .map((c) => ({ category: c, ...totals[c.slug] }))
    .sort((a, b) => b.accesses - a.accesses || a.category.name.localeCompare(b.category.name, 'pt-BR'));
}

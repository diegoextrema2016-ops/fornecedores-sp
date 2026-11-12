// Leitura dos dados públicos do banco (categorias, bairros e fornecedores aprovados), com a chave publicável.
// Usado pelo build e pela verificação de alterações. Nenhuma chave secreta é usada aqui.
import { readFile } from 'node:fs/promises';
import { SUPABASE } from '../js/config.js';

const PAGE_SIZE = 1000;

async function fetchAll(resource, query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${SUPABASE.url}/rest/v1/${resource}?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` } });
    if (!res.ok) throw new Error(`Falha ao ler ${resource} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadData() {
  if (process.env.SEO_FIXTURE) {
    return JSON.parse(await readFile(process.env.SEO_FIXTURE, 'utf8'));
  }
  const [categories, regions, suppliers] = await Promise.all([
    fetchAll('categories', 'select=id,slug,name,description,status,sort_order&order=sort_order.asc,name.asc'),
    fetchAll('regions', 'select=slug,name,description,sort_order&order=sort_order.asc,name.asc'),
    fetchAll(
      'suppliers',
      'select=id,slug,name,description,category_id,subcategory,supplier_type,bairro,city,state,sale_wholesale,sale_retail,sale_resellers,ships_other_cities,min_order,hours,tags,logo_url,verified,featured,is_demo,approval_status,supplier_photos(url,position)' +
        '&approval_status=eq.approved&is_demo=eq.false&order=id.asc',
    ),
  ]);
  return { categories, regions, suppliers };
}


// Impressão digital dos dados que o site usa. Muda só quando algo publicado muda.
// Ordena tudo antes de gerar o texto, para que a mesma base sempre dê o mesmo resultado.
import { createHash } from 'node:crypto';

const porId = (a, b) => String(a.id ?? a.slug).localeCompare(String(b.id ?? b.slug));
const campos = (o, lista) => Object.fromEntries(lista.map((k) => [k, o[k] ?? null]));

export function fingerprint({ categories = [], regions = [], suppliers = [] }) {
  const base = {
    categories: categories.slice().sort(porId).map((c) => campos(c, ['id', 'slug', 'name', 'description', 'status', 'sort_order', 'subcategories'])),
    regions: regions.slice().sort(porId).map((r) => campos(r, ['slug', 'name', 'description', 'sort_order'])),
    suppliers: suppliers.slice().sort(porId).map((s) => ({
      ...campos(s, ['id', 'slug', 'name', 'description', 'category_id', 'subcategory', 'supplier_type', 'bairro', 'city', 'state',
        'sale_wholesale', 'sale_retail', 'sale_resellers', 'ships_other_cities', 'min_order', 'hours', 'tags', 'logo_url', 'verified', 'featured']),
      photos: (s.supplier_photos || []).map((p) => `${p.position ?? 0}|${p.url}`).sort(),
    })),
  };
  return createHash('sha256').update(JSON.stringify(base)).digest('hex');
}

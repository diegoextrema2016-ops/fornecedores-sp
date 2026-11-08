// Importação de fornecedores por planilha CSV (módulo puro, sem DOM).
// Colunas esperadas: instagram; segmento; whatsapp; link_whatsapp; links_bio_e_sites
// Separador ";" ou "," (detectado automaticamente). Cabeçalho sem acento e em minúsculas.
import { slugify, onlyDigits, isUrl, normalizeUrl } from './utils.js';

const normHeader = (h) =>
  String(h)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

// Lê o texto CSV, respeitando aspas e quebras de linha dentro de campos.
export function parseCsv(text = '') {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delim = semis >= commas ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = (rows.shift() || []).map(normHeader);
  return rows
    .filter((r) => r.some((v) => String(v).trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '').trim()])));
}

// Aceita "@usuario", "usuario" ou URL do Instagram. Preserva maiúsculas e minúsculas.
export function normalizeInstagram(v = '') {
  return String(v)
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#\s]/)[0]
    .trim();
}

// Separa a coluna de links ("a | b" ou URLs coladas) e mantém só o que é URL.
export function splitLinks(v = '') {
  return String(v)
    .split(/\s*\|\s*|\s+(?=https?:\/\/)/)
    .map((s) => s.trim())
    .filter((s) => s && isUrl(s))
    .map(normalizeUrl);
}

// Converte as linhas em registros de fornecedor, sem duplicar contas já existentes ou repetidas.
export function planImport(rows, existing = []) {
  const seen = new Set(
    existing.map((s) => (s.instagram ? normalizeInstagram(s.instagram).toLowerCase() : '')).filter(Boolean)
  );
  const records = [];
  const counts = {
    lidas: rows.length,
    duplicadas: 0,
    comInstagram: 0,
    comWhatsapp: 0,
    comLinkWhatsapp: 0,
    comSite: 0,
    semContato: 0,
    porCategoria: {},
  };

  rows.forEach((r, idx) => {
    const instagram = normalizeInstagram(r.instagram || '');
    const key = instagram.toLowerCase();
    if (key && seen.has(key)) { counts.duplicadas++; return; }
    if (key) seen.add(key);

    const whatsapp = onlyDigits(r.whatsapp || '');
    const whatsappUrl = r.link_whatsapp && isUrl(r.link_whatsapp) ? normalizeUrl(r.link_whatsapp) : '';
    const bioLinks = splitLinks(r.links_bio_e_sites || '');
    const segment = (r.segmento || '').trim() || 'Outros';
    const category = slugify(segment) || 'outros';

    if (instagram) counts.comInstagram++;
    if (whatsapp) counts.comWhatsapp++;
    if (whatsappUrl) counts.comLinkWhatsapp++;
    if (bioLinks.length) counts.comSite++;
    if (!instagram && !whatsapp && !whatsappUrl) counts.semContato++;
    counts.porCategoria[segment] = (counts.porCategoria[segment] || 0) + 1;

    records.push({
      name: instagram ? `@${instagram}` : `Fornecedor ${idx + 1}`,
      instagram,
      whatsapp,
      whatsappUrl,
      site: bioLinks[0] || '',
      bioLinks,
      category,
      categoryName: segment,
      city: 'São Paulo',
      state: 'SP',
      bairro: '',
      supplierType: '',
      description: '',
      status: 'approved',
      verified: false,
      featured: false,
      isDemo: false,
      importSource: 'csv',
      importLine: idx + 2, // linha no arquivo (cabeçalho é a linha 1)
    });
  });

  return { records, counts };
}

// Grava os registros no store (Supabase): cria categorias que faltarem e salva cada fornecedor.
export async function applyImport(store, records) {
  const known = new Set(store.categories.list().map((c) => c.slug));
  let categoriesCreated = 0;
  for (const r of records) {
    if (!known.has(r.category)) {
      await store.categories.save({ name: r.categoryName, slug: r.category });
      known.add(r.category);
      categoriesCreated++;
    }
    const { categoryName, ...supplier } = r;
    await store.suppliers.save(supplier, { asAdmin: true });
  }
  return { imported: records.length, categoriesCreated };
}

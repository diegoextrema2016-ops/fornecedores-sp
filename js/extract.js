// Extrai dados de um texto copiado de um perfil (bio, telefone, WhatsApp, endereço, site...).
// Módulo puro: sem rede e sem DOM, por isso é testado no Node (tests/extract.test.mjs).
// Regra: só devolve o que encontra no texto. O que não aparece fica vazio, nunca é inventado.
import { onlyDigits, instagramHandle } from './utils.js';

// ---------- Chaves de comparação (usadas também para checar duplicados) ----------

// Instagram sem @, em minúsculas. Vazio se não for um handle válido.
export function instagramKey(value = '') {
  const h = instagramHandle(value).toLowerCase();
  return /^[a-z0-9._]{2,30}$/.test(h) ? h : '';
}

// Telefone de 11 dígitos (DDD + celular) ou 10 (DDD + fixo), sem DDI 55.
// Quem tem DDI, ou o número com 9 à frente, cai na mesma chave.
export function phoneKey(value = '') {
  let d = onlyDigits(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return '';
  return d.length >= 11 ? d.slice(-11) : d;
}

// ---------- Padrões ----------

const RESERVED_IG = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct', 'tv', 'about', 'developer']);
const EMAIL_SRC = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}';
const EMAIL_RE = new RegExp(EMAIL_SRC, 'g');
const EMAIL_TEST = new RegExp(EMAIL_SRC);
const STREET_RE = /\b(rua|r\.|avenida|av\.|alameda|al\.|travessa|tv\.|praça|praca|rodovia|estrada|largo)\s+[^\n]+/i;
const CEP_RE = /\b(\d{5})-?(\d{3})\b/;

const normalize = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function findInstagram(text) {
  const url = text.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
  if (url && !RESERVED_IG.has(url[1].toLowerCase())) return url[1].replace(/\.+$/, '');
  const at = text.match(/(?:^|[\s(])@([A-Za-z0-9._]{2,30})/);
  if (at) return at[1].replace(/\.+$/, '');
  return '';
}

// Números com 10 ou 11 dígitos (com ou sem DDI 55). Retorna { key, marked } para cada um,
// em ordem de aparição. "marked" = a palavra WhatsApp/wpp/zap aparece logo antes do número.
function findPhones(text) {
  const out = [];
  const re = /\+?\d[\d\s().-]{8,}\d/g;
  let m;
  while ((m = re.exec(text))) {
    const key = phoneKey(m[0]);
    if (!key) continue;
    const before = normalize(text.slice(Math.max(0, m.index - 40), m.index));
    const marked = /whats|wpp|zap|wa\.me/.test(before);
    out.push({ key, marked });
  }
  return out;
}

function findWaLink(text) {
  const m = text.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/i);
  return m ? phoneKey(m[1]) : '';
}

function findSite(text) {
  const cleaned = text
    .replace(EMAIL_RE, ' ')
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|wa\.me|api\.whatsapp\.com)\S*/gi, ' ');
  const m = cleaned.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com\.br|com|net|org|br|shop|store|site|loja|app|bio\.link|linktr\.ee|me|co))(?:\/[^\s]*)?/i);
  if (!m) return '';
  const host = m[1].toLowerCase();
  if (/(facebook|tiktok|youtube|twitter|x)\.com$/.test(host)) return '';
  return m[0].replace(/[.,;)]+$/, '');
}

function findRegion(text, regions) {
  const t = normalize(text);
  const hit = regions.find((r) => r.name && t.includes(normalize(r.name)));
  return hit ? hit.slug : '';
}

// Categoria só é sugerida quando exatamente uma bate. Em caso de dúvida, fica vazia.
function findCategory(text, categories) {
  const t = normalize(text);
  const scored = categories
    .filter((c) => c.status !== 'inactive' && c.name)
    .map((c) => {
      const full = normalize(c.name);
      if (t.includes(full)) return { slug: c.slug, score: 100 };
      const words = full.split(/\s+/).filter((w) => w.length >= 5);
      return { slug: c.slug, score: words.filter((w) => t.includes(w)).length };
    })
    .filter((x) => x.score > 0);
  // Só uma categoria pode bater. Se duas aparecem, o texto é ambíguo e nada é sugerido.
  return scored.length === 1 ? scored[0].slug : '';
}

// ---------- Função principal ----------

export function parseSupplierText(text = '', { categories = [], regions = [] } = {}) {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const notes = [];

  // Instagram, WhatsApp, e-mail, site, endereço e CEP.
  const instagram = findInstagram(raw);
  const phones = findPhones(raw);
  const waLink = findWaLink(raw);
  const email = (raw.match(EMAIL_RE) || [])[0] || '';
  const site = findSite(raw);
  const cepMatch = raw.match(CEP_RE);
  const cep = cepMatch ? `${cepMatch[1]}-${cepMatch[2]}` : '';

  let whatsapp = '';
  if (waLink) whatsapp = waLink;
  else {
    const marked = phones.find((p) => p.marked);
    if (marked) whatsapp = marked.key;
    else if (phones.length) {
      whatsapp = phones[0].key;
      notes.push('Telefone encontrado sem a palavra WhatsApp. Confira se ele tem WhatsApp.');
    }
  }
  if (phones.length > 1) notes.push('Mais de um telefone no texto. Confira o WhatsApp preenchido.');

  const whatsappUrl = waLink ? `https://wa.me/55${waLink}` : '';

  // Endereço: a linha que começa com rua, avenida etc.
  let address = '';
  let number = '';
  const streetLine = lines.find((l) => STREET_RE.test(l));
  if (streetLine) {
    const [street, ...rest] = streetLine.split(',');
    address = street.replace(/\s+/g, ' ').trim();
    const numMatch = rest.join(',').match(/(?:n[º°o.]?\s*)?(\d{1,6}[A-Za-z]?)\b/i);
    if (numMatch) number = numMatch[1];
    if (!number) {
      const inline = streetLine.match(/\b(?:n[º°o.]?\s*)(\d{1,6}[A-Za-z]?)\b/i);
      if (inline) number = inline[1];
    }
  }

  // Bairro: pelo nome de um bairro/região cadastrado que aparece no texto.
  const bairro = findRegion(raw, regions);

  // Categoria: só quando a escolha é clara.
  const category = findCategory(raw, categories);

  // Nome: primeira linha que parece nome (sem @, link, telefone ou endereço).
  const isContactLine = (l) =>
    /@|https?:\/\/|www\.|instagram\.com|wa\.me/i.test(l) ||
    /\+?\d[\d\s().-]{8,}\d/.test(l) ||
    STREET_RE.test(l) ||
    CEP_RE.test(l) ||
    EMAIL_TEST.test(l);
  const nameLine = lines.find((l) => l.length >= 2 && l.length <= 60 && !isContactLine(l) && (l.match(/\d/g) || []).length < 4);
  const name = nameLine ? nameLine.replace(/[|•·]+.*$/, '').trim() : '';
  if (name) notes.push('Nome sugerido pela primeira linha do texto. Confira.');

  // Descrição: o restante do texto, sem o que já foi usado nos outros campos.
  const descLines = lines.filter((l) => l !== nameLine && !isContactLine(l) && !/^(telefone|whats|wpp|zap|site|email|e-mail|endereço|endereco)\b/i.test(normalize(l)));
  const description = descLines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600);

  return {
    name,
    instagram: instagram ? `@${instagram}` : '',
    whatsapp,
    whatsappUrl,
    email,
    site,
    address,
    number,
    cep,
    bairro,
    category,
    description,
    notes,
  };
}

// Campos que o preenchimento automático controla, com o nome do campo no formulário e o rótulo exibido.
export const EXTRACT_FIELDS = [
  ['name', 'Nome da empresa'],
  ['instagram', 'Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['whatsappUrl', 'Link de WhatsApp'],
  ['email', 'E-mail'],
  ['site', 'Site'],
  ['address', 'Endereço'],
  ['number', 'Número'],
  ['cep', 'CEP'],
  ['bairro', 'Bairro / região'],
  ['category', 'Categoria'],
  ['description', 'Descrição'],
];

// Utilitários puros (sem DOM), usados pelas páginas e pelos testes.

export const slugify = (text = '') =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const onlyDigits = (value = '') => String(value).replace(/\D/g, '');

// Monta o link wa.me. Aceita número com ou sem DDI; assume Brasil (55) quando faltar.
export function whatsappLink(phone, message = '') {
  let digits = onlyDigits(phone);
  if (!digits) return '';
  if (digits.length <= 11) digits = `55${digits}`; // DDD + número, sem DDI
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

// Destino do ícone do WhatsApp: o número (wa.me) tem prioridade; se não houver número,
// usa o link de WhatsApp cadastrado pelo fornecedor (campo whatsappUrl). Vazio se não houver nenhum.
export function whatsappTarget(s = {}, message = '') {
  const byPhone = whatsappLink(s.whatsapp, message);
  if (byPhone) return byPhone;
  if (s.whatsappUrl && isUrl(s.whatsappUrl)) return normalizeUrl(s.whatsappUrl);
  return '';
}

// Link de rota/busca no Google Maps. Não exige chave de API.
export function mapsLink({ address = '', number = '', bairro = '', city = 'São Paulo', state = 'SP', cep = '' } = {}) {
  const parts = [address && number ? `${address}, ${number}` : address, bairro, city, state, cep]
    .filter(Boolean)
    .join(', ');
  if (!parts) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatCount(n) {
  return new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
}

export const isEmail = (v = '') => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

// Aceita 10 ou 11 dígitos (DDD + número), com ou sem DDI 55.
export function isBrazilPhone(v = '') {
  let d = onlyDigits(v);
  if (d.startsWith('55') && d.length === 13) d = d.slice(2);
  return d.length === 10 || d.length === 11;
}

export const isCep = (v = '') => onlyDigits(v).length === 8;

export const isUrl = (v = '') => {
  if (!v) return true;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes('.');
  } catch {
    return false;
  }
};

export function normalizeUrl(v = '') {
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function instagramHandle(v = '') {
  return String(v).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
}

// Valida o cadastro de fornecedor. Retorna { ok, errors } com mensagens por campo.
export function validateSupplier(data, { requireTerms = true, required = true } = {}) {
  const e = {};
  const req = (k, label) => {
    if (required && !String(data[k] ?? '').trim()) e[k] = `${label} é obrigatório.`;
  };
  req('name', 'Nome da empresa');
  req('responsible', 'Nome do responsável');
  req('email', 'E-mail');
  req('category', 'Categoria');
  req('address', 'Endereço');
  req('number', 'Número');
  req('bairro', 'Bairro');
  req('cep', 'CEP');
  req('description', 'Descrição comercial');
  req('supplierType', 'Tipo de fornecedor');

  if (data.email && !isEmail(data.email)) e.email = 'Informe um e-mail válido.';
  if (data.whatsapp && !isBrazilPhone(data.whatsapp)) e.whatsapp = 'WhatsApp inválido. Use DDD + número.';
  if (data.whatsappUrl && !isUrl(data.whatsappUrl)) e.whatsappUrl = 'Link de WhatsApp inválido.';
  if (data.cep && !isCep(data.cep)) e.cep = 'CEP deve ter 8 dígitos.';
  if (data.instagram && instagramHandle(data.instagram).length < 1) e.instagram = 'Instagram inválido.';
  if (data.site && !isUrl(data.site)) e.site = 'Site inválido.';
  if (data.description && String(data.description).length > 600) e.description = 'Máximo de 600 caracteres.';
  if (required && !(data.saleWholesale || data.saleRetail || data.saleResellers)) {
    e.sale = 'Marque pelo menos um tipo de venda (atacado, varejo ou lojistas).';
  }
  if (data.minOrder && !/^\d+([.,]\d+)?$/.test(String(data.minOrder).trim())) {
    e.minOrder = 'Pedido mínimo deve ser um número.';
  }
  if (requireTerms && !data.acceptTerms) e.acceptTerms = 'Você precisa aceitar os termos de uso.';
  return { ok: Object.keys(e).length === 0, errors: e };
}

export function validateUser({ name = '', email = '', password = '', confirm = '' } = {}, { requirePassword = true } = {}) {
  const e = {};
  if (!name.trim()) e.name = 'Informe seu nome.';
  if (!isEmail(email)) e.email = 'Informe um e-mail válido.';
  if (requirePassword) {
    if (password.length < 8) e.password = 'A senha deve ter pelo menos 8 caracteres.';
    if (password !== confirm) e.confirm = 'As senhas não coincidem.';
  }
  return { ok: Object.keys(e).length === 0, errors: e };
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Formata telefone brasileiro para exibição: (11) 98765-4321
export function formatPhone(phone = '') {
  let d = onlyDigits(phone);
  if (d.startsWith('55') && d.length === 13) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

// Versão mascarada para quem não tem acesso: (11) 9****-**21
export function maskPhone(phone = '') {
  let d = onlyDigits(phone);
  if (!d) return '';
  if (d.startsWith('55') && d.length === 13) d = d.slice(2);
  if (d.length < 10) return '••••••';
  const ddd = d.slice(0, 2);
  const last = d.slice(-2);
  const middle = d.length === 11 ? '9****' : '****';
  return `(${ddd}) ${middle}-**${last}`;
}

// Arroba mascarada: @jor*******
export function maskHandle(handle = '') {
  const h = instagramHandle(handle);
  if (!h) return '';
  return `@${h.slice(0, 3)}${'*'.repeat(Math.max(4, h.length - 3))}`;
}

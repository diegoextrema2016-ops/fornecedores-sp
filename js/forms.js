// Formulário de fornecedor (usado no cadastro público e na edição pelo administrador).
import { CATEGORIES, REGIONS, SUPPLIER_TYPES } from './data.js';
import { validateSupplier, escapeHtml as e, onlyDigits } from './utils.js';
import { store } from './store.js';
import { sugerirDescricao } from './descricao.js';
import { sb } from './api.js';
import { toast } from './ui.js';

// Opções de categoria: as ativas do store, mais a categoria atual do fornecedor (mesmo que esteja inativa).
// Opções de bairro/cidade vindas do store (ordem alfabética).
function regionOptions() {
  const list = store ? store.regions.list() : REGIONS;
  return list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).map((r) => [r.slug, r.name]);
}

function categoryOptions(current = '') {
  const list = store ? store.categories.list() : CATEGORIES;
  const active = list.filter((c) => c.status !== 'inactive');
  const keep = current && !active.some((c) => c.slug === current) ? list.filter((c) => c.slug === current) : [];
  return [...active, ...keep]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .map((c) => [c.slug, c.name]);
}

const MAX_LOGO_BYTES = 150 * 1024;
const MAX_PHOTO_BYTES = 250 * 1024;
const MAX_PHOTOS = 6;

export function supplierFormHtml(s = {}, { admin = false, loggedEmail = '' } = {}) {
  const v = (k, d = '') => e(s[k] ?? d);
  // chk(k, padrão): quando o fornecedor ainda não tem o valor (cadastro novo), usa o padrão.
  const chk = (k, padrao = false) => ((s[k] ?? padrao) ? 'checked' : '');
  // No modo administrador nenhum campo é obrigatório: sem asteriscos e sem 'required'.
  const R = !admin;
  const star = admin ? '' : ' *';
  const field = (id, label, input, extra = '') => `
    <div class="field ${extra}">
      <label for="${id}">${label}</label>
      ${input}
      <span class="field-error" id="err-${id}" role="alert"></span>
    </div>`;
  const text = (name, label, opts = {}) => field(name, label,
    `<input id="${name}" name="${name}" type="${opts.type || 'text'}" value="${v(name, opts.value)}" ${opts.ph ? `placeholder="${e(opts.ph)}"` : ''} ${opts.req ? 'required' : ''} ${opts.auto ? `autocomplete="${opts.auto}"` : ''} ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''}>`,
    opts.wide ? 'field-wide' : '');
  const select = (name, label, options, selected, req = false) => field(name, label,
    `<select id="${name}" name="${name}" ${req ? 'required' : ''}><option value="">Selecione...</option>${options
      .map(([val, lab]) => `<option value="${e(val)}" ${selected === val ? 'selected' : ''}>${e(lab)}</option>`).join('')}</select>`);

  return `
  <form class="card form supplier-form" id="supplier-form" novalidate>
    <fieldset class="form-section">
      <legend>Dados da empresa</legend>
      <div class="form-grid">
        ${text('name', `Nome da empresa${star}`, { req: R, wide: true })}
        ${text('responsible', `Nome do responsável${star}`, { req: R, auto: 'name' })}
        ${text('email', `E-mail${star}`, { type: 'email', req: R, auto: 'email', value: s.email ?? loggedEmail })}
        ${text('whatsapp', 'WhatsApp (DDD + número)', { type: 'tel', ph: '(11) 91234-5678', inputmode: 'tel' })}
        ${text('whatsappUrl', 'Link de WhatsApp (se não tiver número)', { ph: 'https://wa.me/...' })}
        ${text('instagram', 'Instagram (@usuario)', { ph: '@sualoja' })}
        ${text('site', 'Site', { ph: 'www.sualoja.com.br' })}
        ${select('category', `Categoria${star}`, categoryOptions(s.category), s.category, R)}
        ${text('subcategory', 'Subcategoria')}
        ${select('supplierType', `Tipo de fornecedor${star}`, SUPPLIER_TYPES.map((t) => [t.value, t.label]), (admin ? 'atacadista' : s.supplierType || ''), R)}
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Endereço comercial</legend>
      <div class="form-grid">
        ${text('address', `Endereço (rua/avenida)${star}`, { wide: true, req: R })}
        ${text('number', `Número${star}`, { req: R })}
        ${text('complement', 'Complemento', { ph: 'Loja, sala, galpão...' })}
        ${select('bairro', `Bairro / região${star}`, regionOptions(), s.bairro, R)}
        ${text('city', 'Cidade', { value: s.city ?? 'São Paulo' })}
        ${text('state', 'Estado (UF)', { value: s.state ?? 'SP' })}
        ${text('cep', `CEP${star}`, { req: R, ph: '00000-000', inputmode: 'numeric' })}
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Vendas</legend>
      <div class="checks">
        <label class="check"><input type="checkbox" name="saleWholesale" ${admin ? 'checked' : chk('saleWholesale')}> Venda no atacado</label>
        <label class="check"><input type="checkbox" name="saleRetail" ${chk('saleRetail')}> Venda no varejo</label>
        <label class="check"><input type="checkbox" name="saleResellers" ${chk('saleResellers')}> Venda para lojistas</label>
        <label class="check"><input type="checkbox" name="shipsOtherCities" ${admin ? 'checked' : chk('shipsOtherCities')}> Envio para outras cidades</label>
      </div>
      <span class="field-error" id="err-sale" role="alert"></span>
      <div class="form-grid">
        ${text('minOrder', 'Pedido mínimo (quantidade ou valor)', { ph: 'Ex.: 12', inputmode: 'decimal' })}
        ${text('hours', 'Horário de funcionamento', { ph: 'Seg a sáb, 9h às 18h' })}
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Apresentação</legend>
      ${field('description', `Descrição comercial${star} (até 600 caracteres)`,
        `<textarea id="description" name="description" rows="4" maxlength="600" ${R ? 'required' : ''}>${v('description')}</textarea>`, 'field-wide')}
      <div class="suggest-row field-wide">
        <button type="button" class="btn btn-secondary" data-suggest-description>Sugerir com IA</button>
        <span class="muted small">A IA escreve um texto novo a cada clique. Se ela não responder, aparece o motivo e uma sugestão pronta.</span>
      </div>
      ${text('tags', 'Palavras-chave (separadas por vírgula)', { wide: true, value: (s.tags || []).join(', '), ph: 'Ex.: vestido, blusa, atacado' })}
      <div class="form-grid">
        ${field('logo', 'Logo (JPG, PNG ou WebP; é reduzida automaticamente)', `<input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp">`)}
        ${field('photos', `Fotos da loja (até ${MAX_PHOTOS}; são reduzidas automaticamente)`, `<input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>`)}
      </div>
      <p class="muted small">As imagens são enviadas ao armazenamento do site e reduzidas automaticamente.</p>
    </fieldset>

    ${admin ? `
    <fieldset class="form-section">
      <legend>Controle (administrador)</legend>
      <div class="form-grid">
        ${select('status', 'Status', [['pending', 'Pendente'], ['approved', 'Aprovado'], ['rejected', 'Rejeitado']], s.status || 'pending')}
        <div class="checks">
          <label class="check"><input type="checkbox" name="verified" ${admin ? 'checked' : chk('verified')}> Fornecedor verificado</label>
          <label class="check"><input type="checkbox" name="featured" ${chk('featured')}> Em destaque na home</label>
          <label class="check"><input type="checkbox" name="isDemo" ${chk('isDemo')}> Marcar como demonstração</label>
        </div>
      </div>
    </fieldset>` : `
    <fieldset class="form-section">
      <legend>Termos</legend>
      <label class="check"><input type="checkbox" name="acceptTerms" id="acceptTerms"> Declaro que as informações são verdadeiras, que vendo produtos lícitos e aceito os <a href="/termos">termos de uso</a>.</label>
      <span class="field-error" id="err-acceptTerms" role="alert"></span>
      <p class="muted small">Seu cadastro ficará pendente até a análise da equipe. Nada é publicado automaticamente.</p>
    </fieldset>`}

    <div class="form-actions">
      <button class="btn btn-primary btn-lg" type="submit">${admin ? 'Salvar fornecedor' : 'Enviar cadastro'}</button>
      <a class="btn btn-ghost" href="/">Cancelar</a>
    </div>
  </form>`;
}

// Botão "Sugerir descrição": pede o texto à IA (função do site; exige login).
// Se a IA não responder, mostra o motivo e usa uma sugestão pronta.
async function pedirSugestaoIA(dados) {
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { erro: 'Entre na sua conta para usar a IA.' };
    // Limite de 12 segundos: se a IA demorar, a sugestão pronta entra logo.
    const r = await fetch('/api/sugerir-descricao', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(dados),
      signal: AbortSignal.timeout(12000),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.texto) return { texto: json.texto };
    if (json.fallback) return { erro: 'A IA ainda não está configurada no site. Usando sugestão pronta.' };
    return { erro: json.error || `Não foi possível gerar com a IA (código ${r.status}).` };
  } catch (err) {
    if (err?.name === 'TimeoutError') return { erro: 'A IA demorou demais. Usando sugestão pronta.' };
    return { erro: `Falha de conexão com a IA: ${String(err?.message || err)}` };
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', async (ev) => {
    const botao = ev.target.closest?.('[data-suggest-description]');
    if (!botao) return;
    const form = botao.closest('form');
    const campo = form?.querySelector('#description');
    if (!campo) return;
    const cat = form.elements.category;
    const dados = {
      categoria: cat && cat.selectedIndex > 0 ? cat.options[cat.selectedIndex].text : '',
    };
    const textoBotao = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando com IA...';
    try {
      const resposta = await pedirSugestaoIA(dados);
      if (resposta.texto) {
        campo.value = resposta.texto;
      } else {
        toast(resposta.erro, 'error');
        campo.value = sugerirDescricao(dados);
      }
    } finally {
      botao.disabled = false;
      botao.textContent = textoBotao;
    }
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.focus();
  });
}

// Valida e mostra erros embaixo de cada campo. Retorna o objeto validado ou null.
export function checkSupplierForm(form) {
  const data = readSupplierForm(form);
  // O aceite dos termos só existe no cadastro público (o administrador não o preenche).
  // Administrador: nenhum campo obrigatório e sem aceite de termos (ele não preenche esse campo).
  const isAdmin = Boolean(form.elements.status);
  const { ok, errors } = validateSupplier(data, { requireTerms: !isAdmin, required: !isAdmin });
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  if (ok) return data;
  let first = null;
  for (const [key, msg] of Object.entries(errors)) {
    const el = form.querySelector(`#err-${key}`);
    if (el) el.textContent = msg;
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      first ||= input;
    }
  }
  first?.focus();
  return null;
}

// Lê arquivos de imagem com validação de tipo e tamanho. Retorna data URLs.
export async function readImages(files, { maxBytes, max = 1 }) {
  const list = [...files].slice(0, max);
  const out = [];
  for (const file of list) {
    if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" não é uma imagem.`);
    out.push(await shrinkImage(file, maxBytes));
  }
  return out;
}

// Reduz a imagem (lado maior até maxSide px, em WebP) até caber em maxBytes.
// Fotos de celular são grandes, então o site reduz em vez de recusar.
async function shrinkImage(file, maxBytes, maxSide = 1000) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/webp', quality);
    if (dataUrlBytes(url) <= maxBytes) return url;
  }
  throw new Error(`"${file.name}" continua grande demais. Use uma foto menor.`);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não foi possível abrir "${file.name}".`)); };
    img.src = url;
  });
}

function dataUrlBytes(url) {
  return Math.ceil((url.length - url.indexOf(',') - 1) * 3 / 4);
}

export const LIMITS = { MAX_LOGO_BYTES, MAX_PHOTO_BYTES, MAX_PHOTOS };

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

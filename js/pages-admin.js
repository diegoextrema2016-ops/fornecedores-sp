// Painel administrativo. Acesso protegido pelo router (exige sessão de administrador).
// Todas as gravações vão ao Supabase; o banco também confere se quem grava é administrador.
import { SITE } from './config.js';
import { store } from './store.js';
import { go, currentLocation } from './nav.js';
import { escapeHtml as e, formatDate, formatCount, slugify } from './utils.js';
import { toast, confirmDialog, emptyState, pagination } from './ui.js';
import { PLANS } from './config.js';
import { supplierFormHtml, checkSupplierForm, readImages, LIMITS } from './forms.js';
import { sb } from './api.js';
import { parseCsv, planImport, applyImport } from './import.js';
import { paginate } from './search.js';
import { readLocalBackup, parseBackup, importBackup } from './backup.js';

const catName = (slug) => store.categories.get(String(slug))?.name || slug;
const regName = (slug) => store.regions.get(String(slug))?.name || slug;
const STATUS_LABEL = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const USER_TYPES = ['comprador', 'fornecedor', 'moderador'];

// Executa uma ação que grava no banco: mostra sucesso ou o motivo da falha.
async function attempt(action, okMessage) {
  try {
    await action();
    if (okMessage) toast(okMessage);
    return true;
  } catch (err) {
    toast(err.message || 'Não foi possível concluir. Tente de novo.', 'error');
    return false;
  }
}

// Ação com resposta imediata: a tela já mostra a mudança (a cópia local foi alterada antes da gravação)
// e a gravação roda em segundo plano. Se falhar, o store desfaz a mudança e a tela volta ao valor anterior.
function instant(gravacao, rerender, okMessage) {
  gravacao.then(
    () => { if (okMessage) toast(okMessage); rerender(); },
    (err) => { toast(err.message || 'Não foi possível concluir. Tente de novo.', 'error'); rerender(); },
  );
}

// Casca comum do painel: barra lateral + conteúdo.
export function adminLayout(active, title, body) {
  const link = (href, key, label) => `<a class="${active === key ? 'is-active' : ''}" href="${href}">${label}</a>`;
  const pending = store.suppliers.list({ status: 'pending' }).length;
  const payPending = store.subscriptions.adminList().filter((s) => s.status === 'pending').length;
  return {
    title: `${title} | Painel | ${SITE.shortName}`,
    description: 'Painel administrativo.',
    html: `
    <div class="admin-shell">
      <aside class="admin-side" aria-label="Painel">
        <strong class="admin-brand">Painel</strong>
        ${link('/admin', 'dashboard', 'Visão geral')}
        ${link('/admin/pendentes', 'pending', `Pendentes${pending ? ` (${pending})` : ''}`)}
        ${link('/admin/fornecedores', 'suppliers', 'Fornecedores')}
        ${link('/admin/novo', 'new', 'Adicionar fornecedor')}
        ${link('/admin/categorias', 'categories', 'Categorias')}
        ${link('/admin/regioes', 'regions', 'Bairros e cidades')}
        ${link('/admin/pagamentos', 'payments', `Pagamentos${payPending ? ` (${payPending})` : ''}`)}
        ${link('/admin/usuarios', 'users', 'Usuários')}
        ${link('/admin/migracao', 'backup', 'Backup e migração')}
        <a href="/sair">Sair</a>
      </aside>
      <section class="admin-main">
        <h1>${e(title)}</h1>
        ${body}
      </section>
    </div>`,
  };
}

// ---------- Visão geral ----------
export function adminDashboard() {
  const all = store.suppliers.list();
  const approved = all.filter((s) => s.status === 'approved');
  const pending = all.filter((s) => s.status === 'pending');
  const recent = [...all].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  const viewsByCat = {};
  for (const s of approved) viewsByCat[s.category] = (viewsByCat[s.category] || 0) + (s.views || 0);
  const topCats = Object.entries(viewsByCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const stat = (label, value) => `<div class="stat card"><span class="muted small">${label}</span><strong>${formatCount(value)}</strong></div>`;
  return adminLayout('dashboard', 'Visão geral', `
    <div class="stats">
      ${stat('Total de fornecedores', all.length)}
      ${stat('Total de categorias', store.categories.list().length)}
      ${stat('Cadastros pendentes', pending.length)}
      ${stat('Fornecedores aprovados', approved.length)}
    </div>
    <div class="admin-cols">
      <section class="card">
        <h2>Cadastros recentes</h2>
        ${recent.length ? `<ul class="plain-list">${recent.map((s) => `<li><a href="/admin/fornecedores?busca=${encodeURIComponent(s.name)}">${e(s.name)}</a> <span class="muted small">· ${e(STATUS_LABEL[s.status])} · ${formatDate(s.createdAt)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Nenhum cadastro ainda.</p>'}
      </section>
      <section class="card">
        <h2>Categorias com mais visualizações</h2>
        <p class="muted small">Soma das visualizações dos fornecedores aprovados de cada categoria.</p>
        ${topCats.length ? `<ol class="plain-list">${topCats.map(([slug, n]) => `<li>${e(catName(slug))} <span class="muted small">· ${formatCount(n)}</span></li>`).join('')}</ol>`
          : '<p class="muted">Sem dados ainda.</p>'}
      </section>
    </div>`);
}

// ---------- Lista de fornecedores (também usada para "Pendentes") ----------
export function adminSuppliers(query, { preset = '' } = {}) {
  const status = preset || query.get('status') || 'all';
  const search = (query.get('busca') || '').toLowerCase();
  let list = store.suppliers.list();
  if (status !== 'all') list = list.filter((s) => s.status === status);
  if (search) list = list.filter((s) => `${s.name} ${s.email || ''} ${s.responsible || ''}`.toLowerCase().includes(search));
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  // 50 fornecedores por página
  const p = paginate(list, Number(query.get('pagina')) || 1, 50);
  const base = preset ? '/admin/pendentes' : '/admin/fornecedores';
  const makeHref = (n) => {
    const q = new URLSearchParams();
    if (!preset && status !== 'all') q.set('status', status);
    if (search) q.set('busca', search);
    q.set('pagina', n);
    return `${base}?${q.toString()}`;
  };
  const tabs = [['all', 'Todos'], ['pending', 'Pendentes'], ['approved', 'Aprovados'], ['rejected', 'Rejeitados']];
  const active = preset || 'all';
  const key = preset ? 'pending' : 'suppliers';

  return adminLayout(key, preset ? 'Pendentes de aprovação' : 'Fornecedores', `
    ${preset ? '' : `<div class="tabs" role="tablist">${tabs.map(([v, l]) =>
      `<a role="tab" class="tab ${status === v ? 'is-active' : ''}" href="/admin/fornecedores?status=${v}">${l}</a>`).join('')}</div>`}
    ${preset ? '' : importPanelHtml()}
    <form class="toolbar" data-admin-search>
      <input type="search" name="busca" value="${e(search)}" placeholder="Buscar por nome, e-mail ou responsável">
      <button class="btn btn-secondary" type="submit">Buscar</button>
    </form>
    ${list.length ? `
    ${bulkBarHtml()}
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th><span class="sr-only">Selecionar</span></th><th>Empresa</th><th>Categoria</th><th>Bairro</th><th>Status</th><th>Verificado</th><th>Destaque</th><th>Ações</th></tr></thead>
        <tbody>
        ${p.items.map((s) => `
          <tr data-row="${e(s.id)}">
            <td><input type="checkbox" data-select="${e(s.id)}" aria-label="Selecionar ${e(s.name)}"></td>
            <td><strong>${e(s.name)}</strong><div class="muted small">${e(s.email || '')}${s.isDemo ? ' · demo' : ''}</div></td>
            <td>${e(catName(s.category))}</td>
            <td>${e(regName(s.bairro) || s.bairro)}</td>
            <td><span class="badge badge-${s.status}">${STATUS_LABEL[s.status] || s.status}</span></td>
            <td><label class="switch"><input type="checkbox" data-flag="verified" data-id="${e(s.id)}" ${s.verified ? 'checked' : ''}><span class="sr-only">Verificado</span></label></td>
            <td><label class="switch"><input type="checkbox" data-flag="featured" data-id="${e(s.id)}" ${s.featured ? 'checked' : ''}><span class="sr-only">Destaque</span></label></td>
            <td class="row-actions">
              ${s.status !== 'approved' ? `<button class="btn btn-sm btn-primary" data-status="approved" data-id="${e(s.id)}">Aprovar</button>` : ''}
              ${s.status !== 'rejected' ? `<button class="btn btn-sm btn-ghost" data-status="rejected" data-id="${e(s.id)}">Rejeitar</button>` : ''}
              <a class="btn btn-sm btn-secondary" href="/admin/fornecedor/${e(s.id)}/editar">Editar</a>
              ${s.status === 'approved' ? `<a class="btn btn-sm btn-ghost" href="/fornecedor/${e(s.slug)}">Ver</a>` : ''}
              <select class="row-cat" style="max-width:170px" data-row-cat="${e(s.id)}" aria-label="Categoria de ${e(s.name)}">${categoryOptionsFor(s.category)}</select>
              <button class="btn btn-sm btn-danger" data-delete="${e(s.id)}">Excluir</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted small">Mostrando ${formatCount(p.items.length ? (p.page - 1) * p.pageSize + 1 : 0)}–${formatCount((p.page - 1) * p.pageSize + p.items.length)} de ${formatCount(p.total)} fornecedores.</p>
    ${pagination(p, makeHref)}` : emptyState('Nada aqui', preset ? 'Nenhum cadastro pendente no momento.' : 'Nenhum fornecedor encontrado para este filtro.')}
    <span hidden data-active="${active}"></span>`);
}

// Opções do seletor de categoria de cada linha (ativas, mais a atual do fornecedor).
function categoryOptionsFor(current) {
  const cats = store.categories.list().filter((c) => c.status !== 'inactive' || c.slug === current);
  return cats.map((c) => `<option value="${e(c.slug)}" ${c.slug === current ? 'selected' : ''}>${e(c.name)}</option>`).join('');
}

// Barra para mudar a categoria de vários fornecedores de uma vez.
function bulkBarHtml() {
  const cats = store.categories.list().filter((c) => c.status !== 'inactive');
  return `
    <div class="bulk-bar card">
      <label class="check"><input type="checkbox" data-select-all> Selecionar todos exibidos</label>
      <select data-bulk-category aria-label="Categoria de destino">
        <option value="">Mover selecionados para...</option>
        ${cats.map((c) => `<option value="${e(c.slug)}">${e(c.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" type="button" data-bulk-apply>Aplicar categoria</button>
      <span class="muted small" data-bulk-count>0 selecionados</span>
    </div>`;
}

function importPanelHtml() {
  return `
    <details class="import-box card" open>
      <summary><strong>Importar planilha (CSV)</strong></summary>
      <p class="muted small">Colunas: <code>instagram; segmento; whatsapp; link_whatsapp; links_bio_e_sites</code>. Separador <code>;</code> ou <code>,</code>. Contas do Instagram já cadastradas não são duplicadas, então você pode importar de novo sem repetir.</p>
      <input type="file" accept=".csv,text/csv" data-import-file>
      <div data-import-preview></div>
    </details>`;
}

function importSummaryHtml(plan) {
  const c = plan.counts;
  const cats = Object.entries(c.porCategoria).map(([k, v]) => `<li>${e(k)}: ${formatCount(v)}</li>`).join('');
  return `
    <div class="import-summary">
      <p><strong>${formatCount(plan.records.length)}</strong> fornecedores prontos para importar de ${formatCount(c.lidas)} linhas.
        ${c.duplicadas ? `${formatCount(c.duplicadas)} duplicadas ignoradas.` : ''}</p>
      <p class="small muted">Com Instagram: ${formatCount(c.comInstagram)} · WhatsApp (número): ${formatCount(c.comWhatsapp)} · Link de WhatsApp: ${formatCount(c.comLinkWhatsapp)} · Site ou bio: ${formatCount(c.comSite)} · Sem contato: ${formatCount(c.semContato)}</p>
      <ul class="small">${cats}</ul>
      <button class="btn btn-primary" type="button" data-import-run ${plan.records.length ? '' : 'disabled'}>Importar ${formatCount(plan.records.length)} fornecedores</button>
    </div>`;
}

export function mountAdminSuppliers(root, rerender) {
  let pendingPlan = null;
  const updateCount = () => {
    const n = root.querySelectorAll('[data-select]:checked').length;
    const label = root.querySelector('[data-bulk-count]');
    if (label) label.textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
  };

  root.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.matches('[data-row-cat]')) {
      const s = store.suppliers.get(t.dataset.rowCat);
      if (s) {
        instant(store.suppliers.setCategory(s.id, t.value), rerender, `Categoria de "${s.name}" atualizada.`);
        rerender();
      }
    } else if (t.matches('[data-select-all]')) {
      root.querySelectorAll('[data-select]').forEach((c) => (c.checked = t.checked));
      updateCount();
    } else if (t.matches('[data-select]')) {
      updateCount();
    } else if (t.matches('[data-flag]')) {
      instant(
        store.suppliers.setFlag(t.dataset.id, t.dataset.flag, t.checked),
        rerender,
        t.dataset.flag === 'verified' ? 'Selo de verificado atualizado.' : 'Destaque atualizado.',
      );
    } else if (t.closest('[data-import-file]')) {
      const f = t.files?.[0];
      const preview = root.querySelector('[data-import-preview]');
      if (!f) return;
      const rows = parseCsv(await f.text());
      if (!rows.length) {
        pendingPlan = null;
        preview.innerHTML = '<p class="muted small">Nenhuma linha encontrada. Confira o arquivo e o cabeçalho.</p>';
        return;
      }
      pendingPlan = planImport(rows, store.suppliers.list());
      preview.innerHTML = importSummaryHtml(pendingPlan);
    }
  });

  root.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-bulk-apply]')) {
      const slug = root.querySelector('[data-bulk-category]').value;
      const ids = [...root.querySelectorAll('[data-select]:checked')].map((c) => c.dataset.select);
      if (!slug) return toast('Escolha a categoria de destino.', 'error');
      if (!ids.length) return toast('Marque pelo menos um fornecedor.', 'error');
      const ok = await confirmDialog({
        title: 'Mudar categoria?',
        text: `${ids.length} fornecedor(es) serão movidos para "${catName(slug)}".`,
        confirmLabel: 'Mudar',
      });
      if (!ok) return;
      await attempt(async () => {
        for (const id of ids) {
          const s = store.suppliers.get(id);
          if (s) await store.suppliers.save({ ...s, category: slug }, { asAdmin: true });
        }
      }, `${ids.length} fornecedor(es) movidos.`);
      return rerender();
    }

    if (ev.target.closest('[data-import-run]') && pendingPlan) {
      const ok = await confirmDialog({
        title: 'Importar fornecedores?',
        text: `${pendingPlan.records.length} fornecedores serão publicados na listagem.`,
        confirmLabel: 'Importar',
      });
      if (!ok) return;
      const plan = pendingPlan;
      pendingPlan = null;
      let res = null;
      await attempt(async () => { res = await applyImport(store, plan.records); },
        null);
      if (res) toast(`${res.imported} fornecedores importados${res.categoriesCreated ? `, ${res.categoriesCreated} categorias criadas` : ''}.`);
      return rerender();
    }

    const st = ev.target.closest('[data-status]');
    if (st) {
      instant(store.suppliers.setStatus(st.dataset.id, st.dataset.status), rerender,
        st.dataset.status === 'approved' ? 'Fornecedor aprovado e publicado.' : 'Cadastro rejeitado.');
      if (st.dataset.status === 'approved') publicarPaginas();
      return rerender();
    }

    const del = ev.target.closest('[data-delete]');
    if (del) {
      const s = store.suppliers.get(del.dataset.delete);
      const ok = await confirmDialog({
        title: 'Excluir fornecedor?',
        text: `"${s?.name}" será removido permanentemente do site.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (ok) {
        await attempt(() => store.suppliers.remove(del.dataset.delete), 'Fornecedor excluído.');
        rerender();
      }
    }
  });

  root.querySelector('[data-admin-search]')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const busca = new FormData(ev.currentTarget).get('busca')?.toString().trim() || '';
    const { path, search } = currentLocation();
    const current = new URLSearchParams(search);
    current.set('busca', busca);
    current.delete('pagina');
    go(`${path}?${current.toString()}`);
  });
}

// ---------- Criar / editar fornecedor ----------
export function adminSupplierForm(id) {
  const existing = id ? store.suppliers.get(id) : null;
  if (id && !existing) return adminLayout('suppliers', 'Fornecedor não encontrado', emptyState('Não encontrado', 'Este fornecedor não existe mais.', '<a class="btn btn-primary" href="/admin/fornecedores">Voltar</a>'));
  return adminLayout(existing ? 'suppliers' : 'new', existing ? `Editar: ${existing.name}` : 'Adicionar fornecedor', `
    <p class="muted">Use para cadastrar fornecedores manualmente ou corrigir dados.</p>
    ${supplierFormHtml(existing || {}, { admin: true })}
    <p class="muted small">Logo e fotos atuais serão mantidos se você não enviar novos arquivos.</p>`);
}

// Pede ao site que refaça as páginas públicas (listagens) sem esperar a resposta.
// Não trava a tela: se falhar, o fornecedor continua salvo e aparece nas páginas que leem o banco.
async function publicarPaginas() {
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    fetch('/api/publicar', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  } catch {
    // sem ação: a publicação automática não é obrigatória para salvar
  }
}

export function mountAdminSupplierForm(root, id) {
  const form = root.querySelector('#supplier-form');
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = checkSupplierForm(form);
    if (!data) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      const existing = id ? store.suppliers.get(id) : null;
      const newLogo = await readImages(form.elements.logo.files, { maxBytes: LIMITS.MAX_LOGO_BYTES, max: 1, maxSide: 500 });
      const newPhotos = await readImages(form.elements.photos.files, { maxBytes: LIMITS.MAX_PHOTO_BYTES, max: LIMITS.MAX_PHOTOS, maxSide: 900 });
      const saved = await store.suppliers.save({
        ...(existing || {}),
        ...data,
        id: existing?.id,
        slug: existing ? existing.slug : slugify(data.name),
        logo: newLogo[0] || existing?.logo || '',
        photos: newPhotos.length ? newPhotos : existing?.photos || [],
      }, { asAdmin: true, checkDuplicates: true });
      toast('Fornecedor salvo.');
      publicarPaginas();
      go(saved.status === 'approved' ? `/fornecedor/${saved.slug}` : '/admin/fornecedores');
    } catch (err) {
      toast(err.message || 'Erro ao salvar.', 'error');
      button.disabled = false;
      button.textContent = 'Salvar fornecedor';
    }
  });
}

// ---------- Categorias ----------
// Ordem de exibição no site: sortOrder e, em empate, nome.
const sortedCategories = () => store.categories.list().slice()
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));

// Grava a ordem dada (lista de slugs). Renumera 1..n e grava só as linhas que mudaram.
async function saveCategoryOrder(slugs, rerender) {
  const byslug = new Map(store.categories.list().map((c) => [c.slug, c]));
  const changes = slugs
    .map((slug, k) => ({ c: byslug.get(slug), order: k + 1 }))
    .filter(({ c, order }) => c && (c.sortOrder ?? 0) !== order);
  if (!changes.length) return;
  // Os valores novos entram na cópia local antes da gravação; a tela muda na hora.
  const gravacoes = changes.map(({ c, order }) => store.categories.setFields(c.slug, { sortOrder: order }));
  rerender();
  instant(Promise.all(gravacoes), rerender, 'Ordem das categorias atualizada.');
}

// Sobe ou desce uma categoria (botões ▲ ▼).
async function moveCategory(slug, delta, rerender) {
  const slugs = sortedCategories().map((c) => c.slug);
  const i = slugs.indexOf(slug);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= slugs.length) return;
  [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
  return saveCategoryOrder(slugs, rerender);
}

export function adminCategories() {
  const cats = sortedCategories();
  return adminLayout('categories', 'Categorias', `
    <section class="card">
      <h2 id="cat-form-title">Nova categoria</h2>
      <form class="form-grid" id="cat-form" novalidate>
        <input type="hidden" name="slug">
        <div class="field"><label for="cat-name">Nome *</label><input id="cat-name" name="name" required><span class="field-error" id="err-name" role="alert"></span></div>
        <div class="field"><label for="cat-icon">Ícone (emoji)</label><input id="cat-icon" name="icon" maxlength="4" value="📦"></div>
        <div class="field field-wide"><label for="cat-desc">Descrição</label><input id="cat-desc" name="description" maxlength="160"></div>
        <div class="field field-wide"><label for="cat-sub">Subcategorias (separadas por vírgula)</label><input id="cat-sub" name="subcategories"></div>
        <div class="field"><label class="check"><input type="checkbox" name="active" checked> Ativa (visível no site)</label></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar categoria</button><button class="btn btn-ghost" type="button" id="cat-cancel" hidden>Cancelar edição</button></div>
      </form>
    </section>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Ordem</th><th>Categoria</th><th>Slug</th><th>Fornecedores aprovados</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>
          ${cats.map((c, idx) => `
            <tr draggable="true" data-cat-row="${e(c.slug)}" class="cat-row">
              <td class="row-actions">
                <span class="drag-handle" aria-hidden="true" title="Arraste para reordenar">⋮⋮</span>
                <button class="btn btn-sm btn-ghost" data-cat-up="${e(c.slug)}" aria-label="Subir ${e(c.name)}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="btn btn-sm btn-ghost" data-cat-down="${e(c.slug)}" aria-label="Descer ${e(c.name)}" ${idx === cats.length - 1 ? 'disabled' : ''}>▼</button>
              </td>
              <td>${e(c.icon || '')} <strong>${e(c.name)}</strong><div class="muted small">${e(c.description || '')}</div></td>
              <td><code>${e(c.slug)}</code></td>
              <td>${store.categories.countSuppliers(c.slug)}</td>
              <td><span class="badge ${c.status === 'inactive' ? '' : 'badge-approved'}">${c.status === 'inactive' ? 'Inativa' : 'Ativa'}</span></td>
              <td class="row-actions">
                <button class="btn btn-sm btn-secondary" data-cat-edit="${e(c.slug)}">Editar</button>
                <button class="btn btn-sm btn-ghost" data-cat-toggle="${e(c.slug)}">${c.status === 'inactive' ? 'Ativar' : 'Desativar'}</button>
                <button class="btn btn-sm btn-danger" data-cat-del="${e(c.slug)}">Excluir</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`);
}

export function mountAdminCategories(root, rerender) {
  // Arrastar e soltar (computador). Os botões ▲ ▼ continuam valendo para celular e teclado.
  let dragSlug = null;
  const clearDropMarks = () => root.querySelectorAll('.drop-before, .drop-after, .dragging')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
  root.addEventListener('dragstart', (ev) => {
    const row = ev.target.closest?.('tr[data-cat-row]');
    if (!row) return;
    dragSlug = row.dataset.catRow;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', dragSlug);
    row.classList.add('dragging');
  });
  root.addEventListener('dragover', (ev) => {
    const row = ev.target.closest?.('tr[data-cat-row]');
    if (!row || !dragSlug || row.dataset.catRow === dragSlug) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    root.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    row.classList.add(after ? 'drop-after' : 'drop-before');
  });
  root.addEventListener('dragend', () => { dragSlug = null; clearDropMarks(); });
  root.addEventListener('drop', async (ev) => {
    const row = ev.target.closest?.('tr[data-cat-row]');
    if (!row || !dragSlug) return;
    ev.preventDefault();
    const from = dragSlug;
    const to = row.dataset.catRow;
    const after = row.classList.contains('drop-after');
    dragSlug = null;
    clearDropMarks();
    if (from === to) return;
    const slugs = sortedCategories().map((c) => c.slug).filter((slug) => slug !== from);
    let at = slugs.indexOf(to) + (after ? 1 : 0);
    slugs.splice(at, 0, from);
    await saveCategoryOrder(slugs, rerender);
  });

  const form = root.querySelector('#cat-form');
  const title = root.querySelector('#cat-form-title');
  const cancel = root.querySelector('#cat-cancel');
  const reset = () => {
    form.reset();
    form.elements.slug.value = '';
    title.textContent = 'Nova categoria';
    cancel.hidden = true;
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = form.elements;
    const name = f.name.value.trim();
    if (!name) {
      form.querySelector('#err-name').textContent = 'Informe o nome.';
      return;
    }
    const slug = f.slug.value || slugify(name);
    if (!f.slug.value && store.categories.get(slug)) {
      form.querySelector('#err-name').textContent = 'Já existe uma categoria com esse nome.';
      return;
    }
    instant(store.categories.save({
      slug,
      name,
      icon: f.icon.value.trim() || '📦',
      description: f.description.value.trim(),
      subcategories: f.subcategories.value.split(',').map((s) => s.trim()).filter(Boolean),
      status: f.active.checked ? 'active' : 'inactive',
    }), rerender, 'Categoria salva.');
    rerender();
  });
  cancel.addEventListener('click', reset);
  root.addEventListener('click', async (ev) => {
    const edit = ev.target.closest('[data-cat-edit]');
    const toggle = ev.target.closest('[data-cat-toggle]');
    const del = ev.target.closest('[data-cat-del]');
    const up = ev.target.closest('[data-cat-up]');
    const down = ev.target.closest('[data-cat-down]');
    if (up) return moveCategory(up.dataset.catUp, -1, rerender);
    if (down) return moveCategory(down.dataset.catDown, 1, rerender);
    if (edit) {
      const c = store.categories.get(edit.dataset.catEdit);
      form.elements.slug.value = c.slug;
      form.elements.name.value = c.name;
      form.elements.icon.value = c.icon || '';
      form.elements.description.value = c.description || '';
      form.elements.subcategories.value = (c.subcategories || []).join(', ');
      form.elements.active.checked = c.status !== 'inactive';
      title.textContent = `Editar: ${c.name}`;
      cancel.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (toggle) {
      const c = store.categories.get(toggle.dataset.catToggle);
      instant(store.categories.setFields(c.slug, { status: c.status === 'inactive' ? 'active' : 'inactive' }), rerender, 'Situação atualizada.');
      rerender();
    }
    if (del) {
      const slug = del.dataset.catDel;
      const inUse = store.suppliers.list().filter((s) => s.category === slug).length;
      if (inUse) {
        return toast(`Esta categoria tem ${formatCount(inUse)} fornecedor(es). Troque a categoria deles antes de excluir.`, 'error');
      }
      const ok = await confirmDialog({ title: 'Excluir categoria?', text: `"${catName(slug)}" será removida. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir', danger: true });
      if (!ok) return;
      const done = await attempt(async () => {
        const result = await store.categories.remove(slug);
        if (!result.ok) throw new Error(result.reason);
      }, 'Categoria excluída.');
      if (done) rerender();
    }
  });
}

// ---------- Bairros e cidades ----------
export function adminRegions() {
  const regs = store.regions.list();
  return adminLayout('regions', 'Bairros e cidades', `
    <section class="card">
      <h2 id="reg-form-title">Novo bairro ou cidade</h2>
      <form class="form-grid" id="reg-form" novalidate>
        <input type="hidden" name="slug">
        <div class="field"><label for="reg-name">Nome *</label><input id="reg-name" name="name" required><span class="field-error" id="err-reg-name" role="alert"></span></div>
        <div class="field"><label for="reg-desc">Descrição</label><input id="reg-desc" name="description" maxlength="160"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn btn-ghost" type="button" id="reg-cancel" hidden>Cancelar edição</button></div>
      </form>
    </section>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nome</th><th>Código</th><th>Fornecedores</th><th>Ações</th></tr></thead>
        <tbody>
          ${regs.map((r) => `
            <tr>
              <td><strong>${e(r.name)}</strong><div class="muted small">${e(r.description || '')}</div></td>
              <td><code>${e(r.slug)}</code></td>
              <td>${store.suppliers.list().filter((s) => s.bairro === r.slug).length}</td>
              <td class="row-actions">
                <button class="btn btn-sm btn-secondary" data-reg-edit="${e(r.slug)}">Editar</button>
                <button class="btn btn-sm btn-danger" data-reg-del="${e(r.slug)}">Excluir</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`);
}

export function mountAdminRegions(root, rerender) {
  const form = root.querySelector('#reg-form');
  const title = root.querySelector('#reg-form-title');
  const cancel = root.querySelector('#reg-cancel');
  const reset = () => {
    form.reset();
    form.elements.slug.value = '';
    title.textContent = 'Novo bairro ou cidade';
    cancel.hidden = true;
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = form.elements;
    const name = f.name.value.trim();
    if (!name) {
      form.querySelector('#err-reg-name').textContent = 'Informe o nome.';
      return;
    }
    const slug = f.slug.value || slugify(name);
    if (!f.slug.value && store.regions.get(slug)) {
      form.querySelector('#err-reg-name').textContent = 'Já existe com esse nome.';
      return;
    }
    instant(store.regions.save({ slug, name, description: f.description.value.trim() }), rerender, 'Salvo.');
    rerender();
  });
  cancel.addEventListener('click', reset);
  root.addEventListener('click', async (ev) => {
    const edit = ev.target.closest('[data-reg-edit]');
    const del = ev.target.closest('[data-reg-del]');
    if (edit) {
      const r = store.regions.get(edit.dataset.regEdit);
      form.elements.slug.value = r.slug;
      form.elements.name.value = r.name;
      form.elements.description.value = r.description || '';
      title.textContent = `Editar: ${r.name}`;
      cancel.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (del) {
      const slug = del.dataset.regDel;
      const inUse = store.suppliers.list().filter((s) => s.bairro === slug).length;
      if (inUse) return toast(`Esta região tem ${formatCount(inUse)} fornecedor(es). Troque-os antes de excluir.`, 'error');
      const ok = await confirmDialog({
        title: 'Excluir bairro ou cidade?',
        text: `"${regName(slug)}" será removida. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      const done = await attempt(async () => {
        const result = await store.regions.remove(slug);
        if (!result.ok) throw new Error(result.reason);
      }, 'Excluído.');
      if (done) rerender();
    }
  });
}

// ---------- Usuários ----------
export function adminUsers() {
  const users = store.users.list();
  return adminLayout('users', 'Usuários', users.length ? `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Cadastro</th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${e(u.name)}</td>
              <td>${e(u.email)}</td>
              <td>
                <select data-user-type="${e(u.id)}" aria-label="Tipo de ${e(u.name)}">
                  ${[...USER_TYPES, ...(u.type === 'admin' ? ['admin'] : [])]
                    .map((t) => `<option value="${t}" ${u.type === t ? 'selected' : ''}>${t === 'admin' ? 'administrador' : t}</option>`).join('')}
                </select>
              </td>
              <td>${formatDate(u.createdAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted small">Contas criadas pelo cadastro do site. Para apagar uma conta, use o painel de autenticação do Supabase.</p>`
    : emptyState('Nenhum usuário cadastrado', 'As contas criadas no site aparecerão aqui.'));
}

export function mountAdminUsers(root, rerender) {
  root.addEventListener('change', async (ev) => {
    const sel = ev.target.closest('[data-user-type]');
    if (!sel) return;
    instant(store.users.setType(sel.dataset.userType, sel.value), rerender, 'Tipo de usuário atualizado.');
    rerender();
  });
}

// ---------- Pagamentos (Pix) ----------
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const planName = (id) => PLANS.find((p) => p.id === id)?.name || id;
const isLive = (s) => s.status === 'active' && new Date(s.expiresAt).getTime() > Date.now();

function payClient(s) {
  return `<strong>${e(s.userName || 'Sem nome')}</strong><br><span class="muted small">${e(s.userEmail)}</span>`;
}

function payTable(rows, columns) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((s) => `<tr>${columns.map((c) => `<td>${c.cell(s)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export function adminPayments() {
  const all = store.subscriptions.adminList();
  const pending = all.filter((s) => s.status === 'pending');
  const active = all.filter(isLive);
  const closed = all.filter((s) => !pending.includes(s) && !active.includes(s));

  const pendingTable = payTable(pending, [
    { label: 'Cliente', cell: payClient },
    { label: 'Plano', cell: (s) => e(planName(s.planId)) },
    { label: 'Valor', cell: (s) => brl(s.amount) },
    { label: 'Pedido em', cell: (s) => formatDate(s.createdAt) },
    { label: '', cell: (s) => `
      <div class="pay-actions">
        <button class="btn btn-primary" type="button" data-pay-confirm="${e(s.id)}">Confirmar Pix</button>
        <button class="btn btn-ghost" type="button" data-pay-reject="${e(s.id)}">Recusar</button>
      </div>` },
  ]);
  const activeTable = payTable(active, [
    { label: 'Cliente', cell: payClient },
    { label: 'Plano', cell: (s) => e(planName(s.planId)) },
    { label: 'Válida até', cell: (s) => formatDate(s.expiresAt) },
    { label: '', cell: (s) => `<button class="btn btn-ghost" type="button" data-pay-cancel="${e(s.id)}">Cancelar acesso</button>` },
  ]);
  const closedTable = payTable(closed, [
    { label: 'Cliente', cell: payClient },
    { label: 'Situação', cell: (s) => (s.status === 'cancelled' ? 'Cancelada' : 'Vencida') },
    { label: 'Válida até', cell: (s) => (s.status === 'pending' ? '' : formatDate(s.expiresAt)) },
    { label: 'Observação', cell: (s) => `<span class="muted small">${e(s.paymentNote)}</span>` },
  ]);

  return adminLayout('payments', 'Pagamentos', `
    <p class="muted">Confira o Pix na sua conta bancária antes de confirmar. Ao confirmar, o cliente ganha acesso aos contatos pelo prazo do plano.</p>
    <h2>Aguardando conferência (${pending.length})</h2>
    ${pending.length ? pendingTable : emptyState('Nenhum Pix aguardando', 'Quando um cliente informar o pagamento, o pedido aparece aqui.')}
    <h2>Assinaturas ativas (${active.length})</h2>
    ${active.length ? activeTable : emptyState('Nenhuma assinatura ativa', 'As assinaturas confirmadas aparecem aqui até o prazo acabar.')}
    ${closed.length ? `<h2>Encerradas ou recusadas (${closed.length})</h2>${closedTable}` : ''}`);
}

export function mountAdminPayments(root, rerender) {
  root.addEventListener('click', async (ev) => {
    const confirmBtn = ev.target.closest('[data-pay-confirm]');
    const rejectBtn = ev.target.closest('[data-pay-reject]');
    const cancelBtn = ev.target.closest('[data-pay-cancel]');
    const find = (id) => store.subscriptions.adminList().find((s) => s.id === id);

    if (confirmBtn) {
      const s = find(confirmBtn.dataset.payConfirm);
      if (!s) return toast('Pedido não encontrado. Atualize a página.', 'error');
      const yes = await confirmDialog({
        title: 'Confirmar o Pix?',
        text: `Você recebeu o Pix de ${s.userName || s.userEmail} (${brl(s.amount)})? O acesso aos contatos será liberado pelo prazo do plano.`,
        confirmLabel: 'Confirmar Pix',
      });
      if (!yes) return;
      if (await attempt(() => store.subscriptions.confirmPix(s.id), 'Pagamento confirmado. Acesso liberado.')) rerender();
    }

    if (rejectBtn) {
      const s = find(rejectBtn.dataset.payReject);
      if (!s) return toast('Pedido não encontrado. Atualize a página.', 'error');
      const yes = await confirmDialog({
        title: 'Recusar o pedido?',
        text: `O pedido de ${s.userName || s.userEmail} será marcado como recusado. Use isso se o Pix não chegou.`,
        confirmLabel: 'Recusar',
        danger: true,
      });
      if (!yes) return;
      if (await attempt(() => store.subscriptions.cancel(s.id, 'Pix não localizado; pedido recusado pelo administrador'), 'Pedido recusado.')) rerender();
    }

    if (cancelBtn) {
      const s = find(cancelBtn.dataset.payCancel);
      if (!s) return toast('Assinatura não encontrada. Atualize a página.', 'error');
      const yes = await confirmDialog({
        title: 'Cancelar o acesso?',
        text: `${s.userName || s.userEmail} perde o acesso aos contatos agora. O histórico fica registrado.`,
        confirmLabel: 'Cancelar acesso',
        danger: true,
      });
      if (!yes) return;
      if (await attempt(() => store.subscriptions.cancel(s.id, 'Cancelada pelo administrador'), 'Acesso cancelado.')) rerender();
    }
  });
}

// ---------- Backup e migração ----------
export function adminBackup() {
  const backup = readLocalBackupSafe();
  const local = backup
    ? `<p>Encontrei <strong>${formatCount(backup.suppliers.length)}</strong> fornecedores, <strong>${formatCount(backup.categories.length)}</strong> categorias e <strong>${formatCount(backup.regions.length)}</strong> bairros guardados <em>neste navegador</em>, da versão anterior do site.</p>
       <button class="btn btn-primary" type="button" data-backup-download>Baixar backup (JSON)</button>
       <p class="muted small">Guarde o arquivo. Depois, abra o site publicado, entre como administrador, vá em Backup e migração e restaure o arquivo lá.</p>`
    : '<p class="muted">Não há dados antigos guardados neste navegador. Esta área só serve para migrar os cadastros feitos na versão anterior.</p>';
  return adminLayout('backup', 'Backup e migração', `
    <section class="card">
      <h2>1. Backup deste navegador</h2>
      ${local}
    </section>
    <section class="card">
      <h2>2. Restaurar backup no banco</h2>
      <p class="muted">Escolha o arquivo JSON gerado no passo 1. Os fornecedores entram com o mesmo status que tinham. Contas e favoritos não são importados.</p>
      <input type="file" accept="application/json,.json" data-backup-file>
      <div data-backup-preview></div>
    </section>`);
}

function readLocalBackupSafe() {
  try {
    return readLocalBackup(window.localStorage);
  } catch {
    return null;
  }
}

export function mountAdminBackup(root) {
  let pending = null;
  root.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-backup-download]')) {
      const backup = readLocalBackupSafe();
      if (!backup) return toast('Não há dados para exportar.', 'error');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-fornecedores-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (ev.target.closest('[data-backup-run]') && pending) {
      const ok = await confirmDialog({
        title: 'Restaurar backup?',
        text: `${pending.suppliers.length} fornecedores serão gravados no banco. Fornecedores com o mesmo nome e a mesma cidade podem ficar duplicados.`,
        confirmLabel: 'Restaurar',
      });
      if (!ok) return;
      const data = pending;
      pending = null;
      const preview = root.querySelector('[data-backup-preview]');
      preview.innerHTML = '<p class="muted">Gravando no banco... não feche esta página.</p>';
      try {
        const res = await importBackup(store, data);
        preview.innerHTML = `
          <p><strong>${formatCount(res.suppliers)}</strong> fornecedores, <strong>${formatCount(res.categories)}</strong> categorias e <strong>${formatCount(res.regions)}</strong> bairros gravados.</p>
          ${res.skipped ? `<p class="small">${formatCount(res.skipped)} fornecedor(es) já existiam no banco (mesmo endereço) e não foram gravados de novo.</p>` : ''}
          ${res.errors.length ? `<p class="small">Não foi possível gravar ${formatCount(res.errors.length)} item(ns):</p><ul class="small">${res.errors.map((m) => `<li>${e(m)}</li>`).join('')}</ul>` : ''}
          <a class="btn btn-secondary" href="/admin/fornecedores">Ver fornecedores</a>`;
      } catch (err) {
        preview.innerHTML = '';
        toast(err.message || 'Falha ao gravar o backup.', 'error');
      }
    }
  });
  root.addEventListener('change', async (ev) => {
    const input = ev.target.closest('[data-backup-file]');
    if (!input) return;
    const preview = root.querySelector('[data-backup-preview]');
    const f = input.files?.[0];
    if (!f) return;
    const parsed = parseBackup(await f.text());
    if (!parsed.ok) {
      pending = null;
      preview.innerHTML = `<p class="notice notice-warn">${e(parsed.reason)}</p>`;
      return;
    }
    pending = parsed.data;
    preview.innerHTML = `
      <div class="import-summary">
        <p><strong>${formatCount(pending.suppliers.length)}</strong> fornecedores, <strong>${formatCount(pending.categories.length)}</strong> categorias e <strong>${formatCount(pending.regions.length)}</strong> bairros prontos para gravar.</p>
        <button class="btn btn-primary" type="button" data-backup-run>Gravar no banco</button>
      </div>`;
  });
}

export { formatCount };

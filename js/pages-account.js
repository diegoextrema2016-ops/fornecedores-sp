// Login, cadastro de usuário, sair e cadastro público de fornecedor.
import { ADMIN, SITE } from './config.js';
import { store } from './store.js';
import { validateUser, sha256Hex, escapeHtml as e, isEmail } from './utils.js';
import { toast, breadcrumbs, fieldError } from './ui.js';
import { supplierFormHtml, checkSupplierForm, readImages, LIMITS } from './forms.js';

const fieldsOf = (form) => Object.fromEntries(new FormData(form).entries());

function showErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  for (const [k, msg] of Object.entries(errors)) {
    const el = form.querySelector(`#err-${k}`);
    if (el) el.textContent = msg;
  }
}

export function loginPage() {
  return {
    title: `Entrar | ${SITE.shortName}`,
    description: 'Acesse sua conta no Fornecedores Atacado SP.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Entrar' }])}
    <section class="container section-tight narrow">
      <h1>Entrar</h1>
      <form class="card form" id="login-form" novalidate>
        <div class="field"><label for="l-email">E-mail</label><input id="l-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <div class="field"><label for="l-pass">Senha</label><input id="l-pass" name="password" type="password" required autocomplete="current-password"><span class="field-error" id="err-password" role="alert"></span></div>
        <button class="btn btn-primary btn-lg" type="submit">Entrar</button>
        <p class="muted small">Ainda não tem conta? <a href="#/registro">Criar conta</a></p>
        <p class="muted small">Sem conta, seus favoritos ficam só neste navegador.</p>
      </form>
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#login-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { email = '', password = '' } = fieldsOf(form);
        if (!isEmail(email)) return showErrors(form, { email: 'Informe um e-mail válido.' });
        if (!password) return showErrors(form, { password: 'Informe sua senha.' });
        const hash = await sha256Hex(password);
        const cleanEmail = email.trim().toLowerCase();

        if (cleanEmail === ADMIN.email.toLowerCase()) {
          if (hash !== ADMIN.passwordSha256) return showErrors(form, { password: 'E-mail ou senha incorretos.' });
          store.session.set({ email: cleanEmail, name: 'Administrador' }, 'admin');
          store.favorites.mergeGuestInto(cleanEmail);
          toast('Bem-vindo ao painel.');
          location.hash = '#/admin';
          return;
        }
        const user = store.users.findByEmail(cleanEmail);
        if (!user || user.passwordHash !== hash) {
          return showErrors(form, { password: 'E-mail ou senha incorretos.' });
        }
        store.session.set({ id: user.id, email: user.email, name: user.name, type: user.type }, 'user');
        store.favorites.mergeGuestInto(user.email);
        toast(`Olá, ${user.name.split(' ')[0]}!`);
        location.hash = '#/favoritos';
      });
    },
  };
}

export function registerPage() {
  return {
    title: `Criar conta | ${SITE.shortName}`,
    description: 'Crie sua conta para salvar fornecedores e acompanhar seus cadastros.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Criar conta' }])}
    <section class="container section-tight narrow">
      <h1>Criar conta</h1>
      <form class="card form" id="register-form" novalidate>
        <div class="field"><label for="r-name">Nome</label><input id="r-name" name="name" required autocomplete="name"><span class="field-error" id="err-name" role="alert"></span></div>
        <div class="field"><label for="r-email">E-mail</label><input id="r-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <div class="field"><label for="r-pass">Senha (mínimo 8 caracteres)</label><input id="r-pass" name="password" type="password" required autocomplete="new-password"><span class="field-error" id="err-password" role="alert"></span></div>
        <div class="field"><label for="r-conf">Confirmar senha</label><input id="r-conf" name="confirm" type="password" required autocomplete="new-password"><span class="field-error" id="err-confirm" role="alert"></span></div>
        <button class="btn btn-primary btn-lg" type="submit">Criar conta</button>
        <p class="muted small">Esta conta é guardada neste navegador (modo demonstração). Não use senhas que você usa em outros sites.</p>
      </form>
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#register-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const values = fieldsOf(form);
        const { ok, errors } = validateUser(values);
        if (!ok) return showErrors(form, errors);
        const passwordHash = await sha256Hex(values.password);
        const res = store.users.register({ name: values.name, email: values.email, passwordHash });
        if (!res.ok) return showErrors(form, { email: res.reason });
        store.session.set({ id: res.user.id, email: res.user.email, name: res.user.name, type: 'comprador' }, 'user');
        store.favorites.mergeGuestInto(res.user.email);
        toast('Conta criada com sucesso.');
        location.hash = '#/favoritos';
      });
    },
  };
}

export function logout() {
  store.session.clear();
  toast('Você saiu da conta.');
  location.hash = '#/';
}

export function cadastroPage() {
  const session = store.session.get();
  return {
    title: `Cadastre sua loja | ${SITE.shortName}`,
    description: 'Cadastre seu negócio no Fornecedores Atacado SP e seja encontrado por compradores de todo o Brasil.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Cadastrar fornecedor' }])}
    <section class="container section-tight">
      <h1>Cadastre sua loja e seja encontrado por compradores de todo o Brasil.</h1>
      <p class="lead">Preencha os dados abaixo. Após o envio, seu cadastro fica pendente até a aprovação.</p>
      <div class="notice notice-warn" role="note">
        Anuncie apenas produtos lícitos. Itens com venda proibida por lei ou por norma de órgãos reguladores (como a Anvisa) não podem ser cadastrados.
      </div>
      ${supplierFormHtml({}, { loggedEmail: session?.email || '' })}
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#supplier-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const data = checkSupplierForm(form);
        if (!data) return;
        try {
          const logo = await readImages(form.elements.logo.files, { maxBytes: LIMITS.MAX_LOGO_BYTES, max: 1 });
          const photos = await readImages(form.elements.photos.files, { maxBytes: LIMITS.MAX_PHOTO_BYTES, max: LIMITS.MAX_PHOTOS });
          const saved = store.suppliers.save({
            ...data,
            acceptTerms: undefined,
            logo: logo[0] || '',
            photos,
            ownerEmail: session?.email || data.email,
            status: 'pending',
          });
          root.innerHTML = `
            <section class="container section-tight narrow">
              <div class="card success">
                <h1>Cadastro enviado!</h1>
                <p>Recebemos os dados de <strong>${e(saved.name)}</strong>. Nossa equipe vai analisar as informações antes de publicar.</p>
                <p class="muted small">Você não precisa enviar de novo. Para corrigir algo, fale pelo <a href="#/contato">contato</a>.</p>
                <a class="btn btn-primary" href="#/">Voltar ao início</a>
              </div>
            </section>`;
          window.scrollTo({ top: 0 });
        } catch (err) {
          toast(err.message || 'Não foi possível enviar as imagens.', 'error');
        }
      });
    },
  };
}

export { fieldError };

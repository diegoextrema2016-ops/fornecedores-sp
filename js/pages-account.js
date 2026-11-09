// Login, cadastro de usuário, sair e cadastro público de fornecedor (Supabase Auth).
import { SITE } from './config.js';
import { store } from './store.js';
import { validateUser, escapeHtml as e } from './utils.js';
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
      </form>
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#login-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { email = '', password = '' } = fieldsOf(form);
        if (!email.trim()) return showErrors(form, { email: 'Informe seu e-mail.' });
        if (!password) return showErrors(form, { password: 'Informe sua senha.' });
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await store.auth.signIn(email, password);
          await store.refresh();
          const session = store.session.get();
          toast(`Olá, ${(session?.name || '').split(' ')[0] || 'bem-vindo'}!`);
          location.hash = session?.role === 'admin' ? '#/admin' : '#/favoritos';
        } catch (err) {
          showErrors(form, { password: err.message });
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

export function registerPage() {
  return {
    title: `Criar conta | ${SITE.shortName}`,
    description: 'Crie sua conta para salvar fornecedores, assinar o acesso aos contatos e cadastrar sua loja.',
    html: `
    ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Criar conta' }])}
    <section class="container section-tight narrow" id="register-area">
      <h1>Criar conta</h1>
      <form class="card form" id="register-form" novalidate>
        <div class="field"><label for="r-name">Nome</label><input id="r-name" name="name" required autocomplete="name"><span class="field-error" id="err-name" role="alert"></span></div>
        <div class="field"><label for="r-email">E-mail</label><input id="r-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <div class="field"><label for="r-pass">Senha (mínimo 8 caracteres)</label><input id="r-pass" name="password" type="password" required autocomplete="new-password"><span class="field-error" id="err-password" role="alert"></span></div>
        <div class="field"><label for="r-conf">Confirmar senha</label><input id="r-conf" name="confirm" type="password" required autocomplete="new-password"><span class="field-error" id="err-confirm" role="alert"></span></div>
        <button class="btn btn-primary btn-lg" type="submit">Criar conta</button>
        <p class="muted small">Enviaremos um e-mail para confirmar o endereço. Não use uma senha que você usa em outros sites.</p>
      </form>
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#register-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const values = fieldsOf(form);
        const { ok, errors } = validateUser(values);
        if (!ok) return showErrors(form, errors);
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const { needsConfirmation } = await store.auth.signUp({ name: values.name, email: values.email, password: values.password });
          if (needsConfirmation) {
            root.querySelector('#register-area').innerHTML = `
              <div class="card success">
                <h1>Confira seu e-mail</h1>
                <p>Enviamos um link de confirmação para <strong>${e(values.email.trim())}</strong>. Clique nele e depois entre na sua conta.</p>
                <p class="muted small">Não recebeu? Verifique a pasta de spam ou o lixo eletrônico.</p>
                <a class="btn btn-primary" href="#/login">Ir para o login</a>
              </div>`;
            return;
          }
          await store.refresh();
          toast('Conta criada com sucesso.');
          location.hash = '#/favoritos';
        } catch (err) {
          showErrors(form, err.message.includes('senha') ? { password: err.message } : { email: err.message });
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

export async function logout() {
  try {
    await store.auth.signOut();
    toast('Você saiu da conta.');
  } catch (err) {
    toast(err.message, 'error');
  }
  location.hash = '#/';
}

export function cadastroPage() {
  const session = store.session.get();
  const title = `Cadastre sua loja | ${SITE.shortName}`;
  const description = 'Cadastre seu negócio no Fornecedores Atacado SP e seja encontrado por compradores de todo o Brasil.';
  if (!session) {
    return {
      title,
      description,
      html: `
      ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Cadastrar fornecedor' }])}
      <section class="container section-tight narrow">
        <h1>Cadastre sua loja</h1>
        <div class="card">
          <p>Para cadastrar seu negócio, você precisa de uma conta. Assim, você acompanha o status do cadastro e pode corrigir os dados depois.</p>
          <div class="form-actions">
            <a class="btn btn-primary" href="#/registro">Criar conta</a>
            <a class="btn btn-ghost" href="#/login">Já tenho conta</a>
          </div>
        </div>
      </section>`,
    };
  }
  return {
    title,
    description,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '#/' }, { label: 'Cadastrar fornecedor' }])}
    <section class="container section-tight">
      <h1>Cadastre sua loja e seja encontrado por compradores de todo o Brasil.</h1>
      <p class="lead">Preencha os dados abaixo. Após o envio, seu cadastro fica pendente até a aprovação.</p>
      <div class="notice notice-warn" role="note">
        Anuncie apenas produtos lícitos. Itens com venda proibida por lei ou por norma de órgãos reguladores (como a Anvisa) não podem ser cadastrados.
      </div>
      ${supplierFormHtml({}, { loggedEmail: session.email || '' })}
    </section>`,
    mount: (root) => {
      const form = root.querySelector('#supplier-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const data = checkSupplierForm(form);
        if (!data) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const logo = await readImages(form.elements.logo.files, { maxBytes: LIMITS.MAX_LOGO_BYTES, max: 1 });
          const photos = await readImages(form.elements.photos.files, { maxBytes: LIMITS.MAX_PHOTO_BYTES, max: LIMITS.MAX_PHOTOS });
          const saved = await store.suppliers.save({
            ...data,
            acceptTerms: undefined,
            logo: logo[0] || '',
            photos,
          }, { checkDuplicates: true });
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
          toast(err.message || 'Não foi possível enviar o cadastro.', 'error');
          button.disabled = false;
        }
      });
    },
  };
}

export { fieldError };

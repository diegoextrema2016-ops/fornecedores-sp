// Telas dos links de e-mail: pedir recuperação, criar nova senha, retorno de confirmação/troca de e-mail e "Minha conta".
import { SITE } from './config.js';
import { authFrameHtml } from './visual.js';
import { store } from './store.js';
import { api, authReturn } from './api.js';
import { go } from './nav.js';
import { escapeHtml as e, formatDate, isEmail } from './utils.js';
import { toast, breadcrumbs } from './ui.js';
import { authReturnErrorMessage, validateNewPassword, RECOVERY_MARK_KEY } from './auth-return.js';
import { subscriptionInfo } from './access.js';
import { avisoDoRetorno } from './pagamento.js';
import { guardaDestino } from './retorno.js';
import { confirmaCompra } from './rastreamento.js';

const fieldsOf = (form) => Object.fromEntries(new FormData(form).entries());

function showError(form, field, message) {
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  const el = form.querySelector(`#err-${field}`);
  if (el) el.textContent = message;
}

// Bloco de aviso padrão (sucesso, erro ou informação) com ações.
function notice({ title, text, tone = 'info', actions = [] }) {
  const links = actions.map((a) => `<a class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'}" href="${e(a.href)}">${e(a.label)}</a>`).join(' ');
  return `<div class="card auth-notice auth-${tone}" role="status">
    <h1>${e(title)}</h1>
    <p>${e(text)}</p>
    ${links ? `<p class="auth-actions">${links}</p>` : ''}
  </div>`;
}

const sessionStarted = () => (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RECOVERY_MARK_KEY) === '1' : false);
const clearRecoveryMark = () => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RECOVERY_MARK_KEY);
};

// ----- 1. Recuperação: pedido do link -----
export function forgotPasswordPage() {
  return {
    title: `Recuperar senha | ${SITE.shortName}`,
    description: 'Peça um link para criar uma nova senha.',
    noindex: true,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Entrar', href: '/login' }, { label: 'Recuperar senha' }])}
    ${authFrameHtml({
      eyebrow: 'Acesso à conta',
      title: 'Recuperar senha',
      lead: 'Enviaremos um link para criar uma nova senha no seu e-mail.',
      id: 'forgot-area',
      corpo: `
      <form class="form" id="forgot-form" novalidate>
        <p class="muted">Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha.</p>
        <div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <button class="btn btn-primary btn-lg" type="submit">Enviar link</button>
        <p class="muted small"><a href="/login">Voltar para entrar</a></p>
      </form>`,
    })}`,
    mount: (root) => {
      const form = root.querySelector('#forgot-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { email = '' } = fieldsOf(form);
        if (!email.trim()) return showError(form, 'email', 'Informe seu e-mail.');
        if (!isEmail(email)) return showError(form, 'email', 'Informe um e-mail válido.');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await store.auth.requestPasswordReset(email);
          root.querySelector('#forgot-area').innerHTML = notice({
            title: 'Verifique seu e-mail',
            text: 'Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha em instantes. Confira também a pasta de spam.',
            actions: [{ label: 'Voltar para entrar', href: '/login', primary: true }],
          });
        } catch (err) {
          showError(form, 'email', err.message);
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

// ----- 2. Recuperação: nova senha (link do e-mail) -----
export function resetPasswordPage() {
  return {
    title: `Nova senha | ${SITE.shortName}`,
    description: 'Crie uma nova senha para sua conta.',
    noindex: true,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Nova senha' }])}
    ${authFrameHtml({
      eyebrow: 'Recuperação de senha',
      title: 'Criar nova senha',
      lead: 'Escolha uma senha nova para voltar a acessar a sua conta.',
      id: 'reset-area',
      corpo: '<p class="muted" aria-busy="true">Verificando seu link…</p>',
    })}`,
    mount: async (root) => {
      const area = root.querySelector('#reset-area');
      const expired = (text) => {
        clearRecoveryMark();
        area.innerHTML = notice({
          title: 'Link inválido ou expirado',
          text,
          tone: 'error',
          actions: [{ label: 'Pedir novo link', href: '/esqueci-senha', primary: true }],
        });
      };

      // Link recebido com erro (expirado, já usado ou inválido).
      if (authReturn?.kind === 'error') return expired(authReturnErrorMessage(authReturn));

      // Sem o marcador de recuperação (ex.: alguém abriu a página direto), não há o que trocar.
      const user = await api.currentUser().catch(() => null);
      if (!sessionStarted() || !user) {
        return expired('Este link não está mais válido ou já foi usado. Solicite um novo link de recuperação.');
      }

      area.removeAttribute('aria-busy');
      area.innerHTML = `
        <h2>Nova senha</h2>
        <form class="card form" id="reset-form" novalidate>
          <div class="field"><label for="n-pass">Nova senha (mínimo 8 caracteres)</label><input id="n-pass" name="password" type="password" required autocomplete="new-password"><span class="field-error" id="err-password" role="alert"></span></div>
          <div class="field"><label for="n-conf">Confirmar nova senha</label><input id="n-conf" name="confirm" type="password" required autocomplete="new-password"><span class="field-error" id="err-confirm" role="alert"></span></div>
          <button class="btn btn-primary btn-lg" type="submit">Salvar nova senha</button>
        </form>`;
      const form = area.querySelector('#reset-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { password = '', confirm = '' } = fieldsOf(form);
        const problem = validateNewPassword(password, confirm);
        if (problem) {
          return showError(form, problem.startsWith('As senhas') ? 'confirm' : 'password', problem);
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await store.auth.updatePassword(password);
          clearRecoveryMark();
          // Encerra a sessão de recuperação: o usuário entra de novo com a senha nova.
          await store.auth.signOut();
          area.innerHTML = notice({
            title: 'Senha atualizada',
            text: 'Sua senha foi alterada com sucesso. Entre na sua conta com a nova senha.',
            tone: 'success',
            actions: [{ label: 'Entrar', href: '/login', primary: true }],
          });
        } catch (err) {
          showError(form, 'password', err.message);
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

// ----- 3. Retorno de confirmação de cadastro e de troca de e-mail -----
export function authReturnPage() {
  return {
    title: `Confirmação | ${SITE.shortName}`,
    description: 'Confirmação de e-mail.',
    noindex: true,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Confirmação' }])}
    <section class="container section-tight narrow" id="return-area" aria-busy="true">
      <p class="muted">Confirmando…</p>
    </section>`,
    mount: async (root) => {
      const area = root.querySelector('#return-area');
      const user = await api.currentUser().catch(() => null);

      if (authReturn?.kind === 'error') {
        const isEmailChange = authReturn.type === 'email_change';
        area.innerHTML = notice({
          title: 'Não foi possível confirmar',
          text: authReturnErrorMessage(authReturn),
          tone: 'error',
          actions: isEmailChange
            ? [{ label: 'Minha conta', href: '/conta', primary: true }]
            : [{ label: 'Entrar', href: '/login', primary: true }, { label: 'Pedir novo e-mail de confirmação', href: '/reenviar-confirmacao' }],
        });
        return;
      }

      if (authReturn?.kind === 'success' && authReturn.type === 'email_change') {
        // Enquanto o Supabase tem uma troca pendente, o usuário ainda traz o e-mail antigo e um new_email.
        const pending = user?.new_email && user.new_email !== user.email;
        area.innerHTML = pending
          ? notice({
            title: 'Falta uma confirmação',
            text: `Recebemos a sua confirmação. A troca para ${user.new_email} só termina quando o link do outro endereço também for confirmado. Verifique o e-mail enviado.`,
            actions: [{ label: 'Minha conta', href: '/conta', primary: true }],
          })
          : notice({
            title: 'E-mail atualizado',
            text: user?.email
              ? `Seu endereço de acesso agora é ${user.email}.`
              : 'Seu novo endereço de e-mail foi confirmado. Entre com ele a partir de agora.',
            tone: 'success',
            actions: [{ label: 'Minha conta', href: '/conta', primary: true }],
          });
        return;
      }

      if (authReturn?.kind === 'success' && user) {
        area.innerHTML = notice({
          title: 'Cadastro confirmado',
          text: 'Sua conta está ativa e você já pode usar o site.',
          tone: 'success',
          actions: [{ label: 'Ir para os fornecedores', href: '/fornecedores', primary: true }],
        });
        return;
      }

      area.innerHTML = notice({
        title: 'Nada para confirmar aqui',
        text: 'Este endereço não traz uma confirmação pendente. Se você veio de um e-mail, use o link mais recente que recebeu.',
        actions: [{ label: 'Entrar', href: '/login', primary: true }],
      });
    },
  };
}

// ----- 3b. Pedir novo e-mail de confirmação de cadastro (link expirado) -----
export function resendConfirmationPage() {
  return {
    title: `Reenviar confirmação | ${SITE.shortName}`,
    description: 'Peça um novo e-mail de confirmação de cadastro.',
    noindex: true,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Entrar', href: '/login' }, { label: 'Reenviar confirmação' }])}
    ${authFrameHtml({
      eyebrow: 'Confirmação de e-mail',
      title: 'Pedir novo e-mail de confirmação',
      lead: 'O link de confirmação expirou ou não chegou? Envie outro para o seu e-mail.',
      id: 'resend-area',
      corpo: `
      <form class="form" id="resend-form" novalidate>
        <p class="muted">Informe o e-mail usado no cadastro. Se a conta ainda não estiver confirmada, enviaremos um novo link.</p>
        <div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
        <button class="btn btn-primary btn-lg" type="submit">Enviar novo link</button>
      </form>`,
    })}`,
    mount: (root) => {
      const form = root.querySelector('#resend-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { email = '' } = fieldsOf(form);
        if (!email.trim()) return showError(form, 'email', 'Informe seu e-mail.');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await store.auth.resendConfirmation(email);
          root.querySelector('#resend-area').innerHTML = notice({
            title: 'Verifique seu e-mail',
            text: 'Se houver um cadastro pendente com este e-mail, você recebe um novo link de confirmação. Use apenas o link mais recente.',
            actions: [{ label: 'Entrar', href: '/login', primary: true }],
          });
        } catch (err) {
          showError(form, 'email', err.message);
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

// ----- 4. Minha conta: troca de e-mail -----
// Situação do acesso aos fornecedores, lida do banco (nunca do endereço da página).
function acessoHtml() {
  const sessao = store.session.get();
  if (sessao?.role === 'admin') {
    return '<div class="card"><h2>Acesso aos fornecedores</h2><p>Administradores têm acesso completo.</p></div>';
  }
  const sub = subscriptionInfo();
  if (store.subscriptions.isActive()) {
    return `<div class="card"><h2>Acesso aos fornecedores</h2>
      <p>Seu acesso está <strong>ativo até ${e(formatDate(sub.expiresAt))}</strong>.</p>
      <p class="auth-actions"><a class="btn btn-primary" href="/fornecedores">Ver fornecedores</a> <a class="btn btn-ghost" href="/planos">Renovar</a></p></div>`;
  }
  const pendente = sub?.status === 'pending';
  return `<div class="card"><h2>Acesso aos fornecedores</h2>
    <p>${pendente ? 'Você tem um pagamento aguardando confirmação do Mercado Pago. O acesso é liberado automaticamente quando ele for confirmado.' : 'Você ainda não tem acesso ativo aos contatos dos fornecedores.'}</p>
    <p class="auth-actions"><a class="btn btn-primary" href="/planos">Ver planos de acesso</a></p></div>`;
}

function retornoHtml(aviso) {
  if (!aviso) return '';
  const classe = aviso.tom === 'erro' ? 'notice notice-warn' : 'notice notice-info';
  return `<div class="${classe}" role="status"><span><strong>${e(aviso.titulo)}.</strong> ${e(aviso.texto)}</span></div>`;
}

export function accountPage(query) {
  const parametro = query?.get('pagamento') || '';
  return {
    title: `Minha conta | ${SITE.shortName}`,
    description: 'Dados da sua conta.',
    noindex: true,
    html: `
    ${breadcrumbs([{ label: 'Início', href: '/site' }, { label: 'Minha conta' }])}
    <section class="container section-tight narrow" id="account-area" aria-busy="true">
      <p class="muted">Carregando sua conta…</p>
    </section>`,
    mount: async (root) => {
      const area = root.querySelector('#account-area');
      const user = await api.currentUser().catch(() => null);
      if (!user) {
        // Sessão expirada na volta do pagamento: depois de entrar, a pessoa retorna a esta tela com o aviso.
        guardaDestino('/conta' + (avisoDoRetorno(parametro) ? `?pagamento=${parametro}` : ''));
        return go('/login', { replace: true });
      }
      area.removeAttribute('aria-busy');
      area.innerHTML = `
        <h1>Minha conta</h1>
        <div data-retorno-pagamento></div>
        <div data-acesso></div>
        <div data-cadastro></div>
        <div class="card form">
          <p>E-mail atual: <strong>${e(user.email || '')}</strong></p>
          <form id="email-form" novalidate>
            <div class="field"><label for="a-email">Novo e-mail</label><input id="a-email" name="email" type="email" required autocomplete="email"><span class="field-error" id="err-email" role="alert"></span></div>
            <button class="btn btn-primary" type="submit">Alterar e-mail</button>
            <p class="muted small">Enviaremos um link de confirmação para o novo endereço. A troca só vale depois que você clicar nele. Até lá, continue entrando com o e-mail atual.</p>
          </form>
        </div>`;
      // Acesso e volta do checkout. Depois de "aprovado" ou "pendente", o site confere o banco algumas vezes
      // (a confirmação do Mercado Pago chega por conta própria, em geral em poucos segundos).
      const desenhaAcesso = () => {
        if (!area.isConnected) return false;
        area.querySelector('[data-retorno-pagamento]').innerHTML = retornoHtml(avisoDoRetorno(parametro, store.subscriptions.isActive()));
        area.querySelector('[data-acesso]').innerHTML = acessoHtml();
        // Purchase só para assinatura ativa criada neste navegador (ver js/rastreamento.js).
        // Isolado: uma falha do rastreamento não pode impedir a tela da conta de aparecer.
        try { confirmaCompra(store.subscriptions.list()); } catch { /* rastreamento não interfere na conta */ }
        return true;
      };
      desenhaAcesso();
      // Status do próprio cadastro de fornecedor: pendente, aprovado ou não aprovado. Só o dono vê.
      const ROTULO_CADASTRO = {
        pending: 'Aguardando aprovação. A equipe revisa o cadastro antes de publicar.',
        approved: 'Aprovado e publicado no catálogo.',
        rejected: 'Não aprovado. Fale com a equipe pela página Contato para saber o motivo.',
      };
      api.meusCadastros().then((lista) => {
        const caixa = area.querySelector('[data-cadastro]');
        if (!caixa || !area.isConnected || !lista.length) return;
        caixa.innerHTML = `<div class="card"><h2>Seu cadastro de fornecedor</h2>${lista.map((c) => `
          <p><strong>${e(c.name)}</strong><br><span class="muted">${e(ROTULO_CADASTRO[c.approval_status] || '')}</span></p>`).join('')}</div>`;
      }).catch(() => {});
      if (avisoDoRetorno(parametro, store.subscriptions.isActive())?.aguardando) {
        (async () => {
          for (let i = 0; i < 10; i++) {
            await new Promise((ok) => setTimeout(ok, 4000));
            if (!area.isConnected) return;
            await store.refresh().catch(() => {});
            if (!desenhaAcesso()) return;
            if (store.subscriptions.isActive()) return toast('Pagamento confirmado. Acesso liberado.');
          }
        })();
      }

      const form = area.querySelector('#email-form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { email = '' } = fieldsOf(form);
        if (!email.trim()) return showError(form, 'email', 'Informe o novo e-mail.');
        if (email.trim().toLowerCase() === (user.email || '').toLowerCase()) {
          return showError(form, 'email', 'Este já é o seu e-mail atual.');
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await store.auth.requestEmailChange(email);
          area.querySelector('form').innerHTML = `<p>Enviamos um link de confirmação para <strong>${e(email.trim())}</strong>. Abra o e-mail e clique no link para concluir a troca.</p>`;
          toast('Link enviado para o novo e-mail.');
        } catch (err) {
          showError(form, 'email', err.message);
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

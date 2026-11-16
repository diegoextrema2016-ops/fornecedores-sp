// Regras do formulário de contato. Módulo puro (sem rede nem navegador), testável no Node.
// O banco repete estas regras na função envia_mensagem_contato (supabase/migration-018): a validação
// daqui serve para avisar a pessoa na hora; quem decide de fato é o servidor.
import { isEmail } from './utils.js';

export const LIMITES_CONTATO = {
  nome: { min: 2, max: 80 },
  email: { min: 5, max: 160 },
  assunto: { min: 3, max: 120 },
  mensagem: { min: 10, max: 2000 },
  links: 2,
};

const umaLinha = (v = '') => String(v).replace(/\s+/g, ' ').trim();

// Normaliza os campos como o servidor faz.
export function limpaContato({ nome = '', email = '', assunto = '', mensagem = '', site = '' } = {}) {
  return {
    nome: umaLinha(nome),
    email: String(email).trim().toLowerCase(),
    assunto: umaLinha(assunto),
    mensagem: String(mensagem).trim(),
    site: String(site),
  };
}

const fora = (texto, { min, max }) => texto.length < min || texto.length > max;

// Devolve { ok, errors, dados }: errors traz uma mensagem por campo.
export function validaContato(entrada) {
  const d = limpaContato(entrada);
  const L = LIMITES_CONTATO;
  const errors = {};
  if (fora(d.nome, L.nome)) errors.nome = `Informe seu nome (de ${L.nome.min} a ${L.nome.max} caracteres).`;
  if (fora(d.email, L.email) || !isEmail(d.email)) errors.email = 'Informe um e-mail válido.';
  if (fora(d.assunto, L.assunto)) errors.assunto = `Informe o assunto (de ${L.assunto.min} a ${L.assunto.max} caracteres).`;
  if (fora(d.mensagem, L.mensagem)) errors.mensagem = `A mensagem deve ter de ${L.mensagem.min} a ${L.mensagem.max} caracteres.`;
  else if ((`${d.mensagem} ${d.assunto}`.match(/https?:\/\/|www\./gi) || []).length > L.links) {
    errors.mensagem = `A mensagem tem links demais. Envie no máximo ${L.links} links.`;
  }
  return { ok: Object.keys(errors).length === 0, errors, dados: d };
}

// Mensagem de erro para a pessoa. O banco manda textos prontos (código P0001); o resto vira aviso genérico.
export function erroDeContato(err, emailDoSite = '') {
  if (err && err.code === 'P0001' && err.message) return err.message;
  return `Não foi possível enviar agora. Tente de novo em instantes${emailDoSite ? ` ou escreva para ${emailDoSite}` : ''}.`;
}

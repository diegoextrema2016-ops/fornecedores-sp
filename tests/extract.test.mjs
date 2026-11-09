import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSupplierText, instagramKey, phoneKey } from '../js/extract.js';

const cats = [
  { slug: 'moda-feminina', name: 'Moda feminina' },
  { slug: 'moda-masculina', name: 'Moda masculina' },
  { slug: 'tenis', name: 'Tênis' },
];
const regions = [{ slug: 'bras', name: 'Brás' }, { slug: 'pari', name: 'Pari' }];
const opts = { categories: cats, regions };

test('texto vazio não inventa nada', () => {
  const r = parseSupplierText('', opts);
  assert.equal(r.name, '');
  assert.equal(r.instagram, '');
  assert.equal(r.whatsapp, '');
  assert.equal(r.address, '');
  assert.equal(r.description, '');
  assert.deepEqual(r.notes, []);
});

test('Instagram por @ e por URL', () => {
  assert.equal(parseSupplierText('Loja\n@minhaloja', opts).instagram, '@minhaloja');
  assert.equal(parseSupplierText('veja instagram.com/minhaloja.br/', opts).instagram, '@minhaloja.br');
});

test('URL de post ou página reservada não vira Instagram', () => {
  assert.equal(parseSupplierText('instagram.com/p/ABC123', opts).instagram, '');
});

test('e-mail não é confundido com @ do Instagram', () => {
  const r = parseSupplierText('contato: vendas@loja.com.br', opts);
  assert.equal(r.instagram, '');
  assert.equal(r.email, 'vendas@loja.com.br');
});

test('WhatsApp marcado na frase tem prioridade sobre telefone solto', () => {
  const r = parseSupplierText('Tel (11) 3333-4444\nWhatsApp (11) 91234-5678', opts);
  assert.equal(r.whatsapp, '11912345678');
  assert.equal(r.notes.some((n) => n.includes('sem a palavra WhatsApp')), false);
});

test('telefone sem marcação de WhatsApp preenche o campo e avisa', () => {
  const r = parseSupplierText('Fone: (11) 3333-4444', opts);
  assert.equal(r.whatsapp, '1133334444');
  assert.ok(r.notes.some((n) => n.includes('sem a palavra WhatsApp')));
});

test('link wa.me gera WhatsApp e link', () => {
  const r = parseSupplierText('Fale: https://wa.me/5511987654321', opts);
  assert.equal(r.whatsapp, '11987654321');
  assert.equal(r.whatsappUrl, 'https://wa.me/5511987654321');
});

test('endereço com número e CEP', () => {
  const r = parseSupplierText('Rua Coronel Xavier de Toledo, 123 - Brás\nCEP 01048000', opts);
  assert.equal(r.address, 'Rua Coronel Xavier de Toledo');
  assert.equal(r.number, '123');
  assert.equal(r.cep, '01048-000');
});

test('bairro é reconhecido pelo nome cadastrado, sem acento', () => {
  assert.equal(parseSupplierText('Atendemos no Bras', opts).bairro, 'bras');
  assert.equal(parseSupplierText('Sem bairro aqui', opts).bairro, '');
});

test('site não pega Instagram, WhatsApp nem e-mail', () => {
  assert.equal(parseSupplierText('instagram.com/loja wa.me/5511987654321 a@b.com.br', opts).site, '');
  assert.equal(parseSupplierText('Site: www.minhaloja.com.br/produtos', opts).site, 'www.minhaloja.com.br/produtos');
});

test('categoria só é sugerida quando é clara', () => {
  assert.equal(parseSupplierText('Vendemos tênis atacado', opts).category, 'tenis');
  assert.equal(parseSupplierText('Moda feminina e masculina', opts).category, '');
  assert.equal(parseSupplierText('Eletrônicos', opts).category, '');
});

test('nome vem da primeira linha que parece nome', () => {
  const r = parseSupplierText('@loja\nVazevedo Modas\nRoupas em geral', opts);
  assert.equal(r.name, 'Vazevedo Modas');
});

test('descrição deixa de fora linhas de contato e endereço', () => {
  const r = parseSupplierText('Vazevedo Modas\n@vazevedo\nRoupas femininas para revenda\nWhatsApp (11) 91234-5678\nRua das Flores, 10', opts);
  assert.equal(r.description, 'Roupas femininas para revenda');
});

test('descrição tem no máximo 600 caracteres', () => {
  const r = parseSupplierText('Nome\n' + 'a'.repeat(900), opts);
  assert.equal(r.description.length, 600);
});

test('chaves de comparação ignoram DDI, máscara e @', () => {
  assert.equal(phoneKey('+55 (11) 91234-5678'), '11912345678');
  assert.equal(phoneKey('11912345678'), '11912345678');
  assert.equal(phoneKey('1133334444'), '1133334444');
  assert.equal(phoneKey('123'), '');
  assert.equal(instagramKey('@MinhaLoja'), 'minhaloja');
  assert.equal(instagramKey('https://www.instagram.com/MinhaLoja/'), 'minhaloja');
});

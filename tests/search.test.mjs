import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSuppliers, sortSuppliers, paginate, tokenize, normalize } from '../js/search.js';
import { CATEGORIES, REGIONS } from '../js/data.js';
import { DEMO_FIXTURES } from './fixtures-demo.mjs';
import { slugify, mapsLink, whatsappLink, validateSupplier, isBrazilPhone, maskPhone, maskHandle, formatPhone } from '../js/utils.js';

const approved = DEMO_FIXTURES.map((s, i) => ({ ...s, id: `t${i}`, slug: slugify(s.name), status: 'approved' }));
const ctx = {
  categoryNames: Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.name])),
  regionNames: Object.fromEntries(REGIONS.map((r) => [r.slug, r.name])),
};

test('normaliza acentos e caixa', () => {
  assert.equal(normalize('Relógios  DE   Pari'), 'relogios  de   pari');
  assert.deepEqual(tokenize(' Tênis, Pari '), ['tenis', 'pari']);
});

test('busca sem acento encontra categoria com acento', () => {
  const r = filterSuppliers(approved, { query: 'tenis' }, ctx);
  assert.ok(r.some((s) => s.category === 'tenis'));
});

test('busca por bairro (região) funciona', () => {
  const r = filterSuppliers(approved, { query: 'brás' }, ctx);
  assert.ok(r.length >= 3);
  assert.ok(r.every((s) => s.bairro === 'bras' || s.description.toLowerCase().includes('brás')));
});

test('todos os termos precisam aparecer (AND)', () => {
  assert.equal(filterSuppliers(approved, { query: 'tenis eletronicos' }, ctx).length, 0);
});

test('filtro por categoria, região, atacado e verificado combinados', () => {
  const r = filterSuppliers(approved, { category: 'capinhas-celular', verified: true, wholesale: true }, ctx);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'Capinhas & Cia Demo');
});

test('filtro de varejo retorna só quem vende varejo', () => {
  const r = filterSuppliers(approved, { retail: true }, ctx);
  assert.ok(r.length > 0);
  assert.ok(r.every((s) => s.saleRetail === true));
});

test('filtro de WhatsApp ignora fornecedores sem número', () => {
  const withPhone = approved.map((s, i) => (i === 0 ? { ...s, whatsapp: '11999999999' } : s));
  const r = filterSuppliers(withPhone, { whatsapp: true }, ctx);
  assert.equal(r.length, 1);
});

test('nunca retorna pendentes ou rejeitados', () => {
  const mixed = [...approved, { ...approved[0], id: 'x', status: 'pending', name: 'Pendente Teste' }];
  assert.ok(!filterSuppliers(mixed, { query: 'Pendente' }, ctx).length);
});

test('ordenação por nome e por visualizações', () => {
  const byName = sortSuppliers(approved, 'name');
  assert.ok(byName[0].name.localeCompare(byName[1].name, 'pt-BR') <= 0);
  const byViews = sortSuppliers(approved, 'views');
  assert.ok(byViews[0].views >= byViews[byViews.length - 1].views);
});

test('paginação calcula páginas e limita a página pedida', () => {
  const p = paginate(approved, 99, 5);
  assert.equal(p.totalPages, Math.ceil(approved.length / 5));
  assert.equal(p.page, p.totalPages);
  assert.ok(p.items.length <= 5);
});

test('slugify remove acentos e símbolos', () => {
  assert.equal(slugify('Capinhas & Cia Demo'), 'capinhas-e-cia-demo');
  assert.equal(slugify('Óculos Horizonte'), 'oculos-horizonte');
});

test('links de WhatsApp e Maps', () => {
  assert.equal(whatsappLink('(11) 98765-4321', 'oi'), 'https://wa.me/5511987654321?text=oi');
  assert.equal(whatsappLink(''), '');
  assert.ok(mapsLink({ address: 'Rua Exemplo', number: '10', bairro: 'Brás' }).includes('Rua%20Exemplo'));
});

test('validação de cadastro aponta campos faltantes e formatos inválidos', () => {
  const r = validateSupplier({ name: '', email: 'x', cep: '123', saleWholesale: false, acceptTerms: false });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name && r.errors.email && r.errors.cep && r.errors.sale && r.errors.acceptTerms);
});

test('telefone brasileiro: aceita 10 ou 11 dígitos, com ou sem DDI', () => {
  assert.equal(isBrazilPhone('11987654321'), true);
  assert.equal(isBrazilPhone('5511987654321'), true);
  assert.equal(isBrazilPhone('123'), false);
});

test('admin não precisa aceitar termos (requireTerms: false)', () => {
  const base = { name: 'X', responsible: 'R', email: 'a@b.com', category: 'bolsas', address: 'Rua', number: '1', bairro: 'bras', cep: '03000000', description: 'd', supplierType: 'fabricante', saleWholesale: true };
  assert.equal(validateSupplier({ ...base, acceptTerms: false }, { requireTerms: false }).ok, true);
  assert.equal(validateSupplier({ ...base, acceptTerms: false }).ok, false);
});

test('máscara de telefone esconde o meio e mantém DDD e final', () => {
  assert.equal(maskPhone('11987654321'), '(11) 9****-**21');
  assert.equal(maskPhone('5511987654321'), '(11) 9****-**21');
  assert.equal(maskPhone('1132654321'), '(11) ****-**21');
  assert.equal(maskPhone(''), '');
});

test('formatPhone monta o número completo', () => {
  assert.equal(formatPhone('11987654321'), '(11) 98765-4321');
  assert.equal(formatPhone('1132654321'), '(11) 3265-4321');
});

test('máscara do Instagram não revela o nome inteiro', () => {
  const m = maskHandle('@joaoloja');
  assert.ok(m.startsWith('@joa'));
  assert.ok(!m.includes('loja'));
});

test('ícone do WhatsApp: número tem prioridade, senão usa o link cadastrado', async () => {
  const { whatsappTarget } = await import('../js/utils.js');
  assert.equal(whatsappTarget({ whatsapp: '11987654321', whatsappUrl: 'https://wa.me/x' }, 'oi'), 'https://wa.me/5511987654321?text=oi');
  assert.equal(whatsappTarget({ whatsapp: '', whatsappUrl: 'linkdeloja.com/zap' }), 'https://linkdeloja.com/zap');
  assert.equal(whatsappTarget({ whatsapp: '', whatsappUrl: '' }), '');
  assert.equal(whatsappTarget({}), '');
});

test('filtro de WhatsApp aceita fornecedor que só tem link', () => {
  const withLink = approved.map((s, i) => (i === 0 ? { ...s, whatsapp: '', whatsappUrl: 'https://wa.me/5511999999999' } : { ...s, whatsapp: '' }));
  const r = filterSuppliers(withLink, { whatsapp: true }, ctx);
  assert.equal(r.length, 1);
});

test('validação rejeita link de WhatsApp inválido', () => {
  const base = { name: 'X', responsible: 'R', email: 'a@b.com', category: 'bolsas', address: 'Rua', number: '1', bairro: 'bras', cep: '03000000', description: 'd', supplierType: 'fabricante', saleWholesale: true, acceptTerms: true };
  assert.equal(validateSupplier({ ...base, whatsappUrl: 'https://wa.me/5511999999999' }).ok, true);
  assert.equal(validateSupplier({ ...base, whatsappUrl: 'sem-ponto' }).ok, false);
});

test('administrador: nenhum campo é obrigatório (required: false)', () => {
  assert.equal(validateSupplier({ name: '' }, { requireTerms: false, required: false }).ok, true);
  assert.equal(validateSupplier({ name: '', cep: '123' }, { requireTerms: false, required: false }).ok, false, 'formato continua valendo quando preenchido');
  assert.equal(validateSupplier({ name: '' }).ok, false, 'cadastro público continua exigindo');
});

import { rankCategoriesByAccess } from '../js/search.js';

test('rankCategoriesByAccess soma acessos por categoria e ordena do mais acessado', () => {
  const cats = [{ slug: 'a', name: 'Alfa' }, { slug: 'b', name: 'Beta' }, { slug: 'c', name: 'Gama' }];
  const sups = [
    { category: 'a', views: 10 }, { category: 'a', views: 5 },
    { category: 'b', views: 40 },
    { category: 'c', views: 0 },
    { category: 'x', views: 999 },
  ];
  const ranked = rankCategoriesByAccess(cats, sups);
  assert.deepEqual(ranked.map((r) => r.category.slug), ['b', 'a', 'c']);
  assert.equal(ranked[1].accesses, 15);
  assert.equal(ranked[1].suppliers, 2);
  assert.deepEqual(rankCategoriesByAccess(cats, []), []);
});

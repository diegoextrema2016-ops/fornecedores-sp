// Sugestões de descrição comercial: texto dentro do limite, com a categoria e as vendas marcadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirDescricao } from '../js/descricao.js';

test('sugestão cabe em 600 caracteres e não fica vazia', () => {
  for (let i = 0; i < 200; i++) {
    const texto = sugerirDescricao({ categoria: 'Moda feminina', atacado: true, varejo: true, lojistas: true, outrasCidades: true });
    assert.ok(texto.length > 0 && texto.length <= 600);
  }
});

test('sugestão usa a categoria e as vendas marcadas', () => {
  const sempre = () => 0;
  const texto = sugerirDescricao({ categoria: 'Tênis', atacado: true, outrasCidades: true }, sempre);
  assert.match(texto, /tênis/);
  assert.match(texto, /atacado/i);
  assert.match(texto, /outras cidades/);
  assert.doesNotMatch(texto, /varejo/i);
});

test('sem categoria a sugestão ainda é válida', () => {
  const texto = sugerirDescricao({});
  assert.ok(texto.length > 20);
  assert.doesNotMatch(texto, /\{cat\}/);
});

test('sugestões variam com o sorteio', () => {
  const valores = new Set();
  for (let i = 0; i < 30; i++) valores.add(sugerirDescricao({ categoria: 'Bolsas' }));
  assert.ok(valores.size > 1);
});

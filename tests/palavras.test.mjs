import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirPalavras } from '../js/descricao.js';

test('palavras-chave saem da categoria, da orientação e da descrição', () => {
  const texto = sugerirPalavras({ categoria: 'Moda Feminina', instrucao: 'vestidos de verão', descricao: 'Loja de blusas' });
  const lista = texto.split(', ');
  assert.ok(lista.includes('moda'));
  assert.ok(lista.includes('feminina'));
  assert.ok(lista.includes('vestidos'));
  assert.ok(lista.includes('blusas'));
});

test('palavras-chave não repetem e não trazem palavras de ligação', () => {
  const texto = sugerirPalavras({ categoria: 'Moda', descricao: 'moda para a loja e moda de praia' });
  const lista = texto.split(', ');
  assert.equal(new Set(lista).size, lista.length);
  assert.ok(!lista.includes('para'));
  assert.ok(!lista.includes('de'));
});

test('no máximo 8 palavras-chave', () => {
  const texto = sugerirPalavras({ descricao: 'um dois três quatro cinco seis sete oito nove dez onze doze' });
  assert.ok(texto.split(', ').length <= 8);
});

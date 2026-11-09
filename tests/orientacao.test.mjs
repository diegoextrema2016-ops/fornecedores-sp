import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirDescricao } from '../js/descricao.js';

test('sugestão pronta usa a orientação do fornecedor no texto', () => {
  const texto = sugerirDescricao({ categoria: 'Moda', instrucao: 'somos fabricantes e entregamos rápido' });
  assert.match(texto, /somos fabricantes e entregamos rápido\./);
});

test('orientação com ponto final não ganha ponto duplicado', () => {
  const texto = sugerirDescricao({ instrucao: 'Peças de inverno.' });
  assert.ok(texto.startsWith('Peças de inverno. '));
  assert.ok(!texto.includes('..'));
});

test('sem orientação, a sugestão continua como antes', () => {
  const texto = sugerirDescricao({ categoria: 'Moda' }, () => 0);
  assert.ok(texto.length > 0 && texto.length <= 600);
});

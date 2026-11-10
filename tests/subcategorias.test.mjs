import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSuppliers, temSubcategoria, subcategoriasDoFornecedor } from '../js/search.js';

const base = (extra) => ({ status: 'approved', category: 'moda-feminina', bairro: 'bras', name: 'Loja', ...extra });

test('separa as subcategorias do texto do fornecedor', () => {
  assert.deepEqual(subcategoriasDoFornecedor('Jeans, Vestidos , Shorts'), ['Jeans', 'Vestidos', 'Shorts']);
  assert.deepEqual(subcategoriasDoFornecedor(''), []);
});

test('encontra a subcategoria sem diferenciar maiúsculas e acentos', () => {
  const s = base({ subcategory: 'Peças Premium, Vestidos' });
  assert.equal(temSubcategoria(s, 'pecas premium'), true);
  assert.equal(temSubcategoria(s, 'VESTIDOS'), true);
  assert.equal(temSubcategoria(s, 'Jeans'), false);
});

test('filtro por subcategoria devolve o fornecedor uma vez só', () => {
  const lista = [
    base({ id: 1, subcategory: 'Jeans, Vestidos, Shorts' }),
    base({ id: 2, subcategory: 'Moda Balada' }),
    base({ id: 3, subcategory: 'Vestidos' }),
  ];
  const achados = filterSuppliers(lista, { subcategory: 'Vestidos' }, {});
  assert.deepEqual(achados.map((s) => s.id).sort(), [1, 3]);
  assert.equal(new Set(achados.map((s) => s.id)).size, achados.length);
});

test('subcategoria combina com a categoria e com os outros filtros', () => {
  const lista = [
    base({ id: 1, subcategory: 'Vestidos' }),
    base({ id: 2, category: 'calcados', subcategory: 'Vestidos' }),
    base({ id: 3, subcategory: 'Vestidos', bairro: 'pari' }),
  ];
  const achados = filterSuppliers(lista, { category: 'moda-feminina', subcategory: 'Vestidos', bairro: 'bras' }, {});
  assert.deepEqual(achados.map((s) => s.id), [1]);
});

test('sem subcategoria selecionada, a lista não muda', () => {
  const lista = [base({ id: 1, subcategory: 'Jeans' }), base({ id: 2 })];
  assert.equal(filterSuppliers(lista, {}, {}).length, 2);
});

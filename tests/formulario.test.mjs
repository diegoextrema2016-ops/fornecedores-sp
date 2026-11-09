// Garante que as funções de leitura e validação do formulário de fornecedor continuam no módulo.
// (Uma remoção acidental dessas funções deixava o salvamento de fornecedores quebrado.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('forms.js define readSupplierForm e checkSupplierForm', async () => {
  const src = await readFile(new URL('../js/forms.js', import.meta.url), 'utf8');
  assert.match(src, /export function readSupplierForm\(/);
  assert.match(src, /export function checkSupplierForm\(/);
});

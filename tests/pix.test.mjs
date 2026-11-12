import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16Ccitt, pixPayload } from '../js/utils.js';

test('CRC-16/CCITT-FALSE bate com o vetor oficial', () => {
  assert.equal(crc16Ccitt('123456789'), '29B1');
});

test('código Pix de R$ 29,90 para a chave aleatória do site', () => {
  const code = pixPayload({ key: '00b688a6-06bc-43d1-babe-89c49f8878ba', amount: 29.9, name: 'FORNECEDORES ATACADO SP', city: 'SAO PAULO' });
  assert.equal(
    code,
    '00020126580014br.gov.bcb.pix013600b688a6-06bc-43d1-babe-89c49f8878ba520400005303986540529.905802BR5923FORNECEDORES ATACADO SP6009SAO PAULO62070503***6304B240',
  );
});

test('nome e cidade respeitam os limites do padrão Pix', () => {
  const code = pixPayload({ key: '00b688a6-06bc-43d1-babe-89c49f8878ba', amount: 10, name: 'X'.repeat(40), city: 'Y'.repeat(30) });
  assert.match(code, /5925X{25}/);
  assert.match(code, /6015Y{15}/);
});

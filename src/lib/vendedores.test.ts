import assert from 'node:assert/strict';
import test from 'node:test';
import { SELECT_VENDEDORES } from './vendedores';

test('consulta vendedores usando aliases para as colunas reais do banco', () => {
  assert.match(SELECT_VENDEDORES, /quantos_lead:"Quantos lead"/);
  assert.match(SELECT_VENDEDORES, /atender:"Atender"/);
  assert.match(SELECT_VENDEDORES, /ativo:"ATIVO"/);
  assert.doesNotMatch(SELECT_VENDEDORES, /id_click/);
});

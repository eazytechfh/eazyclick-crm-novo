import assert from 'node:assert/strict';
import test from 'node:test';
import { carregarTodosLeads, deduplicarLeads } from './carregar-leads';

type LeadTeste = {
  id: number;
  telefone: string | null;
  email: string | null;
};

test('deduplica por telefone normalizado e preserva o registro mais recente', () => {
  const resultado = deduplicarLeads<LeadTeste>([
    { id: 3, telefone: '(11) 99999-0000', email: 'novo@exemplo.com' },
    { id: 2, telefone: '11999990000', email: 'antigo@exemplo.com' },
    { id: 1, telefone: '11988887777', email: null },
  ]);

  assert.deepEqual(resultado.leads.map((lead) => lead.id), [3, 1]);
  assert.equal(resultado.duplicadosRemovidos, 1);
});

test('usa e-mail como fallback e mantém leads sem telefone e sem e-mail', () => {
  const resultado = deduplicarLeads<LeadTeste>([
    { id: 4, telefone: null, email: ' CLIENTE@EXEMPLO.COM ' },
    { id: 3, telefone: '', email: 'cliente@exemplo.com' },
    { id: 2, telefone: null, email: null },
    { id: 1, telefone: '', email: '' },
  ]);

  assert.deepEqual(resultado.leads.map((lead) => lead.id), [4, 2, 1]);
  assert.equal(resultado.duplicadosRemovidos, 1);
});

test('busca páginas de mil registros até a última página', async () => {
  const ranges: Array<[number, number]> = [];
  const primeiraPagina = Array.from({ length: 1000 }, (_, index) => ({
    id: 2000 - index,
    telefone: String(10000000000 + index),
    email: null,
  }));
  const segundaPagina = [{ id: 1, telefone: '11999999999', email: null }];

  const supabase = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (inicio: number, fim: number) => {
            ranges.push([inicio, fim]);
            return { data: inicio === 0 ? primeiraPagina : segundaPagina, error: null };
          },
        }),
      }),
    }),
  };

  const resultado = await carregarTodosLeads<LeadTeste>(supabase, 'id, telefone, email');

  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(resultado.leads.length, 1001);
  assert.equal(resultado.error, null);
});

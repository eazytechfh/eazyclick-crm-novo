const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration normaliza a IA, registra timestamp no banco e bloqueia autoelevacao', () => {
  const sql = read('supabase/migrations/0015_lead_ia_e_protecao_cargo.sql').toLowerCase();
  assert.match(sql, /update public\."base_de_leads"[\s\S]*set bot_ativo = false[\s\S]*where bot_ativo is null/);
  assert.match(sql, /alter column bot_ativo set default false[\s\S]*alter column bot_ativo set not null/);
  assert.match(sql, /bot_ativo_alterado_em timestamptz/);
  assert.match(sql, /new\.bot_ativo is distinct from old\.bot_ativo[\s\S]*now\(\)/);
  assert.match(sql, /new\.bot_ativo_alterado_em := old\.bot_ativo_alterado_em/);
  assert.match(sql, /new\.cargo is distinct from old\.cargo/);
  assert.match(sql, /auth\.uid\(\) = old\.id[\s\S]*não é permitido alterar o próprio cargo/);
  assert.match(sql, /coalesce\(public\.get_my_cargo\(\), ''\) not in \('admin_master', 'admin', 'gerente'\)/);
  assert.match(sql, /new\.cargo = 'admin_master'[\s\S]*get_my_cargo\(\) <> 'admin_master'/);
  assert.match(sql, /errcode = '42501'/);
});

test('tipo do lead usa booleano e timestamp da IA', () => {
  const types = read('src/types/database.ts');
  assert.match(types, /bot_ativo:\s*boolean;/);
  assert.match(types, /bot_ativo_alterado_em:\s*string \| null;/);
});

test('rota de exclusao valida sessao cargo tenant e confirma o id removido', () => {
  const route = read('src/app/api/leads/[id]/route.ts');
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /admin_master.*admin.*gerente/s);
  assert.match(route, /\.eq\('id_empresa',\s*1\)/);
  assert.match(route, /\.delete\(\)[\s\S]*\.select\('id'\)/);
  assert.match(route, /leadRemovido\.id !== leadId/);
  assert.doesNotMatch(route, /createAdminClient|service_role/);
});

test('rota da IA valida entrada e exige transicao atomica confirmada', () => {
  const route = read('src/app/api/leads/[id]/ia/route.ts');
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /typeof ativo !== 'boolean'/);
  assert.match(route, /Number\.isSafeInteger\(leadId\)/);
  assert.match(route, /\.eq\('id_empresa',\s*1\)/);
  assert.match(route, /\.eq\('bot_ativo',\s*!ativo\)/);
  assert.match(route, /bot_ativo_alterado_em/);
  assert.match(route, /leadAtualizado\.id !== leadId/);
  assert.doesNotMatch(route, /n8n|webhook|createAdminClient|service_role/i);
});

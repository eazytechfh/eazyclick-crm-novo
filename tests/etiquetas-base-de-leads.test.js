const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '0014_etiquetas_na_base_de_leads.sql'
);

const migrationSql = () => fs.readFileSync(migrationPath, 'utf8').toLowerCase();

test('cria uma lista de ids de etiquetas e importa os vinculos existentes', () => {
  const sql = migrationSql();

  assert.match(sql, /add column if not exists etiquetas bigint\[\][\s\S]*default '\{\}'::bigint\[\]/);
  assert.match(sql, /array_agg\(le\.id_etiqueta order by le\.id_etiqueta\)/);
  assert.match(sql, /from public\.lead_etiquetas le/);
});

test('sincroniza a lista da base com a tabela de vinculos e valida os ids', () => {
  const sql = migrationSql();

  assert.match(sql, /from unnest\(coalesce\(new\.etiquetas, '\{\}'::bigint\[\]\)\)/);
  assert.match(sql, /left join public\.etiquetas e on e\.id = ids\.id_etiqueta/);
  assert.match(sql, /raise exception 'etiqueta com id % nao existe'/);
  assert.match(sql, /delete from public\.lead_etiquetas[\s\S]*id_etiqueta <> all \(new\.etiquetas\)/);
  assert.match(sql, /insert into public\.lead_etiquetas \(id_lead, id_etiqueta\)[\s\S]*unnest\(new\.etiquetas\)/);
  assert.match(sql, /after insert or update of etiquetas on public\."base_de_leads"/);
});

test('sincroniza alteracoes diretas nos vinculos de volta para a lista', () => {
  const sql = migrationSql();

  assert.match(sql, /update public\."base_de_leads"[\s\S]*set etiquetas = coalesce\([\s\S]*array_agg/);
  assert.match(sql, /after insert or delete on public\.lead_etiquetas/);
});

test('tipa a lista de etiquetas no modelo de lead', () => {
  const typesPath = path.join(__dirname, '..', 'src', 'types', 'database.ts');
  const types = fs.readFileSync(typesPath, 'utf8');

  assert.match(types, /interface BaseDeLeads[\s\S]*?etiquetas:\s*number\[\];/);
});

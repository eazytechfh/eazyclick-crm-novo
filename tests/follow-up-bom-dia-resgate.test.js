const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '0013_follow_up_bom_dia_para_resgate.sql');
const sql = () => fs.readFileSync(migrationPath, 'utf8').toLowerCase();

test('move apenas leads elegiveis que receberam bom dia do sistema', () => {
  const migration = sql();
  assert.match(migration, /insert\s+into\s+public\.pipeline_etapas[\s\S]*'resgate'/);
  assert.match(migration, /estagio_lead\s*=\s*'follow_up'/);
  assert.match(migration, /follow_manual::text[\s\S]*=\s*'ativo'/);
  assert.match(migration, /ja_recebeu_msg::text[\s\S]*=\s*'sim'/);
  assert.match(migration, /regexp_replace\(l\.telefone[\s\S]*regexp_replace\(new\.session_id::text/);
  assert.match(migration, /message\s*->>\s*'type'[\s\S]*=\s*'system'/);
  assert.match(migration, /message\s*->>\s*'content'[\s\S]*in\s*\(\s*'bom dia'\s*,\s*'bom dia'\s*\)/);
});

test('processa eventos futuros e historicos existentes', () => {
  const migration = sql();
  assert.match(migration, /after\s+insert\s+or\s+update\s+of\s+message\s*,\s*session_id/);
  assert.match(migration, /on\s+public\.alescar1_chat_histories/);
  assert.match(migration, /exists\s*\([\s\S]*from\s+public\.alescar1_chat_histories/);
  assert.match(migration, /regexp_replace\(h\.session_id::text[\s\S]*regexp_replace\(l\.telefone/);
});

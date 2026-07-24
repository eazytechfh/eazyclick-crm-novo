const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration protege fechamento, auditoria e estoque', () => {
  const sql = read('supabase/migrations/0016_auditoria_vendas_estoque.sql').toLowerCase();
  assert.match(sql, /create table if not exists public\.lead_logs/);
  assert.match(sql, /create index if not exists[\s\S]*id_lead[\s\S]*created_at desc/);
  assert.match(sql, /revoke insert, update, delete on public\.lead_logs/);
  assert.match(sql, /after insert or update on public\."base_de_leads"/);
  assert.match(sql, /new\.estagio_lead = 'fechado'/);
  assert.match(sql, /btrim\(new\.nome_lead\) = ''/);
  assert.match(sql, /new\.valor <= 0/);
  assert.match(sql, /create or replace function public\.fechar_venda/);
  assert.match(sql, /observacao_autor_nome/);
  assert.match(sql, /check \(status in \('disponivel', 'indisponivel', 'vendido'\)\)/);
});

test('watcher global cria baseline, polling e cleanup sem UI', () => {
  const source = read('src/components/LeadAssignedWatcher.tsx');
  assert.match(source, /INTERVALO_FALLBACK_MS = 180_000/);
  assert.match(source, /postgres_changes/);
  assert.match(source, /removeChannel/);
  assert.match(source, /clearInterval/);
  assert.match(source, /return null/);
  assert.match(source, /lead-assigned\.mp3/);
  assert.match(source, /\.eq\('vendedor', sellerName\)/);
  assert.match(source, /lead-assignments-changed/);
  assert.doesNotMatch(source, /\.eq\('id_empresa', 1\)/);
});

test('celebracao usa copy, duração e offsets exatos', () => {
  const source = read('src/components/SaleCelebration.tsx');
  assert.match(source, /Parabéns pela venda!/);
  assert.match(source, /CELEBRATION_DURATION_MS = 5_000/);
  assert.match(source, /animationDuration: `\$\{CELEBRATION_DURATION_MS\}ms`/);
  assert.match(source, /playAt\(engine, 11\)/);
  assert.match(source, /volume = 0\.58/);
  assert.match(source, /playAt\(money, 5\)/);
  assert.match(source, /volume = 0\.82/);
  assert.match(source, /function stopAndClose\(\)/);
  assert.match(source, /engine\.pause\(\);[\s\S]*engine\.currentTime = 0/);
  assert.match(source, /money\.pause\(\);[\s\S]*money\.currentTime = 0/);
  assert.match(source, /setTimeout\(stopAndClose, CELEBRATION_DURATION_MS\)/);
  assert.match(source, /removeEventListener\('loadedmetadata'/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /NEGÓCIO CONCLUÍDO/);
  assert.match(source, /avançou para a linha de chegada/);
  assert.match(source, /sale-speed-lines/);
  assert.match(source, /sale-car-glow/);
  assert.match(source, /sale-car-right-to-left/);
});

test('pipeline bloqueia fechamento inválido e celebra somente após confirmação', () => {
  const source = read('src/app/(app)/pipeline/page.tsx');
  assert.match(source, /validarFechamento/);
  assert.match(source, /fechamentoPendente/);
  assert.match(source, /SaleCelebration/);
  assert.match(source, /\.rpc\('fechar_venda'/);
  assert.match(source, /useCallback/);
  assert.match(source, /fecharCelebracao/);
  assert.match(source, /lead-assignments-changed/);
});

test('estoque inicia disponível e só confirma status retornado', () => {
  const source = read('src/app/(app)/estoque/page.tsx');
  assert.match(source, /useState\('disponivel'\)/);
  assert.match(source, /normalizarStatusEstoque/);
  assert.match(source, /\.select\('id, status'\)/);
  assert.match(source, /Erro ao alterar o status/);
});

test('drawer limita históricos, exibe logs e autoria persistida', () => {
  const source = read('src/components/LeadDrawer.tsx');
  assert.match(source, /Logs Gerais/);
  assert.match(source, /lead_logs/);
  assert.match(source, /\.limit\(50\)/);
  assert.match(source, /max-h-72 overflow-y-auto pr-1/);
  assert.match(source, /observacao_autor_nome/);
  assert.match(source, /observacao_atualizada_em/);
});

test('loading automotivo é central, acessível e reutilizado', () => {
  const loading = read('src/components/AutomotiveLoading.tsx');
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(read('src/app/(app)/pipeline/page.tsx'), /AutomotiveLoading/);
  assert.match(read('src/app/(app)/estoque/page.tsx'), /AutomotiveLoading/);
  assert.match(read('src/app/(app)/leads/page.tsx'), /AutomotiveLoading/);
});

test('lista de leads reage a atribuições sem refresh manual', () => {
  const source = read('src/app/(app)/leads/page.tsx');
  assert.match(source, /lead-assignments-changed/);
  assert.match(source, /addEventListener/);
  assert.match(source, /removeEventListener/);
});

test('migration corretiva retém auditoria, restringe RLS e habilita realtime', () => {
  const sql = read('supabase/migrations/0017_corrigir_auditoria_e_realtime.sql').toLowerCase();
  assert.match(sql, /drop constraint/);
  assert.match(sql, /lead_logs_select_authenticated/);
  assert.match(sql, /get_my_cargo\(\) in \('admin_master', 'admin', 'gerente'\)/);
  assert.match(sql, /after insert or update or delete/);
  assert.match(sql, /lead_excluido/);
  assert.match(sql, /campos_alterados/);
  assert.match(sql, /supabase_realtime/);
  assert.match(sql, /base_de_leads/);
});

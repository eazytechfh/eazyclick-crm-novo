const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('drawer confirma exclusao e trata loading erro e sucesso sem reload', () => {
  const drawer = read('src/components/LeadDrawer.tsx');
  assert.match(drawer, /Excluir lead/);
  assert.match(drawer, /Confirmar exclusão/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /aria-labelledby="confirmar-exclusao-titulo"/);
  assert.match(drawer, /document\.addEventListener\('keydown', controlarTeclado\)/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /focoAnterior.*\.focus\(\)/s);
  assert.match(drawer, /Excluindo\.\.\./);
  assert.match(drawer, /Não foi possível excluir o lead\. Verifique se você tem permissão para esta ação\./);
  assert.match(drawer, /resultado\?\.id !== lead\.id/);
  assert.match(drawer, /onDeleted\(lead\.id\)/);
  assert.doesNotMatch(drawer, /location\.reload|router\.refresh/);
});

test('drawer controla IA sem otimismo e exibe timestamp seguro', () => {
  const drawer = read('src/components/LeadDrawer.tsx');
  assert.match(drawer, /IA ativa/);
  assert.match(drawer, /IA inativa/);
  assert.match(drawer, /Última alteração:/);
  assert.match(drawer, /não registrada/);
  assert.match(drawer, /Alterando IA\.\.\./);
  assert.match(drawer, /aria-pressed=\{botAtivo\}/);
  assert.match(drawer, /Não foi possível alterar o status da IA\. Tente novamente\./);
  assert.match(drawer, /resultado\?\.bot_ativo === novoEstado/);
  assert.match(drawer, /bot_ativo_alterado_em: resultado\.bot_ativo_alterado_em/);
  assert.ok(
    drawer.indexOf("{botAtivo ? 'IA ativa' : 'IA inativa'}") < drawer.indexOf('Dados Pessoais'),
    'o controle da IA deve aparecer no cabeçalho, antes dos dados pessoais'
  );
});

test('observacao so confirma depois do retorno validado do banco', () => {
  const drawer = read('src/components/LeadDrawer.tsx');
  assert.match(drawer, /\.select\('id, observacao_vendedor(?:,[^']*)?'\)/);
  assert.match(drawer, /finally[\s\S]*setSalvandoObservacao\(false\)/);
  assert.match(drawer, /Observação salva com sucesso/);
  assert.match(drawer, /Erro ao salvar observação/);
});

test('todos os consumidores removem o lead localmente e limpam a selecao', () => {
  for (const file of ['src/app/(app)/leads/page.tsx', 'src/app/(app)/pipeline/page.tsx']) {
    const source = read(file);
    assert.match(source, /onDeleted=\{\(leadId\) =>/);
    assert.match(source, /filter\(\(item\) => item\.id !== leadId\)/);
    assert.match(source, /setLeadSelecionado\(null\)/);
  }
  assert.match(read('src/components/NegociacaoTimerWatcher.tsx'), /onDeleted=\{\(leadId\) =>/);
});

test('consultas carregam o timestamp da IA', () => {
  for (const file of [
    'src/app/(app)/leads/page.tsx',
    'src/app/(app)/pipeline/page.tsx',
    'src/app/(app)/dashboard/page.tsx',
    'src/components/NegociacaoTimerWatcher.tsx',
  ]) {
    assert.match(read(file), /bot_ativo, bot_ativo_alterado_em/);
  }
});

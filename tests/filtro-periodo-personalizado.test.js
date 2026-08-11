const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadTypeScriptModule(file) {
  const ts = require('typescript');
  const source = read(file);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', 'require', compiled)(module, module.exports, require);
  return module.exports;
}

test('calculo usa dias locais completos e rejeita intervalo invalido', () => {
  const { getCustomDateBoundaries, getPreviousDateBoundaries } = loadTypeScriptModule(
    'src/lib/lead-period-filter.ts'
  );

  const current = getCustomDateBoundaries({ start: '2026-08-01', end: '2026-08-03' });
  assert.ok(current);
  assert.deepEqual(
    [current.start.getHours(), current.start.getMinutes(), current.start.getSeconds()],
    [0, 0, 0]
  );
  assert.deepEqual(
    [current.end.getHours(), current.end.getMinutes(), current.end.getSeconds(), current.end.getMilliseconds()],
    [23, 59, 59, 999]
  );

  const previous = getPreviousDateBoundaries(current);
  assert.equal(previous.start.getDate(), 29);
  assert.equal(previous.start.getMonth(), 6);
  assert.equal(previous.end.getDate(), 31);
  assert.equal(previous.end.getMonth(), 6);
  assert.equal(getCustomDateBoundaries({ start: '2026-08-03', end: '2026-08-01' }), null);
  assert.equal(getCustomDateBoundaries({ start: '2026-02-30', end: '2026-03-01' }), null);
});

test('filtro personalizado inclui as duas datas selecionadas', () => {
  const { isLeadWithinPeriod } = loadTypeScriptModule('src/lib/lead-period-filter.ts');
  const range = { start: '2026-08-01', end: '2026-08-03' };

  assert.equal(isLeadWithinPeriod('2026-08-01T00:00:00', 'personalizado', new Date(), range), true);
  assert.equal(isLeadWithinPeriod('2026-08-03T23:59:59.999', 'personalizado', new Date(), range), true);
  assert.equal(isLeadWithinPeriod('2026-08-04T00:00:00', 'personalizado', new Date(), range), false);
});

test('utilitario calcula intervalo personalizado inclusivo e periodo anterior', () => {
  const source = read('src/lib/lead-period-filter.ts');

  assert.match(source, /personalizado/);
  assert.match(source, /setHours\(0, 0, 0, 0\)/);
  assert.match(source, /setHours\(23, 59, 59, 999\)/);
  assert.match(source, /getPreviousDateBoundaries/);
  assert.match(source, /setDate\(.*getDate\(\).*dayCount/s);
});

test('leads e pipeline compartilham o periodo personalizado', () => {
  const hook = read('src/hooks/useLeadFilters.ts');
  const filters = read('src/components/LeadFiltersBar.tsx');

  assert.match(hook, /getDefaultCustomDateRange/);
  assert.match(hook, /customDateRange/);
  assert.match(hook, /isLeadWithinPeriod/);
  assert.match(filters, /CustomDateRangePicker/);
  assert.match(filters, /filters\.periodo === 'personalizado'/);
});

test('visao geral usa datas personalizadas e comparacao equivalente', () => {
  const dashboard = read('src/app/(app)/dashboard/page.tsx');

  assert.match(dashboard, /value: 'personalizado'/);
  assert.match(dashboard, /CustomDateRangePicker/);
  assert.match(dashboard, /getCustomDateBoundaries/);
  assert.match(dashboard, /getPreviousDateBoundaries/);
});

test('seletor mantem intervalo valido ao alterar qualquer extremidade', () => {
  const picker = read('src/components/CustomDateRangePicker.tsx');

  assert.match(picker, /type="date"/);
  assert.match(picker, /if \(value > end\)/);
  assert.match(picker, /if \(value < start\)/);
  assert.match(picker, /aria-label="Data inicial"/);
  assert.match(picker, /aria-label="Data final"/);
});

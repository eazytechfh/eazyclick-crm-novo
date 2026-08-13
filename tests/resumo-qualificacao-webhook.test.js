const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadRoute(createClient) {
  const ts = require('typescript');
  const source = read('src/app/api/leads/[id]/resumo-qualificacao/route.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const customRequire = (id) => {
    if (id === 'next/server') {
      return {
        NextResponse: {
          json(body, init) {
            return { body, status: init?.status ?? 200 };
          },
        },
      };
    }
    if (id === '@/lib/supabase/server') return { createClient };
    return require(id);
  };
  Function('module', 'exports', 'require', compiled)(module, module.exports, customRequire);
  return module.exports;
}

function createSupabase({ user = { id: 'usuario-1' }, lead, error = null } = {}) {
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: lead ?? null, error }; },
  };
  return {
    auth: { async getUser() { return { data: { user } }; } },
    from() { return query; },
  };
}

test('rota autentica e obtem o telefone do lead no banco', () => {
  const route = read('src/app/api/leads/[id]/resumo-qualificacao/route.ts');

  assert.match(route, /Number\.isSafeInteger\(leadId\)/);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /\.select\('id, telefone'\)/);
  assert.match(route, /\.eq\('id_empresa', 1\)/);
  assert.match(route, /JSON\.stringify\(\{ telefone: lead\.telefone \}\)/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test('rota chama somente o webhook fixo e trata falha externa', () => {
  const route = read('src/app/api/leads/[id]/resumo-qualificacao/route.ts');

  assert.match(route, /https:\/\/n8n\.eazy\.tec\.br\/webhook\/resumo-comercial-crm/);
  assert.match(route, /method: 'POST'/);
  assert.match(route, /'Content-Type': 'application\/json'/);
  assert.match(route, /AbortController/);
  assert.match(route, /status: 502/);
  assert.match(route, /\{ ok: true, leadId: lead\.id \}/);
});

test('drawer dispara o resumo com loading e retorno acessivel', () => {
  const drawer = read('src/components/LeadDrawer.tsx');

  assert.match(drawer, /Criar resumo com IA/);
  assert.match(drawer, /Gerando\.\.\./);
  assert.match(drawer, /fetch\(`\/api\/leads\/\$\{lead\.id\}\/resumo-qualificacao`/);
  assert.match(drawer, /resultado\?\.ok === true/);
  assert.match(drawer, /resultado\?\.leadId === lead\.id/);
  assert.match(drawer, /Resumo solicitado\. Ele será atualizado em instantes\./);
  assert.match(drawer, /role="status"/);
  assert.match(drawer, /disabled=\{gerandoResumo \|\| !lead\.telefone\?\.trim\(\)\}/);
});

test('handler rejeita usuario sem sessao antes de chamar o webhook', async () => {
  const route = loadRoute(() => createSupabase({ user: null }));
  const originalFetch = global.fetch;
  let chamouWebhook = false;
  global.fetch = async () => {
    chamouWebhook = true;
    return { ok: true, status: 200 };
  };

  try {
    const response = await route.POST({}, { params: { id: '10' } });
    assert.equal(response.status, 401);
    assert.equal(chamouWebhook, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handler envia ao n8n exatamente o telefone obtido do banco', async () => {
  const route = loadRoute(() => createSupabase({ lead: { id: 10, telefone: '5521999999999' } }));
  const originalFetch = global.fetch;
  let chamada;
  global.fetch = async (url, options) => {
    chamada = { url, options };
    return { ok: true, status: 200 };
  };

  try {
    const response = await route.POST({}, { params: { id: '10' } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, leadId: 10 });
    assert.equal(chamada.url, 'https://n8n.eazy.tec.br/webhook/resumo-comercial-crm');
    assert.equal(chamada.options.method, 'POST');
    assert.equal(chamada.options.body, JSON.stringify({ telefone: '5521999999999' }));
    assert.ok(chamada.options.signal instanceof AbortSignal);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handler rejeita lead sem telefone e converte falha do n8n em 502', async () => {
  const semTelefone = loadRoute(() => createSupabase({ lead: { id: 10, telefone: '  ' } }));
  const responseSemTelefone = await semTelefone.POST({}, { params: { id: '10' } });
  assert.equal(responseSemTelefone.status, 422);

  const route = loadRoute(() => createSupabase({ lead: { id: 10, telefone: '5521999999999' } }));
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await route.POST({}, { params: { id: '10' } });
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'O serviço de resumo não aceitou a solicitação.');
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

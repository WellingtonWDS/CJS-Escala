const assert = require("node:assert/strict");
const { respondToDialogs } = require("./helpers/dialogs.cjs");
const office = "20000000-0000-0000-0000-000000000001",
  demo = "de000000-0000-4000-8000-000000000001",
  company = "30000000-0000-0000-0000-000000000001";
const plano = { limited: true, name: "Inicial", status: "ativo", companyLimit: 5, employeeLimit: 50, courtesy: 0, capacity: 5, companies: 4, swaps: 0, used: 4, free: 1, cycleStart: "2026-11-19", renewsAt: "2026-12-19", cycleAnchor: "2026-11-19", revision: 3, notes: "" };

async function abrirContexto(browser) {
  const context = await browser.newContext();
  await context.route("https://**/*", (r) => r.abort());
  return context;
}

module.exports = async ({ browser, baseURL }) => {
  const raiz = baseURL.replace(/\/$/, "");
  // 1. Painel Admin com dados simulados do servidor.
  let context = await abrirContexto(browser);
  try {
    const page = await context.newPage(), errors = [], enviados = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/auth*", (r) => r.fulfill({ json: { user: { id: "u", name: "Wellington", role: "admin" }, persistenceEnabled: true } }));
    await page.route("**/api/plans*", async (r) => {
      const url = new URL(r.request().url());
      if (r.request().method() === "POST") {
        enviados.push(r.request().postDataJSON());
        return r.fulfill({ json: { ...plano, name: "Profissional", companyLimit: 15, capacity: 15, free: 11, revision: 4 } });
      }
      if (url.searchParams.get("action") === "overview")
        return r.fulfill({ json: { today: "2026-11-19", offices: [
          { id: office, name: "Contabilidade Alfa", active: true, demo: false, plan: plano, activeCompanies: 4, archivedCompanies: 1, users: 3, pendingSwaps: 1, blocks: 0 },
          { id: demo, name: "DEMO", active: true, demo: true, plan: { limited: false }, activeCompanies: 1, archivedCompanies: 0, users: 1, pendingSwaps: 0, blocks: 0 },
        ], events: [{ id: "e1", officeId: office, office: "Contabilidade Alfa", company: "Padaria Pão Bom", kind: "troca_detectada", details: { novos: 6, total: 8 }, actor: "Operador A", createdAt: "2026-11-19T12:00:00Z" }] } });
      return r.fulfill({ json: { office: { id: office, name: "Contabilidade Alfa", demo: false, active: true }, plan: plano,
        companies: [
          { id: company, name: "Padaria Pão Bom", cnpj: "11222333000181", archived: false, cnpjLocked: true, counted: true, lastUse: "2026-11-19T12:00:00Z", swaps: 0, roster: 8 },
          { id: "30000000-0000-0000-0000-000000000009", name: "Mercado Antigo", cnpj: "11444777000161", archived: true, archivedAt: "2026-11-10T10:00:00Z", cnpjLocked: true, counted: true, lastUse: null, swaps: 0, roster: 0 },
        ], extras: [], events: [] } });
    });
    await respondToDialogs(page, (d) => d.accept());
    await page.goto(raiz + "/admin/");
    await page.locator("[data-painel]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-usuario]").textContent(), "Wellington");
    assert.equal(await page.locator('[data-kpi="planos"]').textContent(), "1");
    assert.equal(await page.locator('[data-kpi="vagas"]').textContent(), "4/5");
    assert.equal(await page.locator('[data-kpi="alertas"]').textContent(), "1");
    assert.match(await page.locator("[data-escritorios] tbody").textContent(), /≥ 80% do limite.*1 troca\(s\) pendente\(s\)/s);
    assert.match(await page.locator("[data-escritorios] tbody").textContent(), /DEMO.*Sem limite/s);
    assert.match(await page.locator("[data-eventos]").textContent(), /Troca de quadro detectada.*6 de 8 colaboradores novos/s);
    await page.locator("[data-filtro]").selectOption("livre");
    assert.equal(await page.locator("[data-escritorios] tbody tr").count(), 1);
    await page.locator("[data-filtro]").selectOption("todos");
    await page.locator(`[data-gerenciar="${office}"]`).click();
    await page.locator("[data-gaveta][open] [data-empresas] tbody tr").nth(1).waitFor();
    assert.match(await page.locator("[data-empresas]").textContent(), /11\.222\.333\/0001-81.*travado.*Arquivada 10\/11\/2026/s);
    assert.equal(await page.locator('[data-form-plano] [name="companyLimit"]').inputValue(), "5");
    await page.locator("[data-modelo]").selectOption("Profissional|15");
    assert.equal(await page.locator('[data-form-plano] [name="name"]').inputValue(), "Profissional");
    await page.locator("[data-salvar-plano]").click();
    await page.locator('[data-msg-plano][data-tipo="ok"]').waitFor();
    assert.deepEqual(enviados[0], { action: "savePlan", officeId: office, revision: 3, name: "Profissional", companyLimit: 15, employeeLimit: 50, cycleAnchor: "2026-11-19", status: "ativo", notes: "" });
    if (process.env.PLANOS_SCREENSHOT) {
      await page.waitForTimeout(300);
      await page.locator("[data-fechar]").click();
      await page.setViewportSize({ width: 1360, height: 900 });
      await page.screenshot({ path: process.env.PLANOS_SCREENSHOT + "-lista.png", fullPage: true });
      await page.locator(`[data-gerenciar="${office}"]`).click();
      await page.locator("[data-gaveta][open] [data-empresas] tbody tr").nth(1).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: process.env.PLANOS_SCREENSHOT + "-gaveta.png" });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.locator("[data-fechar]").click();
      await page.screenshot({ path: process.env.PLANOS_SCREENSHOT + "-celular.png", fullPage: true });
    }
    const largo = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".tabela-rolagem, dialog")).map((el) => el.tagName + "." + el.className).slice(0, 5).concat(document.documentElement.scrollWidth > window.innerWidth + 1 ? ["documento mais largo que a tela"] : []));
    assert.deepEqual(largo, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }

  // 2. Gerente não vê dados do painel.
  context = await abrirContexto(browser);
  try {
    const page = await context.newPage();
    let chamadas = 0;
    await page.route("**/api/auth*", (r) => r.fulfill({ json: { user: { id: "u", name: "Gerente", role: "manager" } } }));
    await page.route("**/api/plans*", (r) => { chamadas++; return r.fulfill({ status: 403, json: { error: "Acesso não permitido." } }); });
    await page.goto(raiz + "/admin/");
    await page.locator("[data-restrito]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-painel]").isHidden(), true);
    assert.equal(chamadas, 0);
  } finally {
    await context.close();
  }

  // 3. Conferência do plano no app: troca de quadro, bloqueio, empresa arquivada e CNPJ da SCI.
  context = await abrirContexto(browser);
  try {
    const page = await context.newPage(), errors = [], usos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let respostas = [];
    await page.route("**/api/plans*", async (r) => {
      const url = new URL(r.request().url());
      if (url.searchParams.get("action") === "status") return r.fulfill({ json: { ...plano, canManage: true } });
      const body = r.request().postDataJSON();
      if (body.action === "archive") return r.fulfill({ json: { company: { id: company, name: "Padaria Pão Bom", cnpj: "11222333000181", archived: false }, plan: plano } });
      usos.push(body);
      return r.fulfill({ json: respostas.shift() });
    });
    const mensagens = [];
    await respondToDialogs(page, async (d) => { mensagens.push(d.message()); await d.accept(); });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(async ({ office, company }) => {
      const { initPlanControl } = await import("/assets/js/ui/plan-gate.js");
      const bar = document.getElementById("current-workspace");
      bar.hidden = false;
      bar.innerHTML = '<div class="workspace-context"><strong data-current-company>Padaria</strong></div><p data-current-status></p>';
      window.__ctx = { officeId: office, companyId: company };
      window.__arquivada = false;
      window.__plano = initPlanControl({
        document, window,
        workspace: { context: () => window.__ctx, pending: () => null },
        state: { colaboradores: [{ nome: "Ana" }, { nome: " Bruno " }, { nome: "" }] },
        persistence: { listCompanies: async () => [{ id: company, name: "Padaria Pão Bom", cnpj: "11222333000181", archived: window.__arquivada }] },
      });
      await window.__plano.refresh();
    }, { office, company });
    assert.match(await page.locator("[data-plan-usage]").textContent(), /Uso do plano Inicial: 4 de 5 empresas · renova em 19\/12\/2026/);
    assert.equal(await page.locator("#sci-cnpj").inputValue(), "11.222.333/0001-81");
    assert.equal(await page.locator("#sci-cnpj").evaluate((el) => el.readOnly), true);
    // Troca de quadro confirmada pelo gerente consome 1 vaga.
    respostas = [
      { status: "confirmar_troca", novos: 2, total: 2, canConfirm: true, message: "2 de 2 colaboradores são novos nesta empresa.", plan: plano },
      { status: "liberado", swapConfirmed: true, message: "Troca de quadro confirmada: 1 vaga extra consumida neste ciclo.", plan: { ...plano, used: 5, free: 0, swaps: 1 } },
    ];
    assert.equal(await page.evaluate(() => window.__plano.exigir("gerar")), true);
    assert.deepEqual(usos.map((u) => [u.use, u.confirmSwap, u.names]), [["gerar", false, ["Ana", "Bruno"]], ["gerar", true, ["Ana", "Bruno"]]]);
    assert.match(mensagens[0], /Vagas livres no ciclo: 1/);
    assert.match(await page.locator("[data-current-status]").textContent(), /1 vaga extra/);
    // Operador não confirma.
    respostas = [{ status: "confirmar_troca", canConfirm: false, message: "3 de 4 colaboradores são novos.", plan: plano }];
    assert.equal(await page.evaluate(() => window.__plano.exigir("exportar")), false);
    assert.match(mensagens.at(-1), /Somente o gerente/);
    // Limite de colaboradores bloqueia.
    respostas = [{ status: "bloqueado", reason: "colaboradores", message: "O plano permite até 50 colaboradores por empresa; este preenchimento tem 51.", plan: plano }];
    assert.equal(await page.evaluate(() => window.__plano.exigir("proposta")), false);
    assert.match(mensagens.at(-1), /até 50 colaboradores/);
    // Sem empresa do servidor, nada é gerado.
    assert.equal(await page.evaluate(() => { window.__ctx = null; return window.__plano.exigir("gerar"); }), false);
    assert.match(mensagens.at(-1), /selecione a empresa no servidor/);
    assert.equal(await page.locator("#sci-cnpj").evaluate((el) => el.readOnly), true, "sem atualizar, a trava continua");
    // Empresa arquivada: somente visualização.
    await page.evaluate(async () => { window.__ctx = { officeId: "20000000-0000-0000-0000-000000000001", companyId: "30000000-0000-0000-0000-000000000001" }; window.__arquivada = true; await window.__plano.refresh(); });
    await page.locator("#aviso-somente-leitura").waitFor({ state: "visible" });
    assert.match(await page.locator("#aviso-somente-leitura").textContent(), /somente visualização/);
    assert.equal(await page.locator("[data-plan-archive]").textContent(), "Reativar empresa");
    const campo = page.locator("main input[type=text], main input:not([type])").first();
    const antes = await campo.inputValue();
    await campo.click({ force: true });
    await page.keyboard.type("XYZ");
    assert.equal(await campo.inputValue(), antes);
    await page.locator("[data-plan-archive]").click();
    await page.locator("#aviso-somente-leitura").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.somenteLeitura), "false");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
};

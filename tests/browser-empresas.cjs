const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
const { respondToDialogs } = require("./helpers/dialogs.cjs");
const office = "20000000-0000-0000-0000-000000000001",
  officeB = "20000000-0000-0000-0000-000000000002",
  padaria = "30000000-0000-0000-0000-000000000001",
  mercado = "30000000-0000-0000-0000-000000000002",
  antiga = "30000000-0000-0000-0000-000000000003";
const plano = { limited: true, name: "Inicial", used: 4, capacity: 5, free: 1, renewsAt: "2026-12-19", status: "ativo" };

async function iniciar(browser, baseURL, { role = "manager", cards, persistence = true }) {
  const context = await browser.newContext();
  await context.route("https://**/*", (r) => r.abort());
  const page = await context.newPage(), errors = [], posts = [], aberturas = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/companies*", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: cards() });
    const body = r.request().postDataJSON();
    posts.push(body);
    if (body.action === "updateCompany") return r.fulfill({ json: { company: { id: body.companyId, name: body.name, cnpj: body.cnpj.replace(/\D/g, "") } } });
    return r.fulfill({ json: { status: "created", company: { id: "30000000-0000-0000-0000-000000000099", officeId: body.officeId, name: body.name, cnpj: body.cnpj.replace(/\D/g, "") } } });
  });
  await page.route("**/api/persistence", (r) => r.fulfill({ json: r.request().postDataJSON().companyId === padaria
    ? [{ id: "50000000-0000-4000-8000-000000000001", title: "Escala de dezembro", revision: 3, updated_at: "2026-11-18T14:00:00Z" }] : [] }));
  await page.route("**/api/plans*", (r) => r.fulfill({ json: { company: { id: mercado, archived: true }, plan: plano } }));
  await respondToDialogs(page, (d) => d.accept());
  await page.goto(baseURL);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.evaluate(({ role, persistence }) => {
    window.__aberturas = [];
    return import("/assets/js/ui/navigation.js").then(({ initNavigation }) => {
      initNavigation({
        session: { user: { name: "Pessoa", role }, persistenceEnabled: persistence },
        document, window,
        workspace: { context: () => null },
        remote: { open: async (s, o) => { window.__aberturas.push({ ...s, o }); return true; } },
      });
    });
  }, { role, persistence });
  return { context, page, errors, posts, aberturas };
}

module.exports = async ({ browser, baseURL }) => {
  const cheia = () => ({
    offices: [{ id: office, name: "Contabilidade Alfa", canCreate: true, plan: plano }, { id: officeB, name: "Contabilidade Beta", canCreate: false, plan: null }],
    companies: [
      { id: padaria, officeId: office, officeName: "Contabilidade Alfa", name: "Padaria Pão Bom", cnpj: "11222333000181", cnpjLocked: true, archived: false, canManage: true, canWrite: true, drafts: 2,
        latest: { title: "Escala de dezembro", updatedAt: "2026-11-18T14:00:00Z", updatedBy: "Operador A", employees: 12, hasResult: true } },
      { id: mercado, officeId: office, officeName: "Contabilidade Alfa", name: "Mercado Bairro", cnpj: "11444777000161", archived: false, canManage: true, canWrite: true, drafts: 0, latest: null },
      { id: antiga, officeId: officeB, officeName: "Contabilidade Beta", name: "Loja Antiga", cnpj: "04252011000110", archived: true, canManage: false, canWrite: false, drafts: 1,
        latest: { title: "Escala antiga", updatedAt: "2026-09-01T10:00:00Z", updatedBy: "Gerente B", employees: 4, hasResult: false } },
    ],
  });
  // 1. Gerente: Empresas é a tela inicial, com cartões e resumo.
  let t = await iniciar(browser, baseURL, { cards: cheia });
  try {
    const { page, errors, posts } = t;
    await page.locator("[data-company-card]").first().waitFor();
    assert.equal(await page.evaluate(() => document.body.dataset.appView), "home");
    assert.equal(await page.locator("#scheduler-view").isHidden(), true);
    assert.equal(await page.evaluate(() => location.hash), "#empresas");
    assert.equal(await page.locator('[data-app-view="companies"], [data-app-view="offices"], [data-seasonal-preview-open]').count(), 0);
    assert.equal(await page.locator('button[data-app-view="home"]').getAttribute("aria-current"), "page");
    assert.equal(await page.locator("[data-company-card]").count(), 3);
    const card = page.locator(`[data-company-card="${padaria}"]`);
    assert.match(await card.innerText(), /Padaria Pão Bom[\s\S]*Escala gerada[\s\S]*11\.222\.333\/0001-81 · Contabilidade Alfa[\s\S]*Preenchimentos\s*2[\s\S]*Colaboradores\s*12[\s\S]*18\/11\/2026[\s\S]*Operador A/);
    assert.match(await page.locator(`[data-company-card="${antiga}"]`).innerText(), /Arquivada/);
    assert.match(await page.locator("[data-home-plans]").innerText(), /Plano Inicial: 4 de 5 empresas no ciclo · renova em 19\/12\/2026/);
    await page.locator("[data-home-search]").fill("11.444");
    assert.equal(await page.locator("[data-company-card]").count(), 1);
    await page.locator("[data-home-search]").fill("");
    await page.locator("[data-home-office]").selectOption(officeB);
    assert.equal(await page.locator("[data-company-card]").count(), 1);
    await page.locator("[data-home-office]").selectOption("");
    // Contraste nos dois temas e celular sem rolagem lateral.
    for (const tema of ["light", "dark"]) {
      await page.evaluate((tema) => (document.documentElement.dataset.theme = tema), tema);
      assert.deepEqual(await contrast(page, "#companies-home"), [], `contraste ${tema}`);
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    if (process.env.EMPRESAS_SCREENSHOT) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: process.env.EMPRESAS_SCREENSHOT + "-lista.png" });
    }
    // Detalhe: preenchimentos, edição com CNPJ travado e arquivamento.
    await card.click();
    await page.locator("[data-home-detail]").waitFor({ state: "visible" });
    await page.locator("[data-open-draft]").first().waitFor();
    assert.match(await page.locator("[data-detail-cnpj]").innerText(), /CNPJ 11\.222\.333\/0001-81 · 2 preenchimentos · 12 colaboradores/);
    assert.match(await page.locator("[data-home-drafts]").innerText(), /Escala de dezembro[\s\S]*Revisão 3 · atualizado em 18\/11\/2026/);
    assert.equal(await page.locator('#company-edit [name="cnpj"]').evaluate((el) => el.readOnly), true);
    assert.match(await page.locator("[data-cnpj-note]").innerText(), /Somente o Admin/);
    await page.locator('#company-edit [name="name"]').fill("Padaria Pão Bom Ltda");
    await page.locator("#company-edit button").click();
    await page.waitForFunction(() => /Empresa atualizada/.test(document.querySelector("[data-company-status]").textContent));
    assert.equal(posts.at(-1).action, "updateCompany");
    if (process.env.EMPRESAS_SCREENSHOT) {
      for (const tema of ["light", "dark"]) {
        await page.evaluate((tema) => (document.documentElement.dataset.theme = tema), tema);
        await page.screenshot({ path: `${process.env.EMPRESAS_SCREENSHOT}-detalhe-${tema}.png` });
      }
      await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    }
    // Abrir preenchimento leva à geração de escalas.
    await page.locator("[data-open-draft]").first().click();
    await page.waitForFunction(() => document.body.dataset.appView === "schedule");
    assert.deepEqual(await page.evaluate(() => window.__aberturas), [{ officeId: office, companyId: padaria, draftId: "50000000-0000-4000-8000-000000000001", o: { confirmar: "seAlterado" } }]);
    assert.equal(await page.locator("#scheduler-view").isVisible(), true);
    assert.match(await page.evaluate(() => location.hash), /^#sec-/);
    // Voltar pelo menu reabre a lista; novo preenchimento de outra empresa.
    await page.locator('button[data-app-view="home"]').click();
    await page.locator(`[data-company-card="${mercado}"]`).click();
    await page.waitForFunction(() => /Nenhum preenchimento salvo ainda/.test(document.querySelector("[data-drafts-note]").textContent));
    await page.locator("[data-home-new-draft]").click();
    await page.waitForFunction(() => window.__aberturas.length === 2);
    assert.equal(await page.evaluate(() => window.__aberturas[1].draftId), null);
    await page.locator('button[data-app-view="home"]').click();
    await page.locator(`[data-company-card="${mercado}"]`).click();
    await page.locator("[data-home-archive]").click();
    await page.waitForFunction(() => /arquivada/.test(document.querySelector("[data-company-status]").textContent));
    assert.equal(await page.locator("[data-home-new-draft]").isHidden(), true);
    // Empresa arquivada de outro escritório: só consulta, sem edição.
    await page.locator("[data-home-back]").click();
    await page.locator(`[data-company-card="${antiga}"]`).click();
    await page.locator("[data-home-detail]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-detail-manage]").isHidden(), true);
    assert.equal(await page.locator("[data-home-new-draft]").isHidden(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-home-back]").click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if (process.env.EMPRESAS_SCREENSHOT) await page.screenshot({ path: process.env.EMPRESAS_SCREENSHOT + "-celular.png", fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await t.context.close();
  }

  // 2. Sem empresas: opção de cadastrar a primeira; o cadastro abre a empresa.
  let lista = { offices: [{ id: office, name: "Contabilidade Alfa", canCreate: true, plan: { limited: false } }], companies: [] };
  t = await iniciar(browser, baseURL, { cards: () => lista });
  try {
    const { page, errors, posts } = t;
    await page.locator("[data-home-new-empty]").waitFor();
    assert.match(await page.locator("[data-home-empty]").innerText(), /Nenhuma empresa cadastrada/);
    await page.locator("[data-home-new-empty]").click();
    await page.locator('#company-create [name="name"]').fill("Comércio Novo");
    await page.locator('#company-create [name="cnpj"]').fill("11.222.333/0001-80");
    await page.locator("#company-create button[type=submit]").click();
    await page.waitForFunction(() => /CNPJ válido/.test(document.querySelector("[data-home-status]").textContent));
    assert.equal(posts.length, 0);
    lista = { ...lista, companies: [{ id: "30000000-0000-0000-0000-000000000099", officeId: office, name: "Comércio Novo", cnpj: "11222333000181", canManage: true, canWrite: true, drafts: 0, latest: null }] };
    await page.locator('#company-create [name="cnpj"]').fill("11.222.333/0001-81");
    await page.locator("#company-create button[type=submit]").click();
    await page.locator("[data-home-detail]").waitFor({ state: "visible" });
    assert.deepEqual(posts[0], { officeId: office, name: "Comércio Novo", cnpj: "11.222.333/0001-81", apply: true });
    assert.equal(await page.locator("[data-detail-name]").innerText(), "Comércio Novo");
    assert.deepEqual(errors, []);
  } finally {
    await t.context.close();
  }

  // 3. Operador sem empresas liberadas não vê cadastro; sem servidor, a escala segue como tela inicial.
  t = await iniciar(browser, baseURL, { role: "operator", cards: () => ({ offices: [{ id: office, name: "A", canCreate: false }], companies: [] }) });
  try {
    await t.page.locator("[data-home-empty] h3").waitFor();
    assert.match(await t.page.locator("[data-home-empty]").innerText(), /Peça ao gerente/);
    assert.equal(await t.page.locator("[data-home-new]").isHidden(), true);
  } finally {
    await t.context.close();
  }
  t = await iniciar(browser, baseURL, { cards: cheia, persistence: false });
  try {
    assert.equal(await t.page.locator('button[data-app-view="home"]').isHidden(), true);
    assert.equal(await t.page.locator("#scheduler-view").isVisible(), true);
  } finally {
    await t.context.close();
  }

  // 4. Escritórios são criados no Painel Admin.
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], criados = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/auth*", (r) => r.fulfill({ json: { user: { name: "Admin", role: "admin" } } }));
    let offices = [];
    await page.route("**/api/plans*", (r) => r.fulfill({ json: { today: "2026-11-19", offices, events: [] } }));
    await page.route("**/api/companies", (r) => {
      const body = r.request().postDataJSON();
      criados.push(body);
      offices = [{ id: officeB, name: body.name, active: true, demo: false, plan: { limited: false }, activeCompanies: 0, archivedCompanies: 0, users: 0, pendingSwaps: 0, blocks: 0 }];
      return r.fulfill({ json: { status: "created", office: { id: officeB, name: body.name } } });
    });
    await page.goto(baseURL.replace(/\/$/, "") + "/admin/");
    await page.locator("[data-painel]").waitFor({ state: "visible" });
    await page.locator("[data-novo-escritorio]").click();
    await page.locator('[data-form-escritorio] [name="name"]').fill("Contabilidade Gama");
    await page.locator("[data-criar-escritorio]").click();
    await page.locator('[data-msg-escritorio][data-tipo="ok"]').waitFor();
    assert.deepEqual(criados, [{ action: "createOffice", name: "Contabilidade Gama" }]);
    assert.match(await page.locator("[data-escritorios] tbody").innerText(), /Contabilidade Gama/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log("OK: tela inicial Empresas com cartões e resumo, busca/filtro, cadastro, edição com CNPJ travado, arquivamento, preenchimentos abrindo a escala, estados vazios, contraste/celular e escritórios no Painel Admin.");
};

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
  const diagnostico = { id: "60000000-0000-4000-8000-000000000001", revision: 2, latestRevision: 2, status: "rascunho", updatedBy: "Gerente", updatedAt: "2026-11-18T10:00:00Z",
    data: { schemaVersion: 1, answers: { q02: { value: "Loja Centro", certainty: "confirmada", note: "" } } }, history: [{ revision: 2, status: "rascunho", savedAt: "2026-11-18T10:00:00Z", savedBy: "Gerente" }] };
  await page.route("**/api/diagnostics*", (r) => {
    const action = new URL(r.request().url()).searchParams.get("action");
    return r.fulfill({ json: action === "list"
      ? [{ id: diagnostico.id, unit: "Loja Centro", status: "rascunho", revision: 2, updatedAt: "2026-11-18T10:00:00Z", updatedBy: "Gerente" }]
      : diagnostico });
  });
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
    assert.equal(await page.locator("[data-footer-storage]").isHidden(), true, "aviso de salvamento só em Gerar escala");
    assert.equal(await page.locator("[data-company-card]").count(), 3);
    const card = page.locator(`[data-company-card="${padaria}"]`);
    assert.match(await card.innerText(), /Padaria Pão Bom[\s\S]*Escala gerada[\s\S]*11\.222\.333\/0001-81 · Contabilidade Alfa[\s\S]*Preenchimentos\s*2[\s\S]*Colaboradores\s*12[\s\S]*18\/11\/2026[\s\S]*Operador A/);
    assert.match(await page.locator(`[data-company-card="${antiga}"]`).innerText(), /Arquivada/);
    assert.match(await page.locator("[data-home-plans]").innerText(), /Plano Inicial: 4 de 5 empresas no ciclo · renova em 19\/12\/2026/);
    await page.locator("[data-home-search]").fill("11.444");
    assert.equal(await page.locator("[data-company-card]").count(), 1);
    await page.locator("[data-home-search]").fill("");
    // Visualização em lista, guardada para o usuário.
    assert.equal(await page.locator("[data-home-grid]").getAttribute("data-view"), "cartoes");
    await page.locator('[data-home-view="lista"]').click();
    assert.equal(await page.locator("[data-home-grid]").getAttribute("data-view"), "lista");
    assert.equal(await page.locator('[data-home-view="lista"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => localStorage.getItem("cjs-empresas-visao:anon")), "lista");
    assert.match(await card.innerText(), /Padaria Pão Bom[\s\S]*Preenchimentos\s*2/);
    const alturas = await page.locator("[data-company-card]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    assert.ok(alturas.every((h) => h < 90), `linhas compactas: ${alturas}`);
    await page.locator('[data-home-view="cartoes"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("cjs-empresas-visao:anon")), "cartoes");
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
    // Diagnóstico fica no cartão da empresa e abre já com a empresa definida.
    assert.equal(await page.locator('[data-app-view="diagnostics"], #sidebar-companies').count(), 0);
    await page.locator("[data-open-diagnostic]").waitFor();
    assert.match(await page.locator("[data-home-diagnostics]").innerText(), /Loja Centro[\s\S]*Rascunho · revisão 2 · 18\/11\/2026/);
    await page.locator("[data-open-diagnostic]").click();
    await page.waitForFunction(() => document.body.dataset.appView === "diagnostics");
    await page.waitForFunction(() => document.querySelector("[data-diag-heading]")?.textContent === "Loja Centro");
    assert.match(await page.locator("[data-diag-company]").innerText(), /Padaria Pão Bom · CNPJ 11\.222\.333\/0001-81/);
    assert.equal(await page.locator('button[data-app-view="home"]').getAttribute("aria-current"), "page");
    await page.locator("[data-diag-backto]").click();
    await page.locator("[data-home-detail]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-detail-name]").innerText(), "Padaria Pão Bom");
    await page.locator("[data-open-draft]").first().waitFor();
    // Dados só em leitura até clicar em Editar.
    assert.equal(await page.locator("#company-edit").isHidden(), true);
    assert.match(await page.locator("[data-company-view]").innerText(), /Razão social\s*Padaria Pão Bom[\s\S]*11\.222\.333\/0001-81 · travado[\s\S]*Contabilidade Alfa/i);
    await page.locator("[data-company-edit-open]").click();
    assert.equal(await page.locator('#company-edit [name="cnpj"]').evaluate((el) => el.readOnly), true);
    assert.match(await page.locator("[data-cnpj-note]").innerText(), /Somente o Admin/);
    await page.locator('#company-edit [name="name"]').fill("Padaria Pão Bom Ltda");
    await page.locator("#company-edit button[type=submit]").click();
    await page.waitForFunction(() => /Empresa atualizada/.test(document.querySelector("[data-company-status]").textContent));
    assert.equal(posts.at(-1).action, "updateCompany");
    assert.equal(await page.locator("#company-edit").isHidden(), true);
    assert.match(await page.locator("[data-view-name]").innerText(), /Padaria Pão Bom Ltda/);
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
    assert.equal(await page.locator("[data-footer-storage]").isVisible(), true, "aviso de salvamento em Gerar escala");
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

  // 1b. Marca do escritório: orientações, validação da imagem, cores, prévia e gravação.
  t = await iniciar(browser, baseURL, { cards: cheia });
  try {
    const { page, errors } = t, salvos = [];
    await page.route("**/api/branding*", (r) => {
      if (r.request().method() === "POST") { salvos.push(r.request().postDataJSON()); return r.fulfill({ json: { ...r.request().postDataJSON(), revision: 1, canEdit: true } }); }
      return r.fulfill({ json: { officeId: office, officeName: "Contabilidade Alfa", displayName: null, logo: null, logoWidth: null, logoHeight: null, primaryColor: "#0f2844", secondaryColor: "#1f7a54", revision: 0, canEdit: true } });
    });
    await page.locator("[data-home-brand]").click();
    const dlg = page.locator(".marca-dialog[open]");
    await dlg.waitFor();
    await page.waitForFunction(() => !/Carregando/.test(document.querySelector("[data-marca-status]").textContent));
    assert.match(await dlg.locator(".marca-instrucoes").innerText(), /PNG com fundo transparente[\s\S]*até 2 MB[\s\S]*1200 × 400 px/);
    await dlg.locator("[data-marca-arquivo]").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    await page.waitForFunction(() => /Formato não aceito/.test(document.querySelector("[data-marca-aviso]").textContent));
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1800; c.height = 600;
      const x = c.getContext("2d"); x.fillStyle = "#c4122f"; x.fillRect(0, 100, 500, 400); x.fillStyle = "#1d2b3a"; x.font = "bold 220px sans-serif"; x.fillText("ALFA", 560, 420);
      return c.toDataURL("image/png").split(",")[1];
    });
    await dlg.locator("[data-marca-arquivo]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.waitForFunction(() => /1200 × 400 px/.test(document.querySelector("[data-marca-aviso]").textContent));
    assert.equal(await dlg.locator("[data-previa-logo] img").count(), 1);
    await dlg.locator('[data-marca-hex="primaryColor"]').fill("#c4122f");
    assert.equal(await dlg.locator(".marca-folha th").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(196, 18, 47)");
    await dlg.locator('[data-marca-hex="secondaryColor"]').fill("#ffe600");
    await dlg.locator("[data-marca-nome]").fill("Alfa Contabilidade");
    assert.match(await dlg.locator("[data-previa-rodape]").innerText(), /Alfa Contabilidade • Elaborado no Reescala/);
    for (const tema of ["light", "dark"]) {
      await page.evaluate((tema) => (document.documentElement.dataset.theme = tema), tema);
      const falhas = await contrast(page, ".marca-dialog .marca-campos"); assert.deepEqual(falhas, [], `contraste do diálogo ${tema}: ${JSON.stringify(falhas).slice(0, 600)}`);
      if (process.env.EMPRESAS_SCREENSHOT) await page.screenshot({ path: `${process.env.EMPRESAS_SCREENSHOT}-marca-${tema}.png` });
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await dlg.locator("[data-marca-salvar]").click();
    await page.waitForFunction(() => /Marca salva/.test(document.querySelector("[data-marca-status]").textContent));
    assert.equal(salvos.length, 1);
    assert.deepEqual({ ...salvos[0], logo: salvos[0].logo.slice(0, 22) }, { officeId: office, revision: 0, displayName: "Alfa Contabilidade", logo: "data:image/png;base64,", logoWidth: 1200, logoHeight: 400, primaryColor: "#c4122f", secondaryColor: "#ffe600" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await dlg.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "diálogo sem rolagem lateral no celular");
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

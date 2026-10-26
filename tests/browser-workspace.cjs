const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) =>
      r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort(),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { initRemoteWorkspace } = await import(
        "/assets/js/ui/remote-workspace.js"
      );
      const { createWorkspace } = await import("/assets/js/state/workspace.js");
      const { createDefaultState } = await import("/assets/js/state/store.js");
      const office = "20000000-0000-0000-0000-000000000001",
        company = "30000000-0000-0000-0000-000000000001",
        other = "30000000-0000-0000-0000-000000000002",
        id = "50000000-0000-0000-0000-000000000001";
      const state = createDefaultState(),
        workspace = createWorkspace(
          localStorage,
          "10000000-0000-0000-0000-000000000001",
        );
      workspace.activate(
        { officeId: office, companyId: company, draftId: id, revision: 1 },
        state,
      );
      const rows = [
        {
          id,
          title: "Planejamento A",
          revision: 1,
          companyId: company,
          state,
          schema_version: 1,
        },
        {
          id: "50000000-0000-0000-0000-000000000002",
          title: "Planejamento B",
          revision: 1,
          companyId: other,
          state,
          schema_version: 1,
        },
      ];
      window.__saved = [];
      const service = {
        listOffices: async () => [{ id: office, name: "Escritório" }],
        listCompanies: async () => [
          { id: company, name: "Empresa A", cnpj: "48956412000126" },
          { id: other, name: "Empresa B", cnpj: "11222333000181" },
        ],
        listDrafts: async (_, companyId) =>
          rows.filter((r) => r.companyId === companyId),
        getDraft: async (_, __, draftId) => {
          if (window.__failTitle) {
            window.__failTitle = false;
            throw Error("Falha ao carregar nome");
          }
          return rows.find((r) => r.id === draftId);
        },
        saveDraft: async (body) => {
          window.__saved.push(body);
          let row = rows.find((r) => r.id === body.draftId);
          if (!row) {
            row = {
              id: "50000000-0000-0000-0000-000000000003",
              companyId: body.companyId,
              revision: 0,
              schema_version: 1,
            };
            rows.push(row);
          }
          Object.assign(row, {
            title: body.title,
            state: body.state,
            revision: row.revision + 1,
          });
          return row;
        },
      };
      window.__failTitle = true;
      await initRemoteWorkspace({
        app: { state },
        workspace,
        document,
        window,
        service,
      });
    });
    const bar = page.locator("#current-workspace");
    assert.equal(await page.locator("[data-remote-save]").isDisabled(), true);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("cjs-company-changed")),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-remote-title]").value ===
        "Planejamento A",
    );
    assert.match(await bar.textContent(), /Empresa A — 48\.956/);
    assert.equal(
      await page.locator("[data-remote-title]").inputValue(),
      "Planejamento A",
    );
    assert.equal(
      await page.locator("[data-remote-save]").textContent(),
      "Salvar preenchimento",
    );
    await page.locator("[data-remote-title]").fill("Nome atualizado de A");
    await page.locator("[data-remote-save]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#current-workspace").hasAttribute("aria-busy"),
    );
    assert.equal(await page.evaluate(() => window.__saved.length), 1);
    assert.equal(
      await page.locator("#remote-workspace").evaluate((el) => el.open),
      false,
    );
    await page.locator("[data-current-open]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    assert.equal(await page.locator("[data-remote-save]").count(), 1);
    assert.equal(
      await page.locator("#remote-workspace [data-remote-save]").count(),
      0,
    );
    await page
      .locator("[data-remote-company]")
      .selectOption("30000000-0000-0000-0000-000000000002");
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    await page
      .locator("[data-remote-draft]")
      .selectOption("50000000-0000-0000-0000-000000000002");
    assert.equal(
      await page.locator("[data-remote-title]").inputValue(),
      "Nome atualizado de A",
    );
    await page.keyboard.press("Escape");
    await page.locator("#remote-workspace").waitFor({ state: "hidden" });
    await page.locator("[data-remote-save]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#current-workspace").hasAttribute("aria-busy"),
    );
    assert.equal(
      await page.evaluate(() => window.__saved.at(-1).companyId),
      "30000000-0000-0000-0000-000000000001",
    );
    assert.equal(
      await page.evaluate(() => window.__saved.at(-1).title),
      "Nome atualizado de A",
    );
    await page.locator("[data-remote-new]").click();
    const modal = page.locator("[data-app-dialog][open]");
    await modal.locator("[data-dialog-cancel]").click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__saved.length), 2);
    await page.locator("[data-remote-new]").click();
    await modal.locator("[data-dialog-input]").fill("Cópia para testar");
    await modal.locator("[data-dialog-accept]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#current-workspace").hasAttribute("aria-busy"),
    );
    assert.equal(
      await page.evaluate(() => window.__saved.at(-1).draftId),
      null,
    );
    assert.equal(
      await page.locator("[data-remote-title]").inputValue(),
      "Cópia para testar",
    );
    await page.locator("[data-current-open]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    assert.equal(await page.locator("[data-remote-draft] option").count(), 3);
    assert.equal(
      await page.locator(".workspace-recovery").evaluate((el) => el.open),
      false,
    );
    await page.keyboard.press("Escape");
    await page.locator("#remote-workspace").waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 320, height: 844 });
    const rect = await bar.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 320);
    assert.ok(rect.y >= 0 && rect.y + rect.height <= 844);
    for (const selector of ["[data-remote-save]", "[data-remote-new]"]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.width > 90 && box.x >= 0 && box.x + box.width <= 320);
    }
    await page.evaluate(() => (document.body.dataset.appView = "companies"));
    assert.equal(await bar.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "OK: empresa atual e preenchimentos — barra acessível, salvar sem modal, cópia/cancelamento, troca de seleção sem alterar empresa/título abertos e layout móvel",
    );
  } finally {
    await context.close();
  }
};

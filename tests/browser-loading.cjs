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
    page.on("pageerror", (error) => errors.push(error.message));
    const office = "20000000-0000-0000-0000-000000000001",
      company = "30000000-0000-0000-0000-000000000001";
    let name = "Empresa inicial",
      calls = 0,
      release,
      fail = false;
    await page.route("**/api/companies", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            offices: [{ id: office, name: "Escritório", canCreate: true }],
            companies: [
              { id: company, officeId: office, name, cnpj: "48956412000126" },
            ],
          },
        });
        return;
      }
      calls++;
      await new Promise((resolve) => (release = resolve));
      if (fail)
        await route.fulfill({
          status: 503,
          json: { error: "Falha simulada no servidor" },
        });
      else {
        name = route.request().postDataJSON().name;
        await route.fulfill({
          json: { company: { id: company, name, cnpj: "48956412000126" } },
        });
      }
    });
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { createCompanyRegistry } = await import(
        "/assets/js/ui/company-registry.js"
      );
      document.querySelector("#company-management").hidden = false;
      window.__registry = createCompanyRegistry({ document, window });
      await window.__registry.show();
    });
    assert.equal(await page.locator("[data-loading-overlay][open]").count(), 0);
    await page.locator('#company-edit [name="name"]').fill("Empresa alterada");
    await page.locator("#company-edit button").click();
    const loading = page.locator("[data-loading-overlay][open]");
    await loading.waitFor({ state: "visible" });
    assert.match(await loading.locator("h2").textContent(), /cadastro/);
    assert.equal(calls, 1);
    assert.notEqual(
      await loading
        .locator(".loading-orbit")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.keyboard.press("Escape");
    assert.equal(await loading.isVisible(), true);
    await page.evaluate(() =>
      document.querySelector("#company-edit button").click(),
    );
    assert.equal(calls, 1);
    release();
    await loading.waitFor({ state: "hidden" });
    assert.match(
      await page.locator("[data-company-status]").textContent(),
      /Empresa atualizada/,
    );
    fail = true;
    await page
      .locator('#company-edit [name="name"]')
      .fill("Preservar na falha");
    await page.locator("#company-edit button").click();
    await loading.waitFor({ state: "visible" });
    release();
    await loading.waitFor({ state: "hidden" });
    assert.match(
      await page.locator("[data-company-status]").textContent(),
      /Falha simulada/,
    );
    assert.equal(
      await page.locator('#company-edit [name="name"]').inputValue(),
      "Preservar na falha",
    );
    // Uma operação não esconde o carregamento de outra ainda em andamento.
    await page.evaluate(() => {
      for (const id of ["busy-one", "busy-two"]) {
        const root = document.createElement("div");
        root.id = id;
        root.setAttribute("aria-busy", "true");
        document.body.append(root);
      }
    });
    await loading.waitFor({ state: "visible" });
    await page.evaluate(() => document.querySelector("#busy-one").remove());
    assert.equal(await loading.isVisible(), true);
    // A confirmação precisa ficar acessível; o carregamento retoma depois dela.
    await page.evaluate(async () => {
      const { getDialogs } = await import("/assets/js/ui/dialogs.js");
      getDialogs(document)
        .confirm("Confirmar durante processamento?")
        .then((v) => (window.__confirmed = v));
    });
    const confirm = page.locator("dialog[data-app-dialog][open]");
    await confirm.waitFor({ state: "visible" });
    assert.equal(
      await confirm.evaluate((el) => getComputedStyle(el).animationName),
      "window-in",
    );
    await loading.waitFor({ state: "hidden" });
    await confirm.locator("[data-dialog-cancel]").click();
    await confirm.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__confirmed), false);
    await loading.waitFor({ state: "visible" });
    await page.evaluate(() => document.querySelector("#busy-two").remove());
    await loading.waitFor({ state: "hidden" });
    // Cálculos canceláveis continuam podendo ser interrompidos no overlay.
    await page.evaluate(() => {
      const root = document.createElement("section");
      root.id = "test-ajustes";
      root.innerHTML = "<button data-ajuste-cancelar>Cancelar busca</button>";
      root.querySelector("button").onclick = () => {
        window.__cancelled = true;
        root.remove();
      };
      root.setAttribute("aria-busy", "true");
      document.body.append(root);
    });
    await loading.waitFor({ state: "visible" });
    await loading.locator("[data-loading-cancel]").click();
    await loading.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__cancelled), true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => {
      const root = document.createElement("div");
      root.id = "busy-mobile";
      root.setAttribute("aria-busy", "true");
      document.body.append(root);
    });
    await loading.waitFor({ state: "visible" });
    assert.equal(
      await loading
        .locator(".loading-orbit")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    const rect = await loading.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 320);
    await page.evaluate(() => document.querySelector("#busy-mobile").remove());
    await loading.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log(
      "OK: carregamento — fundo modal, animação central, gravação lenta/erro, bloqueio de duplicação, sobreposição de operações, confirmação acessível, cancelamento e movimento reduzido/celular",
    );
  } finally {
    await context.close();
  }
};

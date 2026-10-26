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
    page.on("dialog", () => {
      throw Error("Não deve abrir diálogo nativo");
    });
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      window.__dialogs = (await import("/assets/js/ui/dialogs.js")).getDialogs(
        document,
      );
      window.__results = [];
      window.__dialogs
        .confirm("<img src=x onerror=alert(1)>")
        .then((value) => window.__results.push(value));
      window.__dialogs
        .alert("Segundo aviso")
        .then(() => window.__results.push("alerta fechado"));
    });
    const modal = page.locator("dialog[data-app-dialog][open]");
    await modal.waitFor();
    assert.equal(await modal.locator("img").count(), 0);
    assert.match(await modal.locator("p").textContent(), /<img/);
    assert.equal(await modal.count(), 1);
    assert.equal(
      await modal
        .locator("[data-dialog-cancel]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-app-dialog]")?.dataset.appDialog ===
        "alert",
    );
    await modal.locator("[data-dialog-accept]").click();
    await page.waitForFunction(() => window.__results.length === 2);
    assert.deepEqual(await page.evaluate(() => window.__results), [
      false,
      "alerta fechado",
    ]);
    await page.evaluate(() => {
      window.__dialogs
        .prompt("Horas", "08:00")
        .then((value) => window.__results.push(value));
    });
    await modal.locator("input").fill("08:30");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__results.length === 3);
    assert.equal(await page.evaluate(() => window.__results[2]), "08:30");
    await page.evaluate(() => {
      window.__dialogs
        .prompt("Cancelar", "original")
        .then((value) => window.__results.push(value));
    });
    await modal.waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__results.length === 4);
    assert.equal(await page.evaluate(() => window.__results[3]), null);
    await page.evaluate(() => {
      window.__dialogs
        .prompt("Vazio", "original")
        .then((value) => window.__results.push(value));
    });
    await modal.locator("input").fill("");
    await modal.locator("[data-dialog-accept]").click();
    await page.waitForFunction(() => window.__results.length === 5);
    assert.equal(await page.evaluate(() => window.__results[4]), "");
    await page.evaluate(() => {
      const parent = document.createElement("dialog");
      parent.id = "test-parent-dialog";
      parent.innerHTML =
        '<button id="test-parent-button">Abrir confirmação</button>';
      document.body.append(parent);
      parent.showModal();
      parent.querySelector("button").focus();
      window.__dialogs
        .confirm("Confirmação sobre outra janela")
        .then((value) => window.__results.push(value));
    });
    await modal.waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement.closest("[data-app-dialog]"),
      ),
      true,
    );
    await modal.locator("[data-dialog-cancel]").click();
    await page.waitForFunction(() => window.__results.length === 6);
    assert.equal(
      await page.locator("#test-parent-dialog").evaluate((el) => el.open),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "test-parent-button",
    );
    await page.evaluate(() => {
      document.querySelector("#test-parent-dialog").close();
      document.querySelector("#test-parent-dialog").remove();
    });
    // Cancelar limpeza não altera dados; confirmar só então limpa e recarrega.
    await page
      .locator('[data-field="nome"]')
      .first()
      .fill("Preenchimento preservado");
    await page.locator('[data-field="nome"]').first().dispatchEvent("change");
    const before = await page.evaluate(() =>
      localStorage.getItem("fintria-escala-dp-v2"),
    );
    await page.locator("#btn-limpar-dados").click();
    await modal.locator("[data-dialog-cancel]").click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("fintria-escala-dp-v2")),
      before,
    );
    await page.locator("#btn-limpar-dados").click();
    await Promise.all([
      page.waitForEvent("load"),
      modal.locator("[data-dialog-accept]").click(),
    ]);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.notEqual(
      await page.locator('[data-field="nome"]').first().inputValue(),
      "Preenchimento preservado",
    );
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(async () => {
      const d = (await import("/assets/js/ui/dialogs.js")).getDialogs(document);
      d.alert("Aviso em tela pequena");
    });
    await modal.waitFor();
    const rect = await modal.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 320);
    await modal.locator("[data-dialog-accept]").click();
    assert.deepEqual(errors, []);
    console.log(
      "OK: modais — fila, Escape, Enter, foco, texto seguro, prompt/cancelamento, janela sobreposta, limpeza e celular sem diálogos nativos",
    );
  } finally {
    await context.close();
  }
};

const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL, sql }) => {
  const { cenario } = await import("./fixtures/edicao-manual.mjs");
  const contexts = [];
  const errors = [];
  async function login(email) {
    const context = await browser.newContext();
    contexts.push(context);
    await context.route("https://**/*", (r) =>
      r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort(),
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(baseURL + "/login.html");
    await page.locator("#email").waitFor({ state: "visible" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("correct-pass");
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    return page;
  }
  const openPanel = async (page) => {
    await page.locator("#btn-remote-workspace").click();
    await page
      .locator("[data-remote-company] option")
      .first()
      .waitFor({ state: "attached" });
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
  };
  const openSelection = async (page, draft = "") => {
    await openPanel(page);
    await page
      .locator("[data-remote-company]")
      .selectOption("30000000-0000-0000-0000-000000000001");
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    await page.locator("[data-remote-draft]").selectOption(draft);
    await page.locator("[data-remote-open]").click();
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.ready === "true" &&
        !document.querySelector("#remote-workspace").open,
    );
  };
  try {
    const a = await login("admin-a@example.test");
    assert.equal(await a.locator('[data-field="nome"]').count(), 0);
    const legacy = cenario();
    legacy.mes = 8;
    legacy.escalaGerada = null;
    await a.evaluate(
      (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
      legacy,
    );
    await openSelection(a);
    await openPanel(a);
    await a.locator("[data-remote-import]").click();
    await a.waitForFunction(
      () =>
        document.documentElement.dataset.ready === "true" &&
        !document.querySelector("#remote-workspace").open,
    );
    assert.equal(await a.locator('[data-field="nome"]').count(), 2);
    assert.equal(await a.locator("#cfg-mes").inputValue(), "8");
    await openPanel(a);
    await a
      .locator("[data-remote-title]")
      .fill("Rascunho integração navegador");
    let dropped = false;
    await a.route("**/api/persistence", async (route) => {
      if (!dropped && route.request().postDataJSON()?.action === "saveDraft") {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await a.locator("[data-remote-save]").click();
    await a.waitForFunction(() =>
      document
        .querySelector("[data-remote-status]")
        .textContent.includes("Não foi possível conectar"),
    );
    await a.unroute("**/api/persistence");
    await a.reload();
    await a.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await openPanel(a);
    await a.locator("[data-remote-save]").click();
    await a.waitForFunction(() =>
      document
        .querySelector("[data-remote-status]")
        .textContent.includes("Salvo no servidor"),
    );
    const id = await a.locator("[data-remote-draft]").inputValue();
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.equal(
      sql(
        "SELECT count(*) FROM cjs_private.drafts WHERE title='Rascunho integração navegador';",
      ),
      "1",
    );
    await a.locator(".remote-close").click();
    const second = await login("admin-a@example.test");
    await openSelection(second, id);
    assert.equal(await second.locator('[data-field="nome"]').count(), 2);
    assert.equal(await second.locator("#cfg-mes").inputValue(), "8");
    await openPanel(a);
    await a.locator("[data-remote-title]").fill("Revisão A");
    await a.locator("[data-remote-save]").click();
    await a.waitForFunction(() =>
      document
        .querySelector("[data-remote-status]")
        .textContent.includes("revisão 2"),
    );
    await second
      .locator('[data-field="nome"]')
      .first()
      .fill("Alteração local preservada");
    await second.locator('[data-field="nome"]').first().dispatchEvent("change");
    await openPanel(second);
    await second.locator("[data-remote-save]").click();
    await second.waitForFunction(() =>
      document
        .querySelector("[data-remote-status]")
        .textContent.includes("Outra pessoa alterou"),
    );
    await second.locator(".remote-close").click();
    assert.equal(
      await second.locator('[data-field="nome"]').first().inputValue(),
      "Alteração local preservada",
    );
    await openSelection(second, id);
    await openPanel(second);
    await second.locator("[data-remote-restore]").click();
    await second.waitForFunction(
      () =>
        document.documentElement.dataset.ready === "true" &&
        !document.querySelector("#remote-workspace").open,
    );
    assert.equal(
      await second.locator('[data-field="nome"]').first().inputValue(),
      "Alteração local preservada",
    );
    // Criar uma cópia e atualizá-la mantém os demais rascunhos no seletor.
    await a.locator("[data-remote-title]").fill("Cópia independente");
    await a.locator("[data-remote-new]").click();
    await a.waitForFunction(() => !document.querySelector("#remote-workspace").hasAttribute("aria-busy"));
    const copyId = await a.locator("[data-remote-draft]").inputValue();
    assert.notEqual(copyId, id);
    for (const savedId of [id, copyId]) {
      assert.equal(await a.locator(`[data-remote-draft] option[value="${savedId}"]`).count(), 1);
    }
    await a.locator("[data-remote-title]").fill("Cópia renomeada");
    await a.locator("[data-remote-save]").click();
    await a.waitForFunction(() => !document.querySelector("#remote-workspace").hasAttribute("aria-busy"));
    assert.equal(await a.locator("[data-remote-draft]").inputValue(), copyId);
    assert.equal(await a.locator(`[data-remote-draft] option[value="${id}"]`).count(), 1);
    assert.match(await a.locator(`[data-remote-draft] option[value="${copyId}"]`).textContent(), /Cópia renomeada/);
    // Após logout, login de outro escritório no mesmo navegador não abre o cache anterior.
    await second.locator("#btn-sair").click();
    await second.waitForURL("**/login.html?**");
    await second.locator("#email").waitFor({ state: "visible" });
    await second.locator("#email").fill("admin-b@example.test");
    await second.locator("#password").fill("correct-pass");
    await second.locator('button[type="submit"]').click();
    await second.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(await second.locator('[data-field="nome"]').count(), 0);
    await openPanel(second);
    assert.equal(
      await second.locator("[data-remote-office] option").count(),
      1,
    );
    assert.equal(
      await second.locator("[data-remote-company]").inputValue(),
      "30000000-0000-0000-0000-000000000002",
    );
    // Expiração/revogação é conferida na API antes de carregar os dados remotos.
    sql(
      "UPDATE cjs_private.sessions SET revoked_at=now() WHERE user_id='10000000-0000-0000-0000-000000000003';",
    );
    const status = await second.evaluate(async () => {
      const r = await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listOffices" }),
      });
      return r.status;
    });
    assert.equal(status, 401);
    assert.deepEqual(errors, []);
    console.log(
      "OK: navegador real — login individual, seleção, migração explícita, salvar/reabrir em outro navegador, conflito com cópia local, troca de conta e revogação.",
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
};

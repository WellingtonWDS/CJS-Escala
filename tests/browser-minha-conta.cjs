const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], pedidos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let resposta = { status: 422, json: { error: "Senha atual incorreta. Restam 4 tentativa(s) antes de um bloqueio de 15 minutos." } };
    await page.route("**/api/password", (r) => { pedidos.push(r.request().postDataJSON()); return r.fulfill(resposta); });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(async () => {
      const { initNavigation } = await import("/assets/js/ui/navigation.js");
      initNavigation({ session: { user: { id: "u1", name: "Maria Gerente", role: "manager" }, persistenceEnabled: true }, document, window });
    });
    const gatilho = page.locator("#sidebar-user [data-minha-conta]");
    assert.match(await gatilho.innerText(), /Maria Gerente/);
    assert.equal(await gatilho.getAttribute("aria-label"), "Minha conta — Maria Gerente");
    await page.setViewportSize({ width: 1440, height: 768 });
    assert(await page.locator("#app-sidebar").evaluate((s) => s.scrollHeight <= s.clientHeight + 1), "menu sem rolagem");
    await gatilho.click();
    const dlg = page.locator("dialog[data-minha-conta-dialog][open]");
    await dlg.waitFor();
    assert.match(await dlg.locator("h2").innerText(), /Maria Gerente/);
    assert.match(await dlg.locator(".conta-papel").innerText(), /Gerente/);
    // Validações no navegador antes de enviar.
    await dlg.locator("[data-dialog-accept]").click();
    assert.match(await dlg.locator("[data-msg]").innerText(), /senha atual/);
    await dlg.locator("#conta-atual").fill("SenhaAtual1");
    await dlg.locator("#conta-nova").fill("abc");
    assert.deepEqual(await dlg.locator("[data-regra]").evaluateAll((l) => l.map((x) => x.dataset.ok)), ["false", "true", "false"]);
    await dlg.locator("[data-dialog-accept]").click();
    assert.match(await dlg.locator("[data-msg]").innerText(), /8 a 72/);
    await dlg.locator("#conta-nova").fill("SenhaAtual1");
    await dlg.locator("[data-dialog-accept]").click();
    assert.match(await dlg.locator("[data-msg]").innerText(), /diferente da atual/);
    await dlg.locator("#conta-nova").fill("NovaSenha2026");
    await dlg.locator("#conta-confirmar").fill("Outra2026");
    await dlg.locator("[data-dialog-accept]").click();
    assert.match(await dlg.locator("[data-msg]").innerText(), /não conferem/);
    assert.equal(pedidos.length, 0);
    // Senha atual incorreta (servidor).
    await dlg.locator("#conta-confirmar").fill("NovaSenha2026");
    await dlg.locator("[data-ver=conta-nova]").click();
    assert.equal(await dlg.locator("#conta-nova").getAttribute("type"), "text");
    await dlg.locator("[data-dialog-accept]").click();
    await page.waitForFunction(() => /Restam 4/.test(document.querySelector("dialog[data-minha-conta-dialog] [data-msg]").textContent));
    assert.deepEqual(pedidos[0], { action: "change", current: "SenhaAtual1", password: "NovaSenha2026" });
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      const falhas = await contrast(page, "dialog[data-minha-conta-dialog]");
      assert.deepEqual(falhas, [], `contraste ${tema}: ${JSON.stringify(falhas).slice(0, 300)}`);
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    // Sucesso.
    resposta = { json: { ok: true, sessionsRevoked: 2 } };
    await dlg.locator("[data-dialog-accept]").click();
    await page.waitForFunction(() => /Senha alterada/.test(document.querySelector("dialog[data-minha-conta-dialog] [data-msg]").textContent));
    assert.match(await dlg.locator("[data-msg]").innerText(), /2 sessão\(ões\) em outros aparelhos/);
    assert.equal(await dlg.locator("#conta-atual").isDisabled(), true);
    if (process.env.CONTA_SCREENSHOT) await page.screenshot({ path: process.env.CONTA_SCREENSHOT });
    await dlg.locator("[data-dialog-accept]").click();
    await page.locator("dialog[data-minha-conta-dialog]").waitFor({ state: "detached" });
    assert(await gatilho.evaluate((e) => document.activeElement === e), "foco volta ao nome");
    // Modo compartilhado: nome sem botão.
    await page.evaluate(async () => {
      document.getElementById("sidebar-user").replaceChildren();
      const { initNavigation } = await import("/assets/js/ui/navigation.js?local");
      initNavigation({ session: { user: { name: "Local" }, persistenceEnabled: false }, document, window });
    });
    assert.equal(await page.locator("#sidebar-user [data-minha-conta]").count(), 0);
    assert.deepEqual(errors, []);
    console.log("OK: minha conta — nome abre o modal, validações, senha atual incorreta, troca com sessões encerradas, contraste, foco e modo local sem botão.");
  } finally {
    await context.close();
  }
};

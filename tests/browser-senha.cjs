const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
const TOKEN = "b".repeat(64);
module.exports = async ({ browser, baseURL }) => {
  const raiz = baseURL.replace(/\/$/, "");
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], pedidos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/auth?config=1", (r) => r.fulfill({ json: { mode: "n8n" } }));
    let valido = true;
    await page.route("**/api/password", (r) => {
      const body = r.request().postDataJSON();
      pedidos.push(body);
      if (body.action === "request") return r.fulfill({ json: { ok: true, message: "Se o e-mail estiver cadastrado e com acesso ativo, enviaremos em instantes um link para criar uma nova senha. O link vale por 30 minutos." } });
      if (body.action === "check") return r.fulfill({ json: { valid: valido } });
      return r.fulfill(body.password === "Expirada123" ? { status: 410, json: { error: "Este link é inválido, já foi usado ou expirou. Peça um novo." } } : { json: { ok: true, sessionsRevoked: 1 } });
    });
    // 1. Login → Esqueci minha senha.
    await page.goto(raiz + "/login.html");
    await page.locator("#login-forgot").waitFor();
    await page.locator("#email").fill("gerente@exemplo.test");
    await page.locator("#login-forgot").click();
    assert.equal(await page.locator("#forgot-form").isVisible(), true);
    assert.equal(await page.locator("#login-form").isHidden(), true);
    assert.equal(await page.locator("#login-title").innerText(), "Recuperar acesso");
    assert.equal(await page.locator("#forgot-email").inputValue(), "gerente@exemplo.test", "aproveita o e-mail digitado");
    await page.locator("#forgot-email").fill("invalido");
    await page.locator("#forgot-form button[type=submit]").click();
    assert.match(await page.locator("#forgot-message").innerText(), /e-mail válido/);
    assert.equal(pedidos.length, 0);
    await page.locator("#forgot-email").fill("gerente@exemplo.test");
    await page.locator("#forgot-form button[type=submit]").click();
    await page.waitForFunction(() => /link para criar uma nova senha/.test(document.querySelector("#forgot-message").textContent));
    assert.deepEqual(pedidos[0], { action: "request", email: "gerente@exemplo.test" });
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      assert.deepEqual(await contrast(page, ".login-card"), [], `contraste ${tema}`);
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await page.locator("#forgot-back").click();
    assert.equal(await page.locator("#login-form").isVisible(), true);
    // Endereço direto (#esqueci) abre o pedido.
    await page.goto(raiz + "/login.html#esqueci");
    await page.locator("#forgot-form").waitFor({ state: "visible" });
    // 2. Página do link: token sai da barra de endereço; regras e confirmação.
    await page.goto(raiz + "/redefinir-senha.html#token=" + TOKEN);
    await page.locator("#reset-form").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => location.hash), "", "token retirado da barra de endereço");
    assert.deepEqual(pedidos.at(-1), { action: "check", token: TOKEN });
    await page.locator("#nova-senha").fill("abc");
    assert.deepEqual(await page.locator("[data-regra]").evaluateAll((l) => l.map((x) => x.dataset.ok)), ["false", "true", "false"]);
    await page.locator("#nova-senha").fill("NovaSenha2026");
    assert.deepEqual(await page.locator("[data-regra]").evaluateAll((l) => l.map((x) => x.dataset.ok)), ["true", "true", "true"]);
    await page.locator("[data-ver=nova-senha]").click();
    assert.equal(await page.locator("#nova-senha").getAttribute("type"), "text");
    await page.locator("#confirmar-senha").fill("Diferente2026");
    await page.locator("#reset-form button[type=submit]").click();
    assert.match(await page.locator("#reset-message").innerText(), /não conferem/);
    await page.locator("#confirmar-senha").fill("NovaSenha2026");
    if (process.env.SENHA_SCREENSHOT) await page.screenshot({ path: process.env.SENHA_SCREENSHOT + "-form.png" });
    await page.locator("#reset-form button[type=submit]").click();
    await page.locator("#reset-done").waitFor({ state: "visible" });
    assert.deepEqual(pedidos.at(-1), { action: "reset", token: TOKEN, password: "NovaSenha2026" });
    assert.equal(await page.locator("#reset-title").innerText(), "Senha alterada");
    assert.deepEqual(await contrast(page, ".login-card"), []);
    // 3. Link vencido ou inválido.
    valido = false;
    await page.goto(raiz + "/redefinir-senha.html#token=" + TOKEN);
    await page.locator("#reset-new-link").waitFor({ state: "visible" });
    assert.match(await page.locator("#reset-status").innerText(), /expirou/);
    assert.equal(await page.locator("#reset-form").isHidden(), true);
    await page.goto(raiz + "/redefinir-senha.html");
    await page.locator("#reset-new-link").waitFor({ state: "visible" });
    assert.match(await page.locator("#reset-status").innerText(), /Link incompleto/);
    valido = true;
    await page.goto(raiz + "/redefinir-senha.html#token=" + TOKEN);
    await page.locator("#reset-form").waitFor({ state: "visible" });
    await page.locator("#nova-senha").fill("Expirada123");
    await page.locator("#confirmar-senha").fill("Expirada123");
    await page.locator("#reset-form button[type=submit]").click();
    await page.locator("#reset-new-link").waitFor({ state: "visible" });
    await page.setViewportSize({ width: 360, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    console.log("OK: esqueci minha senha — pedido com resposta neutra, e-mail validado, página de redefinição com token fora da URL, regras, confirmação, link expirado/inválido, contraste e celular.");
  } finally {
    await context.close();
  }
};

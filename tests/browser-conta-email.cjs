const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
const { respondToDialogs } = require("./helpers/dialogs.cjs");
const TOKEN = "c".repeat(64);
const office = "20000000-0000-0000-0000-000000000001";

async function minhaConta(browser, baseURL) {
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], pedidos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let pendente = null;
    await page.route("**/api/account", (r) => {
      if (r.request().method() === "GET") return r.fulfill({ json: { name: "Maria Gerente", email: "maria@exemplo.test", pendingEmail: pendente, emailChangeEnabled: true } });
      const body = r.request().postDataJSON();
      pedidos.push(body);
      if (body.action === "name") return r.fulfill({ json: { ok: true, name: body.name } });
      if (body.current === "Errada1") return r.fulfill({ status: 422, json: { error: "Senha atual incorreta. Restam 4 tentativa(s) antes de um bloqueio de 15 minutos." } });
      return r.fulfill({ json: { ok: true, pendingEmail: body.email } });
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(async () => {
      const { initNavigation } = await import("/assets/js/ui/navigation.js");
      initNavigation({ session: { user: { id: "u1", name: "Maria Gerente", role: "manager" }, persistenceEnabled: true }, document, window });
    });
    const gatilho = page.locator("#sidebar-user [data-minha-conta]");
    await gatilho.click();
    const dlg = page.locator("dialog[data-minha-conta-dialog][open]");
    await dlg.waitFor();
    await page.waitForFunction(() => document.querySelector("[data-email-atual]")?.textContent === "maria@exemplo.test");
    // Nome.
    await dlg.locator("#conta-nome").fill("M");
    await dlg.locator("[data-nome-form] button[type=submit]").click();
    assert.match(await dlg.locator("[data-nome-msg]").innerText(), /nome completo/);
    await dlg.locator("#conta-nome").fill("Maria Souza");
    await dlg.locator("[data-nome-form] button[type=submit]").click();
    await page.waitForFunction(() => /Nome atualizado/.test(document.querySelector("[data-nome-msg]").textContent));
    assert.equal(await dlg.locator("h2").innerText(), "Maria Souza");
    assert.match(await gatilho.innerText(), /Maria Souza/, "menu mostra o novo nome");
    assert.equal(await gatilho.getAttribute("aria-label"), "Minha conta — Maria Souza");
    // E-mail: campos só aparecem ao pedir a troca.
    assert.equal(await dlg.locator("[data-email-campos]").isHidden(), true);
    await dlg.locator("[data-email-abrir]").click();
    await dlg.locator("#conta-email-novo").fill("maria@exemplo.test");
    await dlg.locator("[data-email-form] button[type=submit]").click();
    assert.match(await dlg.locator("[data-email-msg]").innerText(), /já é o seu e-mail/);
    await dlg.locator("#conta-email-novo").fill("maria.nova@exemplo.test");
    await dlg.locator("[data-email-form] button[type=submit]").click();
    assert.match(await dlg.locator("[data-email-msg]").innerText(), /senha atual/);
    await dlg.locator("#conta-email-senha").fill("Errada1");
    await dlg.locator("[data-email-form] button[type=submit]").click();
    await page.waitForFunction(() => /Restam 4/.test(document.querySelector("[data-email-msg]").textContent));
    await dlg.locator("#conta-email-senha").fill("SenhaAtual1");
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      const falhas = await contrast(page, "dialog[data-minha-conta-dialog]");
      assert.deepEqual(falhas, [], `contraste ${tema}: ${JSON.stringify(falhas).slice(0, 300)}`);
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await page.waitForTimeout(300);
    if (process.env.CONTA_EMAIL_SCREENSHOT) await page.screenshot({ path: process.env.CONTA_EMAIL_SCREENSHOT });
    await dlg.locator("[data-email-form] button[type=submit]").click();
    await page.waitForFunction(() => /Enviamos o link/.test(document.querySelector("[data-email-msg]").textContent));
    assert.match(await dlg.locator("[data-email-pendente]").innerText(), /Aguardando confirmação de maria\.nova@exemplo\.test/);
    assert.equal(await dlg.locator("[data-email-campos]").isHidden(), true);
    assert.equal(await dlg.locator("#conta-email-senha").inputValue(), "", "senha não fica no campo");
    assert.equal(await dlg.locator("[data-email-atual]").innerText(), "maria@exemplo.test", "e-mail atual segue até confirmar");
    assert.deepEqual(pedidos.map((p) => p.action), ["name", "email", "email"]);
    assert.deepEqual(pedidos.at(-1), { action: "email", email: "maria.nova@exemplo.test", current: "SenhaAtual1" });
    // Celular: sem rolagem lateral.
    await page.setViewportSize({ width: 375, height: 740 });
    assert(await dlg.evaluate((d) => d.scrollWidth <= d.clientWidth + 1), "modal sem rolagem lateral no celular");
    // Ao reabrir, a troca pendente aparece.
    pendente = "maria.nova@exemplo.test";
    await dlg.locator(".conta-fechar").click();
    await page.locator("dialog[data-minha-conta-dialog]").waitFor({ state: "detached" });
    await gatilho.click();
    await page.waitForFunction(() => !document.querySelector("[data-email-pendente]")?.hidden);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function confirmarPagina(browser, baseURL) {
  const raiz = baseURL.replace(/\/$/, "");
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], pedidos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let status = 200;
    await page.route("**/api/account", (r) => {
      pedidos.push(r.request().postDataJSON());
      return r.fulfill(status === 200 ? { json: { ok: true, email: "maria.nova@exemplo.test" } } : { status, json: { error: "Este link é inválido, já foi usado ou expirou. Peça a troca novamente em Minha conta." } });
    });
    await page.goto(raiz + "/confirmar-email.html");
    assert.equal(await page.locator("#email-status").getAttribute("data-tipo"), "erro");
    assert.equal(await page.locator("#email-form").isHidden(), true);
    await page.goto("about:blank");
    await page.goto(raiz + "/confirmar-email.html#token=" + TOKEN);
    assert.equal(new URL(page.url()).hash, "", "token sai da barra de endereço");
    assert.equal(pedidos.length, 0, "só confirma com o clique");
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      assert.deepEqual(await contrast(page, ".login-card"), [], `contraste ${tema}`);
    }
    await page.locator("#email-form button").click();
    await page.locator("#email-done").waitFor();
    assert.match(await page.locator("#email-done").innerText(), /maria\.nova@exemplo\.test/);
    assert.deepEqual(pedidos[0], { action: "confirmEmail", token: TOKEN });
    status = 410;
    await page.goto("about:blank");
    await page.goto(raiz + "/confirmar-email.html#token=" + TOKEN);
    await page.locator("#email-form button").click();
    await page.waitForFunction(() => document.getElementById("email-form").hidden);
    assert.match(await page.locator("#email-status").innerText(), /expirou/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function semEmpresas(browser, baseURL, role) {
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], avisos = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/companies*", (r) => r.fulfill({ json: { offices: [{ id: office, name: "Contabilidade Alfa", canCreate: role !== "operator", plan: null }], companies: [] } }));
    await page.route("**/api/plans*", (r) => r.fulfill({ json: {} }));
    await respondToDialogs(page, async (d) => { avisos.push(d.message()); await d.accept(); });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate((role) => import("/assets/js/ui/navigation.js").then(({ initNavigation }) => initNavigation({
      session: { user: { name: "Pessoa", role }, persistenceEnabled: true }, document, window,
      workspace: { context: () => null }, remote: { open: async () => true },
    })), role);
    await page.waitForFunction(() => document.body.dataset.appView === "home" && !document.getElementById("companies-home").hidden);
    const esperarAvisos = async (n) => { for (let i = 0; i < 100 && avisos.length < n; i++) await page.waitForTimeout(50); };
    await page.locator('#app-sidebar [data-app-view="schedule"]').click();
    await esperarAvisos(1);
    await page.waitForFunction(() => document.body.dataset.appView === "home" && document.getElementById("scheduler-view").hidden);
    assert.equal(avisos.length, 1);
    if (role === "operator") {
      assert.match(avisos[0], /Peça ao gerente/);
      assert.equal(await page.locator("#company-create").isHidden(), true);
    } else {
      assert.match(avisos[0], /Cadastre a primeira empresa/);
      await page.locator("#company-create").waitFor();
      assert(await page.locator('#company-create [name="name"]').evaluate((e) => document.activeElement === e), "foco no nome da empresa");
    }
    // Recarregar numa etapa da escala também bloqueia.
    await page.evaluate(() => { window.location.hash = "#sec-config"; });
    await esperarAvisos(2);
    await page.waitForFunction(() => window.location.hash === "#empresas" && document.body.dataset.appView === "home");
    assert.equal(avisos.length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

module.exports = async ({ browser, baseURL }) => {
  await minhaConta(browser, baseURL);
  await confirmarPagina(browser, baseURL);
  await semEmpresas(browser, baseURL, "manager");
  await semEmpresas(browser, baseURL, "operator");
  console.log("OK: minha conta — nome e troca de e-mail com confirmação; página de confirmação; Gerar escala bloqueado sem empresas (gerente cadastra, operador é orientado).");
};

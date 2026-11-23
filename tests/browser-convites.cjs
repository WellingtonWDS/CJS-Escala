const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
const { respondToDialogs } = require("./helpers/dialogs.cjs");
const TOKEN = "d".repeat(64);
module.exports = async ({ browser, baseURL }) => {
  const raiz = baseURL.replace(/\/$/, "");
  const context = await browser.newContext();
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(), errors = [], posts = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const office = "20000000-0000-0000-0000-000000000001", company = "30000000-0000-0000-0000-000000000001";
    const options = {
      platformAdmin: false, currentUserId: "u-gerente", invitesEnabled: true,
      offices: [{ id: office, name: "Contabilidade Alfa", active: true, canCreate: true }],
      companies: [{ id: company, officeId: office, name: "Padaria Pão Bom", cnpj: "11222333000181" }, { id: "30000000-0000-0000-0000-000000000002", officeId: office, name: "Mercado Bairro", cnpj: "11444777000161" }, { id: "30000000-0000-0000-0000-000000000003", officeId: office, name: "Loja Centro", cnpj: "04252011000110" }],
      users: [
        { id: "u-gerente", officeId: office, name: "Gerente Alfa", email: "gerente@alfa.test", role: "manager", active: true, membershipActive: true, accountActive: true, canEdit: false, canEditIdentity: true, companyIds: [], revision: 1 },
        { id: "u-novo", officeId: office, name: "Operador Novo", email: "novo@alfa.test", role: "operator", active: true, membershipActive: true, accountActive: true, canEdit: true, canEditIdentity: true, companyIds: [company], revision: 1 },
        { id: "u-antigo", officeId: office, name: "Operador Antigo", email: "antigo@alfa.test", role: "operator", active: true, membershipActive: true, accountActive: true, canEdit: true, canEditIdentity: true, companyIds: [company], revision: 1 },
      ],
      pendingInvites: [{ userId: "u-novo", expired: false }],
    };
    await page.route("**/api/admin", (r) => {
      if (r.request().method() === "GET") return r.fulfill({ json: options });
      const body = r.request().postDataJSON();
      posts.push(body);
      return body.action === "inviteUser"
        ? r.fulfill({ status: 201, json: { ok: true, user: { id: "u-3", name: body.name.trim() }, emailSent: true } })
        : r.fulfill({ json: { ok: true, kind: body.userId === "u-novo" ? "invite" : "reset", emailSent: true } });
    });
    await respondToDialogs(page, (d) => d.accept());
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(async () => {
      const { initNavigation } = await import("/assets/js/ui/navigation.js");
      initNavigation({ session: { user: { id: "u-gerente", name: "Gerente Alfa", role: "manager" }, persistenceEnabled: false }, document, window });
    });
    await page.locator('[data-app-view="users"]').click();
    await page.locator('[data-user-id="u-novo"]').waitFor();
    assert.match(await page.locator('[data-user-id="u-novo"]').innerText(), /Convite pendente/);
    // Gerente: um único escritório, sem filtro nem campo de escritório no cadastro.
    assert.equal(await page.locator("[data-users-office-box]").isHidden(), true);
    assert.equal(await page.locator("[data-users-search]").getAttribute("placeholder"), "Nome ou e-mail");
    await page.locator("[data-user-new]").click();
    assert.equal(await page.locator("[data-create-office]").isHidden(), true);
    assert.equal(await page.locator('#manage-create [name="officeId"]').inputValue(), office, "escritório do Gerente segue no envio");
    await page.keyboard.press("Escape");
    await page.locator("dialog[data-user-editor]").waitFor({ state: "hidden" });
    assert.doesNotMatch(await page.locator('[data-user-id="u-antigo"]').innerText(), /Convite/);
    // Novo usuário: sem senha, convite por e-mail.
    await page.locator("[data-user-new]").click();
    assert.equal(await page.locator('#manage-create [name="password"], #manage-create [name="confirmation"]').count(), 0);
    assert.match(await page.locator("[data-invite-help]").innerText(), /cria a própria senha[\s\S]*7 dias/);
    assert.equal(await page.locator("#manage-create button[type=submit]").innerText(), "Enviar convite");
    await page.locator('#manage-create [name="name"]').fill("Ana Nova");
    await page.locator('#manage-create [name="email"]').fill("ana@alfa.test");
    // Cadastro em modal, com seleção de todas as empresas.
    assert.equal(await page.locator("dialog[data-user-editor]").evaluate((d) => d.open), true);
    assert.equal(await page.locator("dialog[data-user-editor]").evaluate((d) => d.matches(":modal")), true);
    await page.locator('#manage-create [name="role"]').selectOption("operator");
    assert.match(await page.locator("[data-create-count]").innerText(), /0 de 3 selecionada/);
    await page.locator('[data-select-all="create"]').click();
    assert.equal(await page.locator("[data-create-companies] input:checked").count(), 3);
    assert.match(await page.locator("[data-create-count]").innerText(), /3 de 3/);
    await page.locator('[data-select-none="create"]').click();
    await page.locator("[data-create-company-search]").fill("Padaria");
    await page.locator('[data-select-all="create"]').click();
    assert.equal(await page.locator("[data-create-companies] input:checked").count(), 1, "considera só as empresas da busca");
    await page.locator("[data-create-company-search]").fill("");
    await page.locator('#manage-create [name="role"]').selectOption("manager");
    assert.equal(await page.locator("[data-create-bulk]").isHidden(), true, "Gerente já acessa todas as empresas");
    await page.locator('#manage-create [name="role"]').selectOption("operator");
    if (process.env.CONVITE_SCREENSHOT) await page.screenshot({ path: process.env.CONVITE_SCREENSHOT });
    await page.keyboard.press("Escape");
    await page.locator("dialog[data-user-editor]").waitFor({ state: "hidden" });
    await page.locator("[data-user-new]").click();
    await page.locator('#manage-create [name="name"]').fill("Ana Nova");
    await page.locator('#manage-create [name="email"]').fill("ana@alfa.test");
    await page.locator('#manage-create [name="role"]').selectOption("operator");
    await page.locator(`[data-create-companies] input[value="${company}"]`).check();
    await page.locator("#manage-create button[type=submit]").click();
    await page.waitForFunction(() => /Convite enviado para ana@alfa\.test/.test(document.querySelector("[data-management-status]").textContent));
    assert.equal(await page.locator("dialog[data-user-editor]").evaluate((d) => d.open), false, "modal fecha ao enviar");
    assert.deepEqual(posts[0], { action: "inviteUser", name: "Ana Nova", email: "ana@alfa.test", officeId: office, role: "operator", companyIds: [company] });
    // Reenvio do convite e redefinição pelo Gerente.
    await page.locator('[data-user-id="u-novo"] [data-user-edit]').click();
    assert.equal(await page.locator("[data-access-link]").innerText(), "Reenviar convite");
    await page.locator("[data-access-link]").click();
    await page.waitForFunction(() => /Convite reenviado/.test(document.querySelector("[data-management-status]").textContent));
    assert.deepEqual(posts[1], { action: "sendAccessLink", userId: "u-novo", officeId: office, companyIds: [] });
    await page.locator('[data-user-id="u-antigo"] [data-user-edit]').click();
    assert.equal(await page.locator("[data-access-link]").innerText(), "Enviar link para redefinir a senha");
    assert.match(await page.locator("[data-access-help]").innerText(), /24 horas[\s\S]*não vê nem define a senha/);
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      const falhas = await contrast(page, "#user-management");
      assert.deepEqual(falhas, [], `contraste ${tema}: ${JSON.stringify(falhas).slice(0, 500)}`);
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await page.locator("[data-access-link]").click();
    await page.waitForFunction(() => /Link de redefinição enviado para antigo@alfa\.test/.test(document.querySelector("[data-management-status]").textContent));
    // Admin global: convite sem escritório nem empresas.
    options.platformAdmin = true;
    await page.locator("[data-users-refresh]").click();
    await page.waitForFunction(() => !document.querySelector("#user-management").hasAttribute("aria-busy"));
    await page.locator("[data-user-new]").click();
    await page.locator('#manage-create [name="role"]').selectOption("admin");
    assert.equal(await page.locator("[data-create-office]").isHidden(), true);
    assert.equal(await page.locator("[data-create-companies-box]").isHidden(), true);
    assert.match(await page.locator("[data-create-role-help]").innerText(), /Não precisa de vínculo com escritório/);
    await page.locator('#manage-create [name="name"]').fill("Admin Novo");
    await page.locator('#manage-create [name="email"]').fill("admin@fintria.test");
    await page.locator("#manage-create button[type=submit]").click();
    await page.waitForFunction(() => /Convite enviado para admin@fintria\.test/.test(document.querySelector("[data-management-status]").textContent));
    assert.deepEqual(posts.at(-1), { action: "inviteUser", name: "Admin Novo", email: "admin@fintria.test", role: "admin", officeId: null, companyIds: [] });
    await page.locator("[data-user-new]").click();
    // Operador volta a usar o escritório (único disponível, preenchido automaticamente).
    assert.equal(await page.locator('#manage-create [name="officeId"]').isDisabled(), false);
    assert.equal(await page.locator('#manage-create [name="officeId"]').inputValue(), office);
    await page.keyboard.press("Escape");
    options.platformAdmin = false;
    // Admin muda escritório e perfil: Admin sem escritório vira Operador de um escritório.
    options.platformAdmin = true;
    options.offices.push({ id: "20000000-0000-0000-0000-000000000002", name: "Contabilidade Beta", active: true, canCreate: true });
    options.companies.push({ id: "30000000-0000-0000-0000-000000000009", officeId: "20000000-0000-0000-0000-000000000002", name: "Oficina Beta", cnpj: "11444777000161" });
    options.users.push({ id: "u-admin2", officeId: null, name: "Admin Dois", email: "admin2@alfa.test", role: "admin", active: true, membershipActive: false, accountActive: true, canEdit: true, canEditIdentity: true, companyIds: [], revision: 4 });
    await page.route("**/api/admin", (r) => {
      if (r.request().method() === "GET") return r.fulfill({ json: options });
      const body = r.request().postDataJSON();
      posts.push(body);
      return r.fulfill({ json: body.action === "moveUser" ? { ok: true, revision: 5, officeId: body.toOfficeId } : { ok: true, revision: 6 } });
    });
    await page.locator("[data-users-refresh]").click();
    await page.waitForFunction(() => !document.querySelector("#user-management").hasAttribute("aria-busy"));
    assert.equal(await page.locator("[data-users-office-box]").isVisible(), true, "Admin filtra por escritório");
    await page.locator('[data-user-id="u-admin2"] [data-user-edit]').click();
    assert.equal(await page.locator("[data-edit-office-box]").isVisible(), true);
    assert.equal(await page.locator("#manage-edit [name=role]").isDisabled(), false, "perfil de Admin sem escritório pode mudar");
    assert.equal(await page.locator("[data-edit-office-select] option:checked").innerText(), "Sem escritório (Admin global)");
    await page.locator("#manage-edit [name=role]").selectOption("operator");
    await page.locator("#manage-edit button[type=submit]").click();
    await page.waitForFunction(() => /Escolha o escritório do usuário/.test(document.querySelector("[data-management-status]").textContent));
    await page.locator("[data-edit-office-select]").selectOption("20000000-0000-0000-0000-000000000002");
    assert.equal(await page.locator("[data-edit-companies] input").count(), 1, "empresas do novo escritório");
    await page.locator('[data-select-all="edit"]').click();
    await page.locator("#manage-edit button[type=submit]").click();
    await page.waitForFunction(() => /Admin Dois agora pertence a Contabilidade Beta como Operador/.test(document.querySelector("[data-management-status]").textContent));
    assert.deepEqual(posts.at(-1), { action: "moveUser", userId: "u-admin2", revision: 4, toOfficeId: "20000000-0000-0000-0000-000000000002", role: "operator", companyIds: ["30000000-0000-0000-0000-000000000009"] });
    // Operador de A passa para B (sem mudar o perfil).
    await page.locator('[data-user-id="u-antigo"] [data-user-edit]').click();
    await page.locator("[data-edit-office-select]").selectOption("20000000-0000-0000-0000-000000000002");
    await page.locator('[data-select-all="edit"]').click();
    await page.locator("#manage-edit button[type=submit]").click();
    await page.waitForFunction(() => /Operador Antigo agora pertence a Contabilidade Beta/.test(document.querySelector("[data-management-status]").textContent));
    assert.equal(posts.at(-1).action, "moveUser");
    // Sem mudança de escritório: edição normal.
    await page.locator('[data-user-id="u-novo"] [data-user-edit]').click();
    await page.locator('#manage-edit [name="name"]').fill("Operador Renomeado");
    await page.locator("#manage-edit button[type=submit]").click();
    await page.waitForFunction(() => /Usuário e acessos atualizados/.test(document.querySelector("[data-management-status]").textContent));
    assert.equal(posts.at(-1).action, "updateUser");
    options.platformAdmin = false;
    // Sem envio de e-mail configurado, o convite fica indisponível.
    options.invitesEnabled = false;
    await page.locator("[data-users-refresh]").click();
    await page.waitForFunction(() => !document.querySelector("#user-management").hasAttribute("aria-busy"));
    await page.locator("[data-user-new]").click();
    assert.match(await page.locator("[data-invite-help]").innerText(), /não está configurado/);
    // Página do convite: "Criar sua senha".
    await page.route("**/api/password", (r) => {
      const body = r.request().postDataJSON();
      return r.fulfill({ json: body.action === "check" ? { valid: true, kind: "invite", officeName: "Contabilidade Alfa" } : { ok: true, kind: "invite" } });
    });
    await page.goto(raiz + "/redefinir-senha.html#token=" + TOKEN);
    await page.locator("#reset-form").waitFor({ state: "visible" });
    assert.equal(await page.locator("#reset-title").innerText(), "Bem-vindo ao Reescala");
    assert.match(await page.locator("#reset-status").innerText(), /Crie sua senha[\s\S]*Contabilidade Alfa/);
    assert.equal(await page.locator('label[for="nova-senha"]').innerText(), "Sua senha");
    await page.locator("#nova-senha").fill("MinhaSenha2026");
    await page.locator("#confirmar-senha").fill("MinhaSenha2026");
    await page.locator("#reset-form button[type=submit]").click();
    await page.locator("#reset-done").waitFor({ state: "visible" });
    assert.equal(await page.locator("#reset-title").innerText(), "Senha criada");
    assert.match(await page.locator("#reset-done").innerText(), /conta está ativa[\s\S]*Entrar no Reescala/);
    assert.deepEqual(errors, []);
    console.log("OK: convites — cadastro sem senha, convite por e-mail, selo de pendente, reenvio, redefinição pelo Gerente, e-mail não configurado, página Criar sua senha e contraste.");
  } finally {
    await context.close();
  }
};

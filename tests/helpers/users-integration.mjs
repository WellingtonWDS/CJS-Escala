import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAdminHandler } from "../../server/admin.js";
import { issueSession } from "../../server/auth.js";
import { createDevServer } from "../../scripts/serve.js";
import dialogs from "./dialogs.cjs";
export async function testUsersIntegration({ env, sql, browserTest }) {
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "directory-cookie-key-with-enough-characters",
    N8N_LOGIN_URL: "https://unused.example/login",
    N8N_SERVICE_SECRET: "directory-service-key-with-enough-characters",
    N8N_JWT_SECRET: "directory-identity-key-with-enough-characters",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
  };
  const office = randomUUID(),
    otherOffice = randomUUID(),
    company = randomUUID(),
    second = randomUUID(),
    foreignCompany = randomUUID();
  sql(
    `INSERT INTO cjs_private.offices(id,name) VALUES('${office}','Diretório A'),('${otherOffice}','Diretório B');INSERT INTO cjs_private.companies(id,office_id,name) VALUES('${company}','${office}','Loja A'),('${second}','${office}','Loja A segunda'),('${foreignCompany}','${otherOffice}','Loja B');`,
  );
  async function session(id) {
    const sid = randomUUID();
    sql(
      `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${id}',now()+interval '1 hour');`,
    );
    return (
      "cjs_session=" +
      (await issueSession(settings, Date.now(), {
        userId: id,
        sessionId: sid,
        expiresAt: Date.now() + 3600000,
      }))
    );
  }
  async function actor(name, officeId, admin = false) {
    const id = randomUUID();
    sql(
      `INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('${id}','directory:${id}','${name}',${admin});${officeId ? `INSERT INTO cjs_private.memberships VALUES('${id}','${officeId}','admin',true);` : ""}`,
    );
    return { id, cookie: await session(id) };
  }
  const admin = await actor("Admin diretório", null, true),
    manager = await actor("Gerente diretório A", office),
    otherManager = await actor("Gerente diretório B", otherOffice);
  const handler = createAdminHandler({ env: settings });
  const request = (body, cookie = admin.cookie) =>
    new Request("https://app.example/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookie,
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function options(cookie = admin.cookie) {
    const r = await handler(request(null, cookie));
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  }
  async function create(name, email, officeId = office) {
    const r = await handler(
      request({
        action: "createUser",
        name,
        email,
        password: "123456",
        officeId,
        role: "operator",
        companyIds: [officeId === office ? company : foreignCompany],
      }),
    );
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).user.id;
  }
  const id = await create(
      "Operador diretório",
      "directory-operator@example.test",
    ),
    otherId = await create(
      "Operador outro escritório",
      "directory-other@example.test",
      otherOffice,
    ),
    operatorCookie = await session(id);
  const row = async (target = id, officeId = office, cookie = admin.cookie) =>
    (await options(cookie)).users.find(
      (u) => u.id === target && u.officeId === officeId,
    );
  const body = (u, patch = {}) => ({
    action: "updateUser",
    userId: u.id,
    officeId: u.officeId,
    revision: u.revision,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.membershipActive,
    accountActive: u.accountActive,
    companyIds: u.companyIds,
    ...patch,
  });
  let visible = await options(manager.cookie);
  assert.ok(visible.users.every((u) => u.officeId === office));
  assert.ok(visible.users.some((u) => u.id === manager.id));
  assert.equal((await handler(request(null, operatorCookie))).status, 403);
  assert.equal(
    (await handler(request(body(await row()), operatorCookie))).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(otherId, otherOffice)), manager.cookie),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(), { role: "admin" }), manager.cookie),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(), { accountActive: false }), manager.cookie),
      )
    ).status,
    403,
  );
  const initial = await row(),
    hash = sql(
      `SELECT password_hash FROM public.users WHERE email='directory-operator@example.test';`,
    );
  let r = await handler(
    request(
      body(initial, {
        name: "Operador atualizado",
        email: "directory-edited@example.test",
        companyIds: [second],
      }),
      manager.cookie,
    ),
  );
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(
    sql(
      `SELECT password_hash FROM public.users WHERE email='directory-edited@example.test';`,
    ),
    hash,
  );
  assert.equal(
    sql(
      `SELECT username FROM public.users WHERE email='directory-edited@example.test';`,
    ),
    "Operador atualizado",
  );
  assert.equal(
    (
      await handler(
        request(body(initial, { name: "Nome obsoleto" }), manager.cookie),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await handler(
        request(
          body(await row(), { email: "directory-other@example.test" }),
          manager.cookie,
        ),
      )
    ).status,
    409,
  );
  assert.equal((await row()).name, "Operador atualizado");
  assert.equal(
    (
      await handler(
        request(
          body(await row(), { companyIds: [foreignCompany] }),
          manager.cookie,
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        request(
          body(await row(manager.id, office), { active: false }),
          manager.cookie,
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        request(
          body(await row(manager.id, office), { role: "operator" }),
          manager.cookie,
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(admin.id, null), { accountActive: false })),
      )
    ).status,
    400,
  );
  r = await handler(
    request(body(await row(), { active: false }), manager.cookie),
  );
  assert.equal(r.status, 200);
  assert.equal((await row(id, office, manager.cookie)).active, false);
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.memberships WHERE user_id='${id}' AND active;`,
    ),
    "0",
  );
  assert.equal(
    (
      await handler(
        request(body(await row(), { active: true }), manager.cookie),
      )
    ).status,
    200,
  );
  // Nome/e-mail de uma conta compartilhada não podem ser mudados por um só escritório.
  sql(
    `INSERT INTO cjs_private.memberships VALUES('${id}','${otherOffice}','editor',true);INSERT INTO cjs_private.company_access VALUES('${id}','${otherOffice}','${foreignCompany}');`,
  );
  assert.equal((await row(id, office, manager.cookie)).canEditIdentity, false);
  assert.equal(
    (
      await handler(
        request(
          body(await row(), { name: "Alteração cruzada" }),
          manager.cookie,
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(), { active: false }), manager.cookie),
      )
    ).status,
    200,
  );
  assert.equal(
    sql(
      `SELECT active FROM cjs_private.memberships WHERE user_id='${id}' AND office_id='${otherOffice}';`,
    ),
    "t",
  );
  assert.equal((await row(id, otherOffice, otherManager.cookie)).active, true);
  assert.equal(
    (await handler(request(body(await row(), { active: true })))).status,
    200,
  );
  // Admin pode editar tudo, mas o Gerente não edita Admin nem promove contas globais.
  assert.equal(
    (
      await handler(
        request(body(await row(otherId, otherOffice), { role: "admin" })),
      )
    ).status,
    200,
  );
  const globalRow = await row(otherId, otherOffice, otherManager.cookie);
  assert.equal(globalRow.canEdit, false);
  assert.equal(
    (
      await handler(
        request(body(globalRow, { name: "Intrusão" }), otherManager.cookie),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request(body(await row(), { role: "manager" }), manager.cookie),
      )
    ).status,
    200,
  );
  assert.equal((await row()).role, "manager");
  assert.ok(
    (await options(operatorCookie)).users.every((u) => u.officeId === office),
  );
  assert.equal((await row(id, otherOffice)).role, "operator");
  assert.equal(
    (
      await handler(
        request(body(await row(), { role: "operator" }), manager.cookie),
      )
    ).status,
    200,
  );
  const legacyId = await create(
    "Consulta diretório",
    "directory-viewer@example.test",
  );
  sql(
    `UPDATE cjs_private.memberships SET role='viewer' WHERE user_id='${legacyId}';`,
  );
  assert.equal(
    (
      await handler(
        request(
          body(await row(legacyId), { name: "Consulta preservada" }),
          manager.cookie,
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    sql(
      `SELECT role FROM cjs_private.memberships WHERE user_id='${legacyId}';`,
    ),
    "viewer",
  );
  assert.equal(
    (await handler(request({ ...body(await row()), userId: randomUUID() })))
      .status,
    404,
  );
  const revision = await row();
  const concurrent = await Promise.all([
    handler(request(body(revision, { name: "Concorrente A" }))),
    handler(request(body(revision, { name: "Concorrente B" }))),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await handler(request(body(await row(), { accountActive: false }))))
      .status,
    200,
  );
  assert.equal((await handler(request(null, operatorCookie))).status, 401);
  assert.equal((await row()).accountActive, false);
  assert.equal(
    (
      await handler(
        request(
          body(await row(), {
            accountActive: true,
            name: "Operador diretório final",
          }),
        ),
      )
    ).status,
    200,
  );
  assert.equal((await handler(request(null, operatorCookie))).status, 401); // reativar não recupera sessão revogada
  assert.ok(
    Number(
      sql(
        `SELECT count(*) FROM cjs_private.user_change_log WHERE user_id='${id}';`,
      ),
    ) >= 7,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.user_change_log WHERE before_data::text LIKE '%password%' OR after_data::text LIKE '%password%';`,
    ),
    "0",
  );
  if (browserTest) {
    const { chromium } = await import("playwright"),
      app = createDevServer({ env: settings });
    await new Promise((r) => app.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${app.address().port}`;
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    });
    try {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "cjs_session", value: admin.cookie.slice(12), url: origin },
      ]);
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
      let accept = false;
      await dialogs.respondToDialogs(page, (d) =>
        accept ? d.accept() : d.dismiss(),
      );
      const ready = () =>
        page.waitForFunction(
          () => document.documentElement.dataset.ready === "true",
        );
      const idle = () =>
        page.waitForFunction(
          () =>
            !document
              .querySelector("#user-management")
              .hasAttribute("aria-busy"),
        );
      await page.goto(origin);
      await ready();
      await page.locator('[data-app-view="users"]').click();
      await page.locator("[data-users-list] .user-row").first().waitFor();
      await idle();
      assert.equal(await page.locator('[data-app-view="access"]').count(), 0);
      assert.equal(await page.locator('[data-app-view="create"]').count(), 0);
      await page.locator("[data-users-search]").fill("Diretorio B");
      assert.ok((await page.locator(".user-row").count()) >= 2);
      await page
        .locator("[data-users-search]")
        .fill("sem qualquer correspondência");
      assert.equal(await page.locator(".user-row").count(), 0);
      await page
        .locator("[data-users-search]")
        .fill("Operador diretório final");
      await page.locator("[data-users-office]").selectOption(office);
      assert.equal(await page.locator(".user-row").count(), 1);
      const card = () =>
        page.locator(
          `.user-row[data-user-id="${id}"][data-office-id="${office}"]`,
        );
      await card().locator("[data-user-edit]").click();
      await page
        .locator('#manage-edit [name="name"]')
        .fill("Operador navegador editado");
      await page
        .locator(`[data-edit-companies] input[value="${second}"]`)
        .uncheck();
      await page
        .locator(`[data-edit-companies] input[value="${company}"]`)
        .check();
      await page.locator("#manage-edit button[type=submit]").click();
      await idle();
      assert.match(
        await page.locator("[data-management-status]").textContent(),
        /acessos atualizados/,
      );
      assert.equal((await row()).name, "Operador navegador editado");
      assert.deepEqual((await row()).companyIds, [company]);
      await page
        .locator("[data-users-search]")
        .fill("Operador navegador editado");
      await card().getByRole("switch").click();
      await dialogs.waitForDialogs(page);
      await idle();
      assert.equal((await row()).active, true);
      accept = true;
      await card().getByRole("switch").click();
      await dialogs.waitForDialogs(page);
      await idle();
      assert.equal((await row()).active, false);
      await card().getByRole("switch").click();
      await idle();
      assert.equal((await row()).active, true);
      await card().locator("[data-user-edit]").click();
      await handler(
        request(body(await row(), { name: "Alterado por outro admin" })),
      );
      await page.locator('#manage-edit [name="name"]').fill("Desatualizado");
      await page.locator("#manage-edit button[type=submit]").click();
      await idle();
      assert.match(
        await page.locator("[data-management-status]").textContent(),
        /cadastro mudou/,
      );
      assert.equal((await row()).name, "Alterado por outro admin");
      // Layout móvel e seleção de empresas dentro da edição.
      await page.setViewportSize({ width: 375, height: 812 });
      await page.locator("[data-users-refresh]").click();
      await idle();
      await page
        .locator("[data-users-search]")
        .fill("Alterado por outro admin");
      await card().locator("[data-user-edit]").click();
      assert.equal(await page.locator("#manage-edit").isVisible(), true);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      const widths = await page
        .locator(".user-row > div:first-child")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().width),
        );
      assert.ok(
        widths.length && widths.every((width) => width >= 150),
        "Nomes e e-mails devem ocupar uma linha própria no celular",
      );
      // Gerente só recebe os vínculos próprios; identidade compartilhada é somente leitura.
      await context.clearCookies();
      await context.addCookies([
        { name: "cjs_session", value: manager.cookie.slice(12), url: origin },
      ]);
      await page.goto(origin);
      await ready();
      await page.locator('[data-app-view="users"]').click();
      await page.locator(".user-row").first().waitFor();
      await idle();
      await page.locator(`[data-user-id="${id}"] [data-user-edit]`).click();
      assert.equal(
        await page
          .locator('#manage-edit [name="name"]')
          .getAttribute("readonly"),
        "",
      );
      assert.equal(
        await page
          .locator('#manage-edit [name="role"] option[value=admin]')
          .count(),
        0,
      );
      assert.equal(
        await page.locator("[data-account-toggle]").isVisible(),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  console.log(
    "OK: Usuários — diretório completo/por escritório, nome/e-mail/perfil, identidade compartilhada, situação, sessões, revisão concorrente, empresas e auditoria; busca, edição, toggles e isolamento em navegador real.",
  );
}

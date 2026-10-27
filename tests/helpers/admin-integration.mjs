import assert from "node:assert/strict";
import { createAdminHandler } from "../../server/admin.js";
import { issueSession } from "../../server/auth.js";
import { signJwt } from "../../server/jwt.js";
import { createDevServer } from "../../scripts/serve.js";
export async function testAdminIntegration({ env, sql, browserTest }) {
  const userId = "10000000-0000-0000-0000-000000000001",
    sid = "40000000-0000-0000-0000-000000000099";
  const office = "20000000-0000-0000-0000-000000000001",
    otherOffice = "20000000-0000-0000-0000-000000000002";
  const company = "30000000-0000-0000-0000-000000000001",
    restricted = "30000000-0000-0000-0000-000000000003",
    otherCompany = "30000000-0000-0000-0000-000000000002";
  sql(
    `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${userId}',now()+interval '1 hour');`,
  );
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "integration-cookie-key-with-enough-characters",
    N8N_LOGIN_URL: "https://unused.example/login",
    N8N_SERVICE_SECRET: "test-service-key-with-enough-characters",
    N8N_JWT_SECRET: "test-identity-key-with-enough-characters",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
  };
  const normal = await issueSession(settings, Date.now(), {
    userId,
    sessionId: sid,
    expiresAt: Date.now() + 3600000,
  });
  const cookie = "cjs_session=" + normal,
    handler = createAdminHandler({ env: settings });
  const req = (body, cookies = cookie) =>
    new Request("https://app.example/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookies,
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const fields = {
    action: "createUser",
    name: "Operador teste",
    email: "provision@example.test",
    password: "123456",
    officeId: office,
    role: "operator",
    companyIds: [company],
  };
  let options = await (await handler(req())).json();
  assert.equal(options.platformAdmin, false);
  assert.equal(options.offices.length, 1);
  assert.equal(options.companies.length, 2);
  assert.ok(options.users.every((u) => u.officeId === office));
  assert.equal((await handler(req({ ...fields, role: "admin" }))).status, 403);
  assert.equal(
    (
      await handler(
        req({ ...fields, officeId: otherOffice, companyIds: [otherCompany] }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(req({ ...fields, companyIds: [otherCompany] }))).status,
    400,
  );
  const created = await handler(req(fields));
  assert.equal(created.status, 201, await created.clone().text());
  const newId = (await created.json()).user.id;
  assert.equal(
    sql(
      "SELECT password_hash=public.crypt('123456',password_hash) FROM public.users WHERE email='provision@example.test';",
    ),
    "t",
  );
  assert.equal((await handler(req(fields))).status, 409);
  assert.equal(
    sql(`SELECT role FROM cjs_private.memberships WHERE user_id='${newId}';`),
    "editor",
  );
  assert.equal(
    sql(`SELECT platform_admin FROM cjs_private.users WHERE id='${newId}';`),
    "f",
  );
  const manager = await handler(
    req({
      ...fields,
      email: "new-manager@example.test",
      role: "manager",
      companyIds: [],
    }),
  );
  assert.equal(manager.status, 201);
  const subject = sql(
    `SELECT identity_subject FROM cjs_private.users WHERE id='${newId}';`,
  );
  const rpc = async (
    name,
    body,
    who = userId,
    session = sid,
    role = "cjs_authenticated",
  ) => {
    const iat = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        role,
        purpose: "identity",
        sub: who,
        sid: session,
        iss: "cjs-escala-api",
        aud: "cjs-postgrest",
        iat,
        exp: iat + 60,
      },
      settings.PERSISTENCE_JWT_SECRET,
    );
    return fetch(settings.PERSISTENCE_RPC_URL + "/rpc/" + name, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };
  const opened = await rpc(
    "open_session",
    { p_expires_at: new Date(Date.now() + 3600000).toISOString() },
    subject,
    sid,
    "cjs_identity_gateway",
  );
  assert.equal(opened.status, 200);
  const operatorSession = (await opened.json()).sessionId;
  const operatorCookie =
    "cjs_session=" +
    (await issueSession(settings, Date.now(), {
      userId: newId,
      sessionId: operatorSession,
      expiresAt: Date.now() + 3600000,
    }));
  assert.equal((await handler(req(null, operatorCookie))).status, 403);
  assert.equal(
    (
      await handler(
        req(
          { ...fields, email: "operator-illegal@example.test" },
          operatorCookie,
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await (await rpc("get_identity", {}, newId, operatorSession)).json()).role,
    "operator",
  );
  assert.equal(
    (
      await (
        await rpc(
          "list_companies",
          { p_office_id: office },
          newId,
          operatorSession,
        )
      ).json()
    ).length,
    1,
  );
  const update = {
    action: "updateAccess",
    userId: newId,
    officeId: office,
    companyIds: [restricted],
  };
  assert.equal(
    (await handler(req({ ...update, companyIds: [otherCompany] }))).status,
    400,
  );
  assert.equal(
    sql(
      `SELECT company_id FROM cjs_private.company_access WHERE user_id='${newId}';`,
    ),
    company,
  );
  assert.equal((await handler(req({ ...update, userId }))).status, 403);
  assert.equal((await handler(req(update))).status, 200);
  assert.deepEqual(
    (
      await (
        await rpc(
          "list_companies",
          { p_office_id: office },
          newId,
          operatorSession,
        )
      ).json()
    ).map((c) => c.id),
    [restricted],
  );
  assert.equal((await handler(req({ ...update, companyIds: [] }))).status, 200);
  assert.equal(
    (
      await (
        await rpc(
          "list_companies",
          { p_office_id: office },
          newId,
          operatorSession,
        )
      ).json()
    ).length,
    0,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.access_change_log WHERE user_id='${newId}';`,
    ),
    "2",
  );
  sql(`UPDATE cjs_private.users SET platform_admin=true WHERE id='${userId}';`);
  options = await (await handler(req())).json();
  assert.equal(options.platformAdmin, true);
  assert.equal(options.offices.length, 2);
  assert.equal((await (await rpc("get_identity", {})).json()).role, "admin");
  assert.equal(
    (await (await rpc("list_companies", { p_office_id: otherOffice })).json())
      .length,
    1,
  );
  const adminCreated = await handler(
    req({
      ...fields,
      email: "new-admin@example.test",
      role: "admin",
      companyIds: [],
    }),
  );
  assert.equal(adminCreated.status, 201);
  const globalId = (await adminCreated.json()).user.id;
  assert.equal(
    sql(`SELECT platform_admin FROM cjs_private.users WHERE id='${globalId}';`),
    "t",
  );
  assert.ok(
    [401, 403].includes(
      (await rpc("manage_options", {}, "login", sid, "cjs_identity_gateway"))
        .status,
    ),
  );
  assert.equal((await rpc("admin_options", {})).status, 404);
  if (browserTest) {
    const { chromium } = await import("playwright");
    const app = createDevServer({ env: settings });
    await new Promise((r) => app.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${app.address().port}`;
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    try {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "cjs_session", value: normal, url: origin },
      ]);
      await context.route("https://**/*", (r) =>
        r.request().url().includes("cdn.tailwindcss.com")
          ? r.fulfill({
              contentType: "application/javascript",
              body: "window.tailwind={};",
            })
          : r.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin + "/");
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      assert.equal(await page.locator("#sidebar-role").textContent(), "Admin");
      await page.locator('[data-app-view="users"]').click();
      await page.locator("[data-user-new]").click();
      await page.locator("#manage-create").waitFor({ state: "visible" });
      await page
        .locator('#manage-create [name="name"]')
        .fill("Operador navegador");
      await page
        .locator('#manage-create [name="email"]')
        .fill("browser-provision@example.test");
      await page.locator('#manage-create [name="password"]').fill("123456");
      await page.locator('#manage-create [name="confirmation"]').fill("123456");
      await page
        .locator('#manage-create [name="officeId"]')
        .selectOption(office);
      await page
        .locator(`[data-create-companies] input[value="${company}"]`)
        .check();
      await page.locator("#manage-create button[type=submit]").click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-management-status]")
          .textContent.includes("criado."),
      );
      const browserId = sql(
        "SELECT u.id FROM cjs_private.users u JOIN public.users i ON i.user_id::text=u.identity_subject WHERE i.email='browser-provision@example.test';",
      );
      await page
        .locator(`[data-user-id="${browserId}"] [data-user-edit]`)
        .click();
      await page.locator("#manage-edit").waitFor({ state: "visible" });
      await page
        .locator(`[data-edit-companies] input[value="${company}"]`)
        .uncheck();
      await page
        .locator(`[data-edit-companies] input[value="${restricted}"]`)
        .check();
      await page.locator("#manage-edit button[type=submit]").click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-management-status]")
          .textContent.includes("Usuário e acessos atualizados"),
      );
      assert.equal(
        sql(
          `SELECT company_id FROM cjs_private.company_access WHERE user_id='${browserId}';`,
        ),
        restricted,
      );
      await page.locator('[data-app-view="schedule"]').click();
      assert.equal(await page.locator("#scheduler-view").isVisible(), true);
      // O mesmo menu mostra apenas geração e empresas para Operador.
      await context.clearCookies();
      await context.addCookies([
        {
          name: "cjs_session",
          value: operatorCookie.split("=")[1],
          url: origin,
        },
      ]);
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      assert.equal(
        await page.locator("#sidebar-role").textContent(),
        "Operador",
      );
      assert.equal(
        await page.locator('[data-app-view="users"]').isVisible(),
        false,
      );
      // Gerente vê apenas o próprio escritório e não pode criar Admin.
      sql(
        `UPDATE cjs_private.users SET platform_admin=false WHERE id='${userId}';`,
      );
      await context.clearCookies();
      await context.addCookies([
        { name: "cjs_session", value: normal, url: origin },
      ]);
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      assert.equal(
        await page.locator("#sidebar-role").textContent(),
        "Gerente",
      );
      await page.locator('[data-app-view="users"]').click();
      await page.locator("[data-user-new]").click();
      await page.locator("#manage-create").waitFor({ state: "visible" });
      assert.equal(
        await page.locator('#manage-create [name="officeId"] option').count(),
        1,
      );
      assert.equal(
        await page
          .locator('#manage-create [name="role"] option[value="admin"]')
          .count(),
        0,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  sql(
    `UPDATE cjs_private.users SET platform_admin=false WHERE id='${userId}';UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${sid}';`,
  );
  assert.equal((await handler(req())).status, 401);
  console.log(
    "OK: perfis Admin/Gerente/Operador, criação bcrypt atômica, limites por escritório, edição/revogação de empresas, auditoria e sessão; menu integrado" +
      (browserTest ? " em navegador real." : "."),
  );
}

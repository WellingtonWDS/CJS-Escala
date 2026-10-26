import assert from "node:assert/strict";
import { createAdminHandler, adminPasswordHash } from "../../server/admin.js";
import { issueSession } from "../../server/auth.js";
import { signJwt } from "../../server/jwt.js";
import { createDevServer } from "../../scripts/serve.js";
export async function testAdminIntegration({ env, sql, browserTest }) {
  const userId = "10000000-0000-0000-0000-000000000001",
    sid = "40000000-0000-0000-0000-000000000099";
  sql(
    `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${userId}',now()+interval '1 hour');`,
  );
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "integration-admin-cookie-with-enough-characters",
    ADMIN_USER_IDS: userId,
    ADMIN_PASSWORD_HASH: await adminPasswordHash("admin-test-pass"),
    N8N_LOGIN_URL: "https://unused.example/login",
    N8N_SERVICE_SECRET: "test-header-key-with-enough-characters",
    N8N_JWT_SECRET: "test-identity-key-with-enough-characters",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
  };
  const normal = await issueSession(settings, Date.now(), {
    userId,
    sessionId: sid,
    expiresAt: Date.now() + 3600000,
  });
  const cookie = "cjs_session=" + normal;
  const handler = createAdminHandler({ env: settings });
  const request = (body, cookies = cookie) =>
    new Request("https://app.example/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookies,
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const unlock = await handler(
    request({ action: "unlock", password: "admin-test-pass" }),
  );
  assert.equal(unlock.status, 200, await unlock.clone().text());
  const both = cookie + "; " + unlock.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await (await handler(request(null, both))).json()).offices.length,
    2,
  );
  const fields = {
    action: "createUser",
    name: "Conta teste",
    email: "provision@example.test",
    password: "123456",
    officeId: "20000000-0000-0000-0000-000000000001",
    role: "editor",
    companyIds: ["30000000-0000-0000-0000-000000000001"],
  };
  const created = await handler(request(fields, both));
  assert.equal(created.status, 201, await created.clone().text());
  const newId = (await created.json()).user.id;
  assert.equal(
    sql(
      "SELECT password_hash=public.crypt('123456',password_hash) FROM public.users WHERE email='provision@example.test';",
    ),
    "t",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.company_access WHERE user_id='${newId}';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.admin_provision_log WHERE user_id='${newId}';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT role FROM cjs_private.memberships WHERE user_id='${newId}' AND office_id='${fields.officeId}';`,
    ),
    "editor",
  );
  const identitySubject = sql(
    `SELECT identity_subject FROM cjs_private.users WHERE id='${newId}';`,
  );
  const issued = Math.floor(Date.now() / 1000);
  const gatewayToken = await signJwt(
    {
      role: "cjs_identity_gateway",
      purpose: "identity",
      sub: identitySubject,
      iss: "cjs-escala-api",
      aud: "cjs-postgrest",
      iat: issued,
      exp: issued + 60,
    },
    settings.PERSISTENCE_JWT_SECRET,
  );
  const opened = await fetch(
    settings.PERSISTENCE_RPC_URL + "/rpc/open_session",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    },
  );
  assert.equal(opened.status, 200);
  assert.equal((await opened.json()).userId, newId);
  assert.equal((await handler(request(fields, both))).status, 409);
  assert.equal(
    (
      await handler(
        request(
          {
            ...fields,
            email: "invalid-cross@example.test",
            companyIds: ["30000000-0000-0000-0000-000000000002"],
          },
          both,
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    sql(
      "SELECT count(*) FROM public.users WHERE email='invalid-cross@example.test';",
    ),
    "0",
  );
  for (const role of ["cjs_authenticated", "cjs_identity_gateway"]) {
    const iat = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        role,
        sub: userId,
        sid,
        purpose: "identity",
        iss: "cjs-escala-api",
        aud: "cjs-postgrest",
        iat,
        exp: iat + 60,
      },
      settings.PERSISTENCE_JWT_SECRET,
    );
    const r = await fetch(settings.PERSISTENCE_RPC_URL + "/rpc/admin_options", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.ok([401, 403].includes(r.status));
  }
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
      const page = await context.newPage();
      await page.goto(origin + "/admin.html");
      await page.locator("#admin-unlock input").fill("admin-test-pass");
      await page.locator("#admin-unlock button").click();
      await page.locator("#admin-create").waitFor({ state: "visible" });
      await page.locator('#admin-create [name="name"]').fill("Navegador teste");
      await page
        .locator('#admin-create [name="email"]')
        .fill("browser-provision@example.test");
      await page.locator('#admin-create [name="password"]').fill("123456");
      await page.locator('#admin-create [name="confirmation"]').fill("123456");
      await page
        .locator('#admin-create [name="officeId"]')
        .selectOption(fields.officeId);
      await page
        .locator(`#admin-companies input[value="${fields.companyIds[0]}"]`)
        .check();
      await page.locator("#admin-submit").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#admin-status")
          .textContent.includes("criado com acesso"),
      );
      assert.equal(
        sql(
          "SELECT count(*) FROM public.users WHERE email='browser-provision@example.test';",
        ),
        "1",
      );
      await page.locator("#admin-lock").click();
      await page.locator("#admin-unlock").waitFor({ state: "visible" });
      await context.clearCookies();
      const denied = await page.goto(origin + "/admin.html");
      assert.equal(denied.status(), 404);
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  sql(`UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${sid}';`);
  assert.equal((await handler(request(null, both))).status, 401);
  console.log(
    "OK: administração — senha adicional, cadastro bcrypt atômico, duplicidade, isolamento de empresas, auditoria, papéis negados e revogação" +
      (browserTest ? "; página validada em navegador real." : "."),
  );
}

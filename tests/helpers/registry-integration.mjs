import selectCompany from "./company-picker.cjs";
import dialogTools from "./dialogs.cjs";
const { respondToDialogs, waitForDialogs } = dialogTools;
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCompaniesHandler } from "../../server/companies.js";
import { issueSession } from "../../server/auth.js";
import { createPersistenceService } from "../../server/services/persistence.js";
import { cenario } from "../fixtures/edicao-manual.mjs";
import { createDevServer } from "../../scripts/serve.js";
export async function testRegistryIntegration({ env, sql, browserTest }) {
  const manager = "10000000-0000-0000-0000-000000000001",
    operatorA = "10000000-0000-0000-0000-000000000004",
    operatorB = "10000000-0000-0000-0000-000000000088";
  const office = "20000000-0000-0000-0000-000000000001",
    otherOffice = "20000000-0000-0000-0000-000000000002",
    company = "30000000-0000-0000-0000-000000000001";
  sql(
    `INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('${operatorB}','test:shared-b','Operador B'); INSERT INTO cjs_private.memberships VALUES('${operatorB}','${office}','editor',true); INSERT INTO cjs_private.company_access VALUES('${operatorB}','${office}','${company}');`,
  );
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "registry-cookie-key-with-enough-characters",
    N8N_LOGIN_URL: "https://unused.example/login",
    N8N_SERVICE_SECRET: "test-service-key-with-enough-characters",
    N8N_JWT_SECRET: "test-identity-key-with-enough-characters",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
  };
  const identities = {};
  const cookies = {};
  for (const user of [manager, operatorA, operatorB]) {
    const sid = randomUUID();
    sql(
      `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${user}',now()+interval '1 hour');`,
    );
    identities[user] = {
      userId: user,
      sessionId: sid,
      expiresAt: Date.now() + 3600000,
    };
    cookies[user] = await issueSession(settings, Date.now(), {
      ...identities[user],
      expiresAt: identities[user].expiresAt,
    });
  }
  const handler = createCompaniesHandler({ env: settings });
  const req = (body, user = manager) =>
    new Request("https://app.example/api/companies", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: "cjs_session=" + cookies[user],
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const service = createPersistenceService({ env: settings });
  const state = cenario({ pessoas: 1, cobertura: false });
  const saved = await service.saveDraft(identities[operatorA], {
    officeId: office,
    companyId: company,
    draftId: null,
    revision: null,
    key: randomUUID(),
    title: "Escala compartilhada",
    state,
  });
  const sharedList = await service.listDrafts(
    identities[operatorB],
    office,
    company,
  );
  assert.ok(sharedList.some((r) => r.id === saved.id));
  const shared = await service.getDraft(
    identities[operatorB],
    office,
    company,
    saved.id,
  );
  assert.deepEqual(shared.state, JSON.parse(JSON.stringify(state)));
  assert.ok(shared.state.escalaGerada.resultado.length);
  const updated = await service.saveDraft(identities[operatorB], {
    officeId: office,
    companyId: company,
    draftId: saved.id,
    revision: saved.revision,
    key: randomUUID(),
    title: "Revisada por outro operador",
    state: shared.state,
  });
  assert.equal(updated.revision, 2);
  assert.equal(
    (await service.getDraft(identities[operatorA], office, company, saved.id))
      .title,
    "Revisada por outro operador",
  );
  await assert.rejects(
    () =>
      service.saveDraft(identities[operatorA], {
        officeId: office,
        companyId: company,
        draftId: saved.id,
        revision: 1,
        key: randomUUID(),
        title: "Versão antiga",
        state,
      }),
    (e) => e.status === 409,
  );
  const original = (await (await handler(req())).json()).companies.find(
    (c) => c.id === company,
  );
  const fields = {
    action: "updateCompany",
    officeId: office,
    companyId: company,
    name: "Empresa A corrigida",
    cnpj: "60.701.190/0001-04",
    previousName: original.name,
    previousCnpj: original.cnpj,
  };
  assert.equal((await handler(req(fields, operatorA))).status, 403);
  assert.equal(
    (await handler(req({ ...fields, officeId: otherOffice }))).status,
    403,
  );
  let response = await handler(req(fields));
  assert.equal(response.status, 200, await response.clone().text());
  const edited = (await response.json()).company;
  assert.equal(edited.id, company);
  assert.equal(edited.cnpj, "60701190000104");
  assert.equal((await handler(req(fields))).status, 409);
  assert.equal(
    (
      await handler(
        req({
          ...fields,
          name: "Duplicada",
          cnpj: "48.956.412/0001-26",
          previousName: edited.name,
          previousCnpj: edited.cnpj,
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await service.getDraft(identities[operatorB], office, company, saved.id))
      .revision,
    2,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.company_access WHERE user_id='${operatorB}' AND company_id='${company}';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT details->'before'->>'name' FROM cjs_private.company_registry_log WHERE action='update' AND company_id='${company}';`,
    ),
    original.name,
  );
  assert.equal(
    (await handler(req({ action: "createOffice", name: "Novo escritório" })))
      .status,
    403,
  );
  assert.equal(
    (
      await handler(
        req({ action: "createOffice", name: "Novo escritório" }, operatorA),
      )
    ).status,
    403,
  );
  sql(
    `UPDATE cjs_private.users SET platform_admin=true WHERE id='${manager}';`,
  );
  const created = await Promise.all([
    handler(req({ action: "createOffice", name: "Novo escritório" })),
    handler(req({ action: "createOffice", name: "Novo escritório" })),
  ]);
  const rows = await Promise.all(created.map((r) => r.json()));
  assert.equal(rows[0].office.id, rows[1].office.id);
  assert.deepEqual(rows.map((r) => r.status).sort(), ["created", "existing"]);
  const newOffice = rows[0].office.id;
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.office_registry_log WHERE office_id='${newOffice}';`,
    ),
    "1",
  );
  assert.ok(
    (await service.listOffices(identities[manager])).some(
      (o) => o.id === newOffice,
    ),
  );
  assert.ok(
    !(await service.listOffices(identities[operatorA])).some(
      (o) => o.id === newOffice,
    ),
  );
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
        { name: "cjs_session", value: cookies[manager], url: origin },
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
      await respondToDialogs(page, (d) => d.accept());
      const ready = () =>
        page.waitForFunction(
          () => document.documentElement.dataset.ready === "true",
        );
      await page.goto(origin);
      await ready();
      await page.locator('[data-app-view="offices"]').click();
      await waitForDialogs(page);
      await page.locator("#office-create").waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#office-management")
            .hasAttribute("aria-busy"),
      );
      await page
        .locator("#office-create input")
        .fill("Escritório do navegador");
      await page.locator("#office-create button").click();
      await waitForDialogs(page);
      await page
        .waitForFunction(() =>
          document
            .querySelector("[data-office-status]")
            .textContent.includes("Escritório criado"),
        )
        .catch(async (error) => {
          throw Error(
            error.message +
              " — " +
              (await page.locator("[data-office-status]").textContent()) +
              " — campo: " +
              (await page.locator("#office-create input").inputValue()),
          );
        });
      await page.locator('[data-app-view="companies"]').click();
      await waitForDialogs(page);
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#company-management")
            .hasAttribute("aria-busy"),
      );
      await page
        .locator('#company-create [name="officeId"]')
        .selectOption(office);
      await page.locator("[data-company-list]").selectOption(company);
      await page
        .locator('#company-edit [name="name"]')
        .fill("Razão social revisada");
      await page.locator("#company-edit button").click();
      await waitForDialogs(page);
      await page.waitForFunction(() =>
        document
          .querySelector("[data-company-status]")
          .textContent.includes("Empresa atualizada"),
      );
      assert.equal(
        sql(`SELECT name FROM cjs_private.companies WHERE id='${company}';`),
        "Razão social revisada",
      );
      assert.equal(
        (
          await service.getDraft(
            identities[operatorB],
            office,
            company,
            saved.id,
          )
        ).revision,
        2,
      );
      // Outro operador abre a escala criada por A e revisada por B na mesma empresa.
      await context.clearCookies();
      await context.addCookies([
        { name: "cjs_session", value: cookies[operatorB], url: origin },
      ]);
      await page.reload();
      await ready();
      assert.equal(
        await page.locator('[data-app-view="offices"]').isVisible(),
        false,
      );
      await page.locator("#btn-remote-workspace").click();
      await waitForDialogs(page);
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#remote-workspace")
            .hasAttribute("aria-busy"),
      );
      await selectCompany(page, company);
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#remote-workspace")
            .hasAttribute("aria-busy"),
      );
      await page.locator("[data-remote-draft]").selectOption(saved.id);
      await Promise.all([
        page.waitForEvent("load"),
        page.locator("[data-remote-open]").click(),
      ]);
      await ready();
      assert.equal(await page.locator('[data-field="nome"]').count(), 1);
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await waitForDialogs(page);
      assert.ok(
        (await page.locator("#resultado-gerar .escala-mensal").count()) > 0,
      );
      sql(
        `UPDATE cjs_private.users SET platform_admin=false WHERE id='${manager}';`,
      );
      await context.clearCookies();
      await context.addCookies([
        { name: "cjs_session", value: cookies[manager], url: origin },
      ]);
      await page.reload();
      await ready();
      assert.equal(
        await page.locator('[data-app-view="offices"]').isVisible(),
        false,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  sql(
    `UPDATE cjs_private.users SET platform_admin=false WHERE id='${manager}';DELETE FROM cjs_private.company_access WHERE user_id='${operatorB}';`,
  );
  await assert.rejects(
    () => service.getDraft(identities[operatorB], office, company, saved.id),
    (e) => e.status === 403,
  );
  console.log(
    "OK: edição de empresa preserva ID/rascunhos/acessos, conflito e duplicidade; escritório exclusivo de Admin; escala salva compartilhada entre operadores com conflito protegido e revogação" +
      (browserTest ? " em navegador real." : "."),
  );
}

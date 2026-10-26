import dialogTools from "./dialogs.cjs";
const { respondToDialogs, waitForDialogs } = dialogTools;
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCompaniesHandler } from "../../server/companies.js";
import { issueSession } from "../../server/auth.js";
import { createDevServer } from "../../scripts/serve.js";
import { lerArquivoDominio } from "../../assets/js/import/arquivo-dominio.js";
import { analisarQuadroDominio } from "../../assets/js/import/dominio.js";
export async function testCompanyIntegration({ env, sql, browserTest }) {
  const userId = "10000000-0000-0000-0000-000000000001",
    sid = "40000000-0000-0000-0000-000000000098",
    operator = "10000000-0000-0000-0000-000000000004",
    opSid = "40000000-0000-0000-0000-000000000094";
  const office = "20000000-0000-0000-0000-000000000001",
    otherOffice = "20000000-0000-0000-0000-000000000002",
    company = "30000000-0000-0000-0000-000000000001";
  sql(
    `UPDATE cjs_private.memberships SET active=true WHERE user_id='${operator}';`,
  );
  sql(
    `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${userId}',now()+interval '1 hour'),('${opSid}','${operator}',now()+interval '1 hour');`,
  );
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET:
      "company-integration-cookie-key-with-enough-characters",
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
    }),
    opToken = await issueSession(settings, Date.now(), {
      userId: operator,
      sessionId: opSid,
      expiresAt: Date.now() + 3600000,
    });
  const handler = createCompaniesHandler({ env: settings });
  const req = (body, token = normal) =>
    new Request("https://app.example/api/companies", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: "cjs_session=" + token,
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const resolve = (name, cnpj, apply = false, officeId = office) => ({
    officeId,
    name,
    cnpj,
    apply,
  });
  const legacy = resolve("Empresa A", "11.222.333/0001-81");
  let response = await handler(req(legacy));
  assert.equal((await response.json()).status, "legacy");
  assert.equal(
    (await handler(req({ ...legacy, apply: true }, opToken))).status,
    403,
  );
  response = await handler(req({ ...legacy, apply: true }));
  assert.equal((await response.json()).company.id, company);
  const fields = resolve("Padaria de teste", "48.956.412/0001-26", true);
  const concurrent = await Promise.all([
    handler(req(fields)),
    handler(req(fields)),
  ]);
  const created = await Promise.all(concurrent.map((r) => r.json()));
  assert.equal(created[0].company.id, created[1].company.id);
  const padaria = created[0].company.id;
  assert.deepEqual(created.map((c) => c.status).sort(), [
    "created",
    "existing",
  ]);
  assert.equal(
    sql(
      "SELECT count(*) FROM cjs_private.companies WHERE cnpj='48956412000126';",
    ),
    "1",
  );
  assert.equal((await handler(req(fields, opToken))).status, 403);
  assert.equal(
    (await handler(req(resolve("Nova", "04.252.011/0001-10", true), opToken)))
      .status,
    403,
  );
  assert.equal(
    (await handler(req({ ...fields, officeId: otherOffice }))).status,
    403,
  );
  assert.equal(
    (await handler(req({ ...fields, cnpj: "00000000000000" }))).status,
    400,
  );
  assert.equal(
    sql("SELECT cjs_private.valid_cnpj('12.ABC.345/01DE-35');"),
    "t",
  );
  assert.equal(
    (await handler(req(resolve("Empresa alfa", "12.ABC.345/01DE-35", true))))
      .status,
    200,
  );
  const options = await (await handler(req())).json();
  assert.equal(options.offices.length, 1);
  assert.ok(options.companies.some((c) => c.cnpj === "48956412000126"));
  const opOptions = await (await handler(req(null, opToken))).json();
  assert.equal(opOptions.companies.length, 1);
  assert.equal(opOptions.offices[0].canCreate, false);
  sql(`UPDATE cjs_private.users SET platform_admin=true WHERE id='${userId}';`);
  assert.equal(
    (await handler(req({ ...fields, officeId: otherOffice }))).status,
    200,
  );
  sql(
    `UPDATE cjs_private.users SET platform_admin=false WHERE id='${userId}';`,
  );
  if (browserTest) {
    const { chromium } = await import("playwright");
    const XLSX = await import("@e965/xlsx");
    const original = await lerArquivoDominio(
      await readFile(
        new URL("../fixtures/dominio/drogaria.xls", import.meta.url),
      ),
      XLSX,
    );
    const meta = analisarQuadroDominio(original).empresa;
    function workbook(cnpj, name) {
      const book = XLSX.utils.book_new();
      for (const sheet of original) {
        const rows = sheet.linhas.map((row) =>
          row.map((v) =>
            typeof v === "string"
              ? v.replaceAll(meta.cnpj, cnpj).replaceAll(meta.nome, name)
              : v,
          ),
        );
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet(rows),
          sheet.nome,
        );
      }
      return Buffer.from(
        XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      );
    }
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
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await respondToDialogs(page, (d) => d.accept());
      const ready = () =>
        page.waitForFunction(
          () => document.documentElement.dataset.ready === "true",
        );
      await page.goto(origin);
      await ready();
      assert.equal(await page.locator("#btn-imprimir-pagina").count(), 0);
      await page.locator("#sidebar-toggle").click();
      await waitForDialogs(page);
      assert.equal(
        await page.locator("#sidebar-toggle").getAttribute("aria-expanded"),
        "false",
      );
      await page.reload();
      await ready();
      assert.equal(
        await page.locator("#sidebar-toggle").getAttribute("aria-expanded"),
        "false",
      );
      await page.locator("#sidebar-toggle").click();
      await waitForDialogs(page);
      await page.locator('[data-app-view="companies"]').click();
      await waitForDialogs(page);
      await page.locator("#company-create").waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#company-management")
            .hasAttribute("aria-busy"),
      );
      await page
        .locator('#company-create [name="name"]')
        .fill("Comércio navegador");
      await page
        .locator('#company-create [name="cnpj"]')
        .fill("04.252.011/0001-10");
      await page.locator("#company-create button").click();
      await waitForDialogs(page);
      await page.waitForFunction(() =>
        document
          .querySelector("[data-company-status]")
          .textContent.includes("Empresa cadastrada"),
      );
      await page.locator("[data-company-search]").fill("04252011");
      assert.match(
        await page.locator("[data-company-list]").textContent(),
        /Comércio navegador — 04\.252\.011/,
      );
      await page.locator('[data-app-view="schedule"]').click();
      await waitForDialogs(page);
      await page.locator("#btn-remote-workspace").click();
      await waitForDialogs(page);
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#remote-workspace")
            .hasAttribute("aria-busy"),
      );
      await page.locator("[data-remote-company-search]").fill("48956412000126");
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#remote-workspace")
            .hasAttribute("aria-busy"),
      );
      assert.equal(
        await page.locator("[data-remote-company]").inputValue(),
        padaria,
      );
      assert.match(
        await page
          .locator("[data-remote-company] option:checked")
          .textContent(),
        /Padaria de teste — 48\.956/,
      );
      await Promise.all([
        page.waitForEvent("load"),
        page.locator("[data-remote-open]").click(),
      ]);
      await ready();
      const upload = async (cnpj, name) => {
        await page.locator('[data-etapa-link="sec-config"]').click();
        await waitForDialogs(page);
        await page
          .locator("#importacao-dominio")
          .evaluate((el) => (el.open = true));
        await page.locator("#dominio-arquivo").setInputFiles({
          name: "quadro.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: workbook(cnpj, name),
        });
        await page.waitForFunction(
          () => !document.querySelector("#dominio-confirmar").disabled,
        );
        await page.locator("#dominio-confirmar").click();
        await waitForDialogs(page);
        await page
          .locator("#dominio-company-dialog")
          .waitFor({ state: "visible" });
        await page.waitForFunction(
          () =>
            !document
              .querySelector("[data-company-import-status]")
              .textContent.includes("Consultando") &&
            !document
              .querySelector("[data-company-import-status]")
              .textContent.includes("Carregando"),
        );
      };
      const currentContext = () =>
        page.evaluate(() =>
          JSON.parse(
            localStorage.getItem(
              Object.keys(localStorage).find((k) => k.endsWith(":context")),
            ),
          ),
        );
      await upload("48.956.412/0001-26", "Nome do relatório");
      assert.match(
        await page.locator("[data-company-import-status]").textContent(),
        /já cadastrada/,
      );
      await page.locator("[data-company-import-confirm]").click();
      await waitForDialogs(page);
      await page
        .locator("#dominio-company-dialog")
        .waitFor({ state: "detached" });
      await page
        .waitForFunction(
          () => document.querySelectorAll('[data-field="nome"]').length === 6,
        )
        .catch(async (error) => {
          throw Error(
            error.message +
              " Importação: " +
              (await page.locator("#dominio-mensagem").textContent()) +
              "; erros: " +
              JSON.stringify(errors),
          );
        });
      assert.equal((await currentContext()).companyId, padaria);
      assert.equal(
        sql(
          "SELECT count(*) FROM cjs_private.companies WHERE office_id='" +
            office +
            "' AND cnpj='48956412000126';",
        ),
        "1",
      );
      await upload("33.000.167/0001-01", "Empresa nova importada");
      await page.locator("[data-company-import-cancel]").click();
      await waitForDialogs(page);
      await page
        .locator("#dominio-company-dialog")
        .waitFor({ state: "detached" });
      assert.equal((await currentContext()).companyId, padaria);
      assert.equal(
        sql(
          "SELECT count(*) FROM cjs_private.companies WHERE cnpj='33000167000101';",
        ),
        "0",
      );
      await upload("33.000.167/0001-01", "Empresa nova importada");
      await page.locator("[data-company-import-confirm]").click();
      await waitForDialogs(page);
      await page
        .locator("#dominio-company-dialog")
        .waitFor({ state: "detached" });
      await page
        .waitForFunction(
          () => document.querySelectorAll('[data-field="nome"]').length === 6,
        )
        .catch(async (error) => {
          throw Error(
            error.message +
              " Importação: " +
              (await page.locator("#dominio-mensagem").textContent()) +
              "; erros: " +
              JSON.stringify(errors),
          );
        });
      const changed = await currentContext();
      assert.notEqual(changed.companyId, padaria);
      assert.equal(changed.draftId, null);
      assert.equal(
        sql(
          "SELECT count(*) FROM cjs_private.companies WHERE cnpj='33000167000101';",
        ),
        "1",
      );
      await page.reload();
      await ready();
      assert.equal(await page.locator('[data-field="nome"]').count(), 6);
      await context.clearCookies();
      await context.addCookies([
        { name: "cjs_session", value: opToken, url: origin },
      ]);
      await page.reload();
      await ready();
      assert.equal(
        await page.locator('[data-app-view="companies"]').isVisible(),
        false,
      );
      await upload("48.956.412/0001-26", "Empresa sem acesso");
      assert.equal(
        await page.locator("[data-company-import-confirm]").isDisabled(),
        true,
      );
      assert.match(
        await page.locator("[data-company-import-status]").textContent(),
        /Sem permissão/,
      );
      await page.locator("[data-company-import-cancel]").click();
      await waitForDialogs(page);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  sql(`UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${sid}';`);
  assert.equal((await handler(req())).status, 401);
  console.log(
    "OK: empresas — CNPJ numérico/alfanumérico, identificação por escritório, cadastro concorrente sem duplicidade, legado, permissões e revogação" +
      (browserTest
        ? "; menu recolhível, cadastro/busca e importação Domínio em navegador real."
        : "."),
  );
}

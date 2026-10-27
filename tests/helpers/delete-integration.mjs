import selectCompany from "./company-picker.cjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersistenceService } from "../../server/services/persistence.js";
import { createDevServer } from "../../scripts/serve.js";
import { issueSession } from "../../server/auth.js";
import { cenario } from "../fixtures/edicao-manual.mjs";
import dialogTools from "./dialogs.cjs";
const { respondToDialogs, waitForDialogs } = dialogTools;
export async function testDeleteIntegration({ env, sql, browserTest }) {
  const office = "20000000-0000-0000-0000-000000000001",
    company = "30000000-0000-0000-0000-000000000001",
    manager = "10000000-0000-0000-0000-000000000001",
    editor = "10000000-0000-0000-0000-000000000004",
    viewer = "10000000-0000-0000-0000-000000000077",
    outsider = "10000000-0000-0000-0000-000000000003";
  sql(
    `INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('${viewer}','test:delete-viewer','Consulta exclusão');INSERT INTO cjs_private.memberships VALUES('${viewer}','${office}','viewer',true);INSERT INTO cjs_private.company_access VALUES('${viewer}','${office}','${company}');`,
  );
  const identities = {},
    cookies = {},
    settings = {
      ...env,
      AUTH_MODE: "n8n",
      AUTH_SESSION_SECRET: "delete-cookie-secret-with-enough-characters",
      N8N_LOGIN_URL: "https://unused.example/login",
      N8N_SERVICE_SECRET: "test-service-key-with-enough-characters",
      N8N_JWT_SECRET: "test-identity-key-with-enough-characters",
      N8N_JWT_ISSUER: "identity",
      N8N_JWT_AUDIENCE: "login",
    };
  for (const userId of [manager, editor, viewer, outsider]) {
    const sessionId = randomUUID(),
      expiresAt = Date.now() + 3600000;
    sql(
      `INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sessionId}','${userId}',now()+interval '1 hour');`,
    );
    identities[userId] = { userId, sessionId, expiresAt };
    cookies[userId] = await issueSession(settings, Date.now(), {
      userId,
      sessionId,
      expiresAt,
    });
  }
  const service = createPersistenceService({ env: settings }),
    state = cenario({ pessoas: 1, cobertura: false });
  const create = (title) => ({
    officeId: office,
    companyId: company,
    draftId: null,
    revision: null,
    key: randomUUID(),
    title,
    state,
  });
  const initial = create("Excluir — base"),
    saved = await service.saveDraft(identities[manager], initial),
    keep = await service.saveDraft(identities[manager], create("Preservar"));
  let target = {
    officeId: office,
    companyId: company,
    draftId: saved.id,
    revision: 1,
  };
  await assert.rejects(
    () => service.deleteDraft(identities[viewer], target),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => service.deleteDraft(identities[outsider], target),
    (e) => e.status === 403,
  );
  const revised = await service.saveDraft(identities[editor], {
    ...initial,
    draftId: saved.id,
    revision: 1,
    key: randomUUID(),
    title: "Atualizado por colega",
  });
  assert.equal(revised.revision, 2);
  await assert.rejects(
    () => service.deleteDraft(identities[manager], target),
    (e) => e.status === 409,
  );
  target.revision = 2;
  assert.deepEqual(await service.deleteDraft(identities[manager], target), {
    id: saved.id,
    deleted: true,
  });
  assert.deepEqual(await service.deleteDraft(identities[editor], target), {
    id: saved.id,
    deleted: true,
  });
  assert.ok(
    !(await service.listDrafts(identities[editor], office, company)).some(
      (row) => row.id === saved.id,
    ),
  );
  await assert.rejects(
    () => service.getDraft(identities[editor], office, company, saved.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => service.saveDraft(identities[manager], initial),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () =>
      service.saveDraft(identities[editor], {
        ...initial,
        draftId: saved.id,
        revision: 2,
        key: randomUUID(),
      }),
    (e) => e.status === 404,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.audit WHERE draft_id='${saved.id}' AND action='delete';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.draft_versions WHERE draft_id='${saved.id}';`,
    ),
    "2",
  );
  assert.ok(
    (await service.getDraft(identities[manager], office, company, keep.id))
      .state.escalaGerada,
  );
  const claims = JSON.stringify({
    role: "cjs_authenticated",
    iss: "cjs-escala-api",
    aud: "cjs-postgrest",
    sub: editor,
    sid: identities[editor].sessionId,
  });
  const hidden = sql(
    `BEGIN;SET LOCAL ROLE cjs_authenticated;SELECT set_config('request.jwt.claims','${claims}',true);SELECT count(*) FROM cjs_private.draft_versions WHERE draft_id='${saved.id}';ROLLBACK;`,
  );
  assert.match(hidden, /\n0\nROLLBACK$/);
  const raceBody = create("Concorrência"),
    race = await service.saveDraft(identities[manager], raceBody);
  const [write, del] = await Promise.allSettled([
    service.saveDraft(identities[editor], {
      ...raceBody,
      draftId: race.id,
      revision: 1,
      key: randomUUID(),
    }),
    service.deleteDraft(identities[manager], {
      officeId: office,
      companyId: company,
      draftId: race.id,
      revision: 1,
    }),
  ]);
  if (del.status === "fulfilled") {
    assert.equal(write.status, "rejected");
    assert.equal(write.reason.status, 404);
  } else {
    assert.equal(del.reason.status, 409);
    assert.equal(write.status, "fulfilled");
    assert.equal(write.value.revision, 2);
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
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let allowDelete = false;
      await respondToDialogs(page, (d) =>
        d.message().startsWith("Excluir “") && !allowDelete
          ? d.dismiss()
          : d.accept(),
      );
      const ready = () =>
        page.waitForFunction(
          () => document.documentElement.dataset.ready === "true",
        );
      const open = async () => {
        await page.locator("#btn-remote-workspace").click();
        await page.waitForFunction(
          () =>
            !document
              .querySelector("#remote-workspace")
              .hasAttribute("aria-busy"),
        );
        await page.locator("[data-remote-office]").selectOption(office);
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
      };
      const clickDelete = async () => {
        await page.locator("[data-remote-delete]").click();
        await waitForDialogs(page);
        await page.waitForFunction(
          () =>
            !document
              .querySelector("#remote-workspace")
              .hasAttribute("aria-busy"),
        );
      };
      const nonactive = await service.saveDraft(
          identities[manager],
          create("Excluir selecionado"),
        ),
        active = await service.saveDraft(
          identities[manager],
          create("Excluir aberto"),
        );
      await page.goto(origin);
      await ready();
      await open();
      assert.equal(
        await page.locator("[data-remote-delete]").isDisabled(),
        true,
      );
      await page.locator("[data-remote-draft]").selectOption(nonactive.id);
      await clickDelete();
      assert.equal(
        sql(
          `SELECT deleted_at IS NULL FROM cjs_private.drafts WHERE id='${nonactive.id}';`,
        ),
        "t",
      );
      allowDelete = true;
      let dropped = false;
      await page.route("**/api/persistence", async (route) => {
        if (
          !dropped &&
          route.request().postDataJSON()?.action === "deleteDraft"
        ) {
          dropped = true;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await clickDelete();
      assert.match(
        await page.locator("[data-remote-status]").textContent(),
        /Não foi possível conectar/,
      );
      assert.equal(
        await page
          .locator(`[data-remote-draft] option[value="${nonactive.id}"]`)
          .count(),
        1,
      );
      await page.unroute("**/api/persistence");
      await clickDelete();
      assert.equal(
        await page
          .locator(`[data-remote-draft] option[value="${nonactive.id}"]`)
          .count(),
        0,
      );
      assert.equal(
        sql(
          `SELECT count(*) FROM cjs_private.audit WHERE draft_id='${nonactive.id}' AND action='delete';`,
        ),
        "1",
      );
      await page.locator("[data-remote-draft]").selectOption(active.id);
      await Promise.all([
        page.waitForEvent("load"),
        page.locator("[data-remote-open]").click(),
      ]);
      await ready();
      assert.equal(
        await page.locator("#current-workspace").getAttribute("data-draft-id"),
        active.id,
      );
      await open();
      await page.evaluate(() => {
        const k = Object.keys(localStorage).find((k) => k.endsWith(":context")),
          c = JSON.parse(localStorage.getItem(k));
        window.__testPendingKey = `${k.slice(0, -8)}:${c.officeId}:${c.companyId}:${c.draftId}:pending`;
        localStorage.setItem(
          window.__testPendingKey,
          JSON.stringify({ draftId: c.draftId }),
        );
      });
      await clickDelete();
      assert.match(
        await page.locator("[data-remote-status]").textContent(),
        /Conclua o envio pendente/,
      );
      assert.equal(
        sql(
          `SELECT deleted_at IS NULL FROM cjs_private.drafts WHERE id='${active.id}';`,
        ),
        "t",
      );
      await page.evaluate(() =>
        localStorage.removeItem(window.__testPendingKey),
      );
      await Promise.all([
        page.waitForEvent("load"),
        page.locator("[data-remote-delete]").click(),
      ]);
      await ready();
      assert.equal(
        await page.locator("#current-workspace").getAttribute("data-draft-id"),
        "",
      );
      assert.match(
        await page.locator("[data-current-status]").textContent(),
        /excluído/,
      );
      assert.ok(
        (await service.getDraft(identities[manager], office, company, keep.id))
          .id,
      );
      const external = await service.saveDraft(
        identities[manager],
        create("Excluído por colega"),
      );
      await open();
      await page.locator("[data-remote-draft]").selectOption(external.id);
      await Promise.all([
        page.waitForEvent("load"),
        page.locator("[data-remote-open]").click(),
      ]);
      await ready();
      await service.deleteDraft(identities[editor], {
        officeId: office,
        companyId: company,
        draftId: external.id,
        revision: 1,
      });
      await page.locator("[data-remote-save]").click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#current-workspace")
            .hasAttribute("aria-busy"),
      );
      assert.equal(await page.locator("[data-remote-save]").isDisabled(), true);
      assert.match(
        await page.locator("[data-current-status]").textContent(),
        /excluído/,
      );
      await page.locator("[data-remote-new]").click();
      await waitForDialogs(page);
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#current-workspace")
            .hasAttribute("aria-busy"),
      );
      assert.notEqual(
        await page.locator("#current-workspace").getAttribute("data-draft-id"),
        external.id,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((r) => app.close(r));
    }
  }
  sql(
    `UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${identities[manager].sessionId}';`,
  );
  await assert.rejects(
    () => service.deleteDraft(identities[manager], target),
    (e) => e.status === 401,
  );
  console.log(
    "OK: exclusão — autorização por empresa, revisão concorrente, repetição sem duplicar, sem ressurreição por save/replay, histórico/auditoria e sessão revogada" +
      (browserTest
        ? "; cancelamento, falha de rede, exclusão atual/selecionada e cópia após exclusão por colega em navegador real."
        : "."),
  );
}

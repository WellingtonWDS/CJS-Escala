import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { issueSession } from "../../server/auth.js";
import { rpcToken } from "../../server/services/persistence.js";
import { createDiagnosticsHandler } from "../../server/diagnostics.js";
import { PERGUNTAS_DIAGNOSTICO } from "../../assets/js/diagnostico/questionario.js";
export async function testDiagnosticsIntegration({ env, sql, browserTest }) {
  const office = "20000000-0000-0000-0000-000000000001",
    otherOffice = "20000000-0000-0000-0000-000000000002";
  const company = "30000000-0000-0000-0000-000000000001",
    otherCompany = "30000000-0000-0000-0000-000000000002";
  const ids = [1, 2, 3].map((n) => ({
    userId: `81000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sessionId: `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    expiresAt: Date.now() + 3600000,
  }));
  for (const [i, id] of ids.entries()) {
    sql(
      `INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('${id.userId}','diagnostics-test-${i}','Diagnóstico ${i}',${i === 2}); INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${id.sessionId}','${id.userId}',now()+interval '1 hour');`,
    );
    if (i < 2)
      sql(
        `INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES('${id.userId}','${office}','${i === 0 ? "admin" : "editor"}');`,
      );
  }
  sql(
    `INSERT INTO cjs_private.company_access VALUES('${ids[1].userId}','${office}','${company}');`,
  );
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    PERSISTENCE_ENABLED: "true",
    AUTH_SESSION_SECRET: "diagnostics-cookie-secret-for-local-testing",
    N8N_LOGIN_URL: "https://unused.example/login",
    N8N_SERVICE_SECRET: "diagnostic-service-test-secret-long-enough",
    N8N_JWT_SECRET: "diagnostic-login-test-secret-long-enough",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
  };
  const cookies = await Promise.all(
    ids.map((id) => issueSession(settings, Date.now(), id)),
  );
  const handler = createDiagnosticsHandler({ env: settings });
  const req = (fields = {}, post = false, actor = 0) =>
    new Request(
      "https://app.example/api/diagnostics" +
        (post ? "" : "?" + new URLSearchParams(fields)),
      {
        method: post ? "POST" : "GET",
        headers: {
          cookie: "cjs_session=" + cookies[actor],
          origin: "https://app.example",
          "content-type": "application/json",
        },
        ...(post ? { body: JSON.stringify(fields) } : {}),
      },
    );
  const fields = { officeId: office, companyId: company };
  const options = await handler(req());
  assert.equal(options.status, 200);
  assert.equal((await options.json()).offices.length, 1);
  assert.equal((await handler(req({}, false, 1))).status, 403);
  assert.equal(
    (
      await handler(
        req({ action: "list", officeId: otherOffice, companyId: otherCompany }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        req({ action: "list", officeId: office, companyId: otherCompany }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        req(
          { action: "list", officeId: otherOffice, companyId: otherCompany },
          false,
          2,
        ),
      )
    ).status,
    200,
  );
  const data = {
    schemaVersion: 1,
    answers: {
      q02: { value: "Unidade principal", certainty: "confirmada", note: "" },
      q05: {
        value: [{ dia: 1, inicio: "08:00", fim: "" }],
        certainty: "estimativa",
        note: "Conferir fechamento",
      },
    },
  };
  const body = {
    ...fields,
    action: "save",
    id: randomUUID(),
    revision: 0,
    key: randomUUID(),
    status: "rascunho",
    data,
  };
  let res = await handler(req(body, true));
  assert.equal(res.status, 200, await res.clone().text());
  const saved = await res.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.data, data);
  const retry = await (await handler(req(body, true))).json();
  assert.equal(retry.revision, 1);
  assert.equal(retry.history.length, 1);
  const changedKey = await handler(
    req({ ...body, data: { ...data, answers: {} } }, true),
  );
  assert.equal(changedKey.status, 409);
  assert.equal(
    (await handler(req({ ...body, key: randomUUID() }, true))).status,
    409,
  );
  assert.equal((await handler(req(body, true, 1))).status, 403);
  const complete = {
    schemaVersion: 1,
    answers: Object.fromEntries(
      PERGUNTAS_DIAGNOSTICO.filter((q) => q.obrigatoria).map((q) => [
        q.id,
        {
          value: ["multi", "horarios", "cobertura", "ordem"].includes(q.tipo)
            ? []
            : q.tipo === "instrumento"
              ? { nome: "", inicio: "", fim: "", url: "" }
              : "",
          certainty: "pendente",
          note: "Conferir com a empresa",
        },
      ]),
    ),
  };
  complete.answers.q02 = {
    value: "Unidade atualizada",
    certainty: "confirmada",
    note: "",
  };
  res = await handler(
    req(
      {
        ...body,
        revision: 1,
        key: randomUUID(),
        status: "concluido",
        data: complete,
      },
      true,
    ),
  );
  assert.equal(res.status, 200, await res.clone().text());
  const concluded = await res.json();
  assert.equal(concluded.revision, 2);
  assert.equal(concluded.status, "concluido");
  assert.equal(concluded.history.length, 2);
  const historical = await (
    await handler(req({ ...fields, action: "get", id: body.id, revision: "1" }))
  ).json();
  assert.deepEqual(historical.data, data);
  assert.equal(historical.latestRevision, 2);
  assert.equal(
    (
      await handler(
        req({
          ...fields,
          action: "get",
          id: body.id,
          officeId: otherOffice,
          companyId: otherCompany,
        }),
      )
    ).status,
    403,
  );
  // O banco protege também acessos diretos, sem depender do menu ou do BFF.
  const direct = async (actor, name, args) =>
    fetch(`${env.PERSISTENCE_RPC_URL}/rpc/${name}`, {
      method: "POST",
      headers: {
        Authorization:
          "Bearer " + rpcToken(ids[actor], env.PERSISTENCE_JWT_SECRET),
        "Content-Type": "application/json",
        "Content-Profile": "cjs_api",
        "Accept-Profile": "cjs_api",
      },
      body: JSON.stringify(args),
    });
  const args = { p_office_id: office, p_company_id: company };
  assert.equal((await direct(1, "diagnostic_list", args)).status, 403);
  assert.equal(
    (await direct(1, "diagnostic_get", { ...args, p_id: body.id })).status,
    403,
  );
  assert.equal(
    (
      await direct(1, "diagnostic_save", {
        ...args,
        p_id: randomUUID(),
        p_revision: 0,
        p_key: randomUUID(),
        p_status: "rascunho",
        p_data: data,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await direct(0, "diagnostic_save", {
        ...args,
        p_id: randomUUID(),
        p_revision: 0,
        p_key: randomUUID(),
        p_status: "concluido",
        p_data: { schemaVersion: 1, answers: {} },
      })
    ).status,
    400,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM cjs_private.diagnostic_revisions WHERE diagnostic_id='${body.id}';`,
    ),
    "2",
  );
  if (browserTest) {
    const { createDevServer } = await import("../../scripts/serve.js");
    const { chromium } = await import("playwright");
    const server = createDevServer({ env: settings });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    try {
      await (
        await import("../browser-diagnostico-empresa.cjs")
      ).default({
        browser,
        baseURL: origin,
        tokens: cookies,
        companyId: company,
        savedId: body.id,
      });
    } finally {
      await browser.close();
      await new Promise((r) => server.close(r));
    }
  }
  sql(
    `UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${ids[0].sessionId}';`,
  );
  assert.equal((await handler(req())).status, 401);
  console.log(
    "OK: diagnóstico PostgreSQL/PostgREST — gerente/admin, operador bloqueado, isolamento, rascunho/conclusão, revisões, conflito, repetição idempotente e revogação.",
  );
}

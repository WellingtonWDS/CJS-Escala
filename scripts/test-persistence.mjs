import { testIdentityIntegration } from "../tests/helpers/identity-integration.mjs";
import { testAdminIntegration } from "../tests/helpers/admin-integration.mjs";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID, createHmac } from "node:crypto";
import { cenario } from "../tests/fixtures/edicao-manual.mjs";
import assert from "node:assert/strict";
import {
  createPersistenceService,
  rpcToken,
} from "../server/services/persistence.js";
import { createPersistenceHandler } from "../server/persistence-api.js";
const suffix = randomUUID().slice(0, 8),
  network = `cjs-test-${suffix}`,
  pg = `${network}-pg`,
  api = `${network}-api`;
const secret = "integration-only-secret-never-use-in-production";
const docker = (args, input) => {
  const r = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 3 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw Error(r.stderr || r.stdout || "Docker indisponível");
  return r.stdout.trim();
};
const sql = (s) =>
  docker(
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=local-container-test-only",
      pg,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    s,
  );
const office = "20000000-0000-0000-0000-000000000001",
  otherOffice = "20000000-0000-0000-0000-000000000002",
  company = "30000000-0000-0000-0000-000000000001",
  otherCompany = "30000000-0000-0000-0000-000000000002";
const identity = (n) => ({
  userId: `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  sessionId: `40000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  expiresAt: Date.now() + 3600000,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let env;
try {
  docker(["network", "create", network]);
  docker([
    "run",
    "-d",
    "--name",
    pg,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "-e",
    "POSTGRES_PASSWORD=local-container-test-only",
    "postgres:17-alpine",
  ]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      sql("SELECT 1;");
      ready = true;
      break;
    } catch {
      await wait(250);
    }
  }
  assert.ok(ready, "PostgreSQL não iniciou");
  const migrations = new URL("../database/migrations/", import.meta.url);
  for (const file of (await readdir(migrations))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sql(await readFile(new URL(file, migrations), "utf8"));
  sql(
    await readFile(
      new URL("../database/tests/seed.sql", import.meta.url),
      "utf8",
    ),
  );
  docker([
    "cp",
    new URL("../database", import.meta.url).pathname,
    `${pg}:/tmp/cjs-database`,
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    docker([
      "exec",
      pg,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "identity_subject=test:admin-a",
      "-f",
      "/tmp/cjs-database/enable-user-management.sql",
    ]);
    assert.equal(
      sql(
        "SELECT platform_admin FROM cjs_private.users WHERE identity_subject='test:admin-a';",
      ),
      "t",
    );
  }
  sql(
    "UPDATE cjs_private.users SET platform_admin=false WHERE identity_subject='test:admin-a';",
  );
  docker([
    "run",
    "-d",
    "--name",
    api,
    "--network",
    network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    "PGRST_DB_URI=postgres://cjs_authenticator:local-integration-only@postgres:5432/postgres",
    "-e",
    "PGRST_DB_SCHEMAS=cjs_api",
    "-e",
    "PGRST_DB_ANON_ROLE=cjs_anonymous",
    "-e",
    "PGRST_DB_PRE_REQUEST=cjs_api.check_session",
    "-e",
    `PGRST_JWT_SECRET=${secret}`,
    "-e",
    "PGRST_JWT_AUD=cjs-postgrest",
    "postgrest/postgrest:v14.15",
  ]);
  const port = docker(["port", api, "3000/tcp"]).split(":").at(-1);
  env = {
    PERSISTENCE_ENABLED: "true",
    PERSISTENCE_ALLOW_LOCAL_HTTP: "true",
    PERSISTENCE_RPC_URL: `http://127.0.0.1:${port}`,
    PERSISTENCE_JWT_SECRET: secret,
  };
  ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(env.PERSISTENCE_RPC_URL);
      if (r.status < 500) {
        ready = true;
        break;
      }
    } catch {}
    await wait(250);
  }
  assert.ok(ready, "PostgREST não iniciou");
  const service = createPersistenceService({ env }),
    admin = identity(1),
    viewer = identity(2),
    b = identity(3);
  const rpc = (name, args = {}, token = rpcToken(admin, secret)) =>
    fetch(`${env.PERSISTENCE_RPC_URL}/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
    });
  assert.equal((await service.listOffices(admin)).length, 1);
  assert.equal((await service.listOffices(admin))[0].id, office);
  assert.equal((await service.listOffices(b))[0].id, otherOffice);
  assert.deepEqual(await service.listCompanies(admin, otherOffice), []);
  assert.equal((await service.listCompanies(viewer, office)).length, 1);
  const draft = {
    officeId: office,
    companyId: company,
    key: randomUUID(),
    title: "Cenário fictício",
    state: JSON.parse(JSON.stringify(cenario())),
  };
  const saved = await service.saveDraft(admin, draft);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await service.saveDraft(admin, draft), saved);
  assert.deepEqual(
    (await service.getDraft(viewer, office, company, saved.id)).state,
    draft.state,
  );
  await assert.rejects(
    () => service.saveDraft(viewer, { ...draft, key: randomUUID() }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => service.getDraft(b, office, company, saved.id),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      service.saveDraft(admin, {
        ...draft,
        officeId: otherOffice,
        companyId: otherCompany,
        key: randomUUID(),
      }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      service.saveDraft(admin, {
        ...draft,
        key: randomUUID(),
        companyId: otherCompany,
      }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => service.saveDraft(admin, { ...draft, title: "Outra tentativa" }),
    (e) => e.status === 409,
  );
  const update = {
    ...draft,
    draftId: saved.id,
    revision: 1,
    key: randomUUID(),
    state: { ...draft.state, mes: 10 },
  };
  const updated = await service.saveDraft(admin, update);
  assert.equal(updated.revision, 2);
  await assert.rejects(
    () => service.saveDraft(admin, { ...update, key: randomUUID() }),
    (e) => e.status === 409,
  );
  const concurrent = await Promise.allSettled(
    [1, 2].map((i) =>
      service.saveDraft(admin, {
        ...update,
        revision: 2,
        key: randomUUID(),
        title: `Concorrência ${i}`,
      }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    concurrent.find((r) => r.status === "rejected").reason.status,
    409,
  );
  assert.equal(sql("SELECT count(*) FROM cjs_private.draft_versions;"), "3");
  assert.equal(sql("SELECT count(*) FROM cjs_private.audit;"), "3");
  const before = sql("SELECT count(*) FROM cjs_private.idempotency;");
  await assert.rejects(() =>
    service.saveDraft(admin, { ...draft, key: randomUUID(), state: [] }),
  );
  assert.equal(sql("SELECT count(*) FROM cjs_private.idempotency;"), before);
  assert.ok([401, 403].includes((await rpc("list_offices", {}, null)).status));
  assert.equal((await rpc("list_offices", {}, "not-a-jwt")).status, 401);
  const expired = rpcToken(
    { ...admin, expiresAt: Date.now() + 1000 },
    secret,
    Date.now() - 120000,
  );
  assert.equal((await rpc("list_offices", {}, expired)).status, 401);
  // Mesmo com assinatura válida, finalidade/emissor e identidade não podem ser trocados.
  const forge = (changes) => {
    const [h, p] = rpcToken(admin, secret).split(".");
    const data = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(p, "base64url")),
        ...changes,
      }),
    ).toString("base64url");
    return `${h}.${data}.${createHmac("sha256", secret).update(`${h}.${data}`).digest("base64url")}`;
  };
  for (const changes of [
    { aud: "other-app" },
    { iss: "other-issuer" },
    { sid: identity(2).sessionId },
  ])
    assert.equal((await rpc("list_offices", {}, forge(changes))).status, 401);
  assert.equal(
    (
      await fetch(`${env.PERSISTENCE_RPC_URL}/drafts`, {
        headers: { Authorization: `Bearer ${rpcToken(admin, secret)}` },
      })
    ).status,
    404,
  );
  // RLS é verificada também sob SET ROLE direto, sem passar pelas RPCs.
  const claims = JSON.stringify({
    role: "cjs_authenticated",
    sub: b.userId,
    sid: b.sessionId,
    iss: "cjs-escala-api",
    aud: "cjs-postgrest",
  });
  assert.equal(
    sql(
      `BEGIN;SET LOCAL ROLE cjs_authenticated;SELECT set_config('request.jwt.claims','${claims}',true);SELECT count(*) FROM cjs_private.drafts;ROLLBACK;`,
    )
      .split("\n")
      .at(-2),
    "0",
  );
  let fkRejected = false;
  try {
    sql(
      `INSERT INTO cjs_private.company_access VALUES('${admin.userId}','${office}','${otherCompany}');`,
    );
  } catch {
    fkRejected = true;
  }
  assert.ok(fkRejected);
  const editor = identity(4);
  const byEditor = await service.saveDraft(editor, {
    ...draft,
    key: randomUUID(),
    title: "Rascunho do editor",
  });
  assert.equal(
    (await service.getDraft(admin, office, company, byEditor.id)).updated_by,
    editor.userId,
  );
  await assert.rejects(
    () =>
      service.saveDraft(editor, {
        ...draft,
        key: randomUUID(),
        companyId: "30000000-0000-0000-0000-000000000003",
      }),
    (e) => e.status === 403,
  );
  sql(
    `UPDATE cjs_private.memberships SET active=false WHERE user_id='${editor.userId}';`,
  );
  await assert.rejects(
    () => service.getDraft(editor, office, company, byEditor.id),
    (e) => e.status === 403,
  );
  sql(`UPDATE cjs_private.users SET active=false WHERE id='${viewer.userId}';`);
  await assert.rejects(
    () => service.listOffices(viewer),
    (e) => e.status === 401,
  );
  // API portátil: identidade vem exclusivamente do autenticador injetado.
  const handler = createPersistenceHandler({
    env,
    authenticate: async () => admin,
  });
  const request = (body) =>
    new Request("https://escala.example/api/persistence", {
      method: "POST",
      headers: {
        Origin: "https://escala.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const response = await handler(
    request({ action: "listOffices", userId: b.userId }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].id, office);
  assert.equal(
    (
      await createPersistenceHandler({ env })(
        request({ action: "listOffices" }),
      )
    ).status,
    401,
  );
  sql(
    `UPDATE cjs_private.sessions SET revoked_at=now() WHERE id='${admin.sessionId}';`,
  );
  await assert.rejects(
    () => service.listOffices(admin),
    (e) => e.status === 401,
  );
  await assert.rejects(
    () => service.getDraft(admin, office, company, saved.id),
    (e) => e.status === 401,
  );
  await testAdminIntegration({
    env,
    sql,
    browserTest: process.argv.includes("--browser"),
  });
  await testIdentityIntegration({
    env,
    sql,
    browserTest: process.argv.includes("--browser"),
  });
  console.log(
    "OK: PostgreSQL 17 + PostgREST 14.15 reais: migração, isolamento entre escritórios/empresas, consulta/edição, revisão, idempotência, concorrência, histórico/auditoria, rollback, RLS, FK cruzada, JWT e sessão revogada; API portátil nega identidade não autenticada.",
  );
} finally {
  for (const name of [api, pg])
    spawnSync("docker", ["rm", "-fv", name], { stdio: "ignore" });
  spawnSync("docker", ["network", "rm", network], { stdio: "ignore" });
}

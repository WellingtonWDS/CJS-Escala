const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
test("template n8n emite claims compatíveis com o backend pelo nó JWT nativo e mantém o webhook protegido", async () => {
  const workflow = JSON.parse(
    await readFile(
      new URL(
        "../integrations/n8n/cjs-login.template.json",
        `file://${__filename}`,
      ),
      "utf8",
    ),
  );
  const { signJwt, verifyIdentityJwt } = await import("../server/jwt.js");
  const jwt = workflow.nodes.find((n) => n.name === "Assinar identidade CJS"),
    webhook = workflow.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  assert.equal(webhook.parameters.authentication, "headerAuth");
  assert.equal(jwt.type, "n8n-nodes-base.jwt");
  assert.equal(jwt.parameters.operation, "sign");
  assert.equal(jwt.parameters.options.algorithm, "HS256");
  // Executa a expressão do artefato, usando um relógio que avança a cada leitura.
  const expression = jwt.parameters.claimsJson.slice(3, -2),
    now = Date.now();
  let reads = 0;
  const payload = Function(
    "$json",
    "Date",
    `return (${expression});`,
  )({ user_id: 123 }, { now: () => now + 1000 * reads++ });
  assert.equal(reads, 1);
  assert.equal(payload.exp - payload.iat, 43200);
  const env = {
    N8N_JWT_SECRET: "test-native-n8n-secret-32-characters-long",
    N8N_JWT_ISSUER: "fintria-cjs-identity",
    N8N_JWT_AUDIENCE: "fintria-cjs-login",
  };
  const verified = await verifyIdentityJwt(
    await signJwt(payload, env.N8N_JWT_SECRET),
    env,
    now,
  );
  assert.equal(verified.subject, "123");
  assert.ok(!JSON.stringify(jwt.parameters).includes("$env"));
});

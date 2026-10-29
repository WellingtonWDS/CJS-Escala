const { test } = require("node:test");
const assert = require("node:assert/strict");
const user = "10000000-0000-0000-0000-000000000001";
const context = {
  officeId: "20000000-0000-0000-0000-000000000001",
  companyId: "30000000-0000-0000-0000-000000000001",
  draftId: null,
  revision: null,
};
async function sample() {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const s = criarEstadoDemo();
  s.colaboradores = Array.from({ length: 30 }, (_, i) => ({
    ...s.colaboradores[i % 5],
    id: i + 1,
    nome: `Pessoa ${i}`,
  }));
  s.conversao = converterEscala(s, {
    periodo: "2028-02",
    fase: "definitivo40",
    folgas: "fim_semana",
  });
  s.escalaGerada = structuredClone(s.conversao.origem.escala);
  return JSON.parse(JSON.stringify(s));
}
test("30 colaboradores: resultados completos compactados, sem alterar entrada nem compartilhar referências", async () => {
  const { compactarSnapshot, expandirSnapshot } =
    await import("../assets/js/state/snapshot.js");
  const s = await sample(),
    before = JSON.stringify(s),
    p = compactarSnapshot(s);
  assert(JSON.stringify(p).length < 800000);
  const restored = expandirSnapshot(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored, s);
  restored.escalaGerada.resultado[0].dias[0].status = "MODIFICADO";
  assert.notEqual(
    restored.conversao.origem.escala.resultado[0].dias[0].status,
    "MODIFICADO",
  );
  assert.equal(JSON.stringify(s), before);
});
test("cache, recuperação e envio pendente restauram resultados; modo volátil não bloqueia servidor", async () => {
  const { createWorkspace } = await import("../assets/js/state/workspace.js");
  const s = await sample(),
    map = new Map();
  let full = false;
  const raw = {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => {
      if (full) throw Error("quota");
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
  };
  const w = createWorkspace(raw, user);
  w.activate(context, s);
  assert.deepEqual(w.cached(context), s);
  const key = "fintria-escala-dp-v2";
  assert.deepEqual(JSON.parse(w.storage.getItem(key)), s);
  w.setPending({ key: "same-key", state: s });
  assert.deepEqual(w.pending().state, s);
  full = true;
  w.setPending({ key: "retry", state: s }, { allowVolatile: true });
  assert.equal(w.pending().key, "retry");
  assert(w.pendingVolatile());
  assert.equal(
    w.activate({ ...context, draftId: user, revision: 1 }, s, {
      allowVolatile: true,
    }).cached,
    false,
  );
  w.clearPending(context);
  assert.equal(w.pending(), null);
});
test("snapshots antigos continuam legíveis e estruturas inválidas são rejeitadas", async () => {
  const { compactarSnapshot, expandirSnapshot } =
    await import("../assets/js/state/snapshot.js");
  assert.deepEqual(expandirSnapshot({ mes: 1 }), { mes: 1 });
  assert.deepEqual(
    expandirSnapshot(
      compactarSnapshot({
        escalaGerada: { resultado: [{ status: "T" }, { status: "T" }] },
      }),
    ),
    { escalaGerada: { resultado: [{ status: "T" }, { status: "T" }] } },
  );
  for (const pack of [
    { versao: 2, nos: [], raiz: 0 },
    { versao: 1, nos: [[1, [0]]], raiz: 0 },
    { versao: 1, nos: ["__proto__", true, [0, [0, 1]]], raiz: 2 },
  ])
    assert.throws(() => expandirSnapshot({ resultadosCompactados: pack }));
});

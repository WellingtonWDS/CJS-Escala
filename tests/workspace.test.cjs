const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let create, base, validate;
before(async () => {
  ({ createWorkspace: create, validateSnapshot: validate } = await import(
    "../assets/js/state/workspace.js"
  ));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
});
const user = "10000000-0000-0000-0000-000000000001",
  other = "10000000-0000-0000-0000-000000000002",
  c = {
    officeId: "20000000-0000-0000-0000-000000000001",
    companyId: "30000000-0000-0000-0000-000000000001",
    draftId: null,
    revision: null,
  },
  key = "fintria-escala-dp-v2";
function raw() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
test("cache é separado por usuário, escritório, empresa e rascunho; legado não é carregado automaticamente", () => {
  const r = raw();
  r.setItem(key, JSON.stringify(base()));
  const a = create(r, user),
    b = create(r, other);
  assert.equal(a.storage.getItem(key), null);
  assert.equal(b.storage.getItem(key), null);
  assert.ok(a.legacy());
  const state = base();
  a.activate(c, state);
  assert.equal(b.context(), null);
  assert.equal(b.storage.getItem(key), null);
  a.storage.setItem(key, JSON.stringify({ ...state, mes: 4 }));
  a.activate(
    { ...c, companyId: "30000000-0000-0000-0000-000000000002" },
    base(),
  );
  assert.equal(a.cached(c).mes, 4);
});
test("envio pendente guarda chave e conteúdo anteriores e não vaza para outra empresa", () => {
  const a = create(raw(), user);
  a.activate(c, base());
  const body = { key: "stable", state: base() };
  a.setPending(body);
  assert.deepEqual(a.pending(), body);
  a.activate(
    { ...c, companyId: "30000000-0000-0000-0000-000000000002" },
    base(),
  );
  assert.equal(a.pending(), null);
});
test("abrir estado diferente preserva cópia local anterior para recuperação", () => {
  const a = create(raw(), user),
    state = base();
  a.activate(c, state);
  a.activate({ ...c, revision: 2 }, { ...state, mes: 3 });
  assert.equal(a.previous().mes, state.mes);
  assert.equal(a.cached(c).mes, 3);
});
test("falha ao salvar novo contexto não remove envio pendente nem altera contexto ativo", () => {
  const r = raw(),
    a = create(r, user);
  a.activate(c, base());
  a.setPending({ key: "pending" });
  const old = r.setItem;
  r.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => a.activate({ ...c, draftId: user, revision: 1 }, base()));
  assert.deepEqual(a.context(), c);
  assert.equal(a.pending().key, "pending");
  r.setItem = old;
});
test("snapshots inválidos e chaves de poluição de protótipo são rejeitados antes de gravar", () => {
  assert.throws(() => validate({ colaboradores: "bad" }));
  assert.throws(() =>
    validate({
      ...base(),
      payload: JSON.parse('{"__proto__":{"polluted":true}}'),
    }),
  );
  assert.equal({}.polluted, undefined);
});

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
let inferir, preencher, base, analisar, preparar, ler, X, defaults, csv, domain;
before(async () => {
  ({ inferirSexoPorNome: inferir, preencherSexoPorNome: preencher } =
    await import("../assets/js/domain/sexo-por-nome.js"));
  ({ NOMES_IBGE: base } = await import("../assets/js/data/nomes-ibge.js"));
  ({ analisarQuadroDominio: analisar, prepararDominio: preparar } =
    await import("../assets/js/import/dominio.js"));
  ({ lerArquivoDominio: ler } = await import(
    "../assets/js/import/arquivo-dominio.js"
  ));
  ({ createDefaultState: defaults } = await import(
    "../assets/js/state/store.js"
  ));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  X = await import("@e965/xlsx");
});
test("preenche apenas nomes com predominância mínima de 99% e preserva evidência", () => {
  for (const [nome, sexo] of [
    ["João da Silva", "masculino"],
    ["Maria Silva", "feminino"],
    ["Ana Paula Silva", "feminino"],
  ]) {
    const r = inferir(nome);
    assert.equal(r.sexo, sexo);
    assert.ok(r.predominancia >= 0.99);
    assert.ok(r.amostra >= 1000);
    assert.ok(r.frequenciaFeminina > 0 && r.frequenciaMasculina > 0);
  }
});
test("ambiguidades, nomes fora da base e evidências divergentes ficam sem resultado", () => {
  for (const nome of [
    "Adair Silva",
    "Ariel Santos",
    "Pessoa Exemplo",
    "J. Silva",
    "Dra Maria Silva",
    "Maria José Silva",
    "José Maria Silva",
    "",
    null,
  ])
    assert.equal(inferir(nome), null, nome);
});
test("limites de predominância e volume são aplicados antes de arredondar", () => {
  assert.ok(inferir("ALFA Silva", { ALFA: [990, 10] }));
  assert.equal(inferir("ALFA Silva", { ALFA: [98999, 1001] }), null);
  assert.equal(inferir("ALFA Silva", { ALFA: [995, 1] }), null);
  assert.equal(inferir("ALFA Silva", { ALFA: [10000, 0] }), null);
  assert.equal(inferir("ALFA Silva", { ALFA: [10000, null] }), null);
});
test("normaliza acentos e espaços sem usar sobrenome para decidir", () => {
  assert.equal(inferir("  joão  da SILVA ").sexo, "masculino");
  assert.equal(inferir("ANA-MARIA SILVA").sexo, "feminino");
  assert.equal(inferir("NOME MARIA"), null);
  assert.equal(inferir("JOÃO/MARIA SILVA"), null);
});
test("base tem ambas as contagens e não trata ausência no ranking como zero", () => {
  assert.equal(Object.keys(base).length, 10582);
  assert.ok(
    Object.values(base).every(
      (c) => c.length === 2 && c.every((n) => Number.isSafeInteger(n) && n > 0),
    ),
  );
  assert.equal(
    Object.values(base).filter(
      (c) => Math.max(...c) / (c[0] + c[1]) >= 0.99 && c[0] + c[1] >= 1000,
    ).length,
    2655,
  );
});
test("sexo previamente informado é preservado mesmo que o nome sugira outro", () => {
  const c = { nome: "Maria Silva", sexo: "masculino" };
  assert.equal(preencher(c), false);
  assert.equal(c.sexo, "masculino");
  assert.equal(c.sexoInferencia, undefined);
  const optout = {
    nome: "Maria Silva",
    sexo: "nao_informado",
    sexoOrigem: "usuario",
  };
  assert.equal(preencher(optout), false);
  assert.equal(optout.sexo, "nao_informado");
});
test("alteração de nome reavalia uma estimativa e retira o preenchimento se ficar ambíguo", () => {
  const c = { nome: "João Silva", sexo: "nao_informado" };
  assert.equal(preencher(c), true);
  assert.equal(c.sexoOrigem, "nome");
  c.nome = "Maria Silva";
  assert.equal(preencher(c), true);
  assert.equal(c.sexo, "feminino");
  c.nome = "Adair Silva";
  assert.equal(preencher(c), true);
  assert.equal(c.sexo, "nao_informado");
  assert.equal(c.sexoInferencia, undefined);
});
test("prévia e confirmação usam a mesma inferência, preservando relatório e cadastro existente", async () => {
  const bytes = await fs.readFile(
    new URL("./fixtures/dominio/drogaria.xls", `file://${__filename}`),
  );
  const q = analisar(await ler(bytes, X), "quadro.xls");
  q.colaboradores[0].nome = "Maria Silva";
  q.colaboradores[1].nome = "Adair Silva";
  const original = structuredClone(q),
    s = defaults(new Date(2026, 9, 22));
  const atual = structuredClone(s);
  const p = preparar(s, q, "substituir");
  assert.equal(p.colaboradores[0].sexo, "feminino");
  assert.equal(p.colaboradores[1].sexo, "nao_informado");
  assert.ok(p.colaboradores[0].sexoInferencia);
  assert.deepEqual(q, original);
  assert.deepEqual(s, atual);
  Object.assign(s, p);
  s.escalaGerada = domain(s).gerarDadosEscala();
  const texto = csv(s);
  assert.match(texto, /Origem do sexo/);
  assert.match(texto, /Estimado pelo prenome/);
  assert.match(texto, /99\.51%/);
});

test("Lucas, Tiago, Thamires e Hellen passam com a base ampliada e limiar de 99%", () => {
  for (const [nome, sexo] of [
    ["Lucas Silva", "masculino"],
    ["Tiago Silva", "masculino"],
    ["Thamires Silva", "feminino"],
    ["Hellen Silva", "feminino"],
  ]) {
    const r = inferir(nome);
    assert.equal(r.sexo, sexo);
    assert.ok(r.predominancia >= 0.99);
    assert.ok(r.frequenciaFeminina > 0 && r.frequenciaMasculina > 0);
    assert.match(r.fonte, /2022/);
  }
});
test("nova base atualiza evidências de uma estimativa antiga sem sobrescrever escolhas manuais", () => {
  const c = {
    nome: "Maria Silva",
    sexo: "feminino",
    sexoOrigem: "nome",
    sexoInferencia: {
      sexo: "feminino",
      prenome: "MARIA",
      predominancia: 0.9966,
      fonte: "IBGE/Censo 2010",
      versao: "antiga",
    },
  };
  assert.equal(preencher(c), true);
  assert.equal(c.sexo, "feminino");
  assert.match(c.sexoInferencia.versao, /2022/);
  assert.equal(preencher(c), false);
  c.sexoOrigem = "usuario";
  const antes = structuredClone(c);
  assert.equal(preencher(c), false);
  assert.deepEqual(c, antes);
});

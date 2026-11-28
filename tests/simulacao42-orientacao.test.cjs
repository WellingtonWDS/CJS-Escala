const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let base, diagnostico;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ diagnosticoSimulacao42: diagnostico } = await import(
    "../assets/js/domain/simulacao42.js"
  ));
});
test("fixa em 01/12 antecipa a fase de 42h, com acordo de compensação como pendência, sem exigir ACT", () => {
  const s = base();
  s.modeloEscala = "fixa";
  s.dataReferenciaFixa = "2026-12-01";
  const antes = structuredClone(s),
    r = diagnostico(s, "2027-02");
  assert.equal(r.permitida, true);
  assert.equal(r.motivo, "antecipacao");
  assert.match(r.mensagem, /Antes de 16\/12\/2026/);
  assert.match(r.mensagem, /art\. 59, § 6º, da CLT/);
  assert.deepEqual(s, antes);
  s.dataReferenciaFixa = "2027-12-16";
  assert.equal(diagnostico(s, "2027-02").motivo, "referencia_fora_transicao");
  for (const data of ["2026-12-16", "2027-12-15"]) {
    s.dataReferenciaFixa = data;
    const livre = diagnostico(s, "2027-02");
    assert(livre.permitida);
    assert.match(livre.mensagem, /42h disponíveis sem ACT\/CCT/);
    assert.equal(s.instrumentoColetivo.identificacao, "");
  }
});
test("dinâmica explica mês fora do período e libera meses válidos, inclusive fronteiras", () => {
  const s = base();
  const r = diagnostico(s, "2028-01");
  assert(!r.permitida);
  assert.equal(r.motivo, "periodo_fora_transicao");
  // Antes de 16/12/2026: antecipação da fase de 42h.
  assert.equal(diagnostico(s, "2026-11").motivo, "antecipacao");
  for (const periodo of ["2026-11", "2026-12", "2027-02", "2027-12"])
    assert(diagnostico(s, periodo).permitida);
  assert.equal(diagnostico(s, "").motivo, "periodo_invalido");
  s.modeloEscala = "fixa";
  s.dataReferenciaFixa = "";
  assert.equal(diagnostico(s, "2027-02").motivo, "referencia_invalida");
});
test("ACT ou banco selecionado é explicado sem descartar condições declaradas", () => {
  const s = base();
  s.instrumentoCompensacao = "act_cct";
  assert.equal(diagnostico(s, "2027-02").motivo, "instrumento_selecionado");
  assert.match(
    diagnostico(s, "2027-02").mensagem,
    /Nenhuma compensação informada/,
  );
  Object.assign(s.instrumentoColetivo, {
    identificacao: "CCT teste",
    inicio: "2026-01-01",
    fim: "2029-12-31",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 10,
  });
  assert(diagnostico(s, "2027-02").permitida);
  s.instrumentoCompensacao = "banco";
  assert.equal(diagnostico(s, "2027-02").motivo, "instrumento_selecionado");
});

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let conferir, cenarios, converter;
before(async () => {
  ({ conferirDiagnostico: conferir } = await import("../assets/js/diagnostico/conferencia.js"));
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
});
const A = (value, certainty = "confirmada", note = "") => ({ value, certainty, note });
const ABERTA = [0, 2, 3, 4, 5, 6];
function lanchonete() {
  const s = cenarios().at(-1).drafts[0].state;
  s.conversao = converter(s, s.destinoConversao);
  return s;
}
const base = () => ({
  q05: A(ABERTA.map((dia) => ({ dia, inicio: "18:00", fim: "01:00" }))),
  q06: A("Sim", "confirmada", "Equipe entra antes para organização"),
  q11: A([{ funcao: "Atendente", minimo: 1, diasSemana: ABERTA, inicio: "18:00", fim: "01:00" },
    { funcao: "cozinheiro", minimo: 1, diasSemana: ABERTA, inicio: "18:00", fim: "01:00" }]),
  q25: A(["Trabalho noturno"]),
  q27: A(["Entradas e saídas", "Distribuição dos intervalos", "Dias de folga"]),
});
const item = (r, titulo) => r.itens.find((i) => i.titulo.startsWith(titulo));

test("diagnóstico coerente com a proposta: funcionamento, mínimo por função e alterações aceitas", () => {
  const r = conferir({ answers: base() }, lanchonete());
  assert.equal(r.escala, "proposta");
  assert.equal(r.contagem.divergencia, 0, JSON.stringify(r.itens.filter((i) => i.nivel === "divergencia")));
  assert.equal(item(r, "Mínimo por função").nivel, "ok", "“cozinheiro” corresponde a “Cozinheiro(a)”");
  assert.equal(item(r, "Horários de entrada e saída").nivel, "ok");
  // Hoje 3 pessoas entram antes da abertura; na proposta todos entram antes.
  assert.match(item(r, "Mais pessoas fora do horário").detalhe, /Hoje 3 pessoas.*na proposta, 8/);
  assert.deepEqual(r.itens.map((i) => i.nivel), [...r.itens.map((i) => i.nivel)].sort((a, b) =>
    ["divergencia", "alerta", "conferir", "ok"].indexOf(a) - ["divergencia", "alerta", "conferir", "ok"].indexOf(b)));
});

test("divergências: dia fechado, função ausente, mínimo maior, alterações sem aceite e fase de 42h", () => {
  const answers = base();
  answers.q05 = A(ABERTA.filter((d) => d !== 0).map((dia) => ({ dia, inicio: "18:00", fim: "01:00" })));
  answers.q06 = A("Não");
  answers.q11 = A([{ funcao: "Caixa", minimo: 1, diasSemana: [5], inicio: "18:00", fim: "22:00" },
    { funcao: "Atendente", minimo: 4, diasSemana: [6], inicio: "20:00", fim: "22:00" }]);
  answers.q27 = A(["Nenhuma alteração"]);
  answers.q03 = A("2028-02-01");
  const s = lanchonete();
  const r = conferir({ answers }, s);
  assert.match(item(r, "Trabalho em dia sem funcionamento").detalhe, /domingo/);
  assert.equal(item(r, "Trabalho fora do horário").nivel, "divergencia");
  assert.match(item(r, "Função do diagnóstico sem ninguém").detalhe, /^Caixa/);
  assert.match(item(r, "Mínimo por função não atendido").detalhe, /Atendente: falta gente/);
  assert.equal(item(r, "Horários de entrada e saída alterados sem aceite").nivel, "divergencia");
  assert.equal(item(r, "Segundo repouso semanal").nivel, "alerta");
  assert.equal(item(r, "Data de implantação").nivel, "ok");
  answers.q03 = A("2026-12-16", "estimativa");
  const r2 = conferir({ answers }, s);
  assert.equal(item(r2, "Data de implantação").nivel, "alerta");
  assert.equal(item(r2, "Data de implantação").certeza, "Estimativa");
});

test("preenchimento sem as informações do diagnóstico: ACT/CCT, comércio, multifunção, restrições e textos livres", () => {
  const answers = {
    q11: A([{ funcao: "Atendente", minimo: 1, diasSemana: ABERTA, inicio: "18:00", fim: "01:00" }]),
    q17: A("Sim"), q23: A("Comércio varejista de alimentos"), q24: A({ nome: "CCT Exemplo", inicio: "2026-01-01", fim: "2026-12-31", url: "" }),
    q25: A(["12×36", "Compensação diária"]), q26: A("Não"), q29: A("Sim"),
    q28: A([{ descricao: "Sábado com equipe completa", natureza: "obrigatoria" }]), q08: A("Feriados normais."),
    q32: A(["Previsibilidade das folgas"]),
  };
  const r = conferir({ answers }, lanchonete());
  for (const t of ["Instrumento coletivo não declarado", "Vigência do ACT/CCT", "Regime 12×36", "Compensação diária", "Trabalho noturno",
    "Atividade de comércio", "Colaboradores multifunção", "Restrições individuais", "Cargas contratuais", "Cobertura diferente da cadastrada"])
    assert.equal(item(r, t)?.nivel, "alerta", t);
  assert.equal(item(r, "Prioridade: previsibilidade").nivel, "alerta");
  assert.equal(item(r, "Condição obrigatória").nivel, "conferir");
  assert.equal(item(r, "Como funciona aos sábados").detalhe, "Feriados normais.");
});

test("sem escala gerada, a conferência pede para gerar antes", () => {
  const s = cenarios().at(-1).drafts[0].state;
  assert.throws(() => conferir({ answers: base() }, s), /Gere a escala/);
});

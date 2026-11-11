const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let converter, base;
before(async () => {
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
});
function empresa(n, { domingo = true, cobertura = false } = {}) {
  const s = base(new Date(2026, 9, 21));
  s.colaboradores = Array.from({ length: n }, (_, i) => ({
    id: i + 1, nome: `Pessoa ${i + 1}`, sexo: "masculino", cargo: "Atendente", horasSemana: 44,
  }));
  s.jornada = { entrada: "08:00", intInicio: "12:00", intFim: "13:00", saida: "17:00" };
  s.diasTrabalho = domingo ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
  s.folgaDiasPermitidos = [...s.diasTrabalho];
  if (cobertura) {
    s.coberturaAtiva = true;
    s.demandasCobertura = [{ id: 1, funcao: "Atendente", inicio: "09:00", fim: "12:00", minimo: 2,
      diasSemana: [0, 1, 2, 3, 4, 5, 6], incluirFeriados: false }];
  }
  return s;
}
const op = { periodo: "2028-02", fase: "automatico", folgas: "distribuir" };
const domingos = (c) => c.proposta.config.escalaGerada.resultado.map((r) =>
  r.dias.filter((d) => d.data.startsWith("2028-02") && new Date(`${d.data}T12:00`).getDay() === 0));

test("com cobertura informada, a proposta prefere o domingo como repouso sem abrir lacunas", () => {
  const c = converter(empresa(12, { cobertura: true }), op);
  assert.equal(c.comparacao.status, "suficiente");
  assert.equal(c.comparacao.faltantesDepois, 0);
  assert.equal(c.comparacao.erros, 0);
  const { antes, depois } = c.comparacao.domingo;
  assert.equal(depois.operacional, true);
  assert.ok(depois.comFolga > antes.comFolga, JSON.stringify(c.comparacao.domingo));
  // A demanda mínima de 2 atendentes no domingo continua atendida.
  for (const data of domingos(c)[0].map((d) => d.data)) {
    const presentes = c.proposta.config.escalaGerada.resultado.filter((r) =>
      r.dias.some((d) => d.data === data && ["T", "FE"].includes(d.status))).length;
    assert.ok(presentes >= 2, `${data}: ${presentes}`);
  }
});

test("sem cobertura cadastrada, a preferência não esvazia o domingo", () => {
  const c = converter(empresa(6), op);
  const { depois } = c.comparacao.domingo;
  assert.ok(depois.comFolga >= 1);
  for (const data of domingos(c)[0].map((d) => d.data)) {
    const presentes = c.proposta.config.escalaGerada.resultado.filter((r) =>
      r.dias.some((d) => d.data === data && ["T", "FE"].includes(d.status))).length;
    // Referência 6×1: ~5,1 pessoas por domingo; 5/6 dessa presença = 4.
    assert.ok(presentes >= 4, `${data}: ${presentes}`);
  }
  assert.equal(c.comparacao.erros, 0);
});

test("empresa fechada aos domingos não muda e o resumo informa o repouso dominical de todos", () => {
  const c = converter(empresa(4, { domingo: false }), op);
  const { depois } = c.comparacao.domingo;
  assert.equal(depois.operacional, false);
  assert.equal(depois.comFolga, depois.pessoas);
});

test("art. 8º ativado reparte o contrato sem o limite de 8h e mantém dois repousos", () => {
  const s = empresa(1, { domingo: false });
  s.analiseEnquadramentoAtiva = true;
  s.jornada = { entrada: "08:00", intInicio: "12:00", intFim: "13:00", saida: "18:00" };
  s.colaboradores[0].ec141 = { tipo: "art8", diplomaSuperior: true, tetoRgps: 8000, remuneracao: 20000,
    salarioAnterior: 20000, salarioAtual: 20000, pisoAnterior: 0, pisoAtual: 0 };
  const c = converter(s, op);
  const semana = c.proposta.config.escalaGerada.resultado[0].dias
    .filter((d) => d.data >= "2028-02-07" && d.data <= "2028-02-13");
  assert.equal(semana.filter((d) => d.status === "T").length, 5);
  assert.ok(semana.filter((d) => d.status === "T").every((d) => Math.abs(d.horas - 8.8) < 0.01));
  const tipos = c.proposta.config.escalaGerada.validacoes[0].issues.map((i) => i.tipo);
  assert.ok(!tipos.includes("JORNADA_DIARIA"));
  assert.ok(!tipos.includes("REPOUSO_SEMANAL"));
});

test("art. 8º sem a análise ativada continua na regra geral de 8h diárias", () => {
  const s = empresa(1, { domingo: false });
  s.jornada = { entrada: "08:00", intInicio: "12:00", intFim: "13:00", saida: "18:00" };
  s.colaboradores[0].ec141 = { tipo: "art8", diplomaSuperior: true, tetoRgps: 8000, remuneracao: 20000 };
  const c = converter(s, op);
  const trabalho = c.proposta.config.escalaGerada.resultado[0].dias.filter((d) => d.status === "T");
  assert.ok(trabalho.every((d) => d.horas <= 8 + 1e-9));
});

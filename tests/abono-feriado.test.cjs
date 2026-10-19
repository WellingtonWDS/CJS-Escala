const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let apurarSemana, createDomain, createDefaultState, createPersistence;
before(async () => {
  ({ apurarSemana } = await import("../assets/js/domain/resumo-semanal.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createPersistence } = await import("../assets/js/state/persistencia.js"));
});
function exemplo(
  feriados = { 12: { nome: "Nossa Senhora Aparecida", trabalhado: false } },
) {
  const config = {
    ...createDefaultState(new Date(2026, 9, 19)),
    tipoEscala: "5x2",
    diasTrabalho: [1, 2, 3, 4, 5],
  };
  const pessoa = {
    id: 1,
    nome: "Colaborador 1",
    cargo: "Atendente",
    horasSemana: 40,
  };
  const map = Object.fromEntries(
    Object.entries(feriados).map(([dia, f]) => [`2026-10-${dia}`, f]),
  );
  const domain = createDomain(config);
  const dias = domain.gerarEscalaColaborador(
    pessoa,
    0,
    new Date(2026, 9, 12),
    new Date(2026, 9, 18),
    map,
  );
  return {
    config,
    pessoa,
    domain,
    dias,
    apuracao: () => apurarSemana(pessoa, dias, config),
  };
}
test("feriado previsto fecha 40h com 32h trabalhadas e 8h abonadas", () => {
  const e = exemplo();
  const a = e.apuracao();
  assert.equal(a.trabalhadas, 32);
  assert.equal(a.abonadas, 8);
  assert.equal(a.computadas, 40);
  assert.equal(a.estado, "ok");
  assert.equal(a.abonos[0].nome, "Nossa Senhora Aparecida");
  assert.equal(e.domain.validarJornadaSemanal(e.pessoa, e.dias).length, 0);
  assert.equal(e.dias[0].horas, 0);
  assert.equal(e.dias[0].horasPrevistas, 8);
});
test("feriado em dia de folga não gera abono e não esconde outra falta", () => {
  const e = exemplo({ 17: { nome: "Feriado no sábado", trabalhado: false } });
  e.dias[1].status = "F";
  e.dias[1].horas = 0;
  assert.equal(e.apuracao().abonadas, 0);
  assert.equal(e.apuracao().estado, "abaixo");
  assert.ok(
    e.domain
      .validarJornadaSemanal(e.pessoa, e.dias)
      .some((i) => i.tipo === "JORNADA_CONTRATUAL"),
  );
});
test("abono de feriado não abona faltas em outros dias da mesma semana", () => {
  const e = exemplo();
  e.dias[1].status = "F";
  e.dias[1].horas = 0;
  assert.equal(e.apuracao().abonadas, 8);
  assert.equal(e.apuracao().computadas, 32);
  assert.equal(e.apuracao().estado, "abaixo");
  assert.ok(
    e.domain
      .validarJornadaSemanal(e.pessoa, e.dias)
      .some((i) => i.mensagem.includes("08:00 abaixo")),
  );
});
test("feriado efetivamente trabalhado não recebe crédito em duplicidade", () => {
  const e = exemplo({ 12: { nome: "Feriado trabalhado", trabalhado: true } });
  assert.equal(e.apuracao().abonadas, 0);
  assert.equal(e.apuracao().trabalhadas, 40);
  assert.equal(e.apuracao().estado, "ok");
  assert.equal(e.dias[0].status, "FE");
});
test("editar feriado dispensado para trabalho ou folga compensatória retira o abono", () => {
  const e = exemplo();
  e.dias[0].status = "T";
  e.dias[0].horas = 8;
  assert.equal(e.apuracao().abonadas, 0);
  assert.equal(e.apuracao().computadas, 40);
  e.dias[0].status = "FC";
  e.dias[0].horas = 0;
  assert.equal(e.apuracao().abonadas, 0);
  assert.equal(e.apuracao().estado, "abaixo");
});
test("dois feriados previstos abonam somente as respectivas cargas", () => {
  const e = exemplo({
    12: { nome: "Feriado 1", trabalhado: false },
    13: { nome: "Feriado 2", trabalhado: false },
  });
  assert.equal(e.apuracao().trabalhadas, 24);
  assert.equal(e.apuracao().abonadas, 16);
  assert.equal(e.apuracao().abonos.length, 2);
  assert.equal(e.apuracao().estado, "ok");
});
test("escala salva sem horas previstas usa a distribuição original da semana", () => {
  const e = exemplo();
  e.dias.forEach((d) => delete d.horasPrevistas);
  assert.equal(e.apuracao().abonadas, 8);
  assert.equal(e.apuracao().estado, "ok");
});
test("semana incompleta não recebe classificação de fechamento completo", () => {
  const e = exemplo();
  assert.equal(
    apurarSemana(e.pessoa, e.dias.slice(0, 3), e.config).estado,
    "parcial",
  );
});
test("abono não é presença operacional nem hora trabalhada para o limite semanal", () => {
  const e = exemplo();
  e.config.coberturaAtiva = true;
  e.config.diaInicio = 12;
  e.config.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "10:00",
      minimo: 1,
      diasSemana: [1],
      incluirFeriados: true,
    },
  ];
  assert.equal(
    e.domain
      .analisarCobertura([{ colaborador: e.pessoa, dias: e.dias }])
      .lacunas.find((f) => f.data === "2026-10-12").presentes,
    0,
  );
  e.dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 11));
  const issues = e.domain.validarJornadaSemanal(e.pessoa, e.dias);
  assert.ok(!issues.some((i) => i.tipo === "LIMITE_SEMANAL"));
  assert.ok(issues.some((i) => i.tipo === "JORNADA_CONTRATUAL"));
});
test("nomes genéricos substituem apenas registros originais de exemplo intactos", () => {
  const inicial = createDefaultState();
  assert.deepEqual(
    inicial.colaboradores.map((c) => c.nome),
    ["Colaborador 1", "Colaborador 2"],
  );
  const antigo = structuredClone(inicial);
  antigo.colaboradores[0].nome = "Carla Martin";
  antigo.colaboradores[1].nome = "Mateus Silva";
  antigo.colaboradores[1].cargo = "Supervisor";
  const state = {};
  const p = createPersistence({
    state,
    initialState: inicial,
    storage: { getItem: () => JSON.stringify(antigo) },
  });
  assert.equal(p.loadState(), true);
  assert.equal(state.colaboradores[0].nome, "Colaborador 1");
  assert.equal(state.colaboradores[1].nome, "Mateus Silva");
});
test("feriado em folga rotativa de dia operacional não gera crédito extra", () => {
  const e = exemplo({});
  e.config.diasTrabalho = [1, 2, 3, 4, 5, 6];
  const inicio = new Date(2026, 9, 12),
    fim = new Date(2026, 9, 18);
  const base = e.domain.gerarEscalaColaborador(e.pessoa, 0, inicio, fim, {});
  const folga = base.find(
    (d) => e.config.diasTrabalho.includes(d.weekday) && !d.previsto,
  );
  assert.ok(folga);
  const dias = e.domain.gerarEscalaColaborador(e.pessoa, 0, inicio, fim, {
    [folga.data]: { nome: "Feriado em folga", trabalhado: false },
  });
  const a = apurarSemana(e.pessoa, dias, e.config);
  assert.equal(a.abonadas, 0);
  assert.equal(a.estado, "ok");
  assert.equal(a.computadas, 40);
});

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState, createDomain, apurarSemana, distribuirCargaPrevista;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ apurarSemana } = await import("../assets/js/domain/resumo-semanal.js"));
  ({ distribuirCargaPrevista } = await import(
    "../assets/js/domain/distribuicao-horas.js"
  ));
});
function exemplo(
  horasSemana = 44,
  mudar = () => {},
  feriados = {},
  indice = 0,
) {
  const config = createDefaultState(new Date(2026, 9, 19));
  config.horarioPorDia = true;
  config.jornada.saida = "17:00";
  config.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "00:00",
    saida: "00:00",
  };
  mudar(config);
  const pessoa = { ...config.colaboradores[0], horasSemana };
  const domain = createDomain(config);
  const dias = domain.gerarEscalaColaborador(
    pessoa,
    indice,
    new Date(2026, 9, 26),
    new Date(2026, 10, 1),
    feriados,
  );
  return {
    config,
    pessoa,
    domain,
    dias,
    apuracao: apurarSemana(pessoa, dias, config),
  };
}
test("6x1 fecha 44h com 8h nos dias úteis e sábado somente das 8h às 12h", () => {
  const e = exemplo();
  assert.deepEqual(
    e.dias.map((d) => d.horas),
    [8, 8, 8, 8, 8, 4, 0],
  );
  const sabado = e.dias[5];
  assert.equal(sabado.entradaMin, 480);
  assert.equal(sabado.saidaMin, 720);
  assert.equal(sabado.intervaloMin, 0);
  assert.equal(e.apuracao.estado, "ok");
  assert.equal(e.domain.validarJornadaDiaria(e.pessoa, e.dias).length, 0);
});
test("turno único com saída explícita ao meio-dia também limita o sábado", () => {
  const e = exemplo(44, (c) =>
    Object.assign(c.jornadaPorDia[6], { intFim: "12:00", saida: "12:00" }),
  );
  assert.equal(e.dias[5].saidaMin, 720);
  assert.equal(e.apuracao.computadas, 44);
});
test("dias úteis com janela de 9h absorvem o restante sem estender sábado", () => {
  const e = exemplo(44, (c) => (c.jornada.saida = "18:00"));
  assert.deepEqual(
    e.dias.map((d) => d.horas),
    [8, 8, 8, 8, 8, 4, 0],
  );
});
test("carga maior que a capacidade fica abaixo do alvo sem ultrapassar janelas", () => {
  const e = exemplo(60, (c) => (c.jornada.saida = "18:00"));
  assert.deepEqual(
    e.dias.map((d) => d.horas),
    [9, 9, 9, 9, 9, 4, 0],
  );
  assert.equal(e.apuracao.estado, "abaixo");
  assert.ok(
    e.domain
      .validarJornadaSemanal(e.pessoa, e.dias)
      .some((i) => i.tipo === "JORNADA_CONTRATUAL"),
  );
  assert.equal(e.dias[5].saidaMin, 720);
});
test("carga menor fecha no minuto sem exceder os limites", () => {
  const e = exemplo(40.05);
  assert.equal(Math.round(e.apuracao.computadas * 60), 2403);
  assert.ok(e.dias[5].saidaMin <= 720);
  assert.ok(e.dias.slice(0, 5).every((d) => d.saidaMin <= 1020));
  assert.equal(e.apuracao.estado, "ok");
});
test("feriado de sábado abona apenas 4h, sem redistribuí-las para os dias úteis", () => {
  const e = exemplo(44, () => {}, {
    "2026-10-31": { nome: "Feriado local", trabalhado: false },
  });
  assert.equal(e.apuracao.trabalhadas, 40);
  assert.equal(e.apuracao.abonadas, 4);
  assert.equal(e.apuracao.estado, "ok");
  e.dias.forEach((d) => delete d.horasPrevistas);
  assert.equal(apurarSemana(e.pessoa, e.dias, e.config).abonadas, 4);
});
test("feriado de dia útil mantém abono de 8h e sábado reduzido", () => {
  const e = exemplo(44, () => {}, {
    "2026-10-26": { nome: "Feriado local", trabalhado: false },
  });
  assert.equal(e.apuracao.trabalhadas, 36);
  assert.equal(e.apuracao.abonadas, 8);
  assert.equal(e.dias[5].saidaMin, 720);
});
test("turno B mantém a duração de 4h do sábado a partir da entrada do turno", () => {
  const e = exemplo(44, (c) => (c.turnosRevezamento = true), {}, 1);
  assert.equal(e.dias[5].turno, "B");
  assert.equal(e.dias[5].entradaMin, 840);
  assert.equal(e.dias[5].saidaMin, 1080);
});
test("ajuste manual que excede a janela recebe erro específico", () => {
  const e = exemplo();
  e.dias[5].horas = 8;
  assert.ok(
    e.domain
      .validarJornadaDiaria(e.pessoa, e.dias)
      .some(
        (i) => i.tipo === "HORARIO_DIA_EXCEDIDO" && i.data === "2026-10-31",
      ),
  );
});
test("horário padrão em dois blocos mantém distribuição individual anterior", () => {
  const e = exemplo(44, (c) => (c.horarioPorDia = false));
  assert.ok(
    e.dias
      .filter((d) => d.previsto)
      .every((d) => Math.abs(d.horas - 44 / 6) < 0.001),
  );
});
test("turno único padrão também respeita o limite de 4h", () => {
  const e = exemplo(44, (c) => {
    c.horarioPorDia = false;
    c.jornada = { ...c.jornadaPorDia[6] };
  });
  assert.ok(e.dias.filter((d) => d.previsto).every((d) => d.saidaMin === 720));
  assert.equal(e.apuracao.estado, "abaixo");
});
test("sem dias previstos a distribuição é vazia", () => {
  assert.equal(distribuirCargaPrevista({ horasSemana: 44 }, [], {}).size, 0);
});

test("persistência restaura horários por dia e regenera sábado até meio-dia", async () => {
  const { createPersistence } = await import(
    "../assets/js/state/persistencia.js"
  );
  const e = exemplo();
  const state = {};
  const persistence = createPersistence({
    state,
    initialState: createDefaultState(new Date(2026, 9, 19)),
    storage: { getItem: () => JSON.stringify(e.config) },
  });
  assert.equal(persistence.loadState(), true);
  assert.deepEqual(state.jornadaPorDia[6], e.config.jornadaPorDia[6]);
  const dias = createDomain(state).gerarEscalaColaborador(
    e.pessoa,
    0,
    new Date(2026, 9, 26),
    new Date(2026, 10, 1),
    {},
  );
  assert.equal(dias[5].saidaMin, 720);
});

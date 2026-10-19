const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState, createDomain, createPersistence;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ createPersistence } = await import("../assets/js/state/persistencia.js"));
});
function exemplo(operacionais = [1, 2, 3, 4, 5, 6]) {
  const state = createDefaultState(new Date(2026, 9, 19));
  Object.assign(state, {
    tipoEscala: "5x2",
    folgasFimSemana: true,
    diasTrabalho: operacionais,
  });
  const domain = createDomain(state);
  const gerar = (feriados = {}, idx = 0) =>
    domain.gerarEscalaColaborador(
      state.colaboradores[idx],
      idx,
      new Date(2026, 9, 5),
      new Date(2026, 10, 1),
      feriados,
    );
  return { state, domain, gerar };
}
test("modelo de fim de semana fixa sábado e domingo para todos sem alterar dias operacionais", () => {
  for (const operacionais of [
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
  ]) {
    const e = exemplo(operacionais);
    for (let idx = 0; idx < 2; idx++) {
      const dias = e.gerar({}, idx);
      assert.ok(
        dias.every(
          (d) => d.status === ([0, 6].includes(d.weekday) ? "F" : "T"),
        ),
      );
      for (let i = 0; i < dias.length; i += 7)
        assert.equal(
          dias.slice(i, i + 7).filter((d) => d.status === "F").length,
          2,
        );
      assert.deepEqual(e.state.diasTrabalho, operacionais);
    }
  }
});
test("feriado durante a semana preserva sábado e domingo fixos e explica folgas adicionais", () => {
  const e = exemplo([0, 1, 2, 3, 4, 5, 6]);
  const dias = e.gerar({
    "2026-10-12": { nome: "Feriado", trabalhado: false },
  });
  assert.deepEqual(
    dias
      .filter(
        (d) =>
          d.data >= "2026-10-12" && d.data <= "2026-10-18" && d.status === "F",
      )
      .map((d) => d.data),
    ["2026-10-12", "2026-10-17", "2026-10-18"],
  );
  assert.ok(
    e.domain
      .validarRepousoSemanal(e.state.colaboradores[0], dias)
      .some((i) => i.tipo === "FOLGAS_OBRIGATORIAS"),
  );
  assert.equal(
    dias.find((d) => d.data === "2026-10-12").horasPrevistas,
    44 / 5,
  );
});
test("feriado marcado como trabalhado não cancela sábado fixo", () => {
  const e = exemplo();
  const dias = e.gerar({ "2026-10-17": { nome: "Feriado", trabalhado: true } });
  assert.equal(dias.find((d) => d.data === "2026-10-17").status, "F");
  assert.equal(dias.find((d) => d.data === "2026-10-17").horasPrevistas, 0);
});
test("modelo de fim de semana não afeta 6x1 nem ciclo 12x36", () => {
  const e = exemplo();
  for (const tipo of ["6x1", "12x36"]) {
    e.state.tipoEscala = tipo;
    e.state.folgasFimSemana = true;
    const comModelo = e.gerar();
    e.state.folgasFimSemana = false;
    assert.deepEqual(comModelo, e.gerar());
  }
});
test("restaura modelo de fim de semana preservando configuração personalizada anterior", () => {
  const e = exemplo();
  const state = {};
  const persistence = createPersistence({
    state,
    initialState: createDefaultState(),
    storage: { getItem: () => JSON.stringify(e.state) },
  });
  assert.equal(persistence.loadState(), true);
  assert.equal(state.folgasFimSemana, true);
  assert.equal(state.folgaTipo, "rotativa");
  assert.deepEqual(state.folgaDiasPermitidos, e.state.folgaDiasPermitidos);
});
test("acordo individual salvo migra para nenhuma compensação e invalida a escala antiga", () => {
  const anterior = createDefaultState();
  anterior.instrumentoCompensacao = "individual";
  anterior.escalaGerada = { resultado: [], validacoes: [] };
  let raw = JSON.stringify(anterior);
  const state = {};
  const persistence = createPersistence({
    state,
    initialState: createDefaultState(),
    storage: { getItem: () => raw, setItem: (key, value) => (raw = value) },
  });
  assert.equal(persistence.loadState(), true);
  assert.equal(state.instrumentoCompensacao, "nenhuma");
  assert.equal(state.escalaGerada, null);
  assert.equal(JSON.parse(raw).instrumentoCompensacao, "nenhuma");
});
test("acordo individual não reduz mais a gravidade do excesso semanal", () => {
  const e = exemplo();
  e.state.instrumentoCompensacao = "individual";
  const dias = e.gerar().slice(0, 7);
  dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 10));
  assert.equal(
    e.domain
      .validarJornadaSemanal(e.state.colaboradores[0], dias)
      .find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
    "erro",
  );
});

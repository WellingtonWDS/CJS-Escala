const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState, createDomain;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
});
function exemplo(
  permitidos = [0, 1, 2, 3, 4],
  operacionais = [0, 1, 2, 3, 4, 5, 6],
  tipo = "rotativa",
) {
  const state = createDefaultState(new Date(2026, 8, 1));
  Object.assign(state, {
    tipoEscala: "5x2",
    diasTrabalho: operacionais,
    folgaDiasPermitidos: permitidos,
    folgaTipo: tipo,
  });
  const domain = createDomain(state);
  const gerar = (inicio, fim, idx = 0, feriados = {}) =>
    domain.gerarEscalaColaborador(
      state.colaboradores[idx],
      idx,
      inicio,
      fim,
      feriados,
    );
  return { state, domain, gerar };
}
function conferir(dias) {
  let seguidos = 0;
  for (const d of dias) {
    seguidos = d.previsto ? seguidos + 1 : 0;
    assert.ok(seguidos <= 6, `sequência acima de seis em ${d.data}`);
    assert.equal(d.repousoSeguranca, false, `folga extra em ${d.data}`);
  }
  for (let i = 0; i < dias.length; i += 7) {
    const semana = dias.slice(i, i + 7);
    assert.equal(semana.length, 7);
    assert.equal(semana.filter((d) => d.previsto).length, 5, semana[0].data);
    assert.equal(semana.filter((d) => !d.previsto).length, 2, semana[0].data);
  }
}
test("5x2 antecipa folga na virada da semana em vez de criar terceiro repouso", () => {
  const e = exemplo();
  const dias = e.gerar(new Date(2026, 8, 7), new Date(2026, 8, 13));
  conferir(dias);
  assert.deepEqual(
    dias.filter((d) => d.status === "F").map((d) => d.data),
    ["2026-09-08", "2026-09-10"],
  );
  assert.ok(
    !e.domain
      .validarRepousoSemanal(e.state.colaboradores[0], dias)
      .some((i) => ["DIAS_CONSECUTIVOS", "REPOUSO_AJUSTADO"].includes(i.tipo)),
  );
});
test("5x2 mantém dois repousos e no máximo seis dias consecutivos em todas as combinações viáveis", () => {
  for (let mask = 1; mask < 128; mask++) {
    const permitidos = Array.from({ length: 7 }, (_, i) => i).filter(
      (i) => mask & (1 << i),
    );
    if (permitidos.length < 2) continue;
    const e = exemplo(permitidos);
    for (let idx = 0; idx < 2; idx++) {
      const dias = e.gerar(new Date(2026, 0, 5), new Date(2027, 0, 3), idx);
      conferir(dias);
      assert.ok(
        dias
          .filter((d) => !d.previsto)
          .every((d) => permitidos.includes(d.weekday)),
      );
    }
  }
});
test("5x2 conta domingo fechado como uma das duas folgas", () => {
  const e = exemplo([0, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]);
  const dias = e.gerar(new Date(2026, 8, 7), new Date(2026, 10, 1));
  conferir(dias);
  assert.ok(dias.filter((d) => d.weekday === 0).every((d) => !d.previsto));
});
test("5x2 com cinco dias operacionais não acrescenta folgas nos dias úteis", () => {
  const e = exemplo([0, 6], [1, 2, 3, 4, 5]);
  conferir(e.gerar(new Date(2026, 8, 7), new Date(2026, 10, 1)));
});
test("5x2 fixo preserva as duas folgas selecionadas", () => {
  const e = exemplo([0, 3], [0, 1, 2, 3, 4, 5, 6], "fixa");
  const dias = e.gerar(new Date(2026, 8, 7), new Date(2026, 10, 1));
  conferir(dias);
  assert.ok(
    dias.filter((d) => !d.previsto).every((d) => [0, 3].includes(d.weekday)),
  );
});
test("5x2 é estável entre períodos sobrepostos, inclusive na virada do ano", () => {
  const e = exemplo();
  for (let idx = 0; idx < 2; idx++) {
    const longo = e.gerar(new Date(2026, 10, 30), new Date(2027, 0, 31), idx);
    const curto = e.gerar(new Date(2026, 11, 28), new Date(2027, 0, 31), idx);
    assert.deepEqual(
      curto,
      longo.filter((d) => d.data >= "2026-12-28"),
    );
    conferir(curto);
  }
});
test("feriado dispensado soma dia sem expediente sem virar terceira folga planejada", () => {
  const e = exemplo();
  const inicio = new Date(2026, 8, 7),
    fim = new Date(2026, 8, 13);
  const base = e.gerar(inicio, fim);
  const trabalho = base.find((d) => d.previsto);
  const dias = e.gerar(inicio, fim, 0, {
    [trabalho.data]: { nome: "Feriado de teste", trabalhado: false },
  });
  conferir(dias);
  assert.equal(dias.filter((d) => d.status === "F").length, 3);
  assert.ok(dias.find((d) => d.data === trabalho.data).horasPrevistas > 0);
});

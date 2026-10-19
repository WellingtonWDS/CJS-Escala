const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState, createDomain, apurarSemana;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ apurarSemana } = await import("../assets/js/domain/resumo-semanal.js"));
});
function exemplo(mudar = () => {}) {
  const state = createDefaultState(new Date(2026, 9, 19));
  state.tipoEscala = "5x2";
  state.horarioPorDia = true;
  state.jornada = {
    entrada: "08:00",
    intInicio: "11:00",
    intFim: "13:00",
    saida: "18:00",
  };
  state.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "00:00",
    saida: "00:00",
  };
  mudar(state);
  const domain = createDomain(state);
  const gerar = (
    feriados = {},
    idx = 0,
    inicio = new Date(2026, 9, 12),
    fim = new Date(2026, 9, 18),
  ) =>
    domain.gerarEscalaColaborador(
      state.colaboradores[idx],
      idx,
      inicio,
      fim,
      feriados,
    );
  return { state, domain, gerar };
}
const feriado = { nome: "Nossa Senhora Aparecida", trabalhado: false };
const folgas = (dias) => dias.filter((d) => d.status === "F");
test("cenário da imagem: feriado de 12/10 e domingo são as duas folgas, sem quarta/quinta extra", () => {
  const e = exemplo();
  for (let idx = 0; idx < 2; idx++) {
    const dias = e.gerar({ "2026-10-12": feriado }, idx);
    assert.deepEqual(
      folgas(dias).map((d) => d.data),
      ["2026-10-12", "2026-10-18"],
    );
    assert.equal(dias.filter((d) => d.status === "T").length, 5);
    assert.equal(dias[5].saidaMin, 720);
    const a = apurarSemana(e.state.colaboradores[idx], dias, e.state);
    assert.equal(a.trabalhadas, 36);
    assert.equal(a.abonadas, 8);
    assert.equal(a.computadas, 44);
    assert.equal(a.estado, "ok");
  }
});
test("sem feriado continuam duas folgas e déficit real quando horários só comportam 36h", () => {
  const e = exemplo();
  const dias = e.gerar();
  assert.equal(folgas(dias).length, 2);
  assert.equal(
    apurarSemana(e.state.colaboradores[0], dias, e.state).estado,
    "abaixo",
  );
});
test("feriado trabalhado não ocupa folga e só trabalha quem estiver previsto", () => {
  const e = exemplo();
  const dias = e.gerar({ "2026-10-12": { ...feriado, trabalhado: true } });
  assert.equal(dias[0].status, "FE");
  assert.equal(folgas(dias).length, 2);
  assert.equal(
    apurarSemana(e.state.colaboradores[0], dias, e.state).abonadas,
    0,
  );
  const descanso = dias.find((d) => d.status === "F" && d.weekday !== 0);
  const emFolga = e.gerar({
    [descanso.data]: { ...feriado, trabalhado: true },
  });
  assert.equal(emFolga.find((d) => d.data === descanso.data).status, "F");
});
test("feriado que coincide com folga rotativa ou domingo não gera folga nem abono em dobro", () => {
  const e = exemplo();
  const base = e.gerar();
  for (const dia of folgas(base)) {
    const dias = e.gerar({ [dia.data]: feriado });
    assert.deepEqual(
      folgas(dias).map((d) => d.data),
      folgas(base).map((d) => d.data),
    );
    assert.equal(
      apurarSemana(e.state.colaboradores[0], dias, e.state).abonadas,
      0,
    );
  }
});
test("dois feriados em semana de operação diária ocupam as duas folgas", () => {
  const e = exemplo((s) => {
    s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
    s.folgaDiasPermitidos = [0, 1, 2, 3, 4, 5, 6];
  });
  const dias = e.gerar({ "2026-10-12": feriado, "2026-10-15": feriado });
  assert.deepEqual(
    folgas(dias).map((d) => d.data),
    ["2026-10-12", "2026-10-15"],
  );
  assert.equal(dias.filter((d) => d.status === "T").length, 5);
});
test("feriado conta também em escala com folgas fixas", () => {
  const e = exemplo((s) => {
    s.folgaTipo = "fixa";
    s.folgaDiasPermitidos = [3];
  });
  assert.deepEqual(
    folgas(e.gerar({ "2026-10-12": feriado })).map((d) => d.data),
    ["2026-10-12", "2026-10-18"],
  );
});
test("6x1 com operação diária usa o feriado como única folga", () => {
  const e = exemplo((s) => {
    s.tipoEscala = "6x1";
    s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
  });
  const dias = e.gerar({ "2026-10-12": feriado });
  assert.deepEqual(
    folgas(dias).map((d) => d.data),
    ["2026-10-12"],
  );
  assert.equal(dias.filter((d) => d.status === "T").length, 6);
});
test("12x36 mantém ciclo sem trocar folga por feriado", () => {
  const e = exemplo((s) => (s.tipoEscala = "12x36"));
  const base = e.gerar();
  const dia = base.find((d) => d.status === "T");
  const dias = e.gerar({ [dia.data]: feriado });
  assert.ok(
    dias
      .filter((d) => d.data !== dia.data)
      .every((d) => d.status === base.find((b) => b.data === d.data).status),
  );
});
test("dias fechados e feriados obrigatórios acima do alvo são preservados", () => {
  const e = exemplo((s) => (s.diasTrabalho = [1, 2, 3, 4, 5]));
  const dias = e.gerar({ "2026-10-12": feriado });
  assert.equal(folgas(dias).length, 3);
  assert.ok(
    e.domain
      .validarRepousoSemanal(e.state.colaboradores[0], dias)
      .some((i) => i.tipo === "FOLGAS_OBRIGATORIAS"),
  );
  assert.ok(
    dias
      .filter((d) => [0, 6].includes(d.weekday))
      .every((d) => d.status === "F"),
  );
});
test("feriados na virada de mês/ano geram a mesma escala em períodos sobrepostos", () => {
  const e = exemplo((s) => {
    s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
    s.folgaDiasPermitidos = [0, 1, 2, 3, 4, 5, 6];
  });
  const mapa = { "2026-12-25": feriado, "2027-01-01": feriado };
  const longo = e.gerar(mapa, 0, new Date(2026, 11, 14), new Date(2027, 0, 10));
  const curto = e.gerar(mapa, 0, new Date(2026, 11, 28), new Date(2027, 0, 10));
  assert.deepEqual(
    curto,
    longo.filter((d) => d.data >= "2026-12-28"),
  );
});

test("abono mantém as 8h originalmente previstas em contrato de 40h, sem duplicar a carga ao liberar outra folga", () => {
  const e = exemplo((s) => {
    s.horarioPorDia = false;
    s.colaboradores[0].horasSemana = 40;
  });
  const dias = e.gerar({ "2026-10-12": feriado });
  const a = apurarSemana(e.state.colaboradores[0], dias, e.state);
  assert.equal(folgas(dias).length, 2);
  assert.equal(a.abonadas, 8);
  assert.equal(a.trabalhadas, 32);
  assert.equal(a.computadas, 40);
  assert.equal(a.estado, "ok");
  dias.forEach((d) => delete d.horasPrevistas);
  assert.equal(
    apurarSemana(e.state.colaboradores[0], dias, e.state).abonadas,
    8,
  );
});

test("feriado em qualquer dia mantém duas folgas e descanso na passagem entre semanas com operação diária", () => {
  const e = exemplo((s) => {
    s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
    s.folgaDiasPermitidos = [0, 1, 2, 3, 4, 5, 6];
  });
  for (let dia = 12; dia <= 18; dia++)
    for (let idx = 0; idx < 2; idx++) {
      const dias = e.gerar(
        { [`2026-10-${dia}`]: feriado },
        idx,
        new Date(2026, 9, 5),
        new Date(2026, 10, 1),
      );
      let seguidos = 0;
      for (const d of dias) {
        seguidos = ["T", "FE"].includes(d.status) ? seguidos + 1 : 0;
        assert.ok(seguidos <= 6, d.data);
        assert.equal(d.repousoSeguranca, false, d.data);
      }
      for (let i = 0; i < dias.length; i += 7)
        assert.equal(folgas(dias.slice(i, i + 7)).length, 2, dias[i].data);
    }
});

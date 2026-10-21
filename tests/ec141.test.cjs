const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState,
  createDomain,
  regimeNaData,
  referenciaDia,
  referenciaSemana,
  instrumentoValido,
  apurarSemana,
  validarRepousoMensal,
  gerarCsv,
  createPersistence,
  VERSAO_REGRAS;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({
    regimeNaData,
    referenciaDia,
    referenciaSemana,
    instrumentoValido,
    VERSAO_REGRAS,
  } = await import("../assets/js/domain/ec141.js"));
  ({ apurarSemana } = await import("../assets/js/domain/resumo-semanal.js"));
  ({ validarRepousoMensal } = await import(
    "../assets/js/domain/enquadramento-ec141.js"
  ));
  ({ gerarCsv } = await import("../assets/js/export/csv.js"));
  ({ createPersistence } = await import("../assets/js/state/persistencia.js"));
});
function exemplo(data = "2028-02-07") {
  const date = new Date(data + "T00:00:00");
  const state = createDefaultState(date);
  // Exercita também a análise avançada preservada, desativada no produto padrão.
  state.analiseEnquadramentoAtiva = true;
  state.colaboradores = [
    {
      id: 1,
      nome: "Pessoa",
      sexo: "masculino",
      cargo: "Atendente",
      horasSemana: 44,
    },
  ];
  const domain = createDomain(state);
  const gerar = (inicio = data, fim = null, feriados = {}) => {
    const d = new Date(inicio + "T00:00:00");
    const f = fim
      ? new Date(fim + "T00:00:00")
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    return domain.gerarEscalaColaborador(
      state.colaboradores[0],
      0,
      d,
      f,
      feriados,
    );
  };
  return { state, domain, gerar, c: state.colaboradores[0] };
}
function act(state, extra = {}) {
  state.instrumentoCompensacao = "act_cct";
  Object.assign(state.instrumentoColetivo, {
    identificacao: "ACT de teste",
    inicio: "2026-01-01",
    fim: "2029-12-31",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 10,
    ...extra,
  });
}
test("vigências: publicação, vésperas e dias 16 nas duas fases", () => {
  for (const [data, horas, folgas] of [
    ["2026-10-16", 44, 1],
    ["2026-12-15", 44, 1],
    ["2026-12-16", 42, 2],
    ["2027-12-15", 42, 2],
    ["2027-12-16", 40, 2],
    ["2028-02-07", 40, 2],
  ]) {
    assert.equal(regimeNaData(data).horas, horas, data);
    assert.equal(regimeNaData(data).folgas, folgas, data);
  }
});
test("sonda A: automático em 2028 programa 40h e dois repousos, preserva contrato 44h", () => {
  const e = exemplo();
  const dias = e.gerar();
  assert.equal(
    dias.reduce((s, d) => s + d.horas, 0),
    40,
  );
  assert.equal(dias.filter((d) => d.status === "F").length, 2);
  assert.equal(e.c.horasSemana, 44);
  assert.equal(apurarSemana(e.c, dias, e.state).alvo, 40);
  const issues = e.domain.validarLegal(e.c, dias);
  assert.ok(
    issues.some(
      (i) => i.tipo === "PROTECAO_SALARIAL" && i.severidade === "pendencia",
    ),
  );
  assert.ok(!issues.some((i) => i.tipo === "REPOUSO_SEMANAL"));
});
test("sonda B: ACT/CCT e banco não atenuam excesso semanal inserido manualmente", () => {
  for (const instrumento of ["nenhuma", "act_cct", "banco"]) {
    const e = exemplo();
    act(e.state);
    e.state.instrumentoCompensacao = instrumento;
    const dias = e.gerar();
    dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 8.8));
    assert.equal(
      e.domain
        .validarJornadaSemanal(e.c, dias)
        .find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
      "erro",
    );
  }
});
test("sonda C: 42h em 5 dias sem ACT gera erro diário; cláusula válida respeita limite declarado", () => {
  const e = exemplo("2027-02-01");
  e.state.tipoEscala = "5x2";
  e.c.horasSemana = 42;
  const dias = e.gerar();
  assert.equal(
    e.domain
      .validarJornadaDiaria(e.c, dias)
      .filter((i) => i.tipo === "JORNADA_DIARIA" && i.severidade === "erro")
      .length,
    5,
  );
  act(e.state);
  assert.ok(
    !e.domain
      .validarJornadaDiaria(e.c, dias)
      .some((i) => i.tipo === "JORNADA_DIARIA"),
  );
  e.state.instrumentoColetivo.limiteDiario = 8;
  assert.equal(
    e.domain
      .validarJornadaDiaria(e.c, dias)
      .filter((i) => i.tipo === "JORNADA_DIARIA").length,
    5,
  );
  e.state.instrumentoColetivo.limiteDiario = 10;
  e.state.instrumentoColetivo.fim = "2027-01-31";
  assert.ok(
    e.domain
      .validarLegal(e.c, dias)
      .some(
        (i) =>
          i.tipo === "INSTRUMENTO_FORA_VIGENCIA" && i.severidade === "erro",
      ),
  );
});
test("cláusula incompatível e datas impossíveis não autorizam distribuição após primeira fase", () => {
  const e = exemplo();
  act(e.state, { compativelEC141: false });
  assert.equal(
    instrumentoValido(e.state, "2028-02-07", "compensacaoDiaria"),
    false,
  );
  assert.ok(
    e.domain
      .validarLegal(e.c, e.gerar())
      .some((i) => i.tipo === "CLAUSULA_INCOMPATIVEL"),
  );
  e.state.instrumentoColetivo.inicio = "2028-02-31";
  e.state.instrumentoColetivo.compativelEC141 = true;
  assert.equal(
    instrumentoValido(e.state, "2028-03-01", "compensacaoDiaria"),
    false,
  );
});
test("sonda D: 12x36 não é dispensado da referência semanal nem aprovado sem enquadramento", () => {
  const e = exemplo();
  e.state.tipoEscala = "12x36";
  e.state.ancora12x36 = "2028-02-07";
  const dias = e.gerar();
  assert.equal(
    dias.reduce((s, d) => s + d.horas, 0),
    44,
  );
  let issues = e.domain.validarLegal(e.c, dias);
  assert.equal(
    issues.find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
    "erro",
  );
  assert.ok(
    issues.some(
      (i) => i.tipo === "REGIME_ESPECIAL" && i.severidade === "pendencia",
    ),
  );
  act(e.state, { regime12x36: true });
  issues = e.domain.validarLegal(e.c, dias);
  assert.equal(
    issues.find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
    "pendencia",
  );
});
test("sonda E: contratos de 20h,30h e40h não sofrem redução proporcional", () => {
  for (const horas of [20, 30, 40]) {
    const e = exemplo();
    e.state.tipoEscala = "5x2";
    e.c.horasSemana = horas;
    assert.equal(
      e.gerar().reduce((s, d) => s + d.horas, 0),
      horas,
    );
  }
});
test("sondas F/G: dezembro não aplica segundo repouso antes da vigência e exige após", () => {
  const e = exemplo("2026-12-07");
  assert.equal(e.gerar().filter((d) => d.status === "F").length, 1);
  const posteriores = e.gerar("2026-12-21");
  assert.equal(posteriores.filter((d) => d.status === "F").length, 2);
  assert.equal(
    posteriores.reduce((s, d) => s + d.horas, 0),
    42,
  );
});
test("semanas cruzando 16/12 nas duas fases usam programação conservadora e pendência explícita", () => {
  for (const [inicio, alvo] of [
    ["2026-12-14", 42],
    ["2027-12-13", 40],
  ]) {
    const e = exemplo(inicio);
    const dias = e.gerar();
    assert.equal(referenciaSemana(e.state, dias, e.c).alvo, alvo);
    assert.equal(dias.filter((d) => d.status === "F").length, 2);
    assert.ok(
      e.domain
        .validarJornadaSemanal(e.c, dias)
        .some(
          (i) => i.tipo === "SEMANA_TRANSICAO" && i.severidade === "pendencia",
        ),
    );
    assert.notEqual(
      referenciaDia(e.state, dias[0].data).chave,
      referenciaDia(e.state, dias.at(-1).data).chave,
    );
  }
});
test("simulação é explícita e não recebe aprovação automática da vigência real", () => {
  const e = exemplo();
  e.state.modoRegime = "simulacao";
  e.state.regimeJornada = "atual44";
  const dias = e.gerar();
  assert.equal(
    dias.reduce((s, d) => s + d.horas, 0),
    44,
  );
  assert.ok(
    e.domain
      .validarLegal(e.c, dias)
      .some((i) => i.tipo === "SIMULACAO" && i.severidade === "pendencia"),
  );
});
test("sonda H: repouso da primeira jornada usa contexto sem duplicar ocorrências antigas", () => {
  const e = exemplo();
  e.state.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
  e.state.folgaDiasPermitidos = [2];
  e.state.turnosRevezamento = true;
  // Caso original da auditoria mantido como simulação de 44h para reproduzir os horários.
  e.state.modoRegime = "simulacao";
  e.state.regimeJornada = "atual44";
  const r = e.domain.gerarDadosEscala().resultado[0];
  const issues = e.domain.validarLegal(
    e.c,
    r.dias,
    r.diasContexto,
    r.diasApuracao,
  );
  assert.ok(
    issues.some((i) => i.tipo === "INTERJORNADA" && i.data === r.dias[0].data),
  );
  assert.ok(!issues.some((i) => i.data && i.data < r.dias[0].data));
  const dias = e.gerar();
  dias.slice(0, 6).forEach((d) => {
    d.status = "T";
    d.horas = 7;
  });
  const anterior = { ...dias[0], data: "2028-02-06", status: "T", horas: 7 };
  assert.ok(
    e.domain
      .validarLegal(e.c, dias, [anterior])
      .some((i) => i.tipo === "DIAS_CONSECUTIVOS"),
  );
});
test("art8: limite de remuneração, diploma e exclusão de empregado público, mantendo repousos", () => {
  const e = exemplo();
  e.c.ec141 = {
    tipo: "art8",
    diplomaSuperior: true,
    remuneracao: 25000,
    tetoRgps: 10000,
  };
  assert.equal(
    referenciaDia(e.state, "2028-02-07", e.c).semLimiteJornada,
    true,
  );
  assert.equal(e.gerar().filter((d) => d.status === "F").length, 2);
  e.c.ec141.remuneracao = 24999;
  assert.equal(
    referenciaDia(e.state, "2028-02-07", e.c).semLimiteJornada,
    false,
  );
  assert.ok(
    e.domain
      .validarLegal(e.c, e.gerar())
      .some((i) => i.tipo === "ART8_REQUISITOS"),
  );
  e.c.ec141.remuneracao = 25000;
  e.c.ec141.empregadoPublico = true;
  assert.equal(
    referenciaDia(e.state, "2028-02-07", e.c).semLimiteJornada,
    false,
  );
  e.c.ec141.empregadoPublico = false;
  e.c.ec141.jornadaMantida = true;
  assert.equal(
    referenciaDia(e.state, "2028-02-07", e.c).semLimiteJornada,
    false,
  );
});
test("art9: aditamento tardio, antecipado e prazo máximo não adiam segundo repouso", () => {
  const e = exemplo("2027-02-01");
  e.c.ec141 = {
    tipo: "contrato_publico",
    contratoVigente: true,
    maoDeObraDireta: true,
    dataAditamento: "2027-06-01",
  };
  assert.equal(referenciaDia(e.state, "2027-05-31", e.c).horas, 44);
  assert.equal(referenciaDia(e.state, "2027-06-01", e.c).horas, 42);
  assert.equal(referenciaDia(e.state, "2027-02-01", e.c).folgas, 2);
  e.c.ec141.dataAditamento = "";
  assert.equal(referenciaDia(e.state, "2027-10-15", e.c).horas, 44);
  assert.equal(referenciaDia(e.state, "2027-10-16", e.c).horas, 42);
  e.c.ec141.dataAditamento = "2026-11-01";
  assert.equal(referenciaDia(e.state, "2026-12-15", e.c).horas, 44);
  assert.equal(referenciaDia(e.state, "2026-12-16", e.c).horas, 42);
  e.c.ec141.dataAditamento = "2028-01-01";
  assert.equal(referenciaDia(e.state, "2027-10-16", e.c).horas, 42);
  assert.ok(
    e.domain
      .validarLegal(e.c, e.gerar())
      .some((i) => i.tipo === "ART9_ADITAMENTO"),
  );
  e.c.ec141.contratoVigente = false;
  assert.equal(referenciaDia(e.state, "2027-02-01", e.c).horas, 42);
});
test("irredutibilidade: salário e piso menores são erros e campos ausentes são pendências", () => {
  const e = exemplo();
  e.c.ec141 = {
    salarioAnterior: 3000,
    salarioAtual: 2900,
    pisoAnterior: 2000,
    pisoAtual: 1900,
  };
  const issues = e.domain.validarLegal(e.c, e.gerar());
  assert.equal(
    issues.find((i) => i.tipo === "REDUCAO_SALARIAL").severidade,
    "erro",
  );
  assert.equal(
    issues.find((i) => i.tipo === "REDUCAO_PISO").severidade,
    "erro",
  );
  e.c.ec141 = {
    salarioAnterior: 3000,
    salarioAtual: 3000,
    pisoAnterior: 0,
    pisoAtual: 0,
  };
  assert.ok(
    !e.domain
      .validarLegal(e.c, e.gerar())
      .some((i) =>
        [
          "PROTECAO_SALARIAL",
          "PROTECAO_PISO",
          "REDUCAO_SALARIAL",
          "REDUCAO_PISO",
        ].includes(i.tipo),
      ),
  );
});
test("cadastro padrão não exige salário/piso e ignora enquadramentos antigos ocultos", () => {
  const e = exemplo();
  e.state.analiseEnquadramentoAtiva = false;
  assert.equal(createDefaultState().analiseEnquadramentoAtiva, false);
  const tipos = [
    "PROTECAO_SALARIAL",
    "PROTECAO_PISO",
    "REDUCAO_SALARIAL",
    "REDUCAO_PISO",
    "ART8_ENQUADRAMENTO",
    "ART8_REQUISITOS",
    "ART9_ENQUADRAMENTO",
    "ART9_REQUISITOS",
  ];
  for (const ec141 of [
    undefined,
    {
      tipo: "art8",
      diplomaSuperior: true,
      remuneracao: 25000,
      tetoRgps: 10000,
      salarioAnterior: 3000,
      salarioAtual: 2000,
    },
    {
      tipo: "contrato_publico",
      contratoVigente: true,
      maoDeObraDireta: true,
      dataAditamento: "2027-06-01",
    },
  ]) {
    e.c.ec141 = ec141;
    const anterior = structuredClone(e.c);
    const dias = e.gerar();
    assert.ok(
      !e.domain.validarLegal(e.c, dias).some((i) => tipos.includes(i.tipo)),
    );
    assert.equal(
      referenciaDia(e.state, "2028-02-07", e.c).semLimiteJornada,
      false,
    );
    assert.equal(referenciaDia(e.state, "2027-02-01", e.c).horas, 42);
    assert.equal(
      dias.reduce((sum, d) => sum + d.horas, 0),
      40,
    );
    assert.deepEqual(e.c, anterior);
  }
});
test("compensação mensal: média em meses de28,29,30,31 dias e repouso emsete dias são independentes", () => {
  for (const [ano, mes, n, minimo] of [
    [2027, 1, 28, 8],
    [2028, 1, 29, 9],
    [2028, 3, 30, 9],
    [2028, 0, 31, 9],
  ]) {
    const e = exemplo();
    e.state.ano = ano;
    e.state.mes = mes;
    act(e.state, { repousoMensal: true });
    const dias = Array.from({ length: n }, (_, i) => ({
      data: `${ano}-${String(mes + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
      status: i < minimo ? "F" : "T",
    }));
    assert.equal(
      validarRepousoMensal(e.state, e.c, dias).find(
        (i) => i.tipo === "REPOUSO_MENSAL",
      ).severidade,
      "pendencia",
    );
    dias[0].status = "T";
    assert.equal(
      validarRepousoMensal(e.state, e.c, dias).find(
        (i) => i.tipo === "REPOUSO_MENSAL",
      ).severidade,
      "erro",
    );
  }
});
test("compensação mensal não libera período incompleto, cláusula expirada ou mês de transição", () => {
  const e = exemplo("2026-12-01");
  act(e.state, { repousoMensal: true });
  const dias = Array.from({ length: 31 }, (_, i) => ({
    data: `2026-12-${String(i + 1).padStart(2, "0")}`,
    status: "F",
  }));
  assert.equal(
    validarRepousoMensal(e.state, e.c, dias)[0].tipo,
    "REPOUSO_MENSAL_TRANSICAO",
  );
  assert.equal(
    validarRepousoMensal(e.state, e.c, dias.slice(1))[0].tipo,
    "REPOUSO_MENSAL_INCOMPLETO",
  );
  e.state.instrumentoColetivo.fim = "2026-12-15";
  assert.equal(
    validarRepousoMensal(e.state, e.c, dias)[0].tipo,
    "REPOUSO_MENSAL_INSTRUMENTO",
  );
});
test("política de feriado adicional preserva duas folgas e política anterior é marcada para conferir fundamento", () => {
  const e = exemplo("2026-10-12");
  e.state.tipoEscala = "5x2";
  const f = { "2026-10-12": { nome: "Feriado", trabalhado: false } };
  let dias = e.gerar("2026-10-12", null, f);
  assert.equal(dias.filter((d) => d.status === "F").length, 2);
  assert.ok(
    e.domain.validarLegal(e.c, dias).some((i) => i.tipo === "FERIADO_REPOUSO"),
  );
  e.state.politicaFeriados = "adicional";
  dias = e.gerar("2026-10-12", null, f);
  assert.equal(dias.filter((d) => d.status === "F").length, 3);
  assert.ok(
    !e.domain.validarLegal(e.c, dias).some((i) => i.tipo === "FERIADO_REPOUSO"),
  );
});
test("CSV recalcula validação e exporta rascunho, horários, fase e pendências", () => {
  const e = exemplo();
  e.state.escalaGerada = e.domain.gerarDadosEscala();
  const r = e.state.escalaGerada.resultado[0];
  r.dias.find((d) => d.status === "T" && d.data >= "2028-02-01").horas = 20;
  const csv = gerarCsv(e.state);
  assert.match(csv, /RASCUNHO — INCOMPATIBILIDADES/);
  assert.match(csv, /Horas trabalhadas/);
  assert.match(csv, /Fase na data/);
  assert.match(csv, /JORNADA_DIARIA/);
  assert.match(csv, /2028-02-/);
});
test("escala salva com regras antigas é invalidada, preservando funcionários e horários", () => {
  const e = exemplo();
  e.state.escalaGerada = { versaoRegras: "antiga", resultado: [] };
  let raw = JSON.stringify(e.state);
  const state = {};
  const p = createPersistence({
    state,
    initialState: createDefaultState(),
    storage: { getItem: () => raw, setItem: (k, v) => (raw = v) },
  });
  assert.equal(p.loadState(), true);
  assert.equal(state.escalaGerada, null);
  assert.equal(state.colaboradores[0].horasSemana, 44);
  e.state.escalaGerada = { versaoRegras: VERSAO_REGRAS, resultado: [] };
  raw = JSON.stringify(e.state);
  p.loadState();
  assert.equal(state.escalaGerada.versaoRegras, VERSAO_REGRAS);
});

test("modalidade mensal aceita semana com um repouso e outra com três sem liberar sete dias seguidos", () => {
  const e = exemplo("2027-02-01");
  act(e.state, { repousoMensal: true });
  const f = new Set([6, 11, 12, 13, 20, 25, 26, 27]);
  const dias = Array.from({ length: 28 }, (_, i) => ({
    data: `2027-02-${String(i + 1).padStart(2, "0")}`,
    weekday: new Date(2027, 1, i + 1).getDay(),
    status: f.has(i) ? "F" : "T",
    horas: f.has(i) ? 0 : 6,
    previsto: !f.has(i),
  }));
  assert.ok(
    !e.domain
      .validarRepousoSemanal(e.c, dias)
      .some((i) => ["REPOUSO_SEMANAL", "DIAS_CONSECUTIVOS"].includes(i.tipo)),
  );
  assert.equal(
    validarRepousoMensal(e.state, e.c, dias)[0].severidade,
    "pendencia",
  );
  dias[6].status = "T";
  dias[7].status = "F";
  assert.ok(
    e.domain
      .validarRepousoSemanal(e.c, dias)
      .some((i) => i.tipo === "DIAS_CONSECUTIVOS"),
  );
});
test("início de geração no meio do mês ainda apura mês completo e edição visível prevalece sobre contexto salvo", () => {
  const e = exemplo("2027-02-01");
  e.state.diaInicio = 19;
  act(e.state, { repousoMensal: true });
  const r = e.domain.gerarDadosEscala().resultado[0];
  const issues = e.domain.validarLegal(
    e.c,
    r.dias,
    r.diasContexto,
    r.diasApuracao,
  );
  assert.ok(!issues.some((i) => i.tipo === "REPOUSO_MENSAL_INCOMPLETO"));
  assert.ok(issues.some((i) => i.tipo === "REPOUSO_MENSAL"));
  const clone = JSON.parse(JSON.stringify(r));
  const dia = clone.dias.find((d) => d.status === "T");
  dia.status = "F";
  dia.horas = 0;
  const antes = issues.find((i) => i.tipo === "REPOUSO_MENSAL").mensagem;
  const depois = e.domain
    .validarLegal(e.c, clone.dias, clone.diasContexto, clone.diasApuracao)
    .find((i) => i.tipo === "REPOUSO_MENSAL").mensagem;
  assert.notEqual(antes, depois);
});
test("contratos públicos e comuns usam cargas diferentes no mesmo período sem modificar o cadastro", () => {
  const e = exemplo("2027-02-01");
  act(e.state);
  const publica = {
    ...e.c,
    id: 2,
    ec141: {
      tipo: "contrato_publico",
      contratoVigente: true,
      maoDeObraDireta: true,
      dataAditamento: "2027-06-01",
    },
  };
  e.state.colaboradores.push(publica);
  const dados = e.domain.gerarDadosEscala();
  assert.equal(
    dados.resultado[0].dias.find((d) => d.status === "T").alvoSemana,
    42,
  );
  assert.equal(
    dados.resultado[1].dias.find((d) => d.status === "T").alvoSemana,
    44,
  );
  assert.deepEqual(
    e.state.colaboradores.map((c) => c.horasSemana),
    [44, 44],
  );
});

test("ACT com compensação de horas apura média e pico: declaração sozinha não libera excesso", async () => {
  const { apurarCompensacaoHoras } = await import(
    "../assets/js/domain/compensacao-horas.js"
  );
  const e = exemplo("2027-02-01");
  e.state.modoRegime = "simulacao";
  e.state.regimeJornada = "definitivo40";
  act(e.state, {
    compensacaoHoras: true,
    apuracaoInicio: "2027-02-01",
    apuracaoFim: "2027-02-28",
    limiteSemanalCompensado: 44,
  });
  const dias = Array.from({ length: 28 }, (_, i) => {
    const week = Math.floor(i / 7),
      weekday = (i % 7) + 1;
    const h = weekday <= 5 ? (week < 2 ? 8.8 : 7.2) : 0;
    return {
      data: `2027-02-${String(i + 1).padStart(2, "0")}`,
      weekday: weekday % 7,
      status: h ? "T" : "F",
      horas: h,
      previsto: !!h,
    };
  });
  let apuracao = apurarCompensacaoHoras(e.state, e.c, dias);
  assert.equal(apuracao.situacao, "apurada");
  assert.equal(apuracao.media, 40);
  let issues = e.domain.validarLegal(e.c, dias);
  assert.ok(
    issues
      .filter((i) => i.tipo === "LIMITE_SEMANAL")
      .every((i) => i.severidade === "pendencia"),
  );
  assert.ok(
    issues.some(
      (i) => i.tipo === "COMPENSACAO_HORAS" && i.severidade === "pendencia",
    ),
  );
  assert.ok(
    !issues.some(
      (i) => i.tipo === "JORNADA_CONTRATUAL" && i.severidade === "erro",
    ),
  );
  e.state.instrumentoColetivo.limiteSemanalCompensado = 42;
  issues = e.domain.validarLegal(e.c, dias);
  assert.ok(
    issues.some((i) => i.tipo === "LIMITE_SEMANAL" && i.severidade === "erro"),
  );
  e.state.instrumentoColetivo.limiteSemanalCompensado = 44;
  dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 8.8));
  apuracao = apurarCompensacaoHoras(e.state, e.c, dias);
  assert.equal(apuracao.situacao, "excedida");
  assert.ok(
    e.domain
      .validarLegal(e.c, dias)
      .some((i) => i.tipo === "LIMITE_SEMANAL" && i.severidade === "erro"),
  );
  assert.equal(
    apurarCompensacaoHoras(e.state, e.c, dias.slice(1)).situacao,
    "incompleta",
  );
});
test("exceção art8 em semana de mudança de fase não imprime limite infinito nem falso rateio de jornada", () => {
  const e = exemplo("2027-12-13");
  e.c.ec141 = {
    tipo: "art8",
    diplomaSuperior: true,
    remuneracao: 25000,
    tetoRgps: 10000,
  };
  const issues = e.domain.validarLegal(e.c, e.gerar());
  assert.ok(!issues.some((i) => /Infinity|NaN/.test(i.mensagem)));
  assert.ok(!issues.some((i) => i.tipo === "SEMANA_TRANSICAO"));
});

test("semana de transição não presume limite retroativo nem dispensa excesso acima de ambas as fases", () => {
  const e = exemplo("2026-12-14");
  const dias = e.gerar();
  // Uma edição que mantém 44h na semana mista não pode ser homologada,
  // tampouco classificada somente pelo teto posterior sem critério de transição.
  dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 8.8));
  let issues = e.domain.validarJornadaSemanal(e.c, dias);
  assert.equal(
    issues.find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
    "pendencia",
  );
  dias.filter((d) => d.status === "T").forEach((d) => (d.horas = 10));
  issues = e.domain.validarJornadaSemanal(e.c, dias);
  assert.equal(
    issues.find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
    "erro",
  );
});

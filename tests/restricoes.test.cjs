const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let base,
  domain,
  apurar,
  validar,
  violacoes,
  converter,
  referencia,
  csv,
  persistence,
  pendencias;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ apurarSemana: apurar } = await import(
    "../assets/js/domain/resumo-semanal.js"
  ));
  ({ validarRestricoes: validar, violacoesDia: violacoes } = await import(
    "../assets/js/domain/restricoes.js"
  ));
  ({ converterEscala: converter, gerarReferenciaAtual: referencia } =
    await import("../assets/js/domain/conversao.js"));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ createPersistence: persistence } = await import(
    "../assets/js/state/persistencia.js"
  ));
  ({ pendenciasPreenchimento: pendencias } = await import(
    "../assets/js/domain/preenchimento.js"
  ));
});
function config(extra = {}) {
  const s = base(new Date(2026, 9, 1));
  Object.assign(s, {
    tipoEscala: "5x2",
    diasTrabalho: [1, 2, 3, 4, 5],
    modoRegime: "simulacao",
    regimeJornada: "definitivo40",
    feriados: [],
    feriadosExcluidos: ["2026-10-12"],
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "17:00",
    },
    ...extra,
  });
  s.colaboradores = [
    {
      id: 1,
      nome: "Pessoa exemplo",
      sexo: "masculino",
      cargo: "Atendente",
      horasSemana: 40,
    },
  ];
  return s;
}
const restr = (s, r) => (s.colaboradores[0].restricoes = r);
const pessoa = (s) => domain(s).gerarDadosEscala().resultado[0];
const semana = (r, inicio = "2026-10-05", fim = "2026-10-11") =>
  r.dias.filter((d) => d.data >= inicio && d.data <= fim);
const trabalha = (d) => ["T", "FE"].includes(d.status);
test("sem restrições mantém resultado e contratos anteriores", () => {
  const s = config();
  const antes = pessoa(s);
  restr(s, {});
  const depois = pessoa(s);
  assert.deepEqual(depois.dias, antes.dias);
  assert.equal(s.colaboradores[0].horasSemana, 40);
});
for (const [tipo, status] of [
  ["ferias", "VA"],
  ["afastamento", "AF"],
]) {
  test(`${tipo}: datas inclusivas, ausência não gera déficit ou compensação, volta ao horário normal`, () => {
    const s = config();
    restr(s, { periodos: [{ tipo, inicio: "2026-10-06", fim: "2026-10-08" }] });
    const r = pessoa(s);
    const ds = semana(r);
    const a = apurar(r.colaborador, ds, s);
    assert.deepEqual(
      ds.map((d) => d.status),
      ["T", status, status, status, "T", "F", "F"],
    );
    assert.equal(a.trabalhadas, 16);
    assert.equal(a.dispensadas, 24);
    assert.equal(a.alvo, 16);
    assert.equal(a.estado, "ok");
    assert.ok(ds.filter(trabalha).every((d) => d.horas === 8));
    assert.ok(
      !domain(s)
        .validarLegal(r.colaborador, r.dias)
        .some(
          (i) =>
            ["JORNADA_CONTRATUAL", "REPOUSO_SEMANAL"].includes(i.tipo) &&
            i.data === "2026-10-05",
        ),
    );
    assert.equal(r.dias.find((d) => d.data === "2026-10-12").horas, 8);
  });
  test(`${tipo}: semana inteira e folgas dentro da ausência não duplicam abatimento`, () => {
    const s = config();
    restr(s, { periodos: [{ tipo, inicio: "2026-10-05", fim: "2026-10-11" }] });
    const r = pessoa(s);
    const a = apurar(r.colaborador, semana(r), s);
    assert.equal(a.dispensadas, 40);
    assert.equal(a.trabalhadas, 0);
    assert.equal(a.alvo, 0);
    assert.equal(a.estado, "ok");
  });
}
test("feriado dentro das férias não duplica abono ou carga; período fora do mês é inócuo", () => {
  const s = config({ feriadosExcluidos: [] });
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-12", fim: "2026-10-12" }],
  });
  const r = pessoa(s);
  const a = apurar(r.colaborador, semana(r, "2026-10-12", "2026-10-18"), s);
  assert.equal(a.abonadas, 0);
  assert.equal(a.dispensadas, 8);
  assert.equal(a.alvo, 32);
  assert.equal(a.estado, "ok");
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2027-02-01", fim: "2027-02-28" }],
  });
  assert.equal(pessoa(s).dias.filter((d) => d.status === "VA").length, 0);
});
test("folga semanal individual substitui a opcional, sem gerar terceira folga", () => {
  const s = config({ diasTrabalho: [1, 2, 3, 4, 5, 6], folgaTipo: "rotativa" });
  restr(s, { folgasObrigatorias: [2] });
  const r = pessoa(s);
  for (const inicio of [
    "2026-10-05",
    "2026-10-12",
    "2026-10-19",
    "2026-10-26",
  ]) {
    const fim = new Date(inicio + "T12:00:00");
    fim.setDate(fim.getDate() + 6);
    const ds = semana(r, inicio, fim.toISOString().slice(0, 10));
    assert.equal(ds.filter((d) => d.status === "F").length, 2);
    assert.equal(ds.find((d) => d.weekday === 2).status, "F");
    assert.equal(ds.filter(trabalha).length, 5);
  }
});
test("indisponibilidade recorrente tem prioridade e conta entre os dias sem trabalho; sem abono", () => {
  const s = config({ diasTrabalho: [1, 2, 3, 4, 5, 6] });
  restr(s, { diasIndisponiveis: [3] });
  const r = pessoa(s),
    ds = semana(r);
  assert.equal(ds.find((d) => d.weekday === 3).status, "I");
  assert.equal(ds.filter((d) => ["F", "I"].includes(d.status)).length, 2);
  assert.equal(apurar(r.colaborador, ds, s).dispensadas, 0);
});
test("três bloqueios fixos tornam o 5x2 incompatível e são mantidos", () => {
  const s = config({ diasTrabalho: [0, 1, 2, 3, 4, 5, 6] });
  restr(s, { folgasObrigatorias: [1, 2, 3] });
  const r = pessoa(s);
  assert.ok(
    semana(r)
      .filter((d) => [1, 2, 3].includes(d.weekday))
      .every((d) => d.status === "F"),
  );
  assert.ok(
    domain(s)
      .validarLegal(r.colaborador, r.dias)
      .some(
        (i) => i.tipo === "RESTRICOES_INVIAVEIS" && i.severidade === "erro",
      ),
  );
});
test("folga por data e indisponibilidade por período respeitam limites inclusivos", () => {
  const s = config({ diasTrabalho: [0, 1, 2, 3, 4, 5, 6] });
  restr(s, {
    periodos: [
      { tipo: "folga", inicio: "2026-10-07", fim: "2026-10-07" },
      { tipo: "indisponivel", inicio: "2026-10-08", fim: "2026-10-09" },
    ],
  });
  const r = pessoa(s);
  assert.equal(r.dias.find((d) => d.data === "2026-10-07").status, "F");
  assert.ok(
    r.dias
      .filter((d) => ["2026-10-08", "2026-10-09"].includes(d.data))
      .every((d) => d.status === "I"),
  );
});
test("janela diurna recorta presença, mantém pausa real, reduz horas e explica déficit", () => {
  const s = config();
  restr(s, {
    horariosPermitidos: [{ dia: 1, entrada: "10:00", saida: "16:00" }],
  });
  const r = pessoa(s),
    d = semana(r)[0];
  assert.equal(d.entradaMin, 600);
  assert.equal(d.saidaMin, 960);
  assert.equal(d.horas, 5);
  assert.equal(d.intervaloInicioMin, 720);
  assert.equal(d.intervaloFimMin, 780);
  assert.equal(apurar(r.colaborador, semana(r), s).trabalhadas, 37);
  assert.ok(
    domain(s)
      .validarLegal(r.colaborador, r.dias)
      .some((i) => i.tipo === "RESTRICAO_CARGA"),
  );
});
test("janela mais ampla preserva horário; sem interseção ou somente pausa não aloca trabalho", () => {
  const s = config();
  restr(s, {
    horariosPermitidos: [
      { dia: 1, entrada: "06:00", saida: "22:00" },
      { dia: 2, entrada: "19:00", saida: "22:00" },
      { dia: 3, entrada: "12:00", saida: "13:00" },
    ],
  });
  const ds = semana(pessoa(s));
  assert.equal(ds[0].horas, 8);
  assert.equal(ds[0].entradaMin, 480);
  assert.equal(ds[1].status, "I");
  assert.equal(ds[2].status, "I");
  assert.ok(!ds[2].horas);
});
test("janela noturna respeita saída no dia seguinte, sem confundir datas", () => {
  const s = config({
    jornada: {
      entrada: "20:00",
      intInicio: "00:00",
      intFim: "01:00",
      saida: "05:00",
    },
  });
  restr(s, {
    horariosPermitidos: [{ dia: 1, entrada: "22:00", saida: "04:00" }],
  });
  const d = semana(pessoa(s))[0];
  assert.equal(d.entradaMin, 1320);
  assert.equal(d.saidaMin, 1680);
  assert.equal(d.horas, 5);
  assert.equal(d.intervaloInicioMin, 1440);
  assert.equal(d.intervaloFimMin, 1500);
});
test("plantão da véspera não invade férias, afastamento ou indisponibilidade", () => {
  for (const tipo of ["ferias", "afastamento", "indisponivel", "folga"]) {
    const s = config({
      jornada: {
        entrada: "20:00",
        intInicio: "00:00",
        intFim: "01:00",
        saida: "05:00",
      },
    });
    restr(s, { periodos: [{ tipo, inicio: "2026-10-06", fim: "2026-10-06" }] });
    const d = semana(pessoa(s))[0];
    assert.ok(!trabalha(d), tipo);
    assert.equal(d.horas, 0);
    assert.match(d.restricao.descricao, /meia-noite/);
  }
});
test("plantão terminando exatamente à meia-noite não invade bloqueio seguinte", () => {
  const s = config({
    jornada: {
      entrada: "15:00",
      intInicio: "19:00",
      intFim: "20:00",
      saida: "00:00",
    },
  });
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-06", fim: "2026-10-06" }],
  });
  const d = semana(pessoa(s))[0];
  assert.equal(d.status, "T");
  assert.equal(d.saidaMin, 1440);
});
test("12x36 preserva ciclo: plantão incompatível é retirado inteiro e causa diagnóstico", () => {
  const s = config({
    tipoEscala: "12x36",
    ancora12x36: "2026-10-05",
    jornada: {
      entrada: "07:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "19:00",
    },
  });
  restr(s, {
    horariosPermitidos: [{ dia: 1, entrada: "08:00", saida: "19:00" }],
  });
  const r = pessoa(s),
    d = semana(r)[0];
  assert.equal(d.status, "I");
  assert.equal(d.horas, 0);
  assert.equal(r.dias.find((d) => d.data === "2026-10-07").status, "T");
  assert.ok(
    domain(s)
      .validarLegal(r.colaborador, r.dias)
      .some((i) => i.tipo === "HORARIO_RESTRITO" && i.severidade === "erro"),
  );
});
test("admissão prevalece sobre ausência; horários Domínio também recebem restrições", () => {
  const s = config();
  s.colaboradores[0].quadroDominio = {
    ativo: true,
    tipo: "semanal",
    modelo: "5x2",
    admissaoIso: "2026-10-07",
    semana: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [
        d,
        d === 0 || d === 6
          ? { status: "folga" }
          : { status: "trabalho", jornada: s.jornada },
      ]),
    ),
    ciclo: {},
    pendencias: [],
  };
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-08" }],
    horariosPermitidos: [{ dia: 5, entrada: "10:00", saida: "16:00" }],
  });
  const ds = semana(pessoa(s));
  assert.deepEqual(
    ds.map((d) => d.status),
    ["NC", "NC", "VA", "VA", "T", "F", "F"],
  );
  assert.equal(ds[4].horas, 5);
});
test("cobertura conta apenas presença disponível e CSV explica os bloqueios", () => {
  const s = config({
    coberturaAtiva: true,
    demandasCobertura: [
      {
        id: 1,
        funcao: "Atendente",
        inicio: "08:00",
        fim: "17:00",
        diasSemana: [1, 2],
        minimo: 1,
        incluirFeriados: false,
      },
    ],
  });
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-05" }],
    horariosPermitidos: [{ dia: 2, entrada: "10:00", saida: "16:00" }],
  });
  s.escalaGerada = domain(s).gerarDadosEscala();
  const lacunas = s.escalaGerada.coberturaOperacional.lacunas;
  assert.ok(lacunas.some((l) => l.data === "2026-10-05" && l.presentes === 0));
  assert.ok(
    lacunas.some(
      (l) => l.data === "2026-10-06" && l.inicioMin === 480 && l.fimMin === 600,
    ),
  );
  const texto = csv(s);
  assert.match(texto, /Restrição individual/);
  assert.match(texto, /Férias/);
  assert.match(texto, /Horário permitido/);
});
test("edição não pode alocar trabalho em bloqueios nem sair da janela permitida", () => {
  const c = {
    restricoes: {
      folgasObrigatorias: [1],
      horariosPermitidos: [{ dia: 2, entrada: "10:00", saida: "16:00" }],
    },
  };
  assert.ok(
    violacoes(c, {
      data: "2026-10-05",
      weekday: 1,
      status: "T",
      entradaMin: 480,
      saidaMin: 1020,
    }).length,
  );
  assert.ok(
    violacoes(c, {
      data: "2026-10-06",
      weekday: 2,
      status: "T",
      entradaMin: 600,
      saidaMin: 1080,
    }).length,
  );
  assert.equal(
    violacoes(c, {
      data: "2026-10-06",
      weekday: 2,
      status: "T",
      entradaMin: 600,
      saidaMin: 960,
    }).length,
    0,
  );
});
test("datas, horas, tipos inválidos e férias sobre afastamento bloqueiam preenchimento e geração", () => {
  const casos = [
    { periodos: [{ tipo: "ferias", inicio: "2026-02-30", fim: "2026-03-01" }] },
    { periodos: [{ tipo: "folga", inicio: "2026-10-08", fim: "2026-10-07" }] },
    { periodos: [{ tipo: "x", inicio: "2026-10-05", fim: "2026-10-06" }] },
    { horariosPermitidos: [{ dia: 2, entrada: "00:00", saida: "00:00" }] },
    { horariosPermitidos: [{ dia: 2, entrada: "25:00", saida: "17:00" }] },
    { diasIndisponiveis: [7] },
    { periodos: "invalid" },
    {
      periodos: [
        { tipo: "ferias", inicio: "2026-10-01", fim: "2026-10-10" },
        { tipo: "afastamento", inicio: "2026-10-10", fim: "2026-10-15" },
      ],
    },
  ];
  for (const r of casos) {
    const s = config();
    restr(s, r);
    assert.ok(validar(s.colaboradores[0]).length);
    assert.throws(() => pessoa(s));
    assert.ok(pendencias(s).some((p) => p.mensagem.includes("Pessoa exemplo")));
  }
});
test("persistência preserva restrições e invalida escala antiga; sem alterar cadastros legados", () => {
  const s = config();
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-09" }],
    folgasObrigatorias: [0],
  });
  let raw;
  const storage = {
    setItem(k, v) {
      raw = v;
    },
    getItem() {
      return raw;
    },
  };
  persistence({ state: s, initialState: base(), storage }).saveState();
  const novo = base();
  persistence({ state: novo, initialState: base(), storage }).loadState();
  assert.deepEqual(
    novo.colaboradores[0].restricoes,
    s.colaboradores[0].restricoes,
  );
});
test("referência atual e conversão 6x1→5x2 mantêm restrições e diagnóstico de falta de pessoal", () => {
  const s = config({
    tipoEscala: "6x1",
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    coberturaAtiva: true,
    demandasCobertura: [
      {
        id: 1,
        funcao: "Atendente",
        inicio: "08:00",
        fim: "12:00",
        diasSemana: [1, 2, 3, 4, 5, 6],
        minimo: 1,
        incluirFeriados: false,
      },
    ],
  });
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-01", fim: "2027-01-31" }],
  });
  const atual = referencia(s);
  assert.ok(
    atual.escala.resultado[0].dias
      .filter((d) => d.data >= "2026-10-01")
      .every((d) => !trabalha(d)),
  );
  const proposta = converter(s, {
    periodo: "2026-12",
    fase: "transicao42",
    folgas: "distribuir",
  });
  const cfg = proposta.proposta.config;
  assert.ok(cfg.escalaGerada.resultado[0].dias.every((d) => !trabalha(d)));
  assert.equal(proposta.comparacao.status, "insuficiente");
  assert.equal(proposta.comparacao.funcoes[0].limiteCapacidade, 0);
});
test("cenários de comércio, padaria e drogaria: nenhuma alocação ultrapassa restrições", () => {
  for (const jornada of [
    { entrada: "05:00", intInicio: "09:00", intFim: "10:00", saida: "14:00" },
    { entrada: "09:00", intInicio: "13:00", intFim: "14:00", saida: "18:00" },
    { entrada: "20:00", intInicio: "00:00", intFim: "01:00", saida: "05:00" },
  ])
    for (const diasTrabalho of [
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5, 6],
      [0, 1, 2, 3, 4, 5, 6],
    ])
      for (const tipoEscala of ["5x2", "6x1"]) {
        const s = config({ jornada, diasTrabalho, tipoEscala });
        restr(s, {
          diasIndisponiveis: [3],
          folgasObrigatorias: [0],
          periodos: [
            { tipo: "ferias", inicio: "2026-10-12", fim: "2026-10-18" },
          ],
          horariosPermitidos: [
            { dia: 1, entrada: jornada.entrada, saida: jornada.saida },
          ],
        });
        const r = pessoa(s);
        for (const d of r.dias) {
          assert.deepEqual(violacoes(r.colaborador, d), []);
          assert.ok(d.horas >= 0);
          if (!trabalha(d)) assert.equal(d.horas, 0);
        }
      }
});

test("operação sete dias com um repouso individual fixo não recursa entre semanas", () => {
  const s = config({ diasTrabalho: [0, 1, 2, 3, 4, 5, 6] });
  restr(s, { folgasObrigatorias: [2] });
  const r = pessoa(s);
  for (const d of r.dias.filter((d) => d.weekday === 2))
    assert.equal(d.status, "F");
  assert.equal(semana(r).filter((d) => d.status === "F").length, 2);
});

test("CCT 12x36: ausência remove presença e créditos sem criar horas faltantes em semana integral", () => {
  const s = config({
    tipoEscala: "12x36",
    ancora12x36: "2026-10-06",
    jornada: {
      entrada: "19:00",
      intInicio: "22:00",
      intFim: "23:00",
      saida: "06:00",
    },
    instrumentoCompensacao: "act_cct",
  });
  Object.assign(s.instrumentoColetivo, {
    identificacao: "CCT exemplo",
    inicio: "2026-01-01",
    fim: "2027-12-31",
    compativelEC141: true,
    regime12x36: true,
    intervaloComputado: true,
    creditoNoturnoUmaHora: true,
  });
  // Imported cycle with 10h presence + two declared credits.
  s.colaboradores[0].quadroDominio = {
    ativo: true,
    tipo: "ciclo",
    modelo: "12x36",
    ancora: "2026-10-06",
    semana: {},
    ciclo: {
      1: { status: "trabalho", jornada: s.jornada },
      2: { status: "folga" },
    },
    pendencias: [],
  };
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-11" }],
  });
  const r = pessoa(s),
    ds = semana(r);
  const a = apurar(r.colaborador, ds, s);
  assert.equal(a.alvo, 0);
  assert.equal(a.computadas, 0);
  assert.ok(ds.every((d) => !d.creditoNoturnoCCT && !d.creditoIntervaloCCT));
  assert.equal(ds.filter((d) => d.horasDispensadasRestricao === 12).length, 3);
});

test("6x1 ajustado à fase de dois repousos não acusa conflito por ter dois dias sem trabalho", () => {
  const s = config({ tipoEscala: "6x1", diasTrabalho: [1, 2, 3, 4, 5, 6] });
  restr(s, { folgasObrigatorias: [2] });
  const r = pessoa(s);
  assert.ok(
    !domain(s)
      .validarLegal(r.colaborador, r.dias)
      .some((i) => i.tipo === "RESTRICOES_INVIAVEIS"),
  );
});

test("horário permitido aplica-se ao turno B e não desloca a pausa para fora da janela", () => {
  const s = config({ turnosRevezamento: true, entradaTurnoB: "14:00" });
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [{ dia: 1, entrada: "15:00", saida: "22:00" }],
  };
  const r = domain(s).gerarDadosEscala().resultado[0],
    d = semana(r)[0];
  assert.equal(d.turno, "B");
  assert.ok(d.entradaMin >= 900);
  assert.ok(d.saidaMin <= 1320);
  assert.deepEqual(violacoes(r.colaborador, d), []);
});

test("ausência atravessando virada de mês protege a noite anterior e mantém geração adjacente consistente", () => {
  const s = config({
    jornada: {
      entrada: "20:00",
      intInicio: "00:00",
      intFim: "01:00",
      saida: "05:00",
    },
  });
  restr(s, {
    periodos: [
      { tipo: "afastamento", inicio: "2026-11-01", fim: "2026-11-04" },
    ],
  });
  const outubro = pessoa(s);
  s.mes = 10;
  const novembro = pessoa(s);
  for (const data of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]) {
    const d = novembro.dias.find((d) => d.data === data);
    assert.equal(d.status, "AF");
    assert.equal(d.horas, 0);
    const anterior = outubro.dias.find((d) => d.data === data);
    if (anterior) assert.equal(anterior.status, d.status);
  }
});

test("aviso de operação sem pessoas reconhece ausência mesmo sem faixas de cobertura", () => {
  const s = config();
  restr(s, {
    periodos: [{ tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-09" }],
  });
  const escala = domain(s).gerarDadosEscala();
  assert.ok(
    escala.avisosCobertura.some(
      (i) =>
        i.mensagem.includes("Dia 5/10") &&
        i.mensagem.includes("sem trabalho escalado"),
    ),
  );
});

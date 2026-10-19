const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let analisarCobertura,
  validarDemanda,
  createDefaultState,
  createDomain,
  createPersistence;
before(async () => {
  ({ analisarCobertura, validarDemanda } = await import(
    "../assets/js/domain/cobertura.js"
  ));
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ createPersistence } = await import("../assets/js/state/persistencia.js"));
});
function config(demandas) {
  return {
    ...createDefaultState(new Date(2026, 9, 31)),
    diaInicio: 31,
    feriados: [],
    coberturaAtiva: true,
    demandasCobertura: demandas,
  };
}
function demanda(extra = {}) {
  return {
    id: 1,
    funcao: "Atendente",
    inicio: "09:00",
    fim: "18:00",
    minimo: 2,
    diasSemana: [6],
    incluirFeriados: false,
    ...extra,
  };
}
function pessoa(id, cargo = "Atendente", dias = [dia()]) {
  return { colaborador: { id, nome: `Pessoa ${id}`, cargo }, dias };
}
function dia(extra = {}) {
  return {
    data: "2026-10-31",
    weekday: 6,
    status: "T",
    horas: 9,
    entradaMin: 540,
    saidaMin: 1080,
    intervaloMin: 0,
    ...extra,
  };
}
function lacunas(c, r) {
  return analisarCobertura(c, r).lacunas.map((f) => [
    f.data,
    f.funcao,
    f.inicioMin,
    f.fimMin,
    f.necessarios,
    f.presentes,
    f.faltantes,
  ]);
}
test("dois atendentes não substituem um supervisor: relatório exato por função", () => {
  const c = config([
    demanda(),
    demanda({ id: 2, funcao: "Supervisor", minimo: 1 }),
  ]);
  assert.deepEqual(lacunas(c, [pessoa(1), pessoa(2)]), [
    ["2026-10-31", "Supervisor", 540, 1080, 1, 0, 1],
  ]);
  assert.equal(
    analisarCobertura(c, [pessoa(1), pessoa(2), pessoa(3, "Supervisor")])
      .lacunas.length,
    0,
  );
});
test("deduz intervalo e mostra somente a faixa de capacidade insuficiente", () => {
  const c = config([demanda()]);
  assert.deepEqual(
    lacunas(c, [
      pessoa(1),
      pessoa(2, "Atendente", [dia({ horas: 8, intervaloMin: 60 })]),
    ]),
    [["2026-10-31", "Atendente", 780, 840, 2, 1, 1]],
  );
  // A entrada 09:00 desloca a pausa relativa de 4h: 13:00–14:00.
});
test("folga e folga compensatória não contam; feriado trabalhado conta", () => {
  const c = config([demanda()]);
  assert.equal(
    analisarCobertura(c, [
      pessoa(1, "Atendente", [dia({ status: "FE" })]),
      pessoa(2, "Atendente", [dia({ status: "F" })]),
      pessoa(3, "Atendente", [dia({ status: "FC" })]),
    ]).lacunas[0].presentes,
    1,
  );
});
test("troca de pessoas no mesmo minuto mantém cobertura, sem exigir sobreposição", () => {
  const c = config([demanda({ minimo: 1 })]);
  assert.equal(
    analisarCobertura(c, [
      pessoa(1, "Atendente", [dia({ saidaMin: 780, horas: 4 })]),
      pessoa(2, "Atendente", [dia({ entradaMin: 780, horas: 5 })]),
    ]).lacunas.length,
    0,
  );
});
test("detecta lacuna de um minuto e arredonda horários conforme a grade", () => {
  const c = config([demanda({ minimo: 1 })]);
  assert.deepEqual(
    lacunas(c, [
      pessoa(1, "Atendente", [dia({ saidaMin: 780, horas: 4 })]),
      pessoa(2, "Atendente", [dia({ entradaMin: 781, horas: 5 })]),
    ]),
    [["2026-10-31", "Atendente", 780, 781, 1, 0, 1]],
  );
});
test("faixas sobrepostas da mesma função exigem o maior mínimo, sem dupla contagem", () => {
  const c = config([
    demanda({ minimo: 1 }),
    demanda({ id: 2, inicio: "12:00", fim: "14:00", minimo: 3 }),
  ]);
  assert.deepEqual(lacunas(c, [pessoa(1), pessoa(2)]), [
    ["2026-10-31", "Atendente", 720, 840, 3, 2, 1],
  ]);
});
test("intervalos adjacentes com mesmo déficit são agrupados", () => {
  const c = config([
    demanda({ inicio: "09:00", fim: "12:00" }),
    demanda({ id: 2, inicio: "12:00", fim: "18:00" }),
  ]);
  assert.equal(analisarCobertura(c, []).lacunas.length, 1);
});
test("associa funções sem diferenciar acentos, maiúsculas e espaços extras", () => {
  const c = config([demanda({ funcao: " Técnico   de Apoio ", minimo: 1 })]);
  assert.equal(
    analisarCobertura(c, [pessoa(1, "tecnico de apoio")]).lacunas.length,
    0,
  );
});
test("não conta a mesma pessoa duas vezes nem duplica dias de contexto", () => {
  const c = config([demanda()]);
  const r = pessoa(1);
  r.diasContexto = [dia()];
  assert.equal(analisarCobertura(c, [r, pessoa(1)]).lacunas[0].presentes, 1);
});
test("demanda explícita vale em dia não operacional; outros dias não entram", () => {
  const c = config([demanda()]);
  c.diasTrabalho = [1, 2, 3, 4, 5];
  assert.equal(analisarCobertura(c, []).lacunas.length, 1);
  c.demandasCobertura[0].diasSemana = [1];
  assert.equal(analisarCobertura(c, []).periodos.length, 0);
});
test("feriados só exigem cobertura quando marcados na demanda", () => {
  const c = config([demanda()]);
  c.feriados = [{ dia: 31, nome: "Local", trabalhado: true }];
  assert.equal(analisarCobertura(c, []).periodos.length, 0);
  c.demandasCobertura[0].incluirFeriados = true;
  assert.equal(analisarCobertura(c, []).lacunas.length, 1);
});
test("jornada noturna do dia anterior cobre a demanda no início do mês", () => {
  const c = {
    ...config([
      demanda({ inicio: "00:00", fim: "06:00", minimo: 1, diasSemana: [0] }),
    ]),
    mes: 10,
    diaInicio: 1,
  };
  const r = pessoa(1, "Atendente", []);
  r.diasContexto = [dia({ entradaMin: 1320, saidaMin: 1800, horas: 8 })];
  assert.deepEqual(
    analisarCobertura(c, [r]).lacunas.find((f) => f.data === "2026-11-01"),
    undefined,
  );
});
test("faixa noturna carrega o déficit do último dia anterior para o mês selecionado", () => {
  const c = {
    ...config([demanda({ inicio: "22:00", fim: "06:00", minimo: 1 })]),
    mes: 10,
    diaInicio: 1,
  };
  assert.deepEqual(analisarCobertura(c, []).lacunas[0], {
    data: "2026-11-01",
    funcao: "Atendente",
    inicioMin: 0,
    fimMin: 360,
    necessarios: 1,
    presentes: 0,
    faltantes: 1,
  });
});
test("fim do mês corta a faixa na meia-noite e não contabiliza o mês seguinte", () => {
  const c = config([demanda({ inicio: "22:00", fim: "06:00", minimo: 1 })]);
  assert.deepEqual(lacunas(c, []), [
    ["2026-10-31", "Atendente", 1320, 1440, 1, 0, 1],
  ]);
});
test("não há alegação de cobertura avaliada quando não existem demandas", () => {
  const r = analisarCobertura(config([]), []);
  assert.equal(r.configurada, false);
  assert.deepEqual(r.lacunas, []);
});
test("horário inválido não conta como presença e aparece nos avisos", () => {
  const r = analisarCobertura(config([demanda()]), [
    pessoa(1, "Atendente", [dia({ entradaMin: NaN })]),
  ]);
  assert.equal(r.lacunas[0].presentes, 0);
  assert.equal(r.avisos.length, 1);
});
test("valida função, horários, quantidade inteira e dias, inclusive noturnos", () => {
  for (const extra of [
    { funcao: " " },
    { inicio: "25:00" },
    { fim: "09:00" },
    { minimo: 0 },
    { minimo: 1.5 },
    { diasSemana: [] },
    { diasSemana: [7] },
  ])
    assert.ok(validarDemanda(demanda(extra)));
  assert.equal(
    validarDemanda(demanda({ inicio: "22:00", fim: "06:00" })),
    null,
  );
  const r = analisarCobertura(config([demanda({ minimo: 0 })]), []);
  assert.equal(r.avisos.length, 1);
  assert.deepEqual(r.periodos, []);
});
test("escala salva antes da funcionalidade recebe demandas vazias sem perder equipe", () => {
  const inicial = createDefaultState();
  const state = structuredClone(inicial);
  const antigo = structuredClone(inicial);
  delete antigo.demandasCobertura;
  delete antigo.proximaDemandaId;
  antigo.colaboradores[0].nome = "Equipe anterior";
  const storage = createPersistence({
    state,
    initialState: inicial,
    storage: { getItem: () => JSON.stringify(antigo) },
  });
  assert.equal(storage.loadState(), true);
  assert.deepEqual(state.demandasCobertura, []);
  assert.equal(state.colaboradores[0].nome, "Equipe anterior");
});
test("geração integra relatório e horário real dos intervalos A/B", () => {
  const c = config([demanda({ minimo: 1 })]);
  c.tipoEscala = "custom";
  c.diasTrabalho = [6];
  c.turnosRevezamento = true;
  c.colaboradores = [
    { id: 1, nome: "Pessoa", cargo: "Atendente", horasSemana: 8 },
  ];
  const domain = createDomain(c);
  const escala = domain.gerarDadosEscala();
  assert.deepEqual(
    escala.coberturaOperacional,
    domain.analisarCobertura(escala.resultado),
  );
  const d = escala.resultado[0].dias.find((d) => d.data === "2026-10-31");
  assert.equal(d.intervaloFimMin - d.intervaloInicioMin, 60);
  assert.equal(d.intervaloInicioMin - d.entradaMin, 240);
  assert.ok(escala.resultado[0].diasContexto.length === 7);
});
test("feriado do mês anterior não cria demanda noturna indevida no mês atual", () => {
  const c = {
    ...config([demanda({ inicio: "22:00", fim: "06:00", minimo: 1 })]),
    mes: 10,
    diaInicio: 1,
    feriadosLocais: [{ dia: 31, mes: 9, ano: 2026, nome: "Local" }],
  };
  assert.ok(
    !analisarCobertura(c, []).lacunas.some((f) => f.data === "2026-11-01"),
  );
});
test("virada de ano mantém o déficit noturno no dia correto", () => {
  const c = {
    ...config([
      demanda({ inicio: "22:00", fim: "06:00", minimo: 1, diasSemana: [4] }),
    ]),
    ano: 2027,
    mes: 0,
    diaInicio: 1,
  };
  assert.equal(analisarCobertura(c, []).lacunas[0].data, "2027-01-01");
  assert.equal(analisarCobertura(c, []).lacunas[0].fimMin, 360);
});
test("demanda por função continua ativa mesmo permitindo folgas no mesmo dia", () => {
  const c = config([demanda()]);
  c.folgaCobertura = "livre";
  assert.equal(analisarCobertura(c, []).lacunas[0].faltantes, 2);
});
test("geração respeita feriado local anterior ao avaliar o plantão noturno", () => {
  const c = {
    ...config([
      demanda({ inicio: "00:00", fim: "06:00", minimo: 1, diasSemana: [0] }),
    ]),
    mes: 10,
    diaInicio: 1,
    tipoEscala: "custom",
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    feriadosLocais: [
      { ano: 2026, mes: 9, dia: 31, nome: "Local", trabalhado: false },
    ],
    jornada: {
      entrada: "22:00",
      intInicio: "02:00",
      intFim: "03:00",
      saida: "07:00",
    },
    colaboradores: [
      { id: 1, nome: "Pessoa", cargo: "Atendente", horasSemana: 56 },
    ],
  };
  const e = createDomain(c).gerarDadosEscala();
  assert.equal(
    e.resultado[0].dias.find((d) => d.data === "2026-10-31").status,
    "F",
  );
  assert.equal(e.coberturaOperacional.lacunas[0].data, "2026-11-01");
  assert.equal(e.coberturaOperacional.lacunas[0].presentes, 0);
});
test("Turno B desloca o intervalo junto com a entrada e deixa a lacuna correta", () => {
  const c = config([demanda({ inicio: "17:00", fim: "20:00", minimo: 1 })]);
  const d = dia({ turno: "B", horas: 8 });
  createDomain(c).atualizarHorarioEfetivo(d);
  assert.equal(d.entradaMin, 840);
  assert.equal(d.intervaloInicioMin, 1080);
  assert.equal(d.intervaloFimMin, 1140);
  assert.deepEqual(lacunas(c, [pessoa(1, "Atendente", [d])]), [
    ["2026-10-31", "Atendente", 1080, 1140, 1, 0, 1],
  ]);
});
test("pausa é antecipada quando a jornada individual termina antes do almoço padrão", () => {
  const c = config([demanda({ inicio: "08:00", fim: "11:00", minimo: 1 })]);
  const d = dia({ turno: "A", horas: 2 });
  createDomain(c).atualizarHorarioEfetivo(d);
  assert.equal(d.intervaloInicioMin, 600);
  assert.equal(d.saidaMin, 660);
  assert.deepEqual(lacunas(c, [pessoa(1, "Atendente", [d])]), [
    ["2026-10-31", "Atendente", 600, 660, 1, 0, 1],
  ]);
});
test("cobertura desativada ignora as demandas sem apagar as configurações", () => {
  const c = config([demanda()]);
  c.coberturaAtiva = false;
  const antes = structuredClone(c.demandasCobertura);
  assert.deepEqual(analisarCobertura(c, []).lacunas, []);
  assert.equal(analisarCobertura(c, []).configurada, false);
  assert.deepEqual(c.demandasCobertura, antes);
  c.coberturaAtiva = true;
  assert.equal(analisarCobertura(c, []).lacunas.length, 1);
});
test("migração mantém cobertura antiga ativa e respeita desativação explícita", () => {
  for (const explicitamenteDesligada of [false, true]) {
    const inicial = createDefaultState();
    const state = structuredClone(inicial);
    const antigo = { ...inicial, demandasCobertura: [demanda()] };
    delete antigo.coberturaAtiva;
    if (explicitamenteDesligada) antigo.coberturaAtiva = false;
    const persistence = createPersistence({
      state,
      initialState: inicial,
      storage: { getItem: () => JSON.stringify(antigo) },
    });
    assert.equal(persistence.loadState(), true);
    assert.equal(state.coberturaAtiva, !explicitamenteDesligada);
  }
});
test("revezamento mantém o grupo durante a semana e inverte na segunda-feira", () => {
  const c = config([]);
  c.turnosRevezamento = true;
  const domain = createDomain(c);
  const a = domain.obterTurno(new Date(2026, 9, 19), 0);
  assert.equal(domain.obterTurno(new Date(2026, 9, 25), 0), a);
  assert.notEqual(domain.obterTurno(new Date(2026, 9, 26), 0), a);
  assert.notEqual(domain.obterTurno(new Date(2026, 9, 19), 1), a);
  c.turnosRevezamento = false;
  assert.equal(domain.obterTurno(new Date(2026, 9, 19), 0), "A");
});

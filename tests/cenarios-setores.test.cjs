const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState,
  createDomain,
  normalizarJornada,
  jornadaValidaEstrutural,
  timeToMin,
  gerarCsv;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  ({ normalizarJornada, jornadaValidaEstrutural, timeToMin } = await import(
    "../assets/js/domain/datas-horas.js"
  ));
  ({ gerarCsv } = await import("../assets/js/export/csv.js"));
});
function negocio(extra = {}) {
  const state = {
    ...createDefaultState(new Date(2028, 1, 7)),
    tipoEscala: "5x2",
    diasTrabalho: [1, 2, 3, 4, 5],
    folgasFimSemana: true,
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "17:00",
    },
    colaboradores: [
      {
        id: 1,
        nome: "Pessoa de teste",
        sexo: "masculino",
        cargo: "Atendente",
        horasSemana: 40,
        ec141: {
          salarioAnterior: 3000,
          salarioAtual: 3000,
          pisoAnterior: 2000,
          pisoAtual: 2000,
        },
      },
    ],
    ...extra,
  };
  const domain = createDomain(state);
  const semana = (inicio = new Date(2028, 1, 7), fim = new Date(2028, 1, 13)) =>
    domain.gerarEscalaColaborador(state.colaboradores[0], 0, inicio, fim, {});
  return { state, domain, semana };
}
function demanda(
  funcao,
  inicio,
  fim,
  diasSemana = [1, 2, 3, 4, 5],
  minimo = 1,
) {
  return {
    id: 1,
    funcao,
    inicio,
    fim,
    diasSemana,
    minimo,
    incluirFeriados: true,
  };
}
function exigirSemErros(e, dias) {
  const issues = e.domain.validarLegal(e.state.colaboradores[0], dias);
  assert.deepEqual(
    issues.filter((i) => i.severidade === "erro"),
    [],
  );
}
test("Padaria: produção 22h–7h com pausa 2h–3h é jornada noturna válida de 8h", () => {
  const e = negocio({
    jornada: {
      entrada: "22:00",
      intInicio: "02:00",
      intFim: "03:00",
      saida: "07:00",
    },
  });
  assert.equal(jornadaValidaEstrutural(e.state.jornada), true);
  const dias = e.semana();
  const d = dias[0];
  assert.equal(d.horas, 8);
  assert.equal(d.saidaMin, 1860);
  assert.equal(d.intervaloInicioMin, 1560);
  assert.equal(d.intervaloFimMin, 1620);
  exigirSemErros(e, dias);
});
test("Restaurante: pausa 23h45–0h15 conserva30min sem contar intervalo como presença", () => {
  const e = negocio({
    jornada: {
      entrada: "20:00",
      intInicio: "23:45",
      intFim: "00:15",
      saida: "04:30",
    },
    coberturaAtiva: true,
    demandasCobertura: [demanda("Atendente", "23:30", "00:30", [1])],
  });
  assert.equal(e.domain.calcHorasDia(1), 8);
  const dias = e.semana();
  assert.equal(dias[0].intervaloMin, 30);
  assert.equal(dias[0].saidaMin, 1710);
  const lacunas = e.domain
    .analisarCobertura([{ colaborador: e.state.colaboradores[0], dias }])
    .lacunas.filter((f) => ["2028-02-07", "2028-02-08"].includes(f.data));
  assert.deepEqual(
    lacunas.map((f) => [f.data, f.inicioMin, f.fimMin]),
    [
      ["2028-02-07", 1425, 1440],
      ["2028-02-08", 0, 15],
    ],
  );
  assert.ok(
    e.domain
      .validarIntervalosIntrajornada(e.state.colaboradores[0], dias)
      .some((i) => i.tipo === "INTRAJORNADA"),
  );
});
test("Farmácia: turno único 22h–6h termina no dia seguinte e não cria intervalo", () => {
  const e = negocio({
    jornada: {
      entrada: "22:00",
      intInicio: "06:00",
      intFim: "06:00",
      saida: "06:00",
    },
  });
  assert.equal(jornadaValidaEstrutural(e.state.jornada), true);
  assert.equal(e.domain.calcHorasDia(1), 8);
  const d = e.semana()[0];
  assert.equal(d.saidaMin, 1800);
  assert.equal(d.intervaloMin, 0);
});
test("Padaria: turno único legado 22h/2h/0h/0h representa quatro horas de trabalho", () => {
  const j = {
    entrada: "22:00",
    intInicio: "02:00",
    intFim: "00:00",
    saida: "00:00",
  };
  const e = negocio({ jornada: j });
  assert.equal(e.domain.calcHorasDia(1), 4);
  assert.equal(jornadaValidaEstrutural(j), true);
});
test("Comércio: horários fora do relógio e jornadas de duração nula ou acima de24h não são válidos", () => {
  for (const valor of ["24:00", "08:99", "-1:00", "99:30"])
    assert.ok(Number.isNaN(timeToMin(valor)), valor);
  for (const j of [
    { entrada: "08:00", intInicio: "08:00", intFim: "08:00", saida: "08:00" },
    { entrada: "22:00", intInicio: "23:00", intFim: "22:30", saida: "23:30" },
  ])
    assert.equal(jornadaValidaEstrutural(j), false);
});
test("Supermercado: feriado trabalhado continua trabalhado após visitar outro mês", () => {
  const e = negocio({ ano: 2026, mes: 9 });
  e.domain.inicializarFeriadosDoMes();
  e.state.feriados.find((f) => f.dia === 12).trabalhado = true;
  e.state.mes = 10;
  e.domain.inicializarFeriadosDoMes();
  e.state.mes = 9;
  e.domain.inicializarFeriadosDoMes();
  assert.equal(e.state.feriados.find((f) => f.dia === 12).trabalhado, true);
});
test("Loja: feriado da semana anterior conserva opção de trabalho na geração e na cobertura", () => {
  const e = negocio({
    ano: 2026,
    mes: 9,
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgasFimSemana: false,
    tipoEscala: "custom",
  });
  e.domain.inicializarFeriadosDoMes();
  e.state.feriados.find((f) => f.dia === 12).trabalhado = true;
  e.state.mes = 10;
  e.domain.inicializarFeriadosDoMes();
  assert.equal(e.domain.feriadoDaData("2026-10-12").trabalhado, true);
  const dados = e.domain.gerarDadosEscala();
  assert.ok(
    !dados.resultado[0].dias.some(
      (d) => d.data === "2026-11-02" && d.status === "T",
    ),
  );
});
test("Comércio: feriado removido deixa de reaparecer na geração, consulta e próxima visita ao mês", () => {
  const e = negocio({ ano: 2026, mes: 9 });
  e.domain.inicializarFeriadosDoMes();
  // Mesmo estado produzido pelo botão Remover após confirmação da política local.
  e.state.feriados = e.state.feriados.filter((f) => f.dia !== 12);
  e.state.feriadosExcluidos = ["2026-10-12"];
  assert.equal(e.domain.feriadoDaData("2026-10-12"), null);
  const d = e.domain
    .gerarDadosEscala()
    .resultado[0].dias.find((d) => d.data === "2026-10-12");
  assert.equal(d.feriado, null);
  assert.equal(d.status, "T");
  e.state.mes = 10;
  e.domain.inicializarFeriadosDoMes();
  e.state.mes = 9;
  e.domain.inicializarFeriadosDoMes();
  assert.ok(!e.state.feriados.some((f) => f.dia === 12));
});
test("Comércio: API direta e cobertura usam o mesmo calendário nacional sem depender da tela inicial", () => {
  const e = negocio({
    ano: 2026,
    mes: 9,
    coberturaAtiva: true,
    demandasCobertura: [
      { ...demanda("Atendente", "09:00", "10:00"), incluirFeriados: false },
    ],
  });
  const dados = e.domain.gerarDadosEscala();
  assert.ok(
    !dados.coberturaOperacional.periodos.some((f) => f.data === "2026-10-12"),
  );
});
test("Clínica: geração com datas ao meio-dia não perde a primeira e última jornada", () => {
  const e = negocio();
  const dias = e.semana(new Date(2028, 1, 7, 12), new Date(2028, 1, 13, 12));
  assert.equal(dias.length, 7);
  assert.equal(dias[0].data, "2028-02-07");
  assert.equal(dias.at(-1).data, "2028-02-13");
});
test("Loja: edição manual de trabalho com zero horas exige correção explícita", () => {
  const e = negocio();
  const dias = e.semana();
  dias[0].horas = 0;
  assert.ok(
    e.domain
      .validarJornadaDiaria(e.state.colaboradores[0], dias)
      .some((i) => i.tipo === "TRABALHO_SEM_HORAS" && i.severidade === "erro"),
  );
});

test("Padaria: dois padeiros não cobrem a função de atendente", () => {
  const e = negocio({
    coberturaAtiva: true,
    demandasCobertura: [demanda("Atendente", "05:00", "06:00", [1])],
    jornada: {
      entrada: "05:00",
      intInicio: "09:00",
      intFim: "10:00",
      saida: "14:00",
    },
  });
  e.state.colaboradores = [
    { ...e.state.colaboradores[0], cargo: "Padeiro" },
    { ...e.state.colaboradores[0], id: 2, cargo: "Padeiro" },
  ];
  const relatorio = e.domain.gerarDadosEscala().coberturaOperacional;
  const lacuna = relatorio.lacunas.find((f) => f.data === "2028-02-07");
  assert.equal(lacuna.presentes, 0);
  assert.equal(lacuna.faltantes, 1);
});
test("Clínica: equipe de30h deixa descoberto o fim da operação, sem fabricar presença", () => {
  const e = negocio({
    coberturaAtiva: true,
    demandasCobertura: [demanda("Atendente", "15:00", "17:00", [1])],
  });
  e.state.colaboradores[0].horasSemana = 30;
  const relatorio = e.domain.gerarDadosEscala().coberturaOperacional;
  assert.deepEqual(
    relatorio.lacunas
      .filter((f) => f.data === "2028-02-07")
      .map((f) => [f.inicioMin, f.fimMin, f.faltantes]),
    [[900, 1020, 1]],
  );
});
test("Loja: sábado de4h e quarta de folga só comportam36h na semana de5x2", () => {
  const e = negocio({
    folgasFimSemana: false,
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    folgaTipo: "fixa",
    folgaDiasPermitidos: [3],
    horarioPorDia: true,
    jornadaPorDia: {
      6: {
        entrada: "08:00",
        intInicio: "12:00",
        intFim: "00:00",
        saida: "00:00",
      },
    },
  });
  const dias = e.semana();
  assert.equal(
    dias.reduce((s, d) => s + d.horas, 0),
    36,
  );
  assert.equal(dias[5].saidaMin, 720);
  assert.ok(
    e.domain
      .validarJornadaSemanal(e.state.colaboradores[0], dias)
      .some(
        (i) => i.tipo === "JORNADA_CONTRATUAL" && i.severidade === "alerta",
      ),
  );
});
test("Restaurante: CSV preserva data da saída após meia-noite", () => {
  const e = negocio({
    jornada: {
      entrada: "17:00",
      intInicio: "21:00",
      intFim: "22:00",
      saida: "02:00",
    },
  });
  e.state.escalaGerada = e.domain.gerarDadosEscala();
  const csv = gerarCsv(e.state);
  assert.match(csv, /Data da saída/);
  assert.match(csv, /2028-02-07;T;17:00;02:00;.*;2028-02-08/);
});
test("Supermercado: virar do turno B dominical para A na segunda mantém alerta de descanso curto", () => {
  const e = negocio({
    ano: 2026,
    mes: 9,
    tipoEscala: "6x1",
    folgasFimSemana: false,
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgaDiasPermitidos: [2],
    turnosRevezamento: true,
  });
  const dados = e.domain.gerarDadosEscala();
  assert.ok(dados.validacoes[0].issues.some((i) => i.tipo === "INTERJORNADA"));
});
const perfis = [
  {
    nome: "Padaria manhã",
    jornada: {
      entrada: "05:00",
      intInicio: "09:00",
      intFim: "10:00",
      saida: "14:00",
    },
    diasTrabalho: [0, 2, 3, 4, 5, 6],
    folgasFimSemana: false,
    funcoes: ["Padeiro", "Atendente"],
    demanda: ["05:00", "14:00"],
  },
  {
    nome: "Supermercado dois turnos",
    tipoEscala: "6x1",
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgasFimSemana: false,
    turnosRevezamento: true,
    entradaTurnoB: "13:00",
    jornada: {
      entrada: "07:00",
      intInicio: "11:00",
      intFim: "12:00",
      saida: "16:00",
    },
    funcoes: ["Caixa", "Caixa", "Repositor", "Repositor"],
    demanda: ["07:00", "22:00"],
  },
  {
    nome: "Farmácia plantões noturnos",
    tipoEscala: "12x36",
    folgasFimSemana: false,
    jornada: {
      entrada: "19:00",
      intInicio: "00:00",
      intFim: "01:00",
      saida: "07:00",
    },
    funcoes: ["Farmacêutico", "Farmacêutico", "Atendente", "Atendente"],
    demanda: ["19:00", "07:00"],
  },
  {
    nome: "Loja sábado reduzido",
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    folgasFimSemana: false,
    horarioPorDia: true,
    jornadaPorDia: {
      6: {
        entrada: "08:00",
        intInicio: "12:00",
        intFim: "00:00",
        saida: "00:00",
      },
    },
    funcoes: ["Vendedor", "Supervisor"],
    demanda: ["09:00", "17:00"],
  },
  {
    nome: "Clínica tempo parcial",
    horas: 30,
    funcoes: ["Recepcionista", "Técnico"],
    demanda: ["08:00", "17:00"],
  },
  {
    nome: "Restaurante madrugada",
    jornada: {
      entrada: "17:00",
      intInicio: "21:00",
      intFim: "22:00",
      saida: "02:00",
    },
    diasTrabalho: [0, 2, 3, 4, 5, 6],
    folgasFimSemana: false,
    funcoes: ["Cozinheiro", "Atendente"],
    demanda: ["17:00", "02:00"],
  },
];
const periodos = [
  [2026, 1],
  [2026, 9],
  [2026, 11],
  [2027, 11],
  [2028, 1],
  [2028, 11],
];
for (const perfil of perfis)
  for (const [ano, mes] of periodos)
    for (const politicaFeriados of ["conta_folga", "adicional"]) {
      test(`Matriz setorial: ${perfil.nome} · ${ano}-${mes + 1} · ${politicaFeriados}`, () => {
        const { nome, funcoes, demanda: faixa, horas = 40, ...config } = perfil;
        const e = negocio({
          ...config,
          ano,
          mes,
          politicaFeriados,
          coberturaAtiva: true,
        });
        e.state.colaboradores = funcoes.map((cargo, i) => ({
          ...e.state.colaboradores[0],
          id: i + 1,
          nome: `Pessoa ${i + 1}`,
          cargo,
          horasSemana: horas,
        }));
        e.state.demandasCobertura = [...new Set(funcoes)].map((cargo, i) => ({
          ...demanda(cargo, ...faixa, e.state.diasTrabalho),
          id: i + 1,
        }));
        e.domain.inicializarFeriadosDoMes();
        const dados = e.domain.gerarDadosEscala();
        assert.equal(dados.resultado.length, funcoes.length);
        for (const r of dados.resultado) {
          let anteriores = 0;
          for (const d of [...r.diasContexto, ...r.dias]) {
            if (["T", "FE"].includes(d.status)) {
              anteriores++;
              assert.ok(anteriores <= 6);
              assert.ok(
                Number.isFinite(d.entradaMin) &&
                  Number.isFinite(d.saidaMin) &&
                  d.horas > 0,
              );
              assert.ok(
                Math.abs(
                  (d.saidaMin - d.entradaMin - d.intervaloMin) / 60 - d.horas,
                ) < 0.001,
              );
              if (e.state.tipoEscala === "12x36")
                assert.equal(d.saidaMin - d.entradaMin, 720);
            } else {
              anteriores = 0;
              assert.equal(d.horas, 0);
            }
          }
          for (let i = 0; i < r.dias.length; i += 7) {
            const semana = r.dias.slice(i, i + 7);
            const computadas = semana.reduce(
              (s, d) =>
                s +
                d.horas +
                (d.status === "F" &&
                d.previsto &&
                d.feriado &&
                !d.feriado.trabalhado
                  ? d.horasPrevistas
                  : 0),
              0,
            );
            if (e.state.tipoEscala !== "12x36")
              assert.ok(
                computadas <= horas + 0.01,
                `carga inventada em ${semana[0].data}`,
              );
          }
          assert.ok(
            !e.domain
              .validarLegal(
                r.colaborador,
                r.dias,
                r.diasContexto,
                r.diasApuracao,
              )
              .some((i) => i.tipo === "HORARIO_INVALIDO"),
          );
        }
        const relatorio = dados.coberturaOperacional;
        assert.ok(relatorio.periodos.length > 0);
        for (const f of relatorio.periodos) {
          assert.ok(
            f.presentes <= funcoes.filter((c) => c === f.funcao).length,
          );
          assert.ok(
            f.inicioMin >= 0 && f.fimMin <= 1440 && f.fimMin > f.inicioMin,
          );
        }
        const semEquipe = e.domain.analisarCobertura([]);
        assert.ok(
          semEquipe.periodos.every(
            (f) => f.presentes === 0 && f.faltantes === f.necessarios,
          ),
        );
      });
    }

test("Padaria noturna: hora reduzida e adicional não recebem aprovação a partir de horas-relógio", () => {
  const e = negocio({
    jornada: {
      entrada: "22:00",
      intInicio: "02:00",
      intFim: "03:00",
      saida: "07:00",
    },
  });
  assert.ok(
    e.domain
      .validarLegal(e.state.colaboradores[0], e.semana())
      .some(
        (i) => i.tipo === "TRABALHO_NOTURNO" && i.severidade === "pendencia",
      ),
  );
  e.state.jornada = {
    entrada: "05:00",
    intInicio: "09:00",
    intFim: "10:00",
    saida: "14:00",
  };
  assert.ok(
    !e.domain
      .validarLegal(e.state.colaboradores[0], e.semana())
      .some((i) => i.tipo === "TRABALHO_NOTURNO"),
  );
});

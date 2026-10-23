const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let base,
  domain,
  buscar,
  aplicar,
  desfazer,
  assinatura,
  analisar,
  naoPiora,
  csv,
  converter,
  comparar;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({
    buscarAjustesCobertura: buscar,
    aplicarAjustesCobertura: aplicar,
    desfazerAjustesCobertura: desfazer,
    assinaturaAjustes: assinatura,
    coberturaNaoPiora: naoPiora,
  } = await import("../assets/js/domain/ajustes-cobertura.js"));
  ({ analisarCobertura: analisar } = await import(
    "../assets/js/domain/cobertura.js"
  ));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ converterEscala: converter, compararConversao: comparar } = await import(
    "../assets/js/domain/conversao.js"
  ));
});
function config(n = 2, extra = {}) {
  const s = base(new Date(2026, 9, 26));
  Object.assign(s, {
    diaInicio: 26,
    tipoEscala: "5x2",
    diasTrabalho: [1, 2, 3, 4, 5],
    modoRegime: "simulacao",
    regimeJornada: "definitivo40",
    coberturaAtiva: true,
    feriados: [],
    feriadosExcluidos: ["2026-10-12"],
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "18:00",
    },
    ...extra,
  });
  s.colaboradores = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    nome: `Pessoa ${i + 1}`,
    cargo: "Atendente",
    sexo: "masculino",
    horasSemana: 40,
  }));
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "18:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
  ];
  return s;
}
function gerar(s) {
  s.escalaGerada = domain(s).gerarDadosEscala();
  return s;
}
const erro = (r) => r.issues.filter((i) => i.severidade === "erro");
function conferir(s, p) {
  const novo = aplicar(s, p);
  assert.ok(novo.validacoes.every((v) => !erro(v).length));
  assert.ok(
    naoPiora(s.escalaGerada.coberturaOperacional, novo.coberturaOperacional),
  );
  return novo;
}
test("ajusta entrada/saída e pausa de atendentes para cobrir almoço e fechamento, sem aumentar horas", () => {
  const s = gerar(config()),
    antes = structuredClone(s);
  const p = buscar(s);
  assert.deepEqual(s, antes);
  assert.ok(p.alteracoes.length);
  assert.equal(p.depois.minutosFaltantes, 0);
  const novo = conferir(s, p);
  assert.ok(
    novo.resultado.some((r) =>
      r.dias.some((d) => d.entradaMin === 540 && d.saidaMin === 1080),
    ),
  );
  for (let i = 0; i < novo.resultado.length; i++)
    assert.equal(
      novo.resultado[i].dias.reduce((s, d) => s + d.horas, 0),
      s.escalaGerada.resultado[i].dias.reduce((s, d) => s + d.horas, 0),
    );
  s.escalaGerada = novo;
  assert.match(csv(s), /Função alocada no dia/);
  assert.match(csv(s), /Ajuste de cobertura aplicado/);
});
test("troca a folga com um dia de trabalho na mesma semana, mantendo cinco dias e 40 horas", () => {
  const s = config(1, {
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    folgaTipo: "rotativa",
  });
  gerar(s);
  const livre = s.escalaGerada.resultado[0].dias.find(
    (d) => d.status === "F" && d.weekday > 0 && d.weekday < 6,
  );
  assert.ok(livre);
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    inicio: "09:00",
    fim: "12:00",
    diasSemana: [livre.weekday],
  };
  gerar(s);
  const p = buscar(s);
  assert.ok(p.acoes.some((a) => a.tipo === "folga"));
  assert.equal(p.depois.minutosFaltantes, 0);
  const novo = conferir(s, p);
  assert.equal(
    novo.resultado[0].dias.filter((d) => ["T", "FE"].includes(d.status)).length,
    5,
  );
  assert.equal(
    novo.resultado[0].dias.reduce((a, d) => a + d.horas, 0),
    40,
  );
});
function habilitados(habilitar = true) {
  const s = config(3);
  s.colaboradores[0].cargo = "Caixa";
  s.colaboradores[1].cargo = "Supervisor";
  s.colaboradores[2].cargo = "Supervisor";
  if (habilitar) s.colaboradores[1].funcoesHabilitadas = ["Caixa"];
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Caixa",
      inicio: "09:00",
      fim: "12:00",
      minimo: 2,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
    {
      id: 2,
      funcao: "Supervisor",
      inicio: "09:00",
      fim: "12:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
  ];
  return gerar(s);
}
test("realoca supervisor habilitado para caixa sem descobrir a supervisão nem contar duas vezes", () => {
  const s = habilitados(),
    p = buscar(s);
  assert.equal(p.depois.minutosFaltantes, 0);
  assert.ok(p.acoes.some((a) => a.tipo === "funcao"));
  const novo = conferir(s, p);
  assert.ok(novo.resultado[1].dias.some((d) => d.funcaoAlocada === "Caixa"));
  assert.ok(
    novo.coberturaOperacional.periodos
      .filter((p) => p.funcao === "Supervisor")
      .every((p) => p.presentes === 1),
  );
});
test("sem habilitação adicional não presume que um supervisor pode exercer função de caixa", () => {
  const s = habilitados(false),
    p = buscar(s);
  assert.equal(p.alteracoes.length, 0);
  assert.ok(p.depois.minutosFaltantes > 0);
});
test("habilitação não representa presença simultânea em duas funções", () => {
  const s = habilitados();
  s.colaboradores = s.colaboradores.slice(1, 2);
  gerar(s);
  const rel = analisar(s, s.escalaGerada.resultado);
  assert.ok(
    rel.periodos
      .filter((p) => p.funcao === "Caixa")
      .every((p) => p.presentes === 0),
  );
  for (const d of s.escalaGerada.resultado[0].dias) d.funcaoAlocada = "Caixa";
  const novo = analisar(s, s.escalaGerada.resultado);
  assert.ok(
    novo.periodos
      .filter((p) => p.funcao === "Supervisor")
      .every((p) => p.presentes === 0),
  );
});
test("alocação sem habilitação é sinalizada e não conta para cobertura", () => {
  const s = gerar(config(1));
  s.escalaGerada.resultado[0].dias[0].funcaoAlocada = "Supervisor";
  const rel = analisar(s, s.escalaGerada.resultado);
  assert.ok(rel.avisos.some((a) => a.includes("habilitação")));
  assert.throws(() => buscar(s), /avisos/);
});
test("não fecha uma função transferindo a falta para outra função, mesmo que diminua o total", () => {
  const s = habilitados();
  s.colaboradores.pop();
  gerar(s);
  const p = buscar(s);
  assert.equal(p.alteracoes.length, 0);
});
test("não abre novas lacunas em outros horários para reduzir o total", () => {
  const f = (inicioMin, fimMin, faltantes) => ({
    data: "2026-10-26",
    funcao: "Atendente",
    inicioMin,
    fimMin,
    faltantes,
  });
  assert.equal(
    naoPiora(
      { lacunas: [f(600, 660, 1)] },
      { avisos: [], lacunas: [f(600, 630, 1), f(700, 710, 1)] },
    ),
    false,
  );
  assert.equal(
    naoPiora(
      { lacunas: [f(600, 660, 2)] },
      { avisos: [], lacunas: [f(620, 640, 1)] },
    ),
    true,
  );
});
test("folga obrigatória, indisponibilidade, férias e afastamento são preservados", () => {
  for (const tipo of ["folga", "indisponivel", "ferias", "afastamento"]) {
    const s = config(1);
    s.colaboradores[0].restricoes = {
      periodos: [{ tipo, inicio: "2026-10-26", fim: "2026-10-30" }],
    };
    gerar(s);
    const p = buscar(s);
    assert.equal(p.alteracoes.length, 0, tipo);
  }
});
test("janela permitida e limite operacional impedem prolongar expediente", () => {
  const s = config(2);
  s.colaboradores.forEach(
    (c) =>
      (c.restricoes = {
        horariosPermitidos: [1, 2, 3, 4, 5].map((dia) => ({
          dia,
          entrada: "08:00",
          saida: "17:00",
        })),
      }),
  );
  gerar(s);
  const p = buscar(s);
  assert.ok(p.alteracoes.every((a) => a.depois.saidaMin <= 1020));
  assert.ok(p.depois.minutosFaltantes >= 300);
  const fechado = config(2, {
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "17:00",
    },
  });
  gerar(fechado);
  assert.equal(buscar(fechado).alteracoes.length, 0);
});
test("folgas de fim de semana e dias editados manualmente não são mudados", () => {
  const s = config(1, {
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgasFimSemana: true,
  });
  s.demandasCobertura[0].diasSemana = [0, 6];
  gerar(s);
  assert.equal(buscar(s).alteracoes.length, 0);
  const m = gerar(config());
  for (const r of m.escalaGerada.resultado)
    for (const d of r.dias) d.ajusteManual = true;
  const p = buscar(m);
  assert.equal(p.alteracoes.length, 0);
  assert.ok(p.explicacoes.some((t) => t.includes("manualmente")));
});
test("contexto de interjornada impede troca para turno B após jornada noturna anterior", () => {
  const s = config(1, { turnosRevezamento: true, entradaTurnoB: "20:00" });
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [{ dia: 1, entrada: "08:00", saida: "17:00" }],
  };
  gerar(s);
  const p = buscar(s);
  if (p.alteracoes.length) {
    const novo = conferir(s, p);
    assert.ok(
      novo.validacoes.every(
        (v) =>
          !v.issues.some(
            (i) => i.tipo === "INTERJORNADA" && i.severidade === "erro",
          ),
      ),
    );
  } else assert.ok(p.depois.minutosFaltantes > 0);
});
test("12x36 não é deslocado automaticamente e mantém âncora", () => {
  const s = config(1, {
    tipoEscala: "12x36",
    ancora12x36: "2026-10-26",
    jornada: {
      entrada: "07:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "19:00",
    },
  });
  gerar(s);
  const p = buscar(s);
  assert.equal(p.alteracoes.length, 0);
  assert.ok(p.explicacoes.some((t) => t.includes("12×36")));
  assert.equal(s.ancora12x36, "2026-10-26");
});
test("busca limitada e determinística, inclusive quando não há solução suficiente", () => {
  const s = gerar(config()),
    a = buscar(s, { limiteTentativas: 2 }),
    b = buscar(s, { limiteTentativas: 2 });
  assert.deepEqual(a, b);
  assert.ok(a.tentativas <= 2);
  assert.ok(a.explicacoes.some((t) => t.includes("limite")));
});
test("não aplica sugestões obsoletas após editar escala, demanda ou habilitação", () => {
  for (const alterar of [
    (s) => (s.escalaGerada.resultado[0].dias[0].horas = 7),
    (s) => (s.demandasCobertura[0].minimo = 2),
    (s) => (s.colaboradores[0].funcoesHabilitadas = ["Supervisor"]),
  ]) {
    const s = gerar(config()),
      p = buscar(s);
    alterar(s);
    assert.throws(() => aplicar(s, p), /mudou/);
  }
});
test("aplicar/desfazer após JSON conserva contexto e apuração; alterações posteriores impedem desfazer", () => {
  const s = JSON.parse(JSON.stringify(gerar(config()))),
    orig = structuredClone(s.escalaGerada.resultado),
    p = buscar(s);
  s.escalaGerada = aplicar(s, p);
  for (const a of p.alteracoes) {
    const r = s.escalaGerada.resultado.find(
      (r) => r.colaborador.id === a.colaboradorId,
    );
    assert.deepEqual(
      r.dias.find((d) => d.data === a.data),
      r.diasApuracao.find((d) => d.data === a.data),
    );
  }
  const restaurado = JSON.parse(JSON.stringify(s));
  restaurado.escalaGerada = desfazer(restaurado);
  assert.deepEqual(restaurado.escalaGerada.resultado, orig);
  s.escalaGerada.resultado[0].dias[0].ajusteManual = true;
  assert.throws(() => desfazer(s), /posteriores/);
});
test("recusa plano adulterado e exige cobertura ativa, escala atual e faixas válidas", () => {
  const s = gerar(config()),
    p = buscar(s);
  p.alteracoes[0].depois.horas = 20;
  assert.throws(() => aplicar(s, p), /conferência/);
  const sem = config();
  assert.throws(() => buscar(sem), /Gere uma escala/);
  gerar(sem);
  sem.coberturaAtiva = false;
  assert.throws(() => buscar(sem), /Ative/);
  s.escalaGerada.versaoRegras = "old";
  assert.throws(() => buscar(s), /regras atuais/);
});
test("pausa explícita de jornada recortada por restrição é respeitada pela cobertura", () => {
  const s = config(1);
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [{ dia: 1, entrada: "10:00", saida: "17:00" }],
  };
  gerar(s);
  const rel = analisar(s, s.escalaGerada.resultado);
  assert.ok(
    rel.lacunas.some(
      (l) => l.data === "2026-10-26" && l.inicioMin === 720 && l.fimMin === 780,
    ),
  );
  assert.ok(
    !rel.lacunas.some(
      (l) => l.data === "2026-10-26" && l.inicioMin === 840 && l.fimMin === 900,
    ),
  );
});
test("busca na proposta usa janela original, preserva origem e atualiza diagnóstico após aplicar", () => {
  const s = config(2, {
    diaInicio: 1,
    tipoEscala: "6x1",
    diasTrabalho: [1, 2, 3, 4, 5, 6],
  });
  const c = converter(s, {
      periodo: "2026-12",
      fase: "definitivo40",
      folgas: "fim_semana",
    }),
    cfg = c.proposta.config;
  const origem = structuredClone(c.origem);
  const p = buscar(cfg, { limiteAcoes: 4 });
  assert.ok(p.alteracoes.length);
  cfg.escalaGerada = aplicar(cfg, p);
  c.comparacao = comparar(c);
  assert.deepEqual(c.origem, origem);
  assert.ok(c.comparacao.faltantesDepois < p.antes.minutosFaltantes / 60);
});

test("turno noturno só é deslocado quando mantém 11 horas até a jornada seguinte", () => {
  function noturno(entradaTerca) {
    const s = config(1, {
      horarioPorDia: true,
      jornadaPorDia: {
        1: {
          entrada: "17:00",
          intInicio: "05:00",
          intFim: "05:00",
          saida: "05:00",
        },
        2: {
          entrada: entradaTerca,
          intInicio: entradaTerca === "08:00" ? "12:00" : "17:00",
          intFim: entradaTerca === "08:00" ? "12:00" : "17:00",
          saida: entradaTerca === "08:00" ? "12:00" : "17:00",
        },
        3: {
          entrada: "08:00",
          intInicio: "12:00",
          intFim: "12:00",
          saida: "12:00",
        },
        4: {
          entrada: "08:00",
          intInicio: "12:00",
          intFim: "12:00",
          saida: "12:00",
        },
        5: {
          entrada: "08:00",
          intInicio: "12:00",
          intFim: "12:00",
          saida: "12:00",
        },
      },
    });
    s.colaboradores[0].horasSemana = 20;
    s.demandasCobertura[0] = {
      ...s.demandasCobertura[0],
      inicio: "22:00",
      fim: "02:00",
      diasSemana: [1],
    };
    return gerar(s);
  }
  const cedo = noturno("08:00");
  assert.ok(cedo.escalaGerada.validacoes.every((v) => !erro(v).length));
  assert.equal(buscar(cedo).alteracoes.length, 0);
  const tarde = noturno("13:00"),
    p = buscar(tarde);
  assert.ok(p.alteracoes.length);
  const novo = conferir(tarde, p);
  assert.ok(novo.resultado[0].dias.some((d) => d.saidaMin > 1440));
});

test("trocar uma folga não pode criar sete dias consecutivos na fronteira entre semanas", () => {
  const s = config(1, {
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgaDiasPermitidos: [5],
    folgaTipo: "rotativa",
  });
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    inicio: "09:00",
    fim: "12:00",
    diasSemana: [1],
  };
  gerar(s);
  const r = s.escalaGerada.resultado[0];
  for (const campo of ["diasContexto", "dias"])
    for (const d of r[campo]) {
      const folga =
        d.data < "2026-10-26"
          ? [1, 2].includes(d.weekday)
          : [1, 6].includes(d.weekday);
      d.status = folga ? "F" : "T";
      d.previsto = !folga;
      d.previstoOriginal = !folga;
      d.horas = folga ? 0 : 8;
      if (!folga && d.data >= "2026-10-26" && d.weekday !== 5)
        d.ajusteManual = true;
      domain(s).atualizarHorarioEfetivo(d);
    }
  assert.ok(
    !domain(s)
      .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
      .some((i) => i.severidade === "erro"),
  );
  assert.equal(buscar(s).alteracoes.length, 0);
});

test("informação de progresso cresce sem modificar a escala", () => {
  const s = gerar(config()),
    fases = [];
  const p = buscar(s, { onProgresso: (v) => fases.push(v) });
  assert.ok(fases.length >= 2);
  assert.equal(fases[0].tentativas, 0);
  assert.equal(fases.at(-1).tentativas, p.tentativas);
  assert.ok(
    fases.every((f, i) => i === 0 || f.tentativas >= fases[i - 1].tentativas),
  );
});

test("alternativa de turno B utiliza apenas a janela declarada e preserva descanso", () => {
  const s = config(2, { turnosRevezamento: true, entradaTurnoB: "14:00" });
  const indice = domain(s).obterTurno(new Date(2026, 9, 26), 0) === "A" ? 0 : 1;
  s.colaboradores[1 - indice].cargo = "Supervisor";
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    inicio: "18:00",
    fim: "21:00",
  };
  gerar(s);
  const p = buscar(s);
  assert.ok(
    p.alteracoes.some(
      (a) =>
        a.colaboradorId === s.colaboradores[indice].id &&
        a.depois.turno === "B",
    ),
  );
  const novo = conferir(s, p);
  assert.ok(
    novo.resultado[indice].dias
      .filter((d) => d.ajusteAutomatico)
      .every((d) => d.saidaMin <= 1440),
  );
});

test("rejeita alterar o conteúdo anterior do plano usado para desfazer", () => {
  const s = gerar(config()),
    p = buscar(s);
  p.alteracoes[0].antes.horas = 100;
  assert.throws(() => aplicar(s, p), /conferência/);
});

test("cadastro Domínio preserva a janela individual na busca de horários", () => {
  const s = config(2);
  for (const c of s.colaboradores)
    c.quadroDominio = {
      ativo: true,
      tipo: "semanal",
      modelo: "5x2",
      semana: Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((d) => [
          d,
          [0, 6].includes(d)
            ? { status: "folga" }
            : {
                status: "trabalho",
                jornada: {
                  entrada: "08:00",
                  intInicio: "12:00",
                  intFim: "13:00",
                  saida: "17:00",
                },
              },
        ]),
      ),
      ciclo: {},
      pendencias: [],
    };
  gerar(s);
  assert.equal(buscar(s).alteracoes.length, 0);
});

test("feriado dispensado e admissão não são convertidos em disponibilidade para cobertura", () => {
  const s = config(1);
  s.colaboradores[0].quadroDominio = {
    ativo: true,
    tipo: "semanal",
    modelo: "5x2",
    admissaoIso: "2026-10-28",
    semana: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [
        d,
        [0, 6].includes(d)
          ? { status: "folga" }
          : { status: "trabalho", jornada: s.jornada },
      ]),
    ),
    ciclo: {},
    pendencias: [],
  };
  s.feriados = [{ dia: 29, nome: "Feriado de exemplo", trabalhado: false }];
  gerar(s);
  const p = buscar(s);
  assert.ok(
    p.alteracoes.every(
      (a) => a.data >= "2026-10-28" && a.data !== "2026-10-29",
    ),
  );
});

test("troca de folgas entre duas pessoas fecha lacunas sem abrir a descoberta intermediária", () => {
  const s = config(2, {
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    folgaDiasPermitidos: [1, 2, 3, 4, 5, 6],
    folgaTipo: "rotativa",
  });
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [1, 2].map((dia) => ({
      dia,
      entrada: "09:00",
      saida: "18:00",
    })),
  };
  s.colaboradores[1].restricoes = {
    horariosPermitidos: [1, 2].map((dia) => ({
      dia,
      entrada: "08:00",
      saida: "17:00",
    })),
  };
  const faixa = (id, inicio, fim, dia) => ({
    id,
    funcao: "Atendente",
    inicio,
    fim,
    minimo: 1,
    diasSemana: [dia],
    incluirFeriados: false,
  });
  s.demandasCobertura = [
    faixa(1, "09:00", "12:00", 1),
    faixa(2, "17:00", "18:00", 1),
    faixa(3, "08:00", "12:00", 2),
  ];
  gerar(s);
  for (const [i, r] of s.escalaGerada.resultado.entries())
    for (const d of r.dias) {
      const folga = d.weekday === 0 || d.weekday === (i === 0 ? 1 : 2);
      d.status = folga ? "F" : "T";
      d.previsto = !folga;
      d.previstoOriginal = !folga;
      d.horas = folga ? 0 : 8;
      d.horasComputadasCCT = d.horas;
      d.entradaMin = i === 0 && d.weekday === 2 ? 540 : 480;
      d.saidaMin = d.entradaMin + (folga ? 0 : 540);
      d.intervaloMin = folga ? 0 : 60;
      d.intervaloInicioMin = folga ? null : d.entradaMin + 240;
      d.intervaloFimMin = folga ? null : d.entradaMin + 300;
      d.jornadaAplicada = {
        entrada: i === 0 && d.weekday === 2 ? "09:00" : "08:00",
        intInicio: i === 0 && d.weekday === 2 ? "13:00" : "12:00",
        intFim: i === 0 && d.weekday === 2 ? "14:00" : "13:00",
        saida: i === 0 && d.weekday === 2 ? "18:00" : "17:00",
      };
      delete d.restricao;
      delete d.ajusteRestricao;
    }
  s.escalaGerada.coberturaOperacional = analisar(s, s.escalaGerada.resultado);
  const p = buscar(s);
  assert.ok(p.acoes.some((a) => a.tipo === "troca_folgas"));
  assert.equal(p.depois.minutosFaltantes, 0);
  const novo = conferir(s, p);
  assert.equal(novo.resultado[0].dias.find((d) => d.weekday === 1).status, "T");
  assert.equal(novo.resultado[1].dias.find((d) => d.weekday === 2).status, "T");
});

test("realocação de função não sugere manter presença fora da janela operacional", () => {
  const s = habilitados();
  s.jornada.saida = "16:00";
  gerar(s);
  assert.equal(buscar(s).alteracoes.length, 0);
});

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let base, domain, atualizar, normalizar, apurar, sugerir, analisar;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ atualizarPerfilDominio: atualizar } = await import(
    "../assets/js/import/dominio.js"
  ));
  ({ normalizarJornada: normalizar } = await import(
    "../assets/js/domain/datas-horas.js"
  ));
  ({ apurarSemana: apurar } = await import(
    "../assets/js/domain/resumo-semanal.js"
  ));
  ({ sugerirIntervalosCobertura: sugerir } = await import(
    "../assets/js/domain/intervalos-cobertura.js"
  ));
  ({ analisarCobertura: analisar } = await import(
    "../assets/js/domain/cobertura.js"
  ));
});
function empresa(curta = false) {
  const s = base(new Date(2026, 9, 1));
  s.coberturaAtiva = false;
  s.feriados = [];
  s.instrumentoCompensacao = "act_cct";
  Object.assign(s.instrumentoColetivo, {
    identificacao: "ACT teste",
    inicio: "2026-01-01",
    fim: "2029-12-31",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 10,
  });
  const c = {
    id: 1,
    nome: "Pessoa",
    sexo: "masculino",
    cargo: "Atendente",
    horasSemana: 44,
    quadroDominio: {
      origem: "manual",
      ativo: true,
      tipo: "semanal",
      cargaConfirmada: true,
      semana: Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((d) => [
          d,
          d === 0
            ? { status: "folga" }
            : d === 6
              ? {
                  status: "compensado",
                  jornada: {
                    entrada: "08:00",
                    intInicio: "12:00",
                    intFim: "",
                    saida: "",
                  },
                }
              : {
                  status: "trabalho",
                  jornada: {
                    entrada: "07:00",
                    intInicio: "12:00",
                    intFim: "13:00",
                    saida: d === 5 || curta ? "16:00" : "17:00",
                  },
                },
        ]),
      ),
      ciclo: {},
      linhasOriginais: [],
      pendencias: [],
    },
  };
  s.colaboradores = [c];
  atualizar(c, s);
  return s;
}
const semana = (esc) =>
  esc.resultado[0].dias.filter(
    (d) => d.data >= "2026-10-05" && d.data <= "2026-10-11",
  );
test("meio período aceita dois horários sem confundir meia-noite com ausência de campo", () => {
  for (const j of [
    { entrada: "08:00", intInicio: "12:00", intFim: "", saida: "" },
    { entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" },
  ]) {
    const n = normalizar(j);
    assert.equal(n.saida - n.entrada, 240);
    assert.equal(n.intervalo, 0);
  }
  assert.equal(
    normalizar({
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "",
    }),
    null,
  );
  assert.equal(
    normalizar({ entrada: "20:00", intInicio: "", intFim: "", saida: "00:00" })
      .saida,
    1440,
  );
});
test("9h de segunda a quinta e 8h sexta fecham 44h: sábado compensado, sem crédito fictício nem horas extras", () => {
  const s = empresa(),
    e = domain(s).gerarDadosEscala(),
    dias = semana(e),
    sab = dias.find((d) => d.weekday === 6);
  assert.equal(sab.status, "FC");
  assert.equal(sab.sabadoCompensado, true);
  assert.equal(sab.horas, 0);
  const a = apurar(s.colaboradores[0], dias, s);
  assert.equal(a.trabalhadas, 44);
  assert.equal(a.computadas, 44);
  assert.equal(a.abonadas, 0);
  assert.equal(a.estado, "ok");
  assert.ok(
    !e.validacoes[0].issues.some(
      (i) =>
        i.data >= "2026-10-05" &&
        i.data <= "2026-10-11" &&
        i.severidade === "erro",
    ),
  );
});
test("déficit da semana usa apenas o saldo no sábado disponível, respeitando bloqueios e capacidade", () => {
  let s = empresa(true),
    e = domain(s).gerarDadosEscala(),
    dias = semana(e);
  assert.equal(dias.find((d) => d.weekday === 6).horas, 4);
  assert.equal(dias.find((d) => d.weekday === 6).saidaMin, 720);
  assert.equal(
    dias.reduce((n, d) => n + d.horas, 0),
    44,
  );
  s = empresa(true);
  s.colaboradores[0].restricoes = { folgasObrigatorias: [6] };
  e = domain(s).gerarDadosEscala();
  assert.equal(semana(e).find((d) => d.weekday === 6).horas, 0);
  s = empresa(true);
  s.colaboradores[0].quadroDominio.semana[6].jornada = {};
  assert.equal(
    semana(domain(s).gerarDadosEscala()).find((d) => d.weekday === 6).horas,
    0,
  );
});
test("feriado abona o dia previsto e não produz reposição indevida no sábado compensado", () => {
  const s = empresa();
  s.feriados = [
    { dia: 5, nome: "Feriado local", tipo: "municipal", trabalhado: false },
  ];
  const dias = semana(domain(s).gerarDadosEscala()),
    a = apurar(s.colaboradores[0], dias, s);
  assert.equal(a.abonadas, 9);
  assert.equal(a.computadas, 44);
  assert.equal(dias.find((d) => d.weekday === 6).status, "FC");
});
test("confirmação preserva o contrato e sinaliza divergência e carga superior a 44h", () => {
  const s = empresa(true),
    c = s.colaboradores[0];
  atualizar(c, s);
  assert.equal(c.horasSemana, 44);
  assert.ok(
    c.quadroDominio.pendencias.some((p) => p.includes("Carga incoerente")),
  );
  c.quadroDominio.cargaConfirmada = false;
  atualizar(c, s);
  assert.equal(c.horasSemana, 40);
  c.horasSemana = 45;
  c.quadroDominio.cargaConfirmada = true;
  atualizar(c, s);
  assert.ok(c.quadroDominio.pendencias.some((p) => p.includes("ERRO:")));
});
test("intervalos escalonados resolvem lacunas sem mudar duração, jornada, função ou origem; edição manual é preservada", () => {
  const s = base(new Date(2026, 9, 1));
  s.coberturaAtiva = true;
  s.diaInicio = 26;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "17:00",
      diasSemana: [1],
      minimo: 1,
      incluirFeriados: false,
    },
  ];
  const dia = {
    data: "2026-10-26",
    weekday: 1,
    status: "T",
    horas: 7,
    entradaMin: 540,
    saidaMin: 1020,
    intervaloMin: 60,
    intervaloInicioMin: 720,
    intervaloFimMin: 780,
  };
  const escala = {
    resultado: [1, 2].map((id) => ({
      colaborador: { id, cargo: "Atendente" },
      dias: [{ ...dia, colaboradorId: id }],
      diasApuracao: [{ ...dia, colaboradorId: id }],
    })),
  };
  const antes = JSON.stringify(escala),
    depois = sugerir(s, escala);
  assert.equal(JSON.stringify(escala), antes);
  assert.equal(analisar(s, depois.resultado).lacunas.length, 0);
  assert.equal(depois.sugestoesIntervalos.length, 1);
  const d = depois.resultado[0].dias[0];
  assert.equal(d.horas, 7);
  assert.equal(d.intervaloMin, 60);
  assert.equal(d.entradaMin, 540);
  assert.equal(d.saidaMin, 1020);
  assert.deepEqual(depois.resultado[0].dias, depois.resultado[0].diasApuracao);
  escala.resultado.forEach((r) =>
    r.dias.forEach((d) => (d.ajusteManual = true)),
  );
  assert.equal(sugerir(s, escala).sugestoesIntervalos.length, 0);
});
test("conversão preserva reposição parcial da referência e janela curta do sábado; sem horário não inventa disponibilidade", async () => {
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const s = empresa(true);
  for (const dia of [1, 2, 3])
    s.colaboradores[0].quadroDominio.semana[dia].jornada.saida = "17:00";
  atualizar(s.colaboradores[0], s);
  const c = converterEscala(s, {
    periodo: "2028-02",
    fase: "automatico",
    folgas: "distribuir",
  });
  assert.equal(semana(c.origem.escala).find((d) => d.weekday === 6).horas, 1);
  for (const r of c.proposta.config.escalaGerada.resultado)
    assert.ok(
      r.dias
        .filter((d) => d.weekday === 6 && d.horas > 0)
        .every((d) => d.saidaMin <= 720),
    );
  s.colaboradores[0].quadroDominio.semana[6].jornada = {};
  const d = converterEscala(s, {
    periodo: "2028-02",
    fase: "automatico",
    folgas: "distribuir",
  });
  assert.ok(
    d.proposta.config.escalaGerada.resultado[0].dias
      .filter((d) => d.weekday === 6)
      .every((d) => d.horas === 0),
  );
});
test("reposição no sábado preserva 11h de descanso e não cria jornada sem pausa acima de 4h", () => {
  const s = empresa(true),
    p = s.colaboradores[0].quadroDominio;
  p.semana[5].jornada = {
    entrada: "20:00",
    intInicio: "00:00",
    intFim: "",
    saida: "",
  };
  atualizar(s.colaboradores[0], s);
  const e = domain(s).gerarDadosEscala(),
    sat = semana(e).find((d) => d.weekday === 6);
  assert.equal(sat.entradaMin, 660);
  assert.equal(sat.saidaMin, 720);
  assert.equal(sat.horas, 1);
  assert.ok(
    !e.validacoes[0].issues.some(
      (i) => i.tipo === "INTERJORNADA" && i.data === "2026-10-10",
    ),
  );
  p.semana[5] = { status: "folga" };
  p.semana[6].jornada = {
    entrada: "08:00",
    intInicio: "18:00",
    intFim: "",
    saida: "",
  };
  assert.ok(
    semana(domain(s).gerarDadosEscala()).find((d) => d.weekday === 6).horas <=
      4,
  );
});
test("Domínio distingue sábado compensado e conserva o descanso de ciclos 12x36", async () => {
  const { analisarQuadroDominio } = await import(
    "../assets/js/import/dominio.js"
  );
  const head = [
    "Código",
    "Nome",
    "Cargo",
    "Dias da semana",
    "Entrada",
    "Intervalo",
    "Saída",
    "Compensado/Folga",
  ];
  const leitura = (linhas) =>
    analisarQuadroDominio([
      {
        nome: "Quadro",
        linhas: [["Empresa", "1 - Empresa teste"], head, ...linhas],
      },
    ]);
  const a = leitura([
    [
      "1",
      "Pessoa",
      "Atendente",
      "Segunda a Sexta",
      "07:00",
      "12:00 às 13:00",
      "16:00",
      "",
    ],
    ["", "", "", "Sábado", "08:00", "", "12:00", "Compensado"],
  ]);
  assert.equal(a.colaboradores[0].quadroDominio.semana[6].status, "compensado");
  assert.equal(
    normalizar(a.colaboradores[0].quadroDominio.semana[6].jornada).saida,
    720,
  );
  const b = leitura([
    [
      "1",
      "Pessoa",
      "Atendente",
      "1º dia",
      "08:00",
      "12:00 às 13:00",
      "20:00",
      "",
    ],
    ["", "", "", "2º dia", "00:00", "", "00:00", "Compensado"],
  ]);
  assert.equal(b.colaboradores[0].quadroDominio.ciclo[2].status, "folga");
});

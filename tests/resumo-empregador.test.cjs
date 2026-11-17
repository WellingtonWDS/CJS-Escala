const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let agruparHorarios,
  agrupadas,
  referencias,
  lacunas,
  datas,
  criarPdf,
  relatorio,
  domain,
  demo,
  libs;
before(async () => {
  ({
    agruparHorarios,
    agruparConferencias: agrupadas,
    referenciasConferencia: referencias,
    agruparLacunas: lacunas,
    resumirDatas: datas,
  } = await import("../assets/js/export/resumo-empregador.js"));
  ({ criarPdf } = await import("../assets/js/export/pdf.js"));
  ({ prepararRelatorio: relatorio } = await import(
    "../assets/js/export/relatorio.js"
  ));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ criarEstadoDemo: demo } = await import("../database/demo/state.mjs"));
  libs = { ...(await import("jspdf")), ...(await import("jspdf-autotable")) };
});
const rel = { fixa: false, config: { ano: 2026, mes: 9 } };
const linha = (
  dia,
  intervalo = "11:00 a 13:00",
  funcao = "Atendente",
  situacao = "Trabalho",
) => [
  `${String(dia).padStart(2, "0")}/10/2026 - Qui`,
  situacao,
  "08:00",
  intervalo,
  "18:00",
  "08:00",
  funcao,
];
const pessoa = (nome, linhas = [], ocorrencias = []) => ({
  nome,
  linhas,
  ocorrencias,
});
const count = (bytes) =>
  (
    Buffer.from(bytes)
      .toString("latin1")
      .match(/\/Type \/Page\b/g) || []
  ).length;

test("horários agrupados preservam exatamente datas, intervalos, situações e funções sem alterar a origem", () => {
  const pessoas = [
    pessoa("Pessoa A", [
      linha(1),
      linha(2),
      linha(5, "12:00 a 13:00"),
      linha(6, undefined, "Caixa"),
      linha(7, undefined, undefined, "Folga - Feriado"),
    ]),
  ];
  const before = structuredClone(pessoas),
    grupos = agruparHorarios(rel, pessoas);
  assert.equal(grupos.length, 4);
  assert.equal(grupos[0].dias, "01 a 02");
  const reconstruido = grupos.flatMap((g) =>
    g.datas.map((data) => [data, ...g.detalhes]),
  );
  const esperado = pessoas[0].linhas.map((l) => [
    `2026-10-${l[0].slice(0, 2)}`,
    ...l.slice(1),
  ]);
  assert.deepEqual(reconstruido, esperado);
  assert.deepEqual(pessoas, before);
  assert(grupos.some((g) => g.detalhes[5] === "Caixa"));
  assert(grupos.some((g) => g.detalhes[0] === "Folga - Feriado"));
});
test("a mesma entrada/saída não une pausas ou alocações por função diferentes; fixo preserva os dias da semana", () => {
  const pessoas = [
    pessoa("Pessoa A", [
      ["Seg", ...linha(1).slice(1)],
      ["Ter", ...linha(1).slice(1)],
      [
        "Qua",
        ...linha(
          1,
          "11:00 a 12:00",
          "08:00–11:00: Atendente; 12:00–18:00: Caixa",
        ).slice(1),
      ],
    ]),
  ];
  const grupos = agruparHorarios({ ...rel, fixa: true }, pessoas);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].dias, "Seg, Ter");
  assert.match(grupos[1].detalhes[5], /Caixa/);
});
test("datas só viram intervalos quando todos os dias são realmente presentes", () => {
  assert.equal(
    datas(["2026-10-01", "2026-10-02", "2026-10-05"], { mes: "2026-10" }),
    "01 a 02, 05",
  );
  assert.equal(
    datas(["2026-09-30", "2026-10-01"], { mes: "2026-10" }),
    "30/09/2026 a 01/10/2026",
  );
  assert.equal(datas(["2026-11-01"], { mes: "2026-10" }), "01/11/2026");
});
test("conferências repetidas mantêm contagem e vínculo entre cada pessoa e suas referências", () => {
  const i = (data, h = 10) => ({
    tipo: "JORNADA",
    severidade: "erro",
    data,
    mensagem: `${data}: ${h}h acima do limite.`,
  });
  const pessoas = [
    pessoa("Pessoa A", [], [i("2026-10-01"), i("2026-10-02")]),
    pessoa("Pessoa B", [], [i("2026-10-05"), i("2026-10-06", 11)]),
  ];
  const grupos = agrupadas(pessoas),
    g = grupos.find((g) => g.ocorrencias === 3);
  assert.equal(grupos.length, 2);
  assert.equal(
    grupos.reduce((n, g) => n + g.ocorrencias, 0),
    4,
  );
  assert.deepEqual(
    g.pessoas.map((p) => p.referencias),
    [["2026-10-01", "2026-10-02"], ["2026-10-05"]],
  );
  assert.match(
    referencias(g, 2),
    /1\. Pessoa A\nReferências: 01\/10\/2026 a 02\/10\/2026/,
  );
  assert.match(referencias(g, 2), /2\. Pessoa B\nReferências: 05\/10\/2026/);
  assert(!referencias(g, 2).includes("Toda a equipe"));
});
test("severidade, ações e datas dentro da mensagem continuam distintas; homônimos não são fundidos", () => {
  const base = {
    tipo: "DOC",
    severidade: "erro",
    mensagem: "2026-10-01: ACT válido até 2026-10-10.",
  };
  const pessoas = [
    pessoa(
      "Mesmo Nome",
      [],
      [
        base,
        { ...base, severidade: "alerta" },
        { ...base, mensagem: "2026-10-02: ACT válido até 2026-10-11." },
        { ...base, acao: "Corrigir data" },
      ],
    ),
    pessoa("Mesmo Nome", [], [base]),
  ];
  const g = agrupadas(pessoas);
  assert.equal(g.length, 4);
  assert.equal(g[0].pessoas.length, 2);
  assert.equal(
    g.reduce((n, g) => n + g.ocorrencias, 0),
    5,
  );
  assert.match(referencias(g[0], 2), /Toda a equipe \(2\)/);
});
test("referências sintéticas do padrão fixo aparecem como dias da semana", () => {
  const p = pessoa(
    "Pessoa",
    [],
    [
      {
        tipo: "J",
        severidade: "erro",
        data: "2026-10-05",
        mensagem: "Seg: Confira o horário.",
      },
    ],
  );
  const grupos = agrupadas([p], true);
  assert.deepEqual(grupos[0].pessoas[0].referencias, ["Seg"]);
  assert(!referencias(grupos[0], 1).includes("2026"));
});
test("cobertura une horários contíguos com o mesmo déficit sem preencher intervalos cobertos ou alterar quantidades", () => {
  const l = (data, inicioMin, fimMin, faltantes = 1, funcao = "Atendente") => ({
    data,
    inicioMin,
    fimMin,
    faltantes,
    funcao,
  });
  const origem = [
      l("2026-10-03", 480, 720),
      l("2026-10-03", 720, 840),
      l("2026-10-10", 480, 840),
      l("2026-10-03", 900, 960),
      l("2026-10-03", 960, 1020, 2),
      l("2026-10-03", 480, 840, 1, "Caixa"),
    ],
    before = structuredClone(origem);
  const grupos = lacunas(origem, rel);
  assert.equal(grupos.length, 4);
  const unida = grupos.find(
    (g) => g.funcao === "Atendente" && g.inicioMin === 480,
  );
  assert.equal(unida.horario, "08:00 a 14:00");
  assert.equal(unida.dias, "03, 10");
  assert(grupos.some((g) => g.faltantes === 2 && g.inicioMin === 960));
  assert.deepEqual(origem, before);
});
test("PDF do empregador sintetiza os cenários DEMO mensal/fixo e agrupa um aviso comum uma única vez", async () => {
  for (const fixa of [false, true]) {
    const s = demo();
    s.modeloEscala = fixa ? "fixa" : "dinamica";
    s.escalaGerada = domain(s).gerarDadosEscala();
    const r = relatorio(s),
      before = structuredClone(r);
    const bytes = await criarPdf(r, r.pessoas, { libs, empregador: true });
    assert(
      count(bytes) <= (fixa ? 2 : 4),
      `PDF compacto ${fixa ? "fixo" : "mensal"}: ${count(bytes)} páginas`,
    );
    assert.deepEqual(r, before);
    const texto = Buffer.from(bytes).toString("latin1");
    for (const p of r.pessoas) assert(texto.includes(p.nome));
    r.pessoas.forEach(
      (p) =>
        (p.ocorrencias = ["2026-10-01", "2026-10-02"].map((data) => ({
          tipo: "TESTE",
          severidade: "erro",
          mensagem: `${data}: Mensagem comum para revisar.`,
        }))),
    );
    const compact = Buffer.from(
      await criarPdf(r, r.pessoas, { libs, empregador: true }),
    ).toString("latin1");
    assert.equal(compact.split("Mensagem comum para revisar.").length - 1, 1);
    assert(compact.includes("RASCUNHO COM INCOMPATIBILIDADES"));
  }
});
test("cobertura ausente ou inválida não é apresentada como operação atendida", async () => {
  const s = demo();
  s.escalaGerada = domain(s).gerarDadosEscala();
  const r = relatorio(s);
  r.config.coberturaAtiva = true;
  r.config.demandasCobertura = [];
  const ausente = Buffer.from(
    await criarPdf(r, r.pessoas, { libs, empregador: true }),
  ).toString("latin1");
  assert(ausente.includes("Cobertura não avaliada"));
  r.config.demandasCobertura = [{ funcao: "" }];
  const invalida = Buffer.from(
    await criarPdf(r, r.pessoas, { libs, empregador: true }),
  ).toString("latin1");
  assert(invalida.includes("Cobertura com avisos"));
  assert(!invalida.includes("Sem lacunas nas faixas cadastradas"));
});

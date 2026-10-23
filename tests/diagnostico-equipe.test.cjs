const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let diagnosticar, base, domain, render, csv;
before(async () => {
  ({ diagnosticarEquipe: diagnosticar } = await import(
    "../assets/js/domain/diagnostico-equipe.js"
  ));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ renderDiagnosticoEquipe: render } = await import(
    "../assets/js/ui/diagnostico-equipe.js"
  ));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
});
function empresa(n = 1) {
  const s = base(new Date(2026, 9, 23));
  s.tipoEscala = "5x2";
  s.diasTrabalho = [1, 2, 3, 4, 5, 6];
  s.coberturaAtiva = true;
  s.jornada = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "13:00",
    saida: "18:00",
  };
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
      inicio: "14:00",
      fim: "18:00",
      minimo: 1,
      diasSemana: [2, 4],
      incluirFeriados: true,
    },
  ];
  return s;
}
function faltas(s) {
  return s.colaboradores.map((c) => ({ colaborador: c, dias: [] }));
}
function analisar(s) {
  return diagnosticar(s, faltas(s));
}
test("agrupa terças e quintas 14–18 com datas exatas e sem presumir contratação", () => {
  const d = analisar(empresa());
  assert.equal(d.status, "redistribuicao");
  assert.equal(d.provas.length, 0);
  assert.equal(d.grupos.length, 1);
  assert.match(
    d.grupos[0].resumo,
    /terças e quintas.*14:00.*18:00.*falta 1 pessoa.*Atendente/,
  );
  assert.equal(d.grupos[0].ocorrencias, 9);
  assert.deepEqual(d.grupos[0].datas.slice(0, 2), ["2026-10-01", "2026-10-06"]);
});
test("sem habilitação e quadro menor que demanda comprovam falta simultânea", () => {
  const s = empresa();
  s.demandasCobertura[0].minimo = 2;
  let d = analisar(s);
  assert.equal(d.status, "capacidade_insuficiente");
  assert.equal(d.picoDeficitMinimo, 1);
  assert.equal(d.grupos[0].tipo, "quadro");
  s.colaboradores[0].cargo = "Supervisor";
  d = analisar(s);
  assert.equal(d.picoDeficitMinimo, 2);
  assert.match(d.funcoes[0].insuficiencias.join(" "), /Nenhum colaborador/);
});
test("pessoa com duas habilitações não cobre duas funções simultaneamente", () => {
  const s = empresa();
  s.colaboradores[0].funcoesHabilitadas = ["Supervisor"];
  s.demandasCobertura.push({
    ...s.demandasCobertura[0],
    id: 2,
    funcao: "Supervisor",
  });
  const d = analisar(s);
  assert.equal(d.status, "capacidade_insuficiente");
  assert.equal(d.picoDeficitMinimo, 1);
  assert.ok(d.grupos.every((g) => g.tipo === "compartilhada"));
  assert.ok(d.provas.some((p) => p.funcoes.length === 2));
  assert.ok(d.grupos.every((g) => g.inicioMin === 840 && g.fimMin === 1080));
});
test("restrições de janela e ausências distinguem disponibilidade de tamanho do quadro", () => {
  const s = empresa();
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [
      { dia: 2, entrada: "08:00", saida: "14:00" },
      { dia: 4, entrada: "08:00", saida: "14:00" },
    ],
  };
  const d = analisar(s);
  assert.equal(d.status, "capacidade_insuficiente");
  assert.ok(d.grupos.every((g) => g.tipo === "disponibilidade"));
  s.colaboradores[0].restricoes = {
    periodos: [{ tipo: "ferias", inicio: "2026-10-01", fim: "2026-10-31" }],
  };
  assert.equal(analisar(s).funcoes[0].limiteCapacidade, 0);
  assert.match(render(analisar(s)), /reforço temporário/);
});
test("horas semanais e dias de presença geram provas diferentes", () => {
  const s = empresa();
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    diasSemana: [1, 2, 3, 4, 5, 6],
    inicio: "09:00",
    fim: "18:00",
  };
  let d = analisar(s);
  assert.ok(d.provas.some((p) => p.tipo === "horas"));
  assert.ok(d.provas.some((p) => p.tipo === "dias"));
  s.demandasCobertura[0].fim = "10:00";
  d = analisar(s);
  assert.ok(!d.provas.some((p) => p.tipo === "horas"));
  assert.ok(d.provas.some((p) => p.tipo === "dias"));
});
test("período parcial não exige capacidade para semanas inteiras fora do mês", () => {
  const s = empresa();
  s.diaInicio = 31;
  s.demandasCobertura[0].diasSemana = [6];
  const d = analisar(s);
  assert.equal(d.status, "redistribuicao");
  assert.equal(d.grupos[0].ocorrencias, 1);
  assert.equal(d.provas.length, 0);
});
test("faixas adjacentes e funções intercaladas são agrupadas sem fragmentação", () => {
  const s = empresa(2);
  s.colaboradores[1].cargo = "Supervisor";
  s.demandasCobertura.push({
    ...s.demandasCobertura[0],
    id: 2,
    funcao: "Supervisor",
  });
  s.colaboradores[0].restricoes = {
    horariosPermitidos: [
      { dia: 2, entrada: "15:00", saida: "18:00" },
      { dia: 4, entrada: "15:00", saida: "18:00" },
    ],
  };
  const d = analisar(s);
  assert.equal(d.grupos.filter((g) => g.funcao === "Supervisor").length, 1);
  assert.equal(d.grupos.filter((g) => g.funcao === "Atendente").length, 2);
});
test("noite atravessando domingo não produz prova semanal ou dias-pessoa incorreta", () => {
  const s = empresa();
  s.jornada = {
    entrada: "22:00",
    intInicio: "02:00",
    intFim: "03:00",
    saida: "06:00",
  };
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    inicio: "22:00",
    fim: "06:00",
    diasSemana: [0],
  };
  const d = analisar(s);
  assert.ok(d.limitacoes.length);
  assert.ok(d.provas.every((p) => p.tipo === "simultaneidade"));
});
test("dados inválidos suspendem conclusão de contratação e não escondem lacunas", () => {
  const s = empresa();
  s.colaboradores[0].horasSemana = 0;
  const d = analisar(s);
  assert.equal(d.status, "dados_pendentes");
  assert.equal(d.provas.length, 0);
  assert.ok(d.grupos.length);
  assert.ok(d.grupos.every((g) => g.tipo === "dados_pendentes"));
});
test("cobertura opcional ou sem faixas aplicáveis não conclui suficiência", () => {
  const s = empresa();
  s.coberturaAtiva = false;
  assert.equal(analisar(s).status, "nao_avaliada");
  s.coberturaAtiva = true;
  s.diaInicio = 31;
  assert.equal(analisar(s).status, "nao_avaliada");
});
test("escala gerada sem lacunas é coberta; diagnóstico e CSV escapam conteúdo", () => {
  const s = empresa(3);
  s.demandasCobertura[0].funcao = "<Atendente>";
  s.colaboradores.forEach((c) => (c.cargo = "<Atendente>"));
  s.demandasCobertura[0].inicio = "09:00";
  s.demandasCobertura[0].fim = "11:00";
  s.escalaGerada = domain(s).gerarDadosEscala();
  const d = diagnosticar(s, s.escalaGerada.resultado);
  assert.equal(d.status, "coberta");
  assert.equal(d.provas.length, 0);
  const faltante = analisar(s);
  assert.ok(render(faltante).includes("&lt;Atendente&gt;"));
  assert.ok(!render(faltante).includes("função <Atendente>"));
  assert.match(csv(s), /Diagnóstico da equipe e contratação/);
});

test("limite de processamento suspende provas e preserva todos os grupos observados", () => {
  const s = empresa(60);
  const funcoes = Array.from({ length: 20 }, (_, i) => `Função ${i}`);
  s.colaboradores.forEach((c) => {
    c.cargo = funcoes[0];
    c.funcoesHabilitadas = funcoes.slice(1);
  });
  s.demandasCobertura = funcoes.map((funcao, id) => ({
    ...s.demandasCobertura[0],
    id: id + 1,
    funcao,
    minimo: 4,
  }));
  const d = analisar(s);
  assert.equal(d.status, "dados_pendentes");
  assert.equal(d.provas.length, 0);
  assert.equal(d.grupos.length, 20);
  assert.ok(d.grupos.every((g) => g.ocorrencias === 9));
  assert.match(d.avisos.join(" "), /limite de processamento/);
});
test("plantão da véspera pode atender a madrugada de segunda sem falta semanal artificial", () => {
  const s = empresa();
  s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
  s.jornada = {
    entrada: "22:00",
    intInicio: "02:00",
    intFim: "03:00",
    saida: "06:00",
  };
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    inicio: "00:00",
    fim: "06:00",
    diasSemana: [1],
  };
  const d = analisar(s);
  assert.equal(d.status, "redistribuicao");
  assert.equal(d.provas.length, 0);
});

test("déficit semanal de atendentes não é atribuído aos supervisores de equipe independente", () => {
  const s = empresa(2);
  s.colaboradores[1].cargo = "Supervisor";
  s.demandasCobertura[0] = {
    ...s.demandasCobertura[0],
    diasSemana: [1, 2, 3, 4, 5, 6],
    inicio: "09:00",
    fim: "18:00",
  };
  s.demandasCobertura.push({
    id: 2,
    funcao: "Supervisor",
    diasSemana: [2, 4],
    inicio: "14:00",
    fim: "18:00",
    minimo: 1,
    incluirFeriados: true,
  });
  const d = analisar(s);
  const supervisor = d.funcoes.find((f) => f.funcao === "Supervisor");
  assert.equal(supervisor.insuficiencias.length, 0);
  assert.ok(
    d.grupos
      .filter((g) => g.funcao === "Supervisor")
      .every((g) => g.tipo === "distribuicao"),
  );
});

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
let base,
  domain,
  perfil,
  atualizar,
  apurar,
  ler,
  analisar,
  preparar,
  X,
  csv,
  computar,
  pendencias;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ configDoPerfil: perfil } = await import(
    "../assets/js/domain/perfil-dominio.js"
  ));
  ({
    atualizarPerfilDominio: atualizar,
    analisarQuadroDominio: analisar,
    prepararDominio: preparar,
  } = await import("../assets/js/import/dominio.js"));
  ({ apurarSemana: apurar } = await import(
    "../assets/js/domain/resumo-semanal.js"
  ));
  ({ lerArquivoDominio: ler } = await import(
    "../assets/js/import/arquivo-dominio.js"
  ));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ computoDaJornada: computar } = await import(
    "../assets/js/domain/computo-cct.js"
  ));
  ({ pendenciasPreenchimento: pendencias } = await import(
    "../assets/js/domain/preenchimento.js"
  ));
  X = await import("@e965/xlsx");
});
const jornada = {
  entrada: "19:00",
  intInicio: "22:00",
  intFim: "23:00",
  saida: "06:00",
};
function configurar(s) {
  s.instrumentoCompensacao = "act_cct";
  Object.assign(s.instrumentoColetivo, {
    identificacao: "CCT de exemplo — cláusula de plantões",
    inicio: "2026-01-01",
    fim: "2027-12-31",
    compativelEC141: true,
    regime12x36: true,
    intervaloComputado: true,
    creditoNoturnoUmaHora: true,
  });
  return s;
}
async function estado() {
  const s = base(new Date(2026, 9, 22));
  const b = await fs.readFile(
    new URL("./fixtures/dominio/misto.xls", `file://${__filename}`),
  );
  const q = analisar(await ler(b, X), "misto.xls");
  q.colaboradores = [q.colaboradores[0]];
  Object.assign(s, preparar(s, q, "substituir"));
  configurar(s);
  s.colaboradores[0].quadroDominio.ancora = "2026-10-01";
  atualizar(s.colaboradores[0], s);
  return s;
}
test("ciclo noturno 19–06 com intervalo computado e crédito é 12x36 sem estender presença", async () => {
  const s = await estado(),
    c = s.colaboradores[0];
  assert.equal(perfil(s, c).tipoEscala, "12x36");
  assert.equal(c.quadroDominio.horasCalculadas, 35);
  assert.equal(c.quadroDominio.horasComputadasCalculadas, 42);
  assert.equal(c.horasSemana, 42);
  s.escalaGerada = domain(s).gerarDadosEscala();
  const r = s.escalaGerada.resultado[0],
    d = r.dias.find((d) => d.data === "2026-10-01");
  assert.equal(d.horas, 10);
  assert.equal(d.creditoIntervaloCCT, 1);
  assert.equal(d.creditoNoturnoCCT, 1);
  assert.equal(d.horasComputadasCCT, 12);
  assert.equal(d.entradaMin, 1140);
  assert.equal(d.saidaMin, 1800);
  assert.equal(d.intervaloInicioMin, 1320);
  assert.equal(d.intervaloFimMin, 1380);
  assert.equal(r.dias.find((d) => d.data === "2026-10-02").status, "F");
  assert.equal(r.dias.find((d) => d.data === "2026-10-03").status, "T");
  assert.ok(
    !s.escalaGerada.validacoes[0].issues.some((i) =>
      ["PLANTAO_12X36", "JORNADA_DIARIA", "INTERJORNADA"].includes(i.tipo),
    ),
  );
  const semana = r.dias.filter(
    (d) => d.data >= "2026-10-05" && d.data <= "2026-10-11",
  );
  const resumo = apurar(c, semana, s);
  assert.equal(
    resumo.computadas,
    resumo.trabalhadas + resumo.creditosIntervalo + resumo.creditosNoturnos,
  );
  assert.ok(resumo.creditosIntervalo > 0);
  const texto = csv(s);
  assert.match(texto, /Intervalo computado CCT/);
  assert.match(texto, /10:00;10:00|10:00;12:00/);
  assert.match(texto, /01:00;01:00;12:00/);
});
test("sem declarar CCT o mesmo quadro mantém horas reais e não vira 12x36", async () => {
  const s = await estado();
  s.instrumentoCompensacao = "nenhuma";
  atualizar(s.colaboradores[0], s);
  assert.equal(perfil(s, s.colaboradores[0]).tipoEscala, "custom");
  assert.equal(s.colaboradores[0].horasSemana, 35);
  const d = domain(s)
    .gerarDadosEscala()
    .resultado[0].dias.find((d) => d.status === "T");
  assert.equal(d.horas, 10);
  assert.equal(d.creditoIntervaloCCT, 0);
  assert.equal(d.creditoNoturnoCCT, 0);
});
test("contrato confirmado não é sobrescrito pela estimativa computada", async () => {
  const s = await estado(),
    c = s.colaboradores[0];
  c.quadroDominio.cargaConfirmada = true;
  c.horasSemana = 40;
  atualizar(c, s);
  assert.equal(c.horasSemana, 40);
});
test("crédito noturno não é aplicado a plantões diurnos", () => {
  const s = configurar(base(new Date(2026, 9, 1)));
  s.tipoEscala = "12x36";
  const d = computar(
    s,
    { entrada: "07:00", intInicio: "12:00", intFim: "13:00", saida: "19:00" },
    "2026-10-01",
  );
  assert.equal(d.horas, 11);
  assert.equal(d.creditoIntervaloCCT, 1);
  assert.equal(d.creditoNoturnoCCT, 0);
  assert.equal(d.horasComputadasCCT, 12);
});
test("CCT vencida e incompatível na nova fase não concede créditos", () => {
  const s = configurar(base(new Date(2026, 9, 1)));
  s.tipoEscala = "12x36";
  s.instrumentoColetivo.fim = "2026-10-15";
  assert.equal(computar(s, jornada, "2026-10-15").horasComputadasCCT, 12);
  assert.equal(computar(s, jornada, "2026-10-16").horasComputadasCCT, 10);
  s.instrumentoColetivo.fim = "2027-12-31";
  s.instrumentoColetivo.compativelEC141 = false;
  assert.equal(computar(s, jornada, "2026-12-16").horasComputadasCCT, 10);
});
test("intervalo computado não cobre ausência durante a pausa nem cria pessoas após a saída", async () => {
  const s = await estado();
  s.coberturaAtiva = true;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: s.colaboradores[0].cargo,
      inicio: "22:00",
      fim: "23:00",
      minimo: 1,
      diasSemana: [4],
      incluirFeriados: true,
    },
    {
      id: 2,
      funcao: s.colaboradores[0].cargo,
      inicio: "06:00",
      fim: "07:00",
      minimo: 1,
      diasSemana: [5],
      incluirFeriados: true,
    },
  ];
  const e = domain(s).gerarDadosEscala();
  assert.ok(
    e.coberturaOperacional.periodos
      .filter((p) => p.data === "2026-10-01")
      .every((p) => p.presentes === 0),
  );
  assert.ok(
    e.coberturaOperacional.periodos
      .filter((p) => p.data === "2026-10-02")
      .every((p) => p.presentes === 0),
  );
});
test("modelo global 12x36 também preserva 19–06 com 12h computadas", () => {
  const s = configurar(base(new Date(2026, 9, 1)));
  s.tipoEscala = "12x36";
  s.jornada = { ...jornada };
  s.ancora12x36 = "2026-10-01";
  const d = domain(s)
    .gerarDadosEscala()
    .resultado[0].dias.find((d) => d.data === "2026-10-01");
  assert.equal(d.saidaMin, 1800);
  assert.equal(d.horas, 10);
  assert.equal(d.horasComputadasCCT, 12);
});
test("selecionar cômputo sem regime e ACT gera pendência explícita", () => {
  const s = base(new Date(2026, 9, 1));
  s.instrumentoColetivo.intervaloComputado = true;
  assert.equal(pendencias(s).filter((p) => p.etapa === "sec-tipo").length, 2);
});

test("plantão que já tem 12h de relógio não pode somar créditos para ultrapassar 12h computadas", () => {
  const s = configurar(base(new Date(2026, 9, 1)));
  s.tipoEscala = "12x36";
  s.jornada = { ...jornada, saida: "07:00" };
  s.ancora12x36 = "2026-10-01";
  const e = domain(s).gerarDadosEscala();
  assert.ok(e.validacoes[0].issues.some((i) => i.tipo === "COMPUTO_12X36"));
});
test("feriado dispensado abona as horas computadas previstas sem crédito duplicado", async () => {
  const s = await estado();
  s.feriados = [
    { dia: 1, mes: 9, ano: 2026, nome: "Feriado de teste", trabalhado: false },
  ];
  const r = domain(s).gerarDadosEscala().resultado[0];
  const d = r.dias.find((d) => d.data === "2026-10-01");
  assert.equal(d.status, "F");
  assert.equal(d.horasPrevistas, 12);
  assert.equal(d.creditoIntervaloCCT, 0);
  assert.equal(d.creditoNoturnoCCT, 0);
  const a = apurar(
    s.colaboradores[0],
    r.dias.filter((d) => d.data >= "2026-09-28" && d.data <= "2026-10-04"),
    s,
  );
  assert.equal(a.abonadas, 12);
});

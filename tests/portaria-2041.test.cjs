/* Portaria MTE nº 2.041/2026 e Decreto nº 13.173/2026: descanso com repouso, domingos,
 * 12×36, turnos ininterruptos, férias e compensação no mês-calendário. */
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createDefaultState, createDomain, descanso;
before(async () => {
  ({ createDefaultState } = await import("../assets/js/state/store.js"));
  ({ createDomain } = await import("../assets/js/domain/index.js"));
  descanso = await import("../assets/js/domain/descanso.js");
});

const pessoas = (n, sexo = "masculino") =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `Pessoa ${i + 1}`, sexo, cargo: "Atendente", horasSemana: 42 }));
function estado(extra = {}) {
  const s = createDefaultState(new Date(2027, 2, 1));
  Object.assign(s, {
    tipoEscala: "5x2",
    diasTrabalho: [0, 1, 2, 3, 4, 5, 6],
    folgaDiasPermitidos: [0, 1, 2, 3, 4, 5, 6],
    folgaTipo: "rotativa",
    folgasFimSemana: false,
    jornada: { entrada: "08:00", intInicio: "12:00", intFim: "13:00", saida: "17:24" },
    colaboradores: pessoas(4),
    ...extra,
  });
  return s;
}
const tipos = (issues) => issues.map((i) => i.tipo);
const todas = (e) => e.validacoes.flatMap((v) => v.issues);
const dia = (data, status, entrada = null, saida = null, extra = {}) => {
  const d = new Date(`${data}T12:00:00`);
  return { data, weekday: d.getDay(), dia: d.getDate(), status, horas: status === "T" ? 8 : 0, entradaMin: entrada, saidaMin: saida, ...extra };
};

test("descanso com repouso intercalado exige 24h por repouso somadas às 11h", () => {
  const cfg = { tipoEscala: "5x2" };
  assert.equal(descanso.descansoMinimo(cfg, 0), 660);
  assert.equal(descanso.descansoMinimo(cfg, 1), 2100);
  assert.equal(descanso.descansoMinimo(cfg, 2), 3540);
  assert.equal(descanso.descansoMinimo({ tipoEscala: "12x36" }, 1), 2160);
  // Sábado até 22h, domingo de repouso, segunda às 6h: 32h < 35h.
  const seq = [dia("2027-03-06", "T", 840, 1320), dia("2027-03-07", "F"), dia("2027-03-08", "T", 360, 840)];
  const [falha] = descanso.conferirDescansos(cfg, seq);
  assert.equal(falha.real, 32 * 60);
  assert.equal(falha.minimo, 35 * 60);
  // Dois repousos seguidos: 59h.
  const dois = [dia("2027-03-05", "T", 840, 1320), dia("2027-03-06", "F"), dia("2027-03-07", "F"), dia("2027-03-08", "T", 360, 840)];
  assert.equal(descanso.conferirDescansos(cfg, dois)[0].minimo, 59 * 60);
  // Entrada às 9h na segunda cumpre os 35h.
  seq[2].entradaMin = 540;
  assert.equal(descanso.conferirDescansos(cfg, seq).length, 0);
});

test("validação aponta descanso de 35h e explica a Portaria", () => {
  const s = estado();
  const domain = createDomain(s);
  const dias = [
    dia("2027-03-01", "T", 480, 1004), dia("2027-03-02", "T", 480, 1004), dia("2027-03-03", "T", 480, 1004),
    dia("2027-03-04", "T", 480, 1004), dia("2027-03-05", "T", 840, 1320), dia("2027-03-06", "F"), dia("2027-03-07", "F"),
    dia("2027-03-08", "T", 360, 884),
  ];
  const issue = domain.validarInterjornada(dias).find((i) => i.tipo === "INTERJORNADA");
  assert.ok(issue);
  assert.equal(issue.data, "2027-03-08");
  assert.match(issue.mensagem, /59h \(2 repousos de 24h \+ 11h entre jornadas; Portaria MTE nº 2\.041\/2026, art\. 4º, § 2º\)/);
});

test("geração atrasa a entrada após o repouso na troca do turno B para o A, na dinâmica e na fixa", () => {
  for (const modeloEscala of ["dinamica", "fixa"]) {
    const s = estado({
      modeloEscala, dataReferenciaFixa: "2027-03-01", turnosRevezamento: true, entradaTurnoB: "14:00",
      jornada: { entrada: "06:00", intInicio: "10:00", intFim: "11:00", saida: "15:24" },
      ...(modeloEscala === "fixa" ? { folgaTipo: "fixa", folgaDiasPermitidos: [6, 0] } : {}),
    });
    const e = createDomain(s).gerarDadosEscala();
    const issues = todas(e);
    assert.ok(!issues.some((i) => i.tipo === "INTERJORNADA"), `${modeloEscala}: ${issues.filter((i) => i.tipo === "INTERJORNADA").map((i) => i.mensagem).join(" | ")}`);
    assert.ok(!issues.some((i) => i.tipo === "PADRAO_FIXO"), modeloEscala);
    for (const r of e.resultado) {
      const ordenados = r.dias.slice().sort((a, b) => a.data.localeCompare(b.data));
      assert.equal(descanso.conferirDescansos(s, ordenados).length, 0);
    }
  }
});

test("comércio: folgas rotativas passam pelo domingo ao menos a cada 3 semanas", () => {
  const s = estado({ atividadeComercio: true, domingosPermitidos: true, colaboradores: pessoas(6) });
  const e = createDomain(s).gerarDadosEscala();
  const issues = todas(e);
  assert.ok(!issues.some((i) => ["DOMINGO_COMERCIO", "DOMINGO_PREFERENCIAL"].includes(i.tipo)), tipos(issues).join(","));
  assert.ok(!issues.some((i) => i.severidade === "erro" && ["REPOUSO_SEMANAL", "DIAS_CONSECUTIVOS", "INTERJORNADA"].includes(i.tipo)));
  for (const r of e.resultado) {
    const domingos = [...r.diasContexto, ...r.dias].filter((d) => d.weekday === 0);
    let seguidos = 0;
    for (const d of domingos) {
      seguidos = ["T", "FE"].includes(d.status) ? seguidos + 1 : 0;
      assert.ok(seguidos < 3, `${r.colaborador.nome}: 3 domingos seguidos até ${d.data}`);
    }
  }
  // Nem todos repousam no mesmo domingo.
  const porDomingo = e.resultado[0].dias.filter((d) => d.weekday === 0).map((d) => e.resultado.filter((r) => r.dias.find((x) => x.data === d.data)?.status === "F").length);
  assert.ok(porDomingo.every((n) => n < 6));
});

test("domingos seguidos: comércio (erro em 3), empregada (alerta em 2) e demais (alerta em 4)", () => {
  const s = estado({ atividadeComercio: true, domingosPermitidos: true });
  const domain = createDomain(s);
  const datas = ["2027-03-07", "2027-03-14", "2027-03-21", "2027-03-28"];
  const dias = datas.map((d) => dia(d, "T", 480, 1004));
  const homem = domain.validarDomingos({ sexo: "masculino" }, dias, dias);
  assert.ok(homem.some((i) => i.tipo === "DOMINGO_COMERCIO" && i.severidade === "erro" && i.data === "2027-03-21"));
  assert.ok(homem.some((i) => i.tipo === "DOMINGO_PREFERENCIAL" && i.severidade === "alerta" && i.data === "2027-03-28"));
  const mulher = createDomain(estado()).validarDomingos({ sexo: "feminino" }, dias, dias);
  assert.ok(mulher.some((i) => i.tipo === "DOMINGO_MULHER" && i.severidade === "alerta" && i.data === "2027-03-14"));
  assert.ok(!mulher.some((i) => i.tipo === "DOMINGO_COMERCIO"));
  // Um domingo de repouso interrompe a sequência.
  dias[2] = dia(datas[2], "F");
  assert.deepEqual(tipos(domain.validarDomingos({ sexo: "masculino" }, dias, dias)).filter((t) => t.startsWith("DOMINGO_")), []);
  // Comércio sem autorização confirmada continua com o alerta da Lei 10.101.
  const semAutorizacao = createDomain(estado({ atividadeComercio: true })).validarDomingos({ sexo: "masculino" }, dias, dias);
  assert.ok(semAutorizacao.some((i) => i.tipo === "DOMINGO" && /legislação municipal/.test(i.mensagem)));
});

test("escala fixa: domingo trabalhado em todas as semanas é apontado conforme a regra", () => {
  const base = { modeloEscala: "fixa", dataReferenciaFixa: "2027-03-01", folgaTipo: "fixa", folgaDiasPermitidos: [1, 2] };
  const comercio = todas(createDomain(estado({ ...base, atividadeComercio: true, domingosPermitidos: true })).gerarDadosEscala());
  assert.ok(comercio.some((i) => i.tipo === "DOMINGO_FIXO" && i.severidade === "erro" && /3 semanas/.test(i.mensagem)));
  const geral = todas(createDomain(estado(base)).gerarDadosEscala());
  assert.ok(geral.some((i) => i.tipo === "DOMINGO_FIXO_PREFERENCIAL" && i.severidade === "alerta" && /4 semanas/.test(i.mensagem)));
  assert.ok(!geral.some((i) => i.tipo === "DOMINGO_FIXO"));
  const mulheres = todas(createDomain(estado({ ...base, colaboradores: pessoas(2, "feminino") })).gerarDadosEscala());
  assert.ok(mulheres.some((i) => i.tipo === "DOMINGO_FIXO" && /art\. 386/.test(i.mensagem)));
  // Domingo como repouso fixo não gera apontamento.
  const folgaDomingo = todas(createDomain(estado({ ...base, atividadeComercio: true, domingosPermitidos: true, folgaDiasPermitidos: [0, 1] })).gerarDadosEscala());
  assert.ok(!folgaDomingo.some((i) => /^DOMINGO/.test(i.tipo)));
});

test("12×36: média do mês-calendário acima do limite gera compensação ou horas extras", () => {
  const s = estado({ tipoEscala: "12x36", ancora12x36: "2027-03-01", jornada: { entrada: "07:00", intInicio: "12:00", intFim: "13:00", saida: "19:00" }, colaboradores: pessoas(2) });
  const e = createDomain(s).gerarDadosEscala();
  const media = e.validacoes[0].issues.find((i) => i.tipo === "MEDIA_12X36");
  // Março/2027: 16 plantões de 11h efetivas em 31 dias = 176h, média de 39,7h — abaixo de 42h.
  assert.equal(media, undefined);
  // Com 12h efetivas (intervalo computado) a média passa de 42h.
  s.jornada = { entrada: "07:00", intInicio: "", intFim: "", saida: "19:00" };
  const e2 = createDomain(s).gerarDadosEscala();
  const m2 = e2.validacoes[0].issues.find((i) => i.tipo === "MEDIA_12X36");
  assert.ok(m2, tipos(e2.validacoes[0].issues).join(","));
  assert.match(m2.mensagem, /março\/2027: 192:00 em 31 dias, média de 43:21 semanais/);
  assert.match(m2.mensagem, /Decreto nº 13\.173\/2026, art\. 3º/);
});

test("turnos ininterruptos: acima de 6h exige ACT/CCT; com instrumento fica pendente da média", () => {
  const s = estado({
    turnosRevezamento: true, entradaTurnoB: "16:00", folgaDiasPermitidos: [0, 6], diasTrabalho: [1, 2, 3, 4, 5, 6, 0],
    jornada: { entrada: "07:00", intInicio: "11:00", intFim: "12:00", saida: "16:24" },
  });
  const e = createDomain(s).gerarDadosEscala();
  const semAcordo = todas(e).find((i) => i.tipo === "TURNO_ININTERRUPTO");
  assert.ok(semAcordo && semAcordo.severidade === "erro");
  assert.match(semAcordo.mensagem, /6h diárias salvo ACT\/CCT/);
  Object.assign(s, {
    instrumentoCompensacao: "act_cct",
    instrumentoColetivo: { ...s.instrumentoColetivo, identificacao: "CCT teste", inicio: "2027-01-01", fim: "2027-12-31", compativelEC141: true, turnosIninterruptos: true },
  });
  const comAcordo = todas(createDomain(s).gerarDadosEscala()).filter((i) => i.tipo.startsWith("TURNO_ININTERRUPTO"));
  assert.ok(comAcordo.length && comAcordo.every((i) => i.severidade === "pendencia"), JSON.stringify(comAcordo));
  // Turnos só diurnos não caracterizam turno ininterrupto.
  s.entradaTurnoB = "10:00";
  s.instrumentoCompensacao = "nenhuma";
  assert.ok(!todas(createDomain(s).gerarDadosEscala()).some((i) => i.tipo === "TURNO_ININTERRUPTO"));
});

test("férias não podem começar nos dois dias que antecedem o repouso semanal", () => {
  const s = estado({ diasTrabalho: [1, 2, 3, 4, 5], folgasFimSemana: false, folgaDiasPermitidos: [0, 6] });
  s.colaboradores[0].restricoes = { periodos: [{ tipo: "ferias", inicio: "2027-03-05", fim: "2027-03-19" }] };
  s.colaboradores[1].restricoes = { periodos: [{ tipo: "ferias", inicio: "2027-03-08", fim: "2027-03-22" }] };
  const e = createDomain(s).gerarDadosEscala();
  const ferias = (i) => e.validacoes[i].issues.filter((x) => x.tipo === "FERIAS_INICIO");
  assert.equal(ferias(0).length, 1);
  assert.match(ferias(0)[0].mensagem, /véspera de dia de repouso semanal \(06\/03\/2027\).*art\. 134, § 3º/);
  assert.equal(ferias(1).length, 0, "início na segunda-feira é permitido");
});

test("compensação de horas fora do mês-calendário fica pendente (art. 3º)", async () => {
  const { mesCalendario } = await import("../assets/js/domain/compensacao-horas.js");
  assert.equal(mesCalendario("2027-03-01", "2027-03-31"), true);
  assert.equal(mesCalendario("2027-02-01", "2027-02-28"), true);
  assert.equal(mesCalendario("2027-03-01", "2027-04-30"), false);
  assert.equal(mesCalendario("2027-03-08", "2027-04-04"), false);
});

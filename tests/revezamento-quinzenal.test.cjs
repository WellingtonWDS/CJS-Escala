const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenarios, converter, motivo, folgasDoPlano, sabadoComIntervalo, rateio;
before(async () => {
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ motivoSemQuinzenal: motivo, folgasDoPlanoQuinzenal: folgasDoPlano, sabadoComIntervalo } = await import("../assets/js/domain/revezamento-quinzenal.js"));
  ({ analisarRateioSemanal: rateio } = await import("../assets/js/domain/rateio-semanal.js"));
});
const comercio = () => cenarios()[0].drafts[0].state; // segunda a sexta 08–18, sábado 08–14, domingo fechado
const converterQuinzenal = (fase = "definitivo40", periodo = "2028-02") => {
  const s = comercio();
  return converter(s, { ...s.destinoConversao, periodo, fase, folgas: "quinzenal" });
};
const trabalha = (d) => ["T", "FE"].includes(d.status);
const semanas = (dias) => {
  const m = new Map();
  for (const d of dias) {
    const k = Math.floor((Date.parse(d.data + "T12:00:00Z") / 86400000 + 3) / 7);
    m.set(k, [...(m.get(k) || []), d]);
  }
  return [...m.values()].filter((s) => s.length === 7);
};

test("semanas alternadas: segunda a sexta, depois sábado com folga em dia útil", () => {
  const c = converterQuinzenal(), p = c.proposta.config;
  assert.equal(p.folgasQuinzenal, true);
  for (const r of p.escalaGerada.resultado) {
    const ss = semanas(r.dias);
    assert.ok(ss.length >= 3);
    const comSabado = ss.map((s) => s.some((d) => d.weekday === 6 && trabalha(d)));
    for (let i = 1; i < comSabado.length; i++) assert.notEqual(comSabado[i], comSabado[i - 1], `${r.colaborador.nome}: alterna as semanas`);
    for (const s of ss) {
      assert.equal(s.filter(trabalha).length, 5, "cinco dias de trabalho em toda semana");
      assert.ok(!s.some((d) => d.weekday === 0 && trabalha(d)), "domingo fechado");
    }
  }
  // Metade da equipe de cada função em cada sábado: todos os sábados cobertos.
  assert.equal(c.comparacao.faltantesDepois, 0);
  assert.equal(c.comparacao.status, "suficiente");
});

test("semana com sábado reduzido fica abaixo do alvo sem alerta nem déficit; sábado usa o funcionamento inteiro", () => {
  const c = converterQuinzenal(), p = c.proposta.config;
  const r = p.escalaGerada.resultado[0];
  const sab = r.dias.find((d) => d.weekday === 6 && trabalha(d));
  assert.deepEqual([sab.entradaMin, sab.saidaMin, sab.horas], [480, 840, 5.75], "08:00–14:00 com 15 min de intervalo");
  const issues = p.escalaGerada.validacoes.flatMap((v) => v.issues);
  assert.ok(issues.some((i) => i.tipo === "REVEZAMENTO_QUINZENAL" && i.severidade === "info" && /não reduzem o salário/.test(i.mensagem)));
  assert.ok(!issues.some((i) => i.tipo === "JORNADA_CONTRATUAL"), "sem alerta de jornada abaixo do alvo");
  assert.ok(c.comparacao.pessoas.every((x) => !x.deficits));
  const semanasRateio = rateio(p, p.escalaGerada.resultado).flatMap((x) => x.semanas);
  assert.ok(semanasRateio.some((s) => s.motivo === "revezamento_quinzenal" && s.aplicado));
});

test("comparado ao rodízio semanal, o quinzenal cobre os sábados", () => {
  const s = comercio();
  const semanal = converter(s, { ...s.destinoConversao, periodo: "2028-02", fase: "definitivo40", folgas: "distribuir" });
  assert.ok(semanal.comparacao.faltantesDepois > converterQuinzenal().comparacao.faltantesDepois);
});

test("disponível só com funcionamento de segunda a sábado, domingo fechado e escala dinâmica", () => {
  const s = comercio();
  assert.equal(motivo(s), "");
  assert.match(motivo({ ...s, modeloEscala: "fixa" }), /escala mensal dinâmica/);
  assert.match(motivo({ ...s, diasTrabalho: [1, 2, 3, 4, 5] }), /funcione aos sábados/);
  assert.match(motivo({ ...s, diasTrabalho: [0, 1, 2, 3, 4, 5, 6] }), /não funcionam aos domingos/);
  assert.throws(() => converter({ ...s, diasTrabalho: [1, 2, 3, 4, 5] }, { ...s.destinoConversao, folgas: "quinzenal" }), /funcione aos sábados/);
});

test("plano quinzenal escolhe as folgas pela paridade da semana; sábado longo recebe 15 min de intervalo", () => {
  const plano = { quinzenal: true, semSabado: [6], comSabado: [3], fase: 0 };
  const a = folgasDoPlano(plano, new Date(2028, 1, 7)), b = folgasDoPlano(plano, new Date(2028, 1, 14));
  assert.notDeepEqual(a, b);
  assert.deepEqual([a, b].sort(), [[3], [6]].sort());
  assert.deepEqual(sabadoComIntervalo({ entrada: "08:00", intInicio: "", intFim: "", saida: "14:00" }), { entrada: "08:00", saida: "14:00", intInicio: "10:55", intFim: "11:10" });
  assert.deepEqual(sabadoComIntervalo({ entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" }), { entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" });
});

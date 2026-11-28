const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenarios, converter, consecutivosNoMes, motivo, demo, atualizarPerfil;
before(async () => {
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ consecutivosNoMes, motivoSemConsecutiva: motivo } = await import("../assets/js/domain/folga-consecutiva.js"));
  ({ criarEstadoDemo: demo } = await import("../database/demo/state.mjs"));
  ({ atualizarPerfilDominio: atualizarPerfil } = await import("../assets/js/import/dominio.js"));
});
const trabalha = (d) => ["T", "FE"].includes(d.status);
const coladaAoDomingo = (r) => r.dias.filter((d) => !trabalha(d) && d.weekday !== 0 && d.status !== "NC")
  .every((d) => d.weekday === 6 || d.weekday === 1);

test("rodízio mensal: 1/N de cada função por mês, outro grupo no mês seguinte", () => {
  const cs = [1, 2, 3, 4].map((id) => ({ id, cargo: id <= 2 ? "Caixa" : "Atendente" }));
  const fev = consecutivosNoMes(cs, 2028, 1, 2), mar = consecutivosNoMes(cs, 2028, 2, 2);
  assert.equal(fev.size, 2);
  assert.equal(mar.size, 2);
  assert.deepEqual([...fev].filter((id) => mar.has(id)), []);
  // A cada 3 meses: todos passam pela folga consecutiva em três meses seguidos.
  const caixas = [1, 2, 3].map((id) => ({ id, cargo: "Caixa" }));
  const tri = [0, 1, 2].map((m) => consecutivosNoMes(caixas, 2028, m, 3));
  assert.deepEqual(tri.map((s) => s.size), [1, 1, 1]);
  assert.equal(new Set(tri.flatMap((s) => [...s])).size, 3);
  assert.equal(consecutivosNoMes(cs, 2028, 1, 0).size, 0);
});

test("quinzenal com folga consecutiva: o grupo do mês folga na segunda na semana com sábado", () => {
  for (const periodo of ["2028-02", "2028-03"]) {
    const s = cenarios()[0].drafts[0].state;
    const c = converter(s, { ...s.destinoConversao, periodo, fase: "definitivo40", folgas: "quinzenal", consecutiva: 2 });
    const p = c.proposta.config;
    assert.equal(p.folgaConsecutiva.cadaMeses, 2);
    assert.equal(p.folgaConsecutiva.ids.length, 4, "metade da equipe de cada função");
    for (const r of p.escalaGerada.resultado.filter((r) => p.folgaConsecutiva.ids.includes(r.colaborador.id)))
      assert.ok(coladaAoDomingo(r), `${r.colaborador.nome}: folgas coladas ao domingo`);
    assert.equal(c.comparacao.faltantesDepois, 0);
  }
});

test("indisponível com domingo aberto ou escala fixa; ignorado com sábado e domingo fixos", () => {
  const s = cenarios()[0].drafts[0].state;
  assert.equal(motivo(s), "");
  assert.match(motivo({ ...s, diasTrabalho: [0, 1, 2, 3, 4, 5, 6] }), /domingo como folga fixa/);
  assert.match(motivo({ ...s, modeloEscala: "fixa" }), /escala mensal dinâmica/);
  assert.throws(() => converter({ ...s, diasTrabalho: [0, 1, 2, 3, 4, 5, 6] }, { ...s.destinoConversao, consecutiva: 2 }), /domingo como folga fixa/);
  const fim = converter(s, { ...s.destinoConversao, folgas: "fim_semana", consecutiva: 3 });
  assert.equal(fim.proposta.config.folgaConsecutiva, null);
});

test("turnos A/B da aba Jornada valem na proposta para quem tem horário importado", () => {
  const s = demo();
  const J = { entrada: "07:30", intInicio: "11:00", intFim: "13:00", saida: "17:30" };
  s.jornada = J;
  for (const d of [1, 2, 3, 4, 5]) s.jornadaPorDia[d] = { ...J };
  s.jornadaPorDia[6] = { entrada: "07:30", intInicio: "", intFim: "", saida: "11:30" };
  Object.assign(s, { turnosRevezamento: true, entradaTurnoB: "08:00" });
  for (const c of s.colaboradores) {
    c.quadroDominio = { origem: "manual", codigo: `X${c.id}`, ativo: true, tipo: "semanal", cargaConfirmada: true, ciclo: {}, pendencias: [], linhasOriginais: [],
      semana: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 ? { status: "folga" } : d === 6
        ? { status: "trabalho", jornada: { entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" } }
        : { status: "trabalho", jornada: { entrada: "08:00", intInicio: "11:00", intFim: "13:00", saida: "18:00" } }])) };
    atualizarPerfil(c, s);
  }
  s.demandasCobertura = ["Atendente", "Supervisor"].map((funcao, i) => ({ id: i + 1, funcao, inicio: "07:30", fim: "17:30", minimo: 1, diasSemana: [1, 2, 3, 4, 5], incluirFeriados: false }));
  const c = converter(s, { periodo: "2027-03", fase: "transicao42", folgas: "distribuir" });
  const dias = c.proposta.config.escalaGerada.resultado.flatMap((r) => r.dias.filter(trabalha));
  assert.ok(dias.some((d) => d.turno === "A" && d.entradaMin === 450), "Turno A entra às 07:30");
  assert.ok(dias.some((d) => d.turno === "B" && d.entradaMin === 480), "Turno B entra às 08:00");
  assert.equal(c.comparacao.faltantesDepois, 0, "07:30–08:00 coberto pelo Turno A");
});

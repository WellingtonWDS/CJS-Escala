const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let demo, converter, destinos, replicar, aplicar;
before(async () => {
  ({ criarEstadoDemo: demo } = await import("../database/demo/state.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ destinosReplicacao: destinos, replicarHorario: replicar } = await import("../assets/js/ui/replicar-horario.js"));
  ({ aplicarHorarioManual: aplicar } = await import("../assets/js/domain/horario-manual.js"));
});
const proposta = (fixa = false) => {
  const s = demo();
  if (fixa) Object.assign(s, { modeloEscala: "fixa", dataReferenciaFixa: "2027-12-16" });
  return converter(s, { periodo: "2028-02", fase: "definitivo40", folgas: "fim_semana" }).proposta.config;
};
const J = { entrada: "09:00", intInicio: "12:00", intFim: "13:00", saida: "18:00" };

test("alcance: dias escolhidos da mesma semana ou do mês inteiro, só dias de trabalho", () => {
  const s = proposta(), r = s.escalaGerada.resultado[0];
  const seg = r.dias.find((d) => d.data === "2028-02-07");
  const semana = destinos(s, r.colaborador.id, seg.data, [2, 3, 6], "semana");
  assert.deepEqual(semana.map((d) => d.data), ["2028-02-08", "2028-02-09"], "sábado é folga e não recebe horário");
  const mes = destinos(s, r.colaborador.id, seg.data, [2], "mes");
  // Terças do mês e também as outras segundas.
  assert.deepEqual(mes.map((d) => d.data).sort(), ["2028-02-01", "2028-02-08", "2028-02-14", "2028-02-15", "2028-02-21", "2028-02-22", "2028-02-28", "2028-02-29"]);
});

test("replica o horário e intervalo editados; folgas e outros colaboradores não mudam", () => {
  const s = proposta(), r = s.escalaGerada.resultado[0];
  const editado = { ...s, escalaGerada: aplicar(s, r.colaborador.id, "2028-02-07", "T", J) };
  const alvo = destinos(editado, r.colaborador.id, "2028-02-07", [2, 3, 4, 5], "mes");
  const { escala, aplicados, ignorados } = replicar(editado, r.colaborador.id, alvo, "T", J);
  assert.equal(ignorados.length, 0);
  assert.equal(aplicados.length, alvo.length);
  const dias = escala.resultado[0].dias.filter((d) => d.data.startsWith("2028-02") && d.weekday >= 1 && d.weekday <= 5 && d.status === "T");
  assert.ok(dias.every((d) => d.entradaMin === 540 && d.saidaMin === 1080 && d.intervaloInicioMin === 720));
  assert.ok(escala.resultado[0].dias.filter((d) => d.weekday === 6 || d.weekday === 0).every((d) => d.status === "F"));
  assert.deepEqual(escala.resultado[1].dias, s.escalaGerada.resultado[1].dias);
});

test("dia que não aceita o horário fica de fora, com o motivo", () => {
  const s = proposta(), r = s.escalaGerada.resultado[0];
  const longo = { entrada: "06:00", intInicio: "12:00", intFim: "13:00", saida: "18:00" };
  const alvo = destinos(s, r.colaborador.id, "2028-02-07", [2], "semana");
  const { aplicados, ignorados } = replicar(s, r.colaborador.id, alvo, "T", longo);
  assert.equal(aplicados.length, 0);
  assert.match(ignorados[0].motivo, /funcionamento/);
});

test("escala fixa: um destino por dia da semana, a edição vale para todas as semanas", () => {
  const s = proposta(true), r = s.escalaGerada.resultado[0];
  const seg = r.dias.find((d) => d.weekday === 1 && d.status === "T");
  const alvo = destinos(s, r.colaborador.id, seg.data, [2, 3], "mes");
  assert.deepEqual(alvo.map((d) => d.weekday).sort(), [2, 3]);
});

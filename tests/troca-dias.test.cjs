const { test } = require("node:test");
const assert = require("node:assert/strict");
async function estado(fixa = false) {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const s = criarEstadoDemo();
  s.modeloEscala = fixa ? "fixa" : "dinamica";
  s.coberturaAtiva = false;
  s.atividadeComercio = false;
  s.colaboradores.forEach((c) => (c.sexo = "masculino"));
  return converterEscala(s, {
    periodo: "2028-02",
    fase: "definitivo40",
    folgas: "fim_semana",
  }).proposta.config;
}
test("troca atômica por data e padrão, horários completos, origem intacta e desfazer", async () => {
  const { trocarDias, desfazerTroca } =
    await import("../assets/js/domain/troca-dias.js");
  for (const fixa of [false, true]) {
    const s = await estado(fixa);
    const r = s.escalaGerada.resultado[0];
    const a = r.dias.find((d) => d.weekday === 3 && d.status === "T"),
      b = r.dias.find((d) => d.weekday === 0 && d.data > a.data);
    const before = JSON.stringify(s);
    const nova = trocarDias(s, r.colaborador.id, a.data, b.data);
    assert.equal(JSON.stringify(s), before);
    const rr = nova.resultado[0];
    assert.equal(rr.dias.find((d) => d.data === a.data).status, "F");
    assert.equal(rr.dias.find((d) => d.data === b.data).status, "T");
    assert.equal(rr.dias.find((d) => d.data === b.data).horas, a.horas);
    if (fixa)
      assert(
        rr.dias.filter((d) => d.weekday === 3).every((d) => d.status === "F"),
      );
    const restored = desfazerTroca({ ...s, escalaGerada: nova });
    assert.deepEqual(restored.resultado, s.escalaGerada.resultado);
  }
});
test("restrições e repousos novos impedem troca sem mutação parcial", async () => {
  const { trocarDias } = await import("../assets/js/domain/troca-dias.js");
  const s = await estado();
  const r = s.escalaGerada.resultado[0],
    a = r.dias.find((d) => d.status === "T"),
    b = r.dias.find((d) => d.status === "F");
  r.colaborador.restricoes = { diasIndisponiveis: [b.weekday] };
  const before = JSON.stringify(s);
  assert.throws(() => trocarDias(s, r.colaborador.id, a.data, b.data));
  assert.equal(JSON.stringify(s), before);
});
test("42h requer instrumento compatível, compensação >=8h24 e vigência em todo destino", async () => {
  const { permiteSimular42 } =
    await import("../assets/js/domain/simulacao42.js");
  const s = await estado();
  assert(!permiteSimular42(s, "2028-02"));
  s.instrumentoCompensacao = "act_cct";
  s.instrumentoColetivo = {
    identificacao: "CCT teste",
    inicio: "2028-02-01",
    fim: "2028-02-29",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 9,
  };
  assert(permiteSimular42(s, "2028-02"));
  s.instrumentoColetivo.fim = "2028-02-15";
  assert(!permiteSimular42(s, "2028-02"));
});
test("troca fixa não introduz trabalho dominical incompatível com revezamento", async () => {
  const { trocarDias } = await import("../assets/js/domain/troca-dias.js");
  const s = await estado(true);
  s.atividadeComercio = true;
  const r = s.escalaGerada.resultado[0],
    a = r.dias.find((d) => d.weekday === 3 && d.status === "T"),
    b = r.dias.find((d) => d.weekday === 0 && d.data > a.data);
  const before = JSON.stringify(s);
  assert.throws(
    () => trocarDias(s, r.colaborador.id, a.data, b.data),
    /domingos|dominical/i,
  );
  assert.equal(JSON.stringify(s), before);
});

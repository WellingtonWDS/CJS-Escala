const { test } = require("node:test");
const assert = require("node:assert/strict");
async function estado(fixa = false, domingoAberto = true, atual = false) {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const s = criarEstadoDemo();
  s.modeloEscala = fixa ? "fixa" : "dinamica";
  s.coberturaAtiva = false;
  s.atividadeComercio = false;
  // Os testes de troca válida precisam de uma empresa que abra aos domingos.
  if (domingoAberto) {
    s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
    s.jornadaPorDia[0] = structuredClone(s.jornada);
  }
  s.colaboradores.forEach((c) => (c.sexo = "masculino"));
  const conversao = converterEscala(s, {
    periodo: "2028-02",
    fase: "definitivo40",
    folgas: "fim_semana",
  });
  return atual
    ? { ...conversao.origem.config, escalaGerada: conversao.origem.escala }
    : conversao.proposta.config;
}
test("empresa fechada impede troca de trabalho com domingo nos dois sentidos, modelos e quadros", async () => {
  const { trocarDias } = await import("../assets/js/domain/troca-dias.js");
  for (const fixa of [false, true]) for (const atual of [false, true]) {
    const s = await estado(fixa, false, atual);
    const r = s.escalaGerada.resultado[0];
    const a = r.dias.find(d => d.weekday === 1 && d.status === "T");
    const b = r.dias.find(d => d.weekday === 0 && d.data > a.data);
    assert.equal(b.status, "F");
    const snapshot = structuredClone(s);
    for (const [de, para] of [[a, b], [b, a]]) {
      assert.throws(() => trocarDias(s, r.colaborador.id, de.data, para.data), /empresa não funciona.*Dom/i);
      assert.deepEqual(s, snapshot);
    }
  }
});
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

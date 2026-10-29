const { test } = require("node:test");
const assert = require("node:assert/strict");
async function gerar(h, pausa) {
  const { createDefaultState } = await import("../assets/js/state/store.js");
  const { createDomain } = await import("../assets/js/domain/index.js");
  const s = createDefaultState();
  s.ano = 2026;
  s.mes = 9;
  s.modoRegime = "simulacao";
  s.regimeJornada = "atual44";
  s.jornada = {
    entrada: "08:00",
    intInicio: pausa ? "10:00" : "",
    intFim: pausa
      ? `${String(10 + Math.floor(pausa / 60)).padStart(2, "0")}:${String(pausa % 60).padStart(2, "0")}`
      : "",
    saida: `${String(8 + h + Math.floor(pausa / 60)).padStart(2, "0")}:${String(pausa % 60).padStart(2, "0")}`,
  };
  s.colaboradores = [
    {
      id: 1,
      nome: "Pessoa",
      cargo: "Atendente",
      sexo: "masculino",
      horasSemana: 40,
    },
  ];
  const domain = createDomain(s);
  return domain.validarLegal(s.colaboradores[0], [
    {
      data: "2026-10-05",
      weekday: 1,
      status: "T",
      horas: h,
      entradaMin: 480,
      saidaMin: 480 + h * 60 + pausa,
      intervaloMin: pausa,
      intervaloInicioMin: pausa ? 600 : null,
      intervaloFimMin: pausa ? 600 + pausa : null,
      jornadaAplicada: s.jornada,
    },
  ]);
}
test("art71: 4h sem pausa, 5/6h com 15min, mais de6 com60 e teto120", async () => {
  for (const [h, p, erro] of [
    [4, 0, false],
    [5, 0, true],
    [5, 15, false],
    [6, 15, false],
    [7, 15, true],
    [7, 60, false],
    [7, 120, false],
    [7, 135, true],
  ]) {
    const issues = await gerar(h, p);
    assert.equal(
      issues.some((i) =>
        ["INTRAJORNADA", "INTRAJORNADA_MAXIMA"].includes(i.tipo),
      ),
      erro,
      `${h}h/${p}min`,
    );
  }
});
test("sugestão automática pausa até4h da entrada e preserva duração e turno noturno", async () => {
  const { alternativasIntervalo } =
    await import("../assets/js/domain/intervalos-cobertura.js");
  for (const entrada of [480, 1200]) {
    const d = {
      data: "2026-10-05",
      weekday: 1,
      status: "T",
      horas: 8,
      entradaMin: entrada,
      saidaMin: entrada + 600,
      intervaloMin: 120,
      intervaloInicioMin: entrada + 360,
      intervaloFimMin: entrada + 480,
    };
    const options = [...alternativasIntervalo({}, d)];
    assert(options.length);
    for (const x of options) {
      assert(x.intervaloInicioMin - entrada <= 240);
      assert.equal(x.intervaloFimMin - x.intervaloInicioMin, 120);
      assert.equal(x.saidaMin, d.saidaMin);
    }
  }
});

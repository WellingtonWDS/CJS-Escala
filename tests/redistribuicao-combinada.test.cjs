const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const cenario = require("./helpers/cenario-redistribuicao.cjs");
let buscar, aplicar, desfazer, domain;
before(async () => {
  ({
    buscarAjustesCobertura: buscar,
    aplicarAjustesCobertura: aplicar,
    desfazerAjustesCobertura: desfazer,
  } = await import("../assets/js/domain/ajustes-cobertura.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
});
test("redistribuição coordenada fecha 09–17 quando nenhuma alteração isolada melhora com segurança", async () => {
  for (const fixa of [false, true]) {
    const s = await cenario(fixa),
      antes = structuredClone(s);
    const inicial = buscar(s),
      ampliada = buscar(s, { ampliada: true });
    assert.equal(inicial.alteracoes.length, 0);
    assert.equal(inicial.depois.minutosFaltantes, 300);
    assert.equal(ampliada.depois.minutosFaltantes, 0);
    assert(ampliada.acoes.some((a) => a.tipo === "redistribuicao_combinada"));
    assert(ampliada.tentativas <= 1200);
    assert.equal(ampliada.buscaAmpliada, true);
    assert.equal(
      ampliada.diagnosticoBusca.tipos.reduce((n, t) => n + t.avaliadas, 0),
      ampliada.tentativas,
    );
    assert.deepEqual(s, antes);
    const nova = aplicar(s, JSON.parse(JSON.stringify(ampliada)));
    assert(
      nova.validacoes.every((v) =>
        v.issues.every((i) => i.severidade !== "erro"),
      ),
    );
    for (const [i, r] of nova.resultado.entries()) {
      for (const d of r.dias.filter((d) => d.status === "T")) {
        assert.equal(d.horas, 4);
        assert.equal(d.entradaMin, i === 0 ? 540 : 780);
        assert.equal(d.saidaMin, i === 0 ? 780 : 1020);
      }
      for (const campo of ["diasContexto", "diasApuracao"])
        for (const d of r[campo] || []) {
          const visivel = r.dias.find((v) => v.data === d.data);
          if (visivel) assert.deepEqual(d, visivel);
        }
    }
    const volta = desfazer({ ...s, escalaGerada: nova });
    assert.deepEqual(volta.resultado, antes.escalaGerada.resultado);
  }
});
test("busca ampliada preserva edição manual, disponibilidade individual e funcionamento reduzido", async () => {
  for (const tipo of ["manual", "restricao", "funcionamento"]) {
    const s = await cenario();
    if (tipo === "manual")
      s.escalaGerada.resultado[0].dias.forEach((d) => (d.ajusteManual = true));
    if (tipo === "restricao") {
      const restricoes = {
        horariosPermitidos: [1, 2, 3, 4, 5].map((dia) => ({
          dia,
          entrada: "08:00",
          saida: "12:00",
        })),
      };
      s.colaboradores[0].restricoes = restricoes;
      s.escalaGerada.resultado[0].colaborador.restricoes =
        structuredClone(restricoes);
    }
    if (tipo === "funcionamento") s.jornada.saida = "16:00";
    const antes = structuredClone(s),
      p = buscar(s, { ampliada: true });
    assert.deepEqual(s, antes);
    assert(p.depois.minutosFaltantes > 0);
    for (const a of p.alteracoes)
      if (["T", "FE"].includes(a.depois.status)) {
        assert(a.depois.entradaMin >= 480);
        assert(a.depois.saidaMin <= (tipo === "funcionamento" ? 960 : 1080));
        if (tipo === "manual") assert.notEqual(a.colaboradorId, 1);
        if (tipo === "restricao" && a.colaboradorId === 1)
          assert(a.depois.saidaMin <= 720);
      }
  }
});
test("mantém folgas fixas no sábado e indica busca ampliada sem afirmar que toda redistribuição foi esgotada", async () => {
  const seed = await require("./helpers/cenario-explicacao-busca.cjs")();
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const s = converterEscala(seed, seed.destinoConversao).proposta.config;
  const p = buscar(s, { ampliada: true, limiteTentativas: 80 });
  assert(p.depois.minutosFaltantes > 0);
  assert(
    p.alteracoes.every(
      (a) => a.depois.weekday !== 6 || a.depois.status === "F",
    ),
  );
  assert.match(p.diagnosticoBusca.resumo, /folgas fixas/);
  assert.equal(p.buscaAmpliada, true);
  assert(p.tentativas <= 80);
});
test("conclusão de capacidade passa a explicar o resultado da busca inicial e da ampliada", async () => {
  const s = await cenario();
  const inicial = buscar(s),
    ampliada = buscar(s, { ampliada: true, limiteTentativas: 2 });
  assert.equal(inicial.diagnosticoBusca.capacidade.status, "redistribuicao");
  assert.doesNotMatch(
    inicial.diagnosticoBusca.capacidade.titulo,
    /Há margem para testar/,
  );
  assert.match(
    inicial.diagnosticoBusca.capacidade.orientacao,
    /Testar redistribuição ampliada/,
  );
  assert.match(
    ampliada.diagnosticoBusca.capacidade.titulo,
    /ampliada ainda não fechou/,
  );
  assert.match(
    ampliada.diagnosticoBusca.capacidade.orientacao,
    /Outros arranjos podem existir/,
  );
});
test("aplicar recusa plano obsoleto e plano combinado adulterado", async () => {
  const s = await cenario(),
    p = buscar(s, { ampliada: true });
  const adulterado = structuredClone(p);
  adulterado.alteracoes[0].depois.saidaMin = 1440;
  assert.throws(() => aplicar(s, adulterado), /conferência/);
  s.jornada.saida = "15:00";
  assert.throws(() => aplicar(s, p), /mudou/);
});
test("mês completo pode ser redistribuído sem alterar a origem, com orçamento ampliado explícito", async () => {
  const { converterEscala } = await import("../assets/js/domain/conversao.js");
  const seed = await cenario();
  seed.tipoEscala = "6x1";
  delete seed.aplicarProposta5x2;
  seed.colaboradores.forEach((c) => (c.quadroDominio.modelo = "6x1"));
  seed.escalaGerada = null;
  const c = converterEscala(seed, {
    periodo: "2026-10",
    fase: "definitivo40",
    folgas: "fim_semana",
  });
  const antes = structuredClone(c),
    p = buscar(c.proposta.config, { ampliada: true });
  assert.equal(p.limiteTentativas, 2400);
  assert.equal(p.limiteAcoes, 40);
  assert.equal(p.depois.minutosFaltantes, 0);
  assert(p.antes.dias > 20);
  assert(p.tentativas <= 2400);
  assert.deepEqual(c, antes);
  const nova = aplicar(c.proposta.config, p);
  assert.equal(nova.coberturaOperacional.lacunas.length, 0);
  assert(
    nova.validacoes.every((v) =>
      v.issues.every((i) => i.severidade !== "erro"),
    ),
  );
});

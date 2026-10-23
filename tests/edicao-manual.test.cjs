const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenario,
  editar,
  buscar,
  aplicar,
  desfazer,
  resumir,
  domain,
  assinatura,
  analisar;
before(async () => {
  ({ cenario, editar } = await import("./fixtures/edicao-manual.mjs"));
  ({
    buscarReadequacoesManuais: buscar,
    aplicarReadequacaoManual: aplicar,
    desfazerUltimaEdicaoManual: desfazer,
    resumirEdicaoManual: resumir,
  } = await import("../assets/js/domain/edicao-manual.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ assinaturaAjustes: assinatura } = await import(
    "../assets/js/domain/ajustes-cobertura.js"
  ));
  ({ analisarCobertura: analisar } = await import(
    "../assets/js/domain/cobertura.js"
  ));
});
const dia = (s, id, data) =>
  s.resultado
    .find((r) => r.colaborador.id === id)
    .dias.find((d) => d.data === data);
test("avisa imediatamente sobre segunda-feira trabalhada: 48h e apenas um repouso em 5x2", () => {
  const s = editar(cenario());
  const r = resumir(s);
  assert.equal(r.horas, 48);
  assert.equal(r.alvo, 40);
  assert.equal(r.repousos, 1);
  assert.equal(r.exigidos, 2);
  assert.ok(r.avisos.some((a) => a.includes("Escolha outro dia")));
  assert.ok(r.avisos.some((a) => a.includes("48:00")));
});
test("busca troca própria e com colega, preserva dia escolhido, 40h, dois repousos e cobertura sem mutar a prévia", () => {
  const s = editar(cenario()),
    antes = structuredClone(s),
    p = buscar(s);
  assert.deepEqual(s, antes);
  assert.ok(p.alternativas.length);
  const indice = p.alternativas.findIndex((o) => o.diaFolga === "2026-10-27");
  assert.ok(indice >= 0);
  const opcao = p.alternativas[indice];
  assert.equal(opcao.adicionais, 1);
  assert.equal(opcao.coberturaCompleta, true);
  const novo = aplicar(s, p, indice);
  assert.equal(novo.ultimaEdicaoManual, undefined);
  assert.equal(dia(novo, 1, "2026-10-26").status, "T");
  assert.equal(dia(novo, 1, "2026-10-27").status, "F");
  assert.ok(
    opcao.alteracoes.some(
      (a) =>
        a.colaboradorId === 2 &&
        a.antes.status === "T" &&
        a.depois.status === "F",
    ),
  );
  assert.equal(dia(novo, 2, "2026-10-27").status, "T");
  for (const r of novo.resultado) {
    assert.equal(r.dias.filter((d) => d.status === "F").length, 2);
    assert.equal(
      r.dias.reduce((t, d) => t + d.horas, 0),
      40,
    );
    assert.deepEqual(
      domain(s)
        .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
        .filter((i) => i.severidade === "erro"),
      [],
    );
  }
  assert.equal(analisar(s, novo.resultado).lacunas.length, 0);
});
test("sem cobertura, oferece troca de folga mas declara que a operação não foi avaliada", () => {
  const s = editar(cenario({ cobertura: false, pessoas: 1 })),
    p = buscar(s);
  assert.ok(p.alternativas.length);
  assert.ok(
    p.alternativas.every((o) => !o.coberturaAvaliada && o.adicionais === 0),
  );
  assert.match(p.avisos.join(" "), /Cobertura não avaliada/);
});
test("ao transformar trabalho em folga busca outro dia para repor o trabalho", () => {
  const s = editar(
      cenario({ cobertura: false, pessoas: 1 }),
      1,
      "2026-10-27",
      "F",
    ),
    p = buscar(s);
  assert.equal(p.semAjustesNecessarios, false);
  assert.ok(p.alternativas.length);
  const novo = aplicar(s, p, 0);
  assert.equal(dia(novo, 1, "2026-10-27").status, "F");
  assert.equal(dia(novo, 1, "2026-10-26").status, "T");
  assert.equal(
    novo.resultado[0].dias.reduce((a, d) => a + d.horas, 0),
    40,
  );
});
test("não altera dias que já foram editados manualmente nem folgas obrigatórias", () => {
  const s = cenario({ cobertura: false, pessoas: 1 });
  for (const d of s.escalaGerada.resultado[0].dias)
    if (d.status === "T") d.ajusteManual = true;
  editar(s);
  const p = buscar(s);
  assert.equal(p.alternativas.length, 0);
  assert.match(p.avisos.join(" "), /busca limitada/);
});
test("restrições que bloqueiam colegas não são ignoradas para cobrir a troca", () => {
  const s = cenario();
  s.colaboradores[1].restricoes = {
    diasIndisponiveis: [2],
    folgasObrigatorias: [],
    periodos: [],
    horariosPermitidos: [],
  };
  s.escalaGerada.resultado[1].colaborador.restricoes = structuredClone(
    s.colaboradores[1].restricoes,
  );
  editar(s);
  const p = buscar(s);
  assert.ok(
    !p.alternativas.some((o) =>
      o.alteracoes.some(
        (a) =>
          a.colaboradorId === 2 &&
          a.data === "2026-10-27" &&
          a.depois.status === "T",
      ),
    ),
  );
});
test("colega de outra função não é presumido habilitado para atender a cobertura", () => {
  const s = cenario();
  s.colaboradores[1].cargo = "Supervisor";
  s.escalaGerada.resultado[1].colaborador.cargo = "Supervisor";
  for (const d of s.escalaGerada.resultado[1].dias) delete d.funcaoAlocada;
  editar(s);
  const p = buscar(s);
  assert.ok(
    !p.alternativas.some((o) =>
      o.alteracoes.some(
        (a) => a.colaboradorId === 2 && a.depois.funcaoAlocada === "Atendente",
      ),
    ),
  );
});
test("plano obsoleto e desfazer após alteração posterior são bloqueados", () => {
  const s = editar(cenario()),
    p = buscar(s);
  s.jornada.entrada = "07:00";
  assert.throws(() => aplicar(s, p, 0), /mudou|desatualizada/);
  assert.throws(() => desfazer(s), /mudou/);
});
test("desfazer restaura apenas a última edição e mantém os resumos coerentes após JSON", () => {
  const original = cenario(),
    s = JSON.parse(JSON.stringify(editar(structuredClone(original))));
  const novo = desfazer(s);
  assert.equal(dia(novo, 1, "2026-10-26").status, "F");
  assert.deepEqual(novo.resultado, original.escalaGerada.resultado);
  assert.equal(novo.ultimaEdicaoManual, undefined);
});
test("edição que mantém a jornada não sugere trocas desnecessárias", () => {
  const s = editar(cenario({ cobertura: false }), 1, "2026-10-27", "T"),
    p = buscar(s);
  assert.equal(p.semAjustesNecessarios, true);
  assert.equal(p.alternativas.length, 0);
});
test("ciclos 12x36 exigem revisão do ciclo e não recebem trocas semanais automáticas", () => {
  const s = editar(cenario());
  s.tipoEscala = "12x36";
  s.escalaGerada.ultimaEdicaoManual.assinatura = assinatura(s);
  const p = buscar(s);
  assert.equal(p.alternativas.length, 0);
  assert.match(p.avisos.join(" "), /12×36/);
});
test("plano adulterado para mudar o dia explicitamente escolhido é rejeitado", () => {
  const s = editar(cenario()),
    p = buscar(s);
  const o = p.alternativas[0];
  o.alteracoes.push({
    colaboradorId: 1,
    data: "2026-10-26",
    depois: s.escalaGerada.ultimaEdicaoManual.antes,
  });
  assert.throws(() => aplicar(s, p, 0), /conferência/);
});

test("a revisão de uma referência atual conserva o alvo 44h mesmo com simulação futura selecionada", () => {
  const s = cenario();
  s.tipoEscala = "6x1";
  for (const c of [
    ...s.colaboradores,
    ...s.escalaGerada.resultado.map((r) => r.colaborador),
  ])
    c.horasSemana = 44;
  s.escalaGerada.referenciaAtual44 = true;
  s.escalaGerada.instrumentoReferencia = {
    base: "nenhuma",
    condicoes: s.instrumentoColetivo,
  };
  editar(s);
  const r = resumir(s);
  assert.equal(r.alvo, 44);
  assert.equal(r.exigidos, 1);
  assert.ok(r.avisos.some((a) => a.includes("44:00")));
});
test("aplicar após restauração JSON sincroniza dias visíveis, contexto e apuração, inclusive na virada do mês", () => {
  const s = JSON.parse(JSON.stringify(editar(cenario()))),
    p = buscar(s),
    novo = aplicar(s, p, 0);
  for (const r of novo.resultado)
    for (const campo of ["diasContexto", "diasApuracao"])
      for (const d of r[campo] || []) {
        const visivel = r.dias.find((v) => v.data === d.data);
        if (visivel) assert.deepEqual(d, visivel);
      }
  assert.equal(dia(novo, 1, "2026-11-01").status, "F");
  assert.equal(
    novo.resultado[0].dias.reduce((n, d) => n + d.horas, 0),
    40,
  );
});

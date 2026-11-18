const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const cenario = require("./helpers/cenario-explicacao-busca.cjs");
let converter, buscar, render, registro;
before(async () => {
  ({ converterEscala: converter } = await import(
    "../assets/js/domain/conversao.js"
  ));
  ({ buscarAjustesCobertura: buscar } = await import(
    "../assets/js/domain/ajustes-cobertura.js"
  ));
  ({ renderExplicacaoBusca: render } = await import(
    "../assets/js/ui/explicacao-busca.js"
  ));
  ({ criarRegistroBusca: registro } = await import(
    "../assets/js/domain/explicacao-busca.js"
  ));
});
const proposta = (s) => converter(s, s.destinoConversao).proposta.config;
test("sete colaboradores: distingue folgas fixas, tentativas reais e limite contratual do sábado nos dois modelos", async () => {
  for (const fixa of [false, true]) {
    const p = proposta(await cenario(fixa)),
      antes = structuredClone(p),
      plano = buscar(p);
    assert.deepEqual(p, antes);
    const d = plano.diagnosticoBusca;
    assert(
      d.lacunas.some((g) =>
        g.bloqueios.some((b) => b.codigo === "folgas_fim_semana"),
      ),
    );
    assert.match(d.resumo, /folgas fixas/);
    const teto = d.lacunas
      .flatMap((g) => g.limitesContratuais)
      .find((l) => l.mensagem.includes("39:36"));
    assert(teto);
    assert.match(teto.mensagem, /não desconta os intervalos/);
    assert.match(teto.mensagem, /não uma prova isolada de falta de pessoal/);
    assert.equal(
      d.tipos.reduce((s, t) => s + t.avaliadas, 0),
      plano.tentativas,
    );
    assert.equal(
      d.tipos.reduce((s, t) => s + t.aceitas, 0),
      plano.acoes.length,
    );
    assert(d.lacunas.length <= 16);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(plano)));
  }
});
test("zero alternativas por configuração não é erro de processamento; sem habilitados é explicitado", async () => {
  const s = await cenario();
  s.demandasCobertura = s.demandasCobertura.filter((d) =>
    d.diasSemana.includes(6),
  );
  const p = proposta(s);
  // Ao preservar os dias úteis, também não há tentativas envolvendo a sexta
  // anterior ao sábado; nem uma troca completa chega a ser gerada.
  for (const r of p.escalaGerada.resultado)
    for (const d of r.dias) if (d.status === "T") d.ajusteManual = true;
  const semAlternativas = buscar(p);
  assert.equal(semAlternativas.tentativas, 0);
  assert.equal(
    semAlternativas.diagnosticoBusca.encerramento,
    "sem_alternativas",
  );
  assert.match(render(semAlternativas), /zero tentativas não significa falha/);
  p.demandasCobertura.forEach((d) => (d.funcao = "Enfermeiro"));
  const semHabilitados = buscar(p).diagnosticoBusca;
  assert(
    semHabilitados.lacunas.every(
      (g) =>
        g.habilitados === 0 &&
        g.bloqueios.some((b) => b.codigo === "habilitacao"),
    ),
  );
  assert.equal(semHabilitados.capacidade.status, "capacidade_insuficiente");
});
test("contrato menor não recebe falsa impossibilidade de completar 42h", async () => {
  const s = await cenario();
  s.colaboradores.forEach((c) => (c.horasSemana = 30));
  const p = proposta(s),
    d = buscar(p).diagnosticoBusca;
  assert(d.lacunas.every((g) => !g.limitesContratuais.length));
});
test("contagens incluem todas as avaliações, mas exemplos e dados de cada tentativa são limitados", () => {
  const c = registro({
    resultado: [{ colaborador: { id: 1, nome: "Teste" } }],
  });
  const dia = {
    data: "2027-02-08",
    status: "T",
    entradaMin: 480,
    saidaMin: 1080,
    horas: 8,
    grande: "não copiar",
  };
  const candidato = {
    tipo: "horario",
    alteracoes: [
      { colaboradorId: 1, antes: dia, depois: { ...dia, entradaMin: 420 } },
    ],
  };
  for (let i = 0; i < 1000; i++)
    c.registrar(candidato, "funcionamento", "Fora da abertura");
  c.registrar(candidato, null);
  c.registrar(candidato, "recorrencia", "Não repete", false);
  const d = c.resultado();
  assert.equal(d.tipos[0].avaliadas, 1001);
  assert.equal(d.tipos[0].aceitas, 1);
  assert.equal(d.tipos[0].filtradas, 1);
  assert.equal(d.motivos[0].total, 1000);
  assert.equal(d.motivos[0].exemplos.length, 2);
  assert(!JSON.stringify(d).includes("não copiar"));
  assert(JSON.stringify(d).length < 6000);
});
test("limite atingido, descartes concretos e segurança do HTML são expostos sem aplicar a prévia", async () => {
  const p = await require("./helpers/cenario-redistribuicao.cjs")(),
    plano = buscar(p, { limiteTentativas: 2,agora:()=>0 });
  assert.equal(plano.diagnosticoBusca.encerramento, "limite_tentativas");
  assert.equal(
    plano.diagnosticoBusca.tipos.reduce(
      (s, t) => s + t.descartadas + t.aceitas,
      0,
    ),
    plano.tentativas,
  );
  assert(plano.diagnosticoBusca.motivos.length);
  const d = plano.diagnosticoBusca;
  d.motivos[0].exemplos[0].mensagem = "<img src=x onerror=alert(1)>";
  const html = render(plano);
  assert(html.includes("&lt;img"));
  assert(!html.includes("<img src=x"));
  assert.match(html, /Outros arranjos podem existir/);
  assert.match(html, /amostra de até duas/);
  assert.match(html, /não é automaticamente falta, desconto ou abono/);
});

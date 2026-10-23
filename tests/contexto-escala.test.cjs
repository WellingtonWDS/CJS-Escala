const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let base,
  referencia,
  converter,
  contexto,
  domain,
  csv,
  apurar,
  buscar,
  assinatura;
before(async () => {
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ gerarReferenciaAtual: referencia, converterEscala: converter } =
    await import("../assets/js/domain/conversao.js"));
  ({ configDaEscala: contexto } = await import(
    "../assets/js/domain/contexto-escala.js"
  ));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ apurarSemana: apurar } = await import(
    "../assets/js/domain/resumo-semanal.js"
  ));
  ({ buscarAjustesCobertura: buscar, assinaturaAjustes: assinatura } =
    await import("../assets/js/domain/ajustes-cobertura.js"));
});
function empresa() {
  const s = base(new Date(2026, 9, 23));
  s.colaboradores = [
    {
      id: 1,
      nome: "Pessoa de teste",
      cargo: "Atendente",
      sexo: "masculino",
      horasSemana: 44,
    },
  ];
  Object.assign(s, {
    modoRegime: "simulacao",
    regimeJornada: "transicao42",
    instrumentoCompensacao: "act_cct",
    horarioPorDia: true,
  });
  Object.assign(s.instrumentoColetivo, {
    identificacao: "CCT de teste",
    inicio: "2026-12-16",
    fim: "2027-12-15",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 8.5,
  });
  s.jornada = {
    entrada: "08:00",
    intInicio: "11:00",
    intFim: "13:00",
    saida: "18:00",
  };
  for (let d = 1; d <= 6; d++)
    s.jornadaPorDia[d] =
      d === 6
        ? {
            entrada: "08:00",
            intInicio: "12:00",
            intFim: "00:00",
            saida: "00:00",
          }
        : { ...s.jornada };
  return s;
}
function erros(s) {
  const config = contexto(s);
  return s.escalaGerada.resultado
    .flatMap((r) =>
      domain(config).validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      ),
    )
    .filter((i) => i.severidade === "erro");
}
test("referência criada pela conversão mantém 44h e intervalo 11–13 sem receber a fase futura", () => {
  const s = empresa();
  s.escalaGerada = referencia(s).escala;
  const c = contexto(s);
  assert.equal(c.regimeJornada, "atual44");
  assert.equal(s.regimeJornada, "transicao42");
  assert.equal(erros(s).length, 0);
  const r = s.escalaGerada.resultado[0],
    semana = r.dias.filter(
      (d) => d.data >= "2026-10-05" && d.data <= "2026-10-11",
    );
  const a = apurar(r.colaborador, semana, c);
  assert.equal(a.alvo, 44);
  assert.equal(a.estado, "ok");
  assert.equal(
    semana.reduce((total, d) => total + d.horas, 0),
    44,
  );
  assert.equal(semana[0].intervaloMin, 120);
  const c2 = converter(s, {
    periodo: "2026-12",
    fase: "transicao42",
    folgas: "distribuir",
  });
  assert.equal(c2.origem.config.regimeJornada, "atual44");
  assert.equal(c2.proposta.config.regimeJornada, "transicao42");
});
test("CSV e restauração preservam o contexto da referência atual", () => {
  const s = empresa();
  s.escalaGerada = referencia(s).escala;
  const restaurado = JSON.parse(JSON.stringify(s));
  assert.equal(erros(restaurado).length, 0);
  const exportado = csv(restaurado);
  assert.doesNotMatch(exportado, /REPOUSO_SEMANAL|INSTRUMENTO_FORA_VIGENCIA/);
  assert.equal(restaurado.regimeJornada, "transicao42");
  assert.equal(contexto(restaurado).regimeJornada, "atual44");
});
test("edições com excesso real continuam inválidas na referência de 44h", () => {
  const s = empresa();
  s.escalaGerada = referencia(s).escala;
  const d = s.escalaGerada.resultado[0].dias.find(
    (d) => d.data === "2026-10-05",
  );
  d.horas = 9;
  d.saidaMin += 60;
  assert.ok(erros(s).some((i) => i.tipo === "JORNADA_DIARIA"));
  assert.ok(erros(s).some((i) => i.tipo === "LIMITE_SEMANAL"));
});
test("prévia avulsa explícita não herda o contexto anterior da conversão", () => {
  const s = empresa();
  s.escalaGerada = referencia(s).escala;
  s.escalaGerada = domain(s).gerarDadosEscala();
  assert.ok(!s.escalaGerada.referenciaAtual44);
  assert.equal(contexto(s), s);
});
test("busca de cobertura usa a mesma referência preservada na tela e no CSV", () => {
  const s = empresa();
  s.coberturaAtiva = true;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "10:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
  ];
  s.escalaGerada = referencia(s).escala;
  const plano = buscar(s, { limiteTentativas: 10 });
  assert.equal(plano.assinaturaAntes, assinatura(s));
  assert.equal(plano.assinaturaAntes, assinatura(contexto(s)));
  assert.equal(plano.antes.minutosFaltantes, 0);
  assert.equal(s.regimeJornada, "transicao42");
});

test("ACT/CCT vigente da origem é preservado e autoriza somente o limite diário declarado", () => {
  const s = empresa();
  Object.assign(s.instrumentoColetivo, {
    inicio: "2026-01-01",
    fim: "2026-12-31",
    limiteDiario: 8.5,
  });
  for (let d = 1; d <= 5; d++) s.jornadaPorDia[d].saida = "18:30";
  s.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "09:30",
    intFim: "00:00",
    saida: "00:00",
  };
  s.escalaGerada = referencia(s).escala;
  assert.equal(contexto(s).instrumentoCompensacao, "act_cct");
  assert.equal(erros(s).length, 0);
  // Alterar o formulário depois não muda as condições preservadas desta referência.
  s.instrumentoColetivo.limiteDiario = 10;
  assert.equal(contexto(s).instrumentoColetivo.limiteDiario, 8.5);
  const restaurado = JSON.parse(JSON.stringify(s));
  const d = restaurado.escalaGerada.resultado[0].dias.find(
    (d) => d.data === "2026-10-05",
  );
  d.horas = 9;
  d.saidaMin += 30;
  assert.ok(erros(restaurado).some((i) => i.tipo === "JORNADA_DIARIA"));
});
test("ACT futuro ou expirado não autoriza compensação diária na origem", () => {
  for (const datas of [
    { inicio: "2026-12-16", fim: "2027-12-15" },
    { inicio: "2026-01-01", fim: "2026-08-31" },
  ]) {
    const s = empresa();
    Object.assign(s.instrumentoColetivo, datas);
    for (let d = 1; d <= 5; d++) s.jornadaPorDia[d].saida = "18:30";
    s.escalaGerada = referencia(s).escala;
    assert.equal(contexto(s).instrumentoCompensacao, "nenhuma");
    assert.ok(erros(s).some((i) => i.tipo === "JORNADA_DIARIA"));
  }
});
test("ACT com vigência inválida continua sinalizado para revisão", () => {
  const s = empresa();
  s.instrumentoColetivo.inicio = "";
  s.escalaGerada = referencia(s).escala;
  assert.equal(contexto(s).instrumentoCompensacao, "act_cct");
  assert.ok(erros(s).length > 0);
  const invertido = empresa();
  Object.assign(invertido.instrumentoColetivo, {
    inicio: "2026-12-16",
    fim: "2026-08-31",
  });
  invertido.escalaGerada = referencia(invertido).escala;
  assert.equal(contexto(invertido).instrumentoCompensacao, "act_cct");
  assert.ok(erros(invertido).length > 0);
});

test("jornada de dez horas sem pausa explica que nenhum intervalo foi descontado", () => {
  const s = empresa();
  for (let d = 1; d <= 5; d++)
    s.jornadaPorDia[d] = {
      entrada: "08:00",
      intInicio: "18:00",
      intFim: "00:00",
      saida: "00:00",
    };
  s.escalaGerada = referencia(s).escala;
  assert.ok(
    erros(s)
      .filter((i) => i.tipo === "JORNADA_DIARIA")
      .every((i) =>
        i.mensagem.includes("Intervalo descontado neste dia: 00:00"),
      ),
  );
  assert.ok(erros(s).some((i) => i.tipo === "JORNADA_DIARIA"));
});

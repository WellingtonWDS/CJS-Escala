const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let converter, comparar, base, domain, csv;
before(async () => {
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ converterEscala: converter, compararConversao: comparar } = await import(
    "../assets/js/domain/conversao.js"
  ));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
});
function empresa(n = 2) {
  const s = base(new Date(2026, 9, 21));
  s.colaboradores = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    nome: `Pessoa ${i + 1}`,
    sexo: "masculino",
    cargo: "Atendente",
    horasSemana: 40,
  }));
  s.jornada = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "13:00",
    saida: "17:00",
  };
  s.coberturaAtiva = true;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "12:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5, 6],
      incluirFeriados: false,
    },
  ];
  return s;
}
const op = { periodo: "2028-02", fase: "automatico", folgas: "distribuir" };
test("conversão preserva origem, operação aos sábados, contratos e funções, com cobertura suficiente", () => {
  const s = empresa(),
    original = structuredClone(s),
    c = converter(s, op),
    p = c.proposta.config;
  assert.deepEqual(s, original);
  assert.equal(c.comparacao.status, "suficiente");
  assert.equal(c.comparacao.faltantesDepois, 0);
  assert.deepEqual(p.diasTrabalho, [1, 2, 3, 4, 5, 6]);
  assert.equal(s.tipoEscala, "6x1");
  assert.equal(p.tipoEscala, "5x2");
  assert.equal(s.mes, 9);
  assert.equal(p.mes, 1);
  assert.equal(p.ano, 2028);
  assert.deepEqual(p.colaboradores, s.colaboradores);
  for (const r of p.escalaGerada.resultado) {
    const semana = r.dias.filter(
      (d) => d.data >= "2028-02-07" && d.data <= "2028-02-13",
    );
    assert.equal(
      semana.filter((d) => ["T", "FE"].includes(d.status)).length,
      5,
    );
    assert.equal(
      semana.reduce((sum, d) => sum + d.horas, 0),
      40,
    );
    assert.ok(
      r.dias.filter((d) => d.horas > 0).every((d) => d.saidaMin <= 17 * 60),
    );
  }
});
test("uma pessoa não cobre seis dias, mesmo quando sobram horas contratuais", () => {
  const c = converter(empresa(1), op);
  assert.equal(c.comparacao.status, "insuficiente");
  assert.ok(
    c.comparacao.funcoes[0].insuficiencias.some((s) =>
      s.includes("dias-pessoa"),
    ),
  );
  assert.ok(c.comparacao.lacunas.some((l) => l.faltantes === 1));
});
test("insuficiência de horas e função ausente têm explicação; outra função não substitui", () => {
  const s = empresa(1);
  s.demandasCobertura[0].fim = "18:00";
  s.demandasCobertura.push({
    ...s.demandasCobertura[0],
    id: 2,
    funcao: "Supervisor",
  });
  const m = converter(s, op).comparacao;
  assert.equal(m.status, "insuficiente");
  assert.ok(m.funcoes[0].insuficiencias.some((s) => s.includes("h-pessoa")));
  assert.ok(
    m.funcoes[1].insuficiencias.some((s) => s.includes("Nenhum colaborador")),
  );
});
test("intervalos escalonados na proposta atendem demanda durante a pausa original", () => {
  const s = empresa(3);
  s.demandasCobertura[0].inicio = "12:00";
  s.demandasCobertura[0].fim = "13:00";
  const proposta = converter(s, op);
  const m = proposta.comparacao;
  assert.equal(m.status, "suficiente");
  assert.equal(m.lacunas.length, 0);
  assert.ok(proposta.proposta.config.escalaGerada.sugestoesIntervalos.length);
  assert.match(
    csv(proposta.proposta.config),
    /Início do intervalo;Fim do intervalo;Intervalo sugerido para cobertura/,
  );
  assert.equal(m.funcoes[0].insuficiencias.length, 0);
});
test("cobertura desativada, vazia ou exigida em dia fechado nunca produz falsa suficiência", () => {
  for (const kind of ["desativada", "vazia", "sem_dias"]) {
    const s = empresa();
    if (kind === "desativada") s.coberturaAtiva = false;
    if (kind === "vazia") s.demandasCobertura = [];
    if (kind === "sem_dias") s.demandasCobertura[0].diasSemana = [0];
    assert.notEqual(converter(s, op).comparacao.status, "suficiente");
  }
});
test("busca redistribui folgas de atendentes que ficariam ausentes no mesmo dia", () => {
  const s = empresa(6);
  s.colaboradores.forEach(
    (c, i) => (c.cargo = [0, 5].includes(i) ? "Atendente" : "Supervisor"),
  );
  const c = converter(s, op);
  assert.equal(c.comparacao.status, "suficiente");
  assert.notDeepEqual(
    c.proposta.config.planoFolgasConversao[1],
    c.proposta.config.planoFolgasConversao[6],
  );
  assert.ok(c.tentativas > 0);
});
test("empresa aberta todos os dias mantém a folga fixa atual e limita sequências a seis dias", () => {
  const s = empresa(4);
  s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
  s.folgaTipo = "fixa";
  s.folgaDiasPermitidos = [0, 1, 2, 3, 4, 5, 6];
  const c = converter(s, op);
  assert.deepEqual(c.proposta.config.diasTrabalho, s.diasTrabalho);
  for (const plano of Object.values(c.proposta.config.planoFolgasConversao))
    assert.ok(plano.includes(0));
  for (const r of c.proposta.config.escalaGerada.resultado) {
    let seguidos = 0;
    for (const d of [...r.diasContexto, ...r.dias]) {
      seguidos = ["T", "FE"].includes(d.status) ? seguidos + 1 : 0;
      assert.ok(seguidos <= 6);
    }
  }
});
test("Natal no destino conta na distribuição de repouso sem perder o abono", () => {
  const s = empresa();
  const c = converter(s, { ...op, periodo: "2028-12" });
  for (const r of c.proposta.config.escalaGerada.resultado) {
    const semana = r.dias.filter(
      (d) => d.data >= "2028-12-25" && d.data <= "2028-12-31",
    );
    assert.equal(semana.filter((d) => d.status === "F").length, 2);
    assert.equal(semana.find((d) => d.data === "2028-12-25").status, "F");
    assert.ok(
      Math.abs(
        semana.reduce(
          (sum, d) =>
            sum +
            d.horas +
            (d.status === "F" && d.previsto && d.feriado
              ? d.horasPrevistas
              : 0),
          0,
        ) - 40,
      ) < 0.001,
    );
  }
});
test("folga fixa somente no domingo ganha segundo repouso sem apagar o domingo atual", () => {
  const s = empresa(3);
  s.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
  s.folgaTipo = "fixa";
  s.folgaDiasPermitidos = [0];
  const c = converter(s, op);
  for (const plano of Object.values(c.proposta.config.planoFolgasConversao)) {
    assert.equal(plano.length, 2);
    assert.ok(plano.includes(0));
  }
});
test("fim de semana fixo é explícito e não fecha a empresa nem oculta sábado descoberto", () => {
  const c = converter(empresa(), { ...op, folgas: "fim_semana" });
  assert.deepEqual(c.proposta.config.diasTrabalho, [1, 2, 3, 4, 5, 6]);
  assert.ok(
    c.comparacao.lacunas.some(
      (l) => new Date(l.data + "T12:00:00").getDay() === 6,
    ),
  );
  for (const r of c.proposta.config.escalaGerada.resultado)
    assert.ok(
      r.dias
        .filter((d) => [0, 6].includes(d.weekday))
        .every((d) => d.status === "F"),
    );
});
test("sábado reduzido não é estendido e a busca prioriza planos que completam a carga", () => {
  const s = empresa();
  s.horarioPorDia = true;
  s.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "00:00",
    saida: "00:00",
  };
  const c = converter(s, op);
  for (const r of c.proposta.config.escalaGerada.resultado)
    assert.ok(
      r.dias
        .filter((d) => d.weekday === 6 && d.horas > 0)
        .every((d) => d.saidaMin <= 720 && d.horas <= 4),
    );
  assert.ok(c.comparacao.pessoas.every((p) => !p.deficits));
  assert.ok(c.comparacao.lacunas.some((l) => new Date(l.data + "T12:00:00").getDay() === 6));
});
test("fase de 42h não presume autorização para ultrapassar 8h diárias", () => {
  const s = empresa();
  s.colaboradores.forEach((c) => (c.horasSemana = 44));
  s.jornada.saida = "18:00";
  const c = converter(s, { ...op, periodo: "2027-02" });
  for (const r of c.proposta.config.escalaGerada.resultado)
    assert.ok(r.dias.every((d) => d.horas <= 8));
  assert.ok(c.comparacao.pessoas.some((p) => p.deficits));
  assert.notEqual(c.comparacao.status, "suficiente");
});
test("ACT válido permite distribuir 42h; horários originais são o teto", () => {
  const s = empresa();
  s.colaboradores.forEach((c) => (c.horasSemana = 44));
  s.jornada.saida = "18:00";
  s.instrumentoCompensacao = "act_cct";
  Object.assign(s.instrumentoColetivo, {
    identificacao: "ACT teste",
    inicio: "2026-01-01",
    fim: "2029-12-31",
    compativelEC141: true,
    compensacaoDiaria: true,
    limiteDiario: 10,
  });
  const c = converter(s, { ...op, periodo: "2027-02" });
  for (const r of c.proposta.config.escalaGerada.resultado) {
    const semana = r.dias.filter(
      (d) => d.data >= "2027-02-08" && d.data <= "2027-02-14",
    );
    assert.ok(
      Math.abs(semana.reduce((sum, d) => sum + d.horas, 0) - 42) < 0.001,
    );
    assert.ok(semana.every((d) => d.saidaMin <= 18 * 60));
  }
});
test("feriado local da origem não muda de mês; snapshot preserva edição manual original", () => {
  const s = empresa();
  s.feriados = [
    { dia: 12, nome: "Local", tipo: "municipal", trabalhado: false },
  ];
  s.escalaGerada = domain(s).gerarDadosEscala();
  s.escalaGerada.resultado[0].dias[0].status = "FC";
  const c = converter(s, op);
  assert.equal(c.origem.escala.resultado[0].dias[0].status, "FC");
  assert.ok(!c.proposta.config.feriados.some((f) => f.nome === "Local"));
  assert.ok(
    c.proposta.config.feriadosConfigurados.some(
      (f) => f.nome === "Local" && f.mes === 9,
    ),
  );
});
test("recalcular após ajuste manual muda conclusão sem alterar referência original", () => {
  const c = converter(empresa(), op),
    original = structuredClone(c.origem);
  c.proposta.config.escalaGerada.resultado.forEach((r) =>
    r.dias.forEach((d) => {
      d.horas = 0;
      d.status = "F";
    }),
  );
  const m = comparar(c);
  assert.ok(m.faltantesDepois > 0);
  assert.notEqual(m.status, "suficiente");
  assert.deepEqual(c.origem, original);
});
test("turnos noturnos mantêm saída no dia seguinte e ficam sujeitos à revisão específica", () => {
  const s = empresa(4);
  s.jornada = {
    entrada: "22:00",
    intInicio: "02:00",
    intFim: "03:00",
    saida: "07:00",
  };
  s.demandasCobertura[0].inicio = "23:00";
  s.demandasCobertura[0].fim = "01:00";
  const c = converter(s, op);
  assert.ok(
    c.proposta.config.escalaGerada.resultado[0].dias.some(
      (d) => d.horas > 0 && d.saidaMin > 1440,
    ),
  );
  assert.ok(
    c.proposta.config.escalaGerada.validacoes.some((v) =>
      v.issues.some((i) => i.tipo === "TRABALHO_NOTURNO"),
    ),
  );
});
test("busca é limitada e resultado determinístico", () => {
  const s = empresa(4),
    a = converter(s, op),
    b = converter(s, op);
  assert.deepEqual(
    a.proposta.config.planoFolgasConversao,
    b.proposta.config.planoFolgasConversao,
  );
  assert.ok(a.tentativas <= a.limiteBusca);
});
test("rejeita tipo incompatível, período inválido, horas/horários inválidos e início antes da transição automática", () => {
  const s = empresa();
  assert.throws(() => converter({ ...s, tipoEscala: "12x36" }, op), /6×1/);
  assert.throws(
    () => converter(s, { ...op, periodo: "2026-10" }),
    /segundo repouso/,
  );
  assert.throws(() => converter(s, { ...op, periodo: "2028-13" }), /inválido/);
  assert.throws(
    () => converter({ ...s, jornada: { ...s.jornada, entrada: "xx" } }, op),
    /horários/,
  );
  assert.throws(
    () => converter({ ...s, colaboradores: [] }, op),
    /colaborador/,
  );
  assert.equal(
    converter(s, { ...op, periodo: "2026-10", fase: "definitivo40" }).proposta
      .config.modoRegime,
    "simulacao",
  );
});

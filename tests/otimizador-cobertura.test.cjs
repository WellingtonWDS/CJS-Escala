const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let converter, buscar, aplicar, desfazer, analisar, base, faixa;
before(async () => {
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ buscarAjustesCobertura: buscar, aplicarAjustesCobertura: aplicar, desfazerAjustesCobertura: desfazer } =
    await import("../assets/js/domain/ajustes-cobertura.js"));
  ({ analisarCobertura: analisar } = await import("../assets/js/domain/cobertura.js"));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ faixaInicioIntervalo: faixa } = await import("../assets/js/domain/politica-intervalo.js"));
});
const J = (entrada, intInicio, intFim, saida) => ({ entrada, intInicio, intFim, saida });
const seg = [1, 2, 3, 4, 5, 6];
function empresa({ n, minimo, jornada = J("08:00", "12:00", "13:00", "17:00"), extra = {} }) {
  const s = base(new Date(2026, 9, 21));
  s.colaboradores = Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `P${i + 1}`, sexo: "masculino", cargo: "Atendente", horasSemana: 44 }));
  Object.assign(s, { jornada, diasTrabalho: seg, folgaDiasPermitidos: [...seg], coberturaAtiva: true, politicaFeriados: "conta_folga",
    demandasCobertura: [{ id: 1, funcao: "Atendente", inicio: jornada.entrada, fim: jornada.saida, minimo, diasSemana: seg, incluirFeriados: false }], ...extra });
  return converter(s, { periodo: "2027-03", fase: "automatico", folgas: "distribuir" }).proposta.config;
}
/** Junta todos os almoços às 12h (válido: 4h após a entrada), abrindo lacunas
 * que a busca precisa desfazer escalonando almoços e trocando folgas. */
function juntarAlmocos(cfg) {
  const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (const r of cfg.escalaGerada.resultado)
    for (const campo of ["dias", "diasContexto", "diasApuracao"])
      for (const d of r[campo] || []) {
        if (!["T", "FE"].includes(d.status) || !d.intervaloMin) continue;
        d.intervaloInicioMin = 720; d.intervaloFimMin = 720 + d.intervaloMin;
        d.jornadaAplicada = { ...d.jornadaAplicada, intInicio: minToTime(720), intFim: minToTime(720 + d.intervaloMin) };
      }
  return cfg;
}
const total = (rel) => rel.lacunas.reduce((n, l) => n + (l.fimMin - l.inicioMin) * l.faltantes, 0);
// Relógio congelado e orçamento fixo: resultado determinístico e rápido.
const opcoes = { agora: () => 0, iteracoesOtimizacao: 150000, limiteTentativas: 400 };
function conferirPlano(cfg, plano) {
  const nova = aplicar(cfg, JSON.parse(JSON.stringify(plano)));
  assert(nova.validacoes.every((v) => v.issues.every((i) => i.severidade !== "erro")));
  for (const a of plano.alteracoes) {
    const d = a.depois;
    if (!["T", "FE"].includes(d.status)) continue;
    // Funcionamento rígido da aba Jornada e almoço entre 3h e 5h após a entrada.
    assert(d.entradaMin >= 480 && d.saidaMin <= 1020, `${a.data}: ${d.entradaMin}-${d.saidaMin}`);
    if (d.horas > 6 && d.intervaloMin) {
      const f = faixa(d);
      assert(d.intervaloInicioMin >= f.inicio && d.intervaloInicioMin <= f.fim, `${a.data}: almoço ${d.intervaloInicioMin}`);
      assert(d.intervaloMin >= 60);
    }
  }
  // Horas por pessoa e semana preservadas.
  for (const [i, r] of nova.resultado.entries())
    assert.equal(r.dias.reduce((s, d) => s + d.horas, 0).toFixed(4), cfg.escalaGerada.resultado[i].dias.reduce((s, d) => s + d.horas, 0).toFixed(4));
  return nova;
}

const sig = (d) => [d.entradaMin, d.saidaMin, d.intervaloInicioMin, d.intervaloFimMin].join("|");
/** A busca mantém o padrão do colaborador no mês: dias que tinham o mesmo horário
 * terminam com o mesmo horário (ex.: não escalona o almoço só em alguns dias). */
function conferirPadrao(cfg, plano) {
  for (const a of plano.alteracoes) {
    if (!["T", "FE"].includes(a.antes.status) || !["T", "FE"].includes(a.depois.status) || sig(a.antes) === sig(a.depois)) continue;
    const r = cfg.escalaGerada.resultado.find((x) => x.colaborador.id === a.colaboradorId);
    for (const d of r.dias.filter((d) => d.data.slice(0, 7) === a.data.slice(0, 7) && ["T", "FE"].includes(d.status) && sig(d) === sig(a.antes) && !d.ajusteManual)) {
      const mudou = plano.alteracoes.find((x) => x.colaboradorId === a.colaboradorId && x.data === d.data);
      assert.ok(mudou, `${a.colaboradorId} ${d.data}: o padrão de ${a.data} também vale neste dia`);
      // Dia que virou folga numa troca de folgas não tem horário a comparar.
      if (["T", "FE"].includes(mudou.depois.status))
        assert.equal(sig(mudou.depois), sig(a.depois), `${a.colaboradorId} ${d.data}: mesmo horário do padrão`);
    }
  }
}
test("otimização global escalona almoços mantendo o padrão de cada colaborador no mês", () => {
  const cfg = juntarAlmocos(empresa({ n: 4, minimo: 2 })), original = structuredClone(cfg);
  const plano = buscar(cfg, opcoes);
  assert(plano.antes.minutosFaltantes > 0);
  assert(plano.depois.minutosFaltantes <= plano.antes.minutosFaltantes * 0.2, `${plano.antes.minutosFaltantes} → ${plano.depois.minutosFaltantes}`);
  assert(plano.acoes.some((a) => a.tipo === "otimizacao_global"));
  assert.deepEqual(cfg, original);
  conferirPadrao(cfg, plano);
  const nova = conferirPlano(cfg, plano);
  assert.equal(total(analisar(cfg, nova.resultado)), plano.depois.minutosFaltantes);
  assert.deepEqual(desfazer({ ...cfg, escalaGerada: nova }).resultado, original.escalaGerada.resultado);
});

test("sem solução completa com o padrão mantido, reduz a lacuna sem ficar abaixo do limite inferior", () => {
  // 5 pessoas para 3 presentes o dia inteiro: dias com 4 pessoas têm 1h
  // inevitável, pois os almoços obrigatórios ocorrem entre 11h e 14h.
  const cfg = juntarAlmocos(empresa({ n: 5, minimo: 3 }));
  const plano = buscar(cfg, opcoes);
  assert(plano.depois.minutosFaltantes < plano.antes.minutosFaltantes);
  assert(plano.depois.minutosFaltantes >= plano.limitesCobertura.limiteInferiorMin);
  conferirPadrao(cfg, plano);
  conferirPlano(cfg, plano);
});

test("o limite inferior nunca supera a lacuna alcançada", () => {
  for (const [n, minimo] of [[3, 2], [4, 3], [6, 3], [7, 4]]) {
    const cfg = empresa({ n, minimo, jornada: J("08:00", "12:00", "14:00", "18:00") });
    const plano = buscar(cfg, opcoes);
    assert(plano.limitesCobertura.limiteInferiorMin <= plano.depois.minutosFaltantes, `${n}/${minimo}`);
    assert(plano.depois.minutosFaltantes <= plano.antes.minutosFaltantes);
  }
});

test("demanda fora do funcionamento é comprovada como inevitável e explicada", () => {
  const cfg = empresa({ n: 4, minimo: 1 });
  cfg.demandasCobertura = [{ id: 1, funcao: "Atendente", inicio: "17:00", fim: "20:00", minimo: 1, diasSemana: seg, incluirFeriados: false }];
  const plano = buscar(cfg, opcoes);
  assert.equal(plano.alteracoes.length, 0);
  assert.equal(plano.limitesCobertura.comprovado, true);
  assert.match(plano.limitesCobertura.explicacoes.join(" "), /fora do horário de funcionamento/);
});

test("folgas fixas da origem não são liberadas pela otimização", () => {
  const s = base(new Date(2026, 9, 21));
  s.colaboradores = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, nome: `P${i + 1}`, sexo: "masculino", cargo: "Atendente", horasSemana: 44 }));
  Object.assign(s, { jornada: J("08:00", "12:00", "13:00", "17:00"), diasTrabalho: [1, 2, 3, 4, 5, 6, 0],
    folgaTipo: "fixa", folgaDiasPermitidos: [0, 1, 2, 3, 4, 5, 6], coberturaAtiva: true,
    demandasCobertura: [{ id: 1, funcao: "Atendente", inicio: "08:00", fim: "17:00", minimo: 3, diasSemana: [0, 1, 2, 3, 4, 5, 6], incluirFeriados: false }] });
  const cfg = converter(s, { periodo: "2027-03", fase: "automatico", folgas: "distribuir" }).proposta.config;
  const fixas = cfg.folgasFixasOrigemCobertura;
  assert(fixas.length);
  const plano = buscar(cfg, opcoes);
  for (const a of plano.alteracoes)
    if (fixas.includes(a.depois.weekday)) assert.notEqual(a.depois.status, "T");
});

test("conversão recomenda contratação para o sábado curto ou redução de carga sem redução salarial", () => {
  const s = base(new Date(2026, 9, 21));
  const semana = J("08:00", "12:00", "14:00", "18:00");
  s.colaboradores = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, nome: `P${i + 1}`, sexo: "masculino", cargo: "Atendente", horasSemana: 44 }));
  Object.assign(s, { horarioPorDia: true, jornada: semana,
    jornadaPorDia: { 1: semana, 2: semana, 3: semana, 4: semana, 5: semana, 6: J("08:00", "12:00", "12:00", "12:00") },
    diasTrabalho: seg, folgaDiasPermitidos: [...seg], coberturaAtiva: true,
    demandasCobertura: [
      { id: 1, funcao: "Atendente", inicio: "08:00", fim: "18:00", minimo: 2, diasSemana: [1, 2, 3, 4, 5], incluirFeriados: false },
      { id: 2, funcao: "Atendente", inicio: "08:00", fim: "12:00", minimo: 2, diasSemana: [6], incluirFeriados: false }] });
  const c = converter(s, { periodo: "2027-02", fase: "automatico", folgas: "distribuir" });
  // Ninguém é escalado no sábado para não ficar abaixo de 42h.
  assert(c.proposta.config.escalaGerada.resultado.every((r) => r.dias.every((d) => d.weekday !== 6 || d.status !== "T")));
  const texto = c.comparacao.jornadaCurta.join(" ");
  assert.match(texto, /Aos sábados a empresa funciona das 08:00 às 12:00/);
  assert.match(texto, /máximo de 37h36/);
  assert.match(texto, /contratar colaborador\(es\) específico\(s\) para os sábados \(2 na função Atendente, 4h00 por dia\)/);
  assert.match(texto, /reduzir a carga contratual das atuais para 37h36 semanais, mantendo o salário/);
  const plano = buscar(c.proposta.config, opcoes);
  assert.equal(plano.limitesCobertura.comprovado, true);
  assert.match(plano.limitesCobertura.explicacoes.join(" "), /redução salarial é vedada/);
});

test("proposta reduz o almoço até 1h para caber 8h24 no funcionamento, sem estender a saída", () => {
  const cfg = empresa({ n: 1, minimo: 1, jornada: J("08:00", "12:00", "14:00", "18:00") });
  const trabalho = cfg.escalaGerada.resultado[0].dias.filter((d) => d.status === "T" && d.data >= "2027-03-08" && d.data <= "2027-03-13");
  assert(trabalho.length === 5 && trabalho.every((d) => d.horas === 8.4 && d.saidaMin === 1080 && d.intervaloMin === 96 && d.intervaloReduzido?.de === 120));
});

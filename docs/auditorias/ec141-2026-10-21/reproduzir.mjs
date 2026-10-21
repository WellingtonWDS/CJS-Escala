// Reprodução dos comportamentos observados na auditoria de 21/10/2026.
// As asserções confirmam os achados, não certificam conformidade. Fora da suíte de regressão.
import assert from "node:assert/strict";
import { createDefaultState } from "../../../assets/js/state/store.js";
import { createDomain } from "../../../assets/js/domain/index.js";
import { apurarSemana } from "../../../assets/js/domain/resumo-semanal.js";
const evidencias = [];
function executar(
  nome,
  configurar,
  inicio = new Date(2028, 1, 7),
  fim = new Date(2028, 1, 13),
) {
  const state = createDefaultState(inicio);
  state.colaboradores = [
    {
      id: 1,
      nome: "Pessoa de teste",
      sexo: "masculino",
      cargo: "Atendente",
      horasSemana: 44,
    },
  ];
  configurar(state);
  const domain = createDomain(state);
  const dias = domain.gerarEscalaColaborador(
    state.colaboradores[0],
    0,
    inicio,
    fim,
    {},
  );
  const issues = domain.validarLegal(state.colaboradores[0], dias);
  const resultado = {
    nome,
    periodo: [dias[0].data, dias.at(-1).data],
    regimeSelecionado: state.regimeJornada,
    escala: state.tipoEscala,
    instrumento: state.instrumentoCompensacao,
    horasContratuais: state.colaboradores[0].horasSemana,
    trabalhadas: apurarSemana(state.colaboradores[0], dias, state).trabalhadas,
    folgas: dias.filter((d) => d.status === "F").length,
    horasDias: dias.map((d) => d.horas),
    issues,
  };
  evidencias.push(resultado);
  return { state, domain, dias, issues, resultado };
}
const a = executar(
  "A: fevereiro/2028 usa padrão 44h/1 repouso sem incompatibilidade",
  (s) => {},
);
assert.equal(a.resultado.trabalhadas, 44);
assert.equal(a.resultado.folgas, 1);
assert.equal(a.issues.length, 0);
const b = executar(
  "B: 40h selecionadas ainda gera contrato de 44h; ACT/CCT rebaixa excesso para alerta",
  (s) => {
    s.regimeJornada = "definitivo40";
    s.tipoEscala = "5x2";
    s.instrumentoCompensacao = "act_cct";
  },
);
assert.equal(b.resultado.trabalhadas, 44);
assert.equal(
  b.issues.find((i) => i.tipo === "LIMITE_SEMANAL").severidade,
  "alerta",
);
assert.ok(!b.issues.some((i) => i.severidade === "erro"));
const c = executar(
  "C: fase 42h, sem compensação, gera 8h24 por dia e classifica apenas como alerta",
  (s) => {
    s.regimeJornada = "transicao42";
    s.tipoEscala = "5x2";
    s.colaboradores[0].horasSemana = 42;
  },
  new Date(2027, 1, 1),
  new Date(2027, 1, 7),
);
assert.equal(c.resultado.trabalhadas, 42);
assert.equal(c.issues.filter((i) => i.tipo === "JORNADA_DIARIA").length, 5);
assert.ok(!c.issues.some((i) => i.severidade === "erro"));
const d = executar(
  "D: 12x36 na fase 40h soma 44h na semana sem validar limite semanal",
  (s) => {
    s.regimeJornada = "definitivo40";
    s.tipoEscala = "12x36";
    s.ancora12x36 = "2028-02-07";
  },
);
assert.equal(d.resultado.trabalhadas, 44);
assert.ok(
  !d.issues.some(
    (i) => i.tipo === "LIMITE_SEMANAL" || i.tipo === "REPOUSO_SEMANAL",
  ),
);
const e = executar(
  "E: contrato de 30h mantido na fase 40h quando o operador escolhe 5x2",
  (s) => {
    s.regimeJornada = "definitivo40";
    s.tipoEscala = "5x2";
    s.colaboradores[0].horasSemana = 30;
  },
);
assert.equal(e.resultado.trabalhadas, 30);
assert.ok(!e.issues.some((i) => i.severidade === "erro"));
const f = executar(
  "F: dezembro/2026 inteiro na fase 42h aplica segundo repouso antes de 16/12",
  (s) => {
    s.regimeJornada = "transicao42";
    s.colaboradores[0].horasSemana = 42;
  },
  new Date(2026, 11, 7),
  new Date(2026, 11, 13),
);
assert.ok(
  f.issues.some((i) => i.tipo === "REPOUSO_SEMANAL" && i.severidade === "erro"),
);
const g = executar(
  "G: dezembro/2026 inteiro na fase 44h não exige segundo repouso após 16/12",
  (s) => {},
  new Date(2026, 11, 21),
  new Date(2026, 11, 27),
);
assert.equal(g.resultado.trabalhadas, 44);
assert.equal(g.resultado.folgas, 1);
assert.equal(g.issues.length, 0);
const contextoState = createDefaultState(new Date(2028, 1, 1));
contextoState.diasTrabalho = [0, 1, 2, 3, 4, 5, 6];
contextoState.folgaDiasPermitidos = [2];
contextoState.turnosRevezamento = true;
contextoState.colaboradores = [
  {
    id: 1,
    sexo: "masculino",
    nome: "Pessoa de teste",
    cargo: "Atendente",
    horasSemana: 44,
  },
];
const contextoDomain = createDomain(contextoState);
const r = contextoDomain.gerarDadosEscala().resultado[0];
const primeiraData = r.dias[0].data;
const semContexto = contextoDomain
  .validarInterjornada(r.dias)
  .filter((i) => i.data === primeiraData);
const comContexto = contextoDomain
  .validarInterjornada([...r.diasContexto, ...r.dias])
  .filter((i) => i.data === primeiraData);
assert.equal(semContexto.length, 0);
assert.equal(comContexto.length, 1);
evidencias.push({
  nome: "H: primeira jornada perde validação de descanso em relação à semana anterior",
  primeiraData,
  anterior: r.diasContexto.at(-1),
  atual: r.dias[0],
  semContexto,
  comContexto,
});
console.log(JSON.stringify(evidencias, null, 2));

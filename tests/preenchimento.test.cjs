const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let criar, verificar;
before(async () => {
  ({ createDefaultState: criar } = await import("../assets/js/state/store.js"));
  ({ pendenciasPreenchimento: verificar } = await import(
    "../assets/js/domain/preenchimento.js"
  ));
});
const estado = () => criar(new Date(2026, 9, 22));
const destino = {
  periodo: "2027-01",
  fase: "automatico",
  folgas: "distribuir",
};
test("preenchimento padrão completo não exige formulários opcionais nem ACT/CCT", () => {
  const s = estado(),
    antes = structuredClone(s);
  assert.deepEqual(verificar(s, destino), []);
  assert.deepEqual(s, antes);
});
test("identifica nome, função e horas faltantes na etapa dos colaboradores", () => {
  const s = estado();
  Object.assign(s.colaboradores[0], {
    nome: " ",
    cargo: "",
    horasSemana: null,
  });
  const p = verificar(s, destino);
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.etapa === "sec-config"));
});
test("sem colaboradores ou sem dias operacionais aponta as etapas corretas", () => {
  const s = estado();
  s.colaboradores = [];
  s.diasTrabalho = [];
  assert.deepEqual(
    verificar(s).map((p) => p.etapa),
    ["sec-config", "sec-jornada"],
  );
});
test("horário reduzido de sábado e jornada noturna continuam válidos", () => {
  const s = estado();
  s.horarioPorDia = true;
  s.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "12:00",
    intFim: "00:00",
    saida: "00:00",
  };
  s.jornadaPorDia[1] = {
    entrada: "19:00",
    intInicio: "23:00",
    intFim: "00:00",
    saida: "07:00",
  };
  assert.deepEqual(verificar(s), []);
  s.jornadaPorDia[6].entrada = "";
  assert.match(verificar(s)[0].mensagem, /sábado/);
});
test("referência do ciclo e Turno B são obrigatórios apenas quando usados", () => {
  const s = estado();
  s.ancora12x36 = "";
  s.entradaTurnoB = "";
  assert.deepEqual(verificar(s), []);
  s.turnosRevezamento = true;
  assert.equal(verificar(s)[0].seletor, "#entrada-turno-b");
  s.tipoEscala = "12x36";
  assert.equal(verificar(s).length, 1);
  assert.equal(verificar(s)[0].seletor, "#ancora-12x36");
});
test("ACT selecionado exige identificação e vigência, sem exigir declarações legais", () => {
  const s = estado();
  s.instrumentoCompensacao = "act_cct";
  assert.equal(verificar(s).length, 3);
  Object.assign(s.instrumentoColetivo, {
    identificacao: "CCT",
    inicio: "2026-01-01",
    fim: "2026-12-31",
  });
  assert.deepEqual(verificar(s), []);
  s.instrumentoColetivo.compensacaoHoras = true;
  assert.equal(verificar(s).length, 2);
  Object.assign(s.instrumentoColetivo, {
    apuracaoInicio: "2026-10-01",
    apuracaoFim: "2026-10-31",
  });
  assert.deepEqual(verificar(s), []);
});
test("cobertura desativada é opcional; ativada exige faixas válidas", () => {
  const s = estado();
  assert.deepEqual(verificar(s), []);
  s.coberturaAtiva = true;
  assert.equal(verificar(s)[0].etapa, "sec-cobertura");
  s.demandasCobertura = [
    {
      funcao: "Atendente",
      inicio: "09:00",
      fim: "18:00",
      minimo: 2,
      diasSemana: [1],
    },
  ];
  assert.deepEqual(verificar(s), []);
  s.demandasCobertura[0].minimo = 0;
  assert.equal(verificar(s)[0].etapa, "sec-cobertura");
});
test("datas inválidas e dados do destino incompletos são identificados", () => {
  const s = estado();
  s.diaInicio = 32;
  assert.equal(verificar(s)[0].etapa, "sec-config");
  s.diaInicio = 1;
  assert.equal(
    verificar(s, { periodo: "2027-13", fase: "", folgas: "" }).length,
    3,
  );
});
test("horários importados são validados individualmente e não exigem janela global não usada", () => {
  const s = estado();
  s.colaboradores = [
    {
      id: 1,
      nome: "Pessoa",
      sexo: "feminino",
      cargo: "Atendente",
      horasSemana: 40,
      quadroDominio: {
        tipo: "ciclo",
        ancora: "",
        ciclo: {
          1: { status: "trabalho", jornada: s.jornada },
          2: { status: "folga" },
        },
        semana: {},
      },
    },
  ];
  s.jornada = { entrada: "", intInicio: "", intFim: "", saida: "" };
  const p = verificar(s);
  assert.equal(p.length, 1);
  assert.equal(p[0].etapa, "sec-config");
  assert.match(p[0].mensagem, /ciclo/);
  s.colaboradores[0].quadroDominio.ancora = "2026-10-01";
  assert.deepEqual(verificar(s), []);
});

test("sexo não informado na importação é pendência de preenchimento para a nova proposta", () => {
  const s = estado();
  s.colaboradores[0].sexo = "nao_informado";
  assert.equal(verificar(s).length, 1);
  assert.match(verificar(s)[0].seletor, /sexo/);
});

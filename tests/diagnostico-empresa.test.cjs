const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let validar, perguntas, resumo, visivel;
before(async () => {
  ({
    validarDiagnostico: validar,
    PERGUNTAS_DIAGNOSTICO: perguntas,
    resumoDiagnostico: resumo,
    visivel,
  } = await import("../assets/js/diagnostico/questionario.js"));
});
const body = () => ({ schemaVersion: 1, answers: {} });
const a = (value) => ({ value, certainty: "confirmada", note: "" });
const pendentes = () => ({
  schemaVersion: 1,
  answers: Object.fromEntries(
    perguntas
      .filter((q) => q.obrigatoria)
      .map((q) => [
        q.id,
        {
          ...a(
            ["multi", "horarios", "cobertura", "ordem"].includes(q.tipo)
              ? []
              : q.tipo === "instrumento"
                ? { nome: "", inicio: "", fim: "", url: "" }
                : "",
          ),
          certainty: "pendente",
        },
      ]),
  ),
});
test("questionário tem 34 perguntas em oito etapas e pendências explícitas permitem conclusão", () => {
  assert.equal(perguntas.length, 34);
  assert.equal(new Set(perguntas.map((q) => q.id)).size, 34);
  assert.throws(() => validar(body(), "concluido"), /Antes de concluir/);
  assert.doesNotThrow(() => validar(pendentes(), "concluido"));
  assert(resumo(pendentes()).pendencias.length > 0);
});
test("rascunho admite linhas incompletas sem aceitar tipos arbitrários; conclusão aponta a pergunta", () => {
  const p = pendentes();
  p.answers.q11 = a([
    { funcao: "", minimo: 1, diasSemana: [], inicio: "", fim: "" },
  ]);
  assert.doesNotThrow(() => validar(p));
  assert.throws(
    () => validar(p, "concluido"),
    (e) => e.questionId === "q11",
  );
  p.answers.q11 = a([
    { funcao: { bad: 1 }, minimo: 1, diasSemana: [], inicio: "", fim: "" },
  ]);
  assert.throws(() => validar(p));
});
test("horários noturnos e faixas mínimas válidas são aceitos; sobreposição de dias/valores inválidos não", () => {
  const p = pendentes();
  p.answers.q05 = a([{ dia: 1, inicio: "22:00", fim: "06:00" }]);
  p.answers.q11 = a([
    {
      funcao: "Cuidador",
      minimo: 2,
      diasSemana: [1, 2],
      inicio: "22:00",
      fim: "06:00",
    },
  ]);
  assert.doesNotThrow(() => validar(p, "concluido"));
  p.answers.q05.value.push({ ...p.answers.q05.value[0] });
  assert.throws(() => validar(p));
  p.answers.q05.value.pop();
  p.answers.q11.value[0].minimo = -1;
  assert.throws(() => validar(p));
});
test("instrumento requer vigência na conclusão, admite ausência explícita e rejeita links inseguros", () => {
  const p = pendentes();
  p.answers.q24 = a({ nome: "CCT", inicio: "", fim: "", url: "" });
  assert.doesNotThrow(() => validar(p));
  assert.throws(
    () => validar(p, "concluido"),
    (e) => e.questionId === "q24",
  );
  p.answers.q24.value.semInstrumento = true;
  assert.doesNotThrow(() => validar(p, "concluido"));
  p.answers.q24.value.url = "javascript:alert(1)";
  assert.throws(() => validar(p));
  p.answers.q24.value.url = "https://site.example/documento";
  assert.doesNotThrow(() => validar(p));
});
test("datas, prioridades duplicadas, condições desconhecidas e propriedades injetadas são rejeitadas", () => {
  for (const answer of [a("2026-02-31"), a("2026-99-99")]) {
    const p = body();
    p.answers.q03 = answer;
    assert.throws(() => validar(p));
  }
  const p = body();
  p.answers.q32 = a(["Cobertura operacional", "Cobertura operacional"]);
  assert.throws(() => validar(p));
  p.answers = { q28: a([{ descricao: "Folga fixa", natureza: "qualquer" }]) };
  assert.throws(() => validar(p));
  p.answers = { q99: a("texto") };
  assert.throws(() => validar(p));
  assert.throws(() => validar({ ...body(), userId: "fake" }));
});
test("orçamento é condicional e não entra na contagem enquanto não se aplica", () => {
  const p = body(),
    q = perguntas.find((q) => q.id === "q31");
  assert(!visivel(q, p.answers));
  p.answers.q30 = a(["Contratação"]);
  assert(visivel(q, p.answers));
  assert.equal(resumo(p).total, 34);
});
test("opções mutuamente exclusivas não autorizam uma resposta contraditória", () => {
  const p = body();
  p.answers.q27 = a(["Nenhuma alteração", "Turnos"]);
  assert.throws(() => validar(p));
});
test("operação e cobertura de 24h são registradas como necessidade do negócio, sem virar jornada individual", async () => {
  const { textoResposta } = await import(
    "../assets/js/ui/diagnostico-perguntas.js"
  );
  const p = pendentes();
  p.answers.q05 = a([{ dia: 1, inicio: "00:00", fim: "00:00" }]);
  p.answers.q11 = a([
    {
      funcao: "Cuidador",
      minimo: 1,
      diasSemana: [1],
      inicio: "00:00",
      fim: "00:00",
    },
  ]);
  assert.doesNotThrow(() => validar(p, "concluido"));
  for (const id of ["q05", "q11"])
    assert.match(
      textoResposta(
        perguntas.find((q) => q.id === id),
        p.answers[id],
      ),
      /24h/,
    );
});

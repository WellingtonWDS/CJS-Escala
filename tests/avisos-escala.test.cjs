const test = require("node:test");
const assert = require("node:assert/strict");

test("avisos agrupam datas mantendo textos, pessoas e todas as ocorrências", async () => {
  const { agruparAvisos, renderAvisosEscala } = await import("../assets/js/ui/avisos-escala.js");
  const rows = [
    { colaborador: { id: "a", nome: "Pessoa <A>" }, issues: [
      { tipo: "HORAS", severidade: "erro", mensagem: "2026-10-01: 10:00 acima de 8h" },
      { tipo: "HORAS", severidade: "erro", mensagem: "2026-10-02: 10:00 acima de 8h" },
      { tipo: "DOC", severidade: "pendencia", mensagem: "Confira ACT/CCT" },
    ] },
    { r: { colaborador: { id: "b", nome: "Pessoa B" } }, issues: [
      { tipo: "HORAS", severidade: "erro", mensagem: "2026-10-03: 10:00 acima de 8h" },
      { tipo: "HORAS", severidade: "erro", mensagem: "2026-10-04: 09:00 acima de 8h" },
    ] },
  ];
  const grupos = agruparAvisos(rows);
  assert.equal(grupos.length, 3);
  assert.equal(grupos[0].pessoas, 2);
  assert.equal(grupos[0].ocorrencias.length, 3);
  const erros = renderAvisosEscala(rows, { erros: true });
  assert.match(erros, /data-erros-escala open/);
  assert.match(erros, /4 incompatibilidade/);
  assert.match(erros, /2026-10-03: 10:00/);
  assert.match(erros, /Pessoa &lt;A&gt;/);
  assert.doesNotMatch(erros, /Confira ACT\/CCT/);
  assert.match(renderAvisosEscala(rows), /Confira ACT\/CCT/);
  assert.equal(renderAvisosEscala([], { erros: true }), "");
});

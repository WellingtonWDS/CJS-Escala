const { test } = require("node:test");
const assert = require("node:assert/strict");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const texto = (b) => Buffer.from(b).toString("latin1");
const payload = {
  schemaVersion: 1,
  answers: {
    q01: { value: ["Adequar a jornada", "Organizar folgas"], certainty: "confirmada", note: "" },
    q02: { value: "Loja Centro", certainty: "confirmada", note: "Unidade com maior movimento" },
    q04: { value: "", certainty: "pendente", note: "Aguardando o sócio" },
    q05: { value: [{ dia: 1, inicio: "08:00", fim: "18:00" }], certainty: "estimativa", note: "" },
  },
};
async function gerar(extra = {}) {
  const { criarPdfDiagnostico } = await import("../assets/js/export/pdf-diagnostico.js");
  const libs = { ...(await import("jspdf")), ...(await import("jspdf-autotable")) };
  return criarPdfDiagnostico({
    libs, payload, logo: PNG,
    empresa: { nome: "Padaria Exemplo", cnpj: "11222333000181" },
    registro: { status: "rascunho", revision: 3, updatedBy: "Ana Gerente", updatedAt: "2026-11-24T13:00:00Z" },
    emitido: new Date("2026-11-25T12:00:00Z"),
    ...extra,
  });
}
test("PDF do diagnóstico: respostas, situação, pendências e observações", async () => {
  const pdf = texto(await gerar());
  assert.ok(pdf.startsWith("%PDF-"));
  for (const t of ["Diagn", "Padaria Exemplo", "11.222.333/0001-81", "Loja Centro", "Unidade com maior movimento", "Aguardando o s", "Pend", "Estimativa", "Elaborado no Reescala", "revis"])
    assert.ok(pdf.includes(t), t);
  // Página de retrato A4 (210 x 297 mm = 595.28 x 841.89 pt).
  assert.match(pdf, /\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
});
test("PDF do diagnóstico usa a logomarca e as cores do escritório", async () => {
  const marca = { displayName: "Contabilidade Exemplo", logo: PNG, logoWidth: 1200, logoHeight: 400, primaryColor: "#c4122f", secondaryColor: "#ffe600", revision: 2 };
  const pdf = texto(await gerar({ marca }));
  assert.match(pdf, /Contabilidade Exemplo .{1,4} Elaborado no Reescala/);
  assert.match(pdf, /0\.769 0\.071 0\.184 rg/, "faixa e cabeçalho da tabela na cor principal");
  assert.ok((pdf.match(/\/Subtype \/Image/g) || []).length >= 2, "logo do escritório e do Reescala");
  const padrao = texto(await gerar());
  assert.doesNotMatch(padrao, /0\.769 0\.071 0\.184 rg/);
  assert.match(padrao, /0\.059 0\.157 0\.267 rg/, "sem marca, azul padrão do Reescala");
});
test("PDF do diagnóstico ainda não salvo indica a situação", async () => {
  const pdf = texto(await gerar({ registro: null, alteracoesNaoSalvas: true }));
  assert.ok(pdf.includes("Ainda n"));
  assert.ok(pdf.includes("inclui altera"));
});

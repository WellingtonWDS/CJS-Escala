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
    q05: { value: [{ dia: 1, inicio: "08:00", fim: "18:00" }, { dia: 6, inicio: "08:00", fim: "12:00" }], certainty: "estimativa", note: "" },
    q03: { value: "2026-12-16", certainty: "confirmada", note: "" },
    q24: { value: { nome: "CCT Comércio", inicio: "2026-05-01", fim: "2027-04-30", url: "" }, certainty: "confirmada", note: "" },
    q32: { value: ["Menor necessidade de contratação", "Equilíbrio entre colaboradores", "Cobertura operacional", "Previsibilidade das folgas", "Preservar horários atuais"], certainty: "confirmada", note: "Prioridade → custo ✅" },
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

test("PDF do diagnóstico: datas DD/MM/AAAA, ordem numerada e símbolos fora da fonte substituídos", async () => {
  const { textoPdf } = await import("../assets/js/export/pdf-diagnostico.js");
  const pdf = texto(await gerar());
  assert.ok(pdf.includes("16/12/2026"), "data de implantação");
  assert.ok(pdf.includes("01/05/2026") && pdf.includes("30/04/2027"), "vigência do ACT/CCT");
  assert.doesNotMatch(pdf, /2026-12-16|2026-05-01/);
  // Ordem numerada, em texto simples (sem a codificação que espalha as letras).
  assert.ok(pdf.includes("1\272 Menor necessidade de contrata"), "1º Menor necessidade…");
  assert.ok(pdf.includes("5\272 Preservar hor"));
  assert.ok(pdf.includes("Prioridade -> custo"), "seta trocada e emoji removido");
  assert.equal(textoPdf("A → B ≥ 2 ✅ ção “ok” – €"), "A -> B >= 2  ção “ok” – €");
});

test("PDF do diagnóstico: horários, cobertura e prioridades com um item por linha", async () => {
  const { criarPdfDiagnostico } = await import("../assets/js/export/pdf-diagnostico.js");
  const libs = { ...(await import("jspdf")), ...(await import("jspdf-autotable")) };
  const pdf = texto(criarPdfDiagnostico({ libs, empresa: { nome: "Padaria" }, payload: { schemaVersion: 1, answers: {
    q05: { value: [{ dia: 1, inicio: "08:00", fim: "18:00" }, { dia: 6, inicio: "08:00", fim: "12:00" }], certainty: "confirmada", note: "" },
    q11: { value: [{ funcao: "Atendente", minimo: 2, diasSemana: [1, 2], inicio: "08:00", fim: "12:00" }, { funcao: "Padeiro", minimo: 1, diasSemana: [6], inicio: "05:00", fim: "11:00" }], certainty: "confirmada", note: "" },
  } } }));
  // Cada linha do PDF é um texto entre parênteses; os itens não podem dividir o mesmo.
  const linhas = [...pdf.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((m) => m[1]);
  assert.ok(linhas.some((l) => /^Seg: 08:00.{1,4}18:00$/.test(l)), "segunda em linha própria");
  assert.ok(linhas.some((l) => /^S.{1,4}b: 08:00.{1,4}12:00$/.test(l)), "sábado em linha própria");
  assert.ok(linhas.some((l) => /^Atendente: 2 pessoa/.test(l)) && linhas.some((l) => /^Padeiro: 1 pessoa/.test(l)), "uma faixa por linha");
  assert.ok(!linhas.some((l) => /Seg: .*b: /.test(l)), "dias não ficam na mesma linha");
});

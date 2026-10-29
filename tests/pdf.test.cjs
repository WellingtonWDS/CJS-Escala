const { test } = require("node:test");
const assert = require("node:assert/strict");
async function seed(fixa = false) {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { createDomain } = await import("../assets/js/domain/index.js");
  const s = criarEstadoDemo();
  s.modeloEscala = fixa ? "fixa" : "dinamica";
  s.escalaGerada = createDomain(s).gerarDadosEscala();
  return s;
}
test("relatórios fixo/dinâmico preservam origem e expõem horários, folgas e resumos", async () => {
  const { prepararRelatorio } =
    await import("../assets/js/export/relatorio.js");
  for (const fixa of [false, true]) {
    const s = await seed(fixa),
      before = JSON.stringify(s),
      r = prepararRelatorio(s);
    assert.equal(r.fixa, fixa);
    assert.equal(r.pessoas.length, 5);
    assert.equal(r.pessoas[0].linhas.length, fixa ? 7 : 31);
    assert(r.pessoas[0].semanas.length);
    assert(r.pessoas[0].linhas.some((l) => l[1] === "Folga"));
    assert.equal(JSON.stringify(s), before);
  }
});
test("exportação rejeita ausência de resultado e proposta desatualizada", async () => {
  const { prepararRelatorio } =
    await import("../assets/js/export/relatorio.js");
  assert.throws(() => prepararRelatorio({}), /Gere a escala/);
  const s = await seed();
  s.conversao = { desatualizada: true };
  assert.throws(() => prepararRelatorio(s, { proposta: true }), /atualizada/);
});
test("PDF é paisagem, individual isolado e ZIP mantém arquivos de homônimos", async () => {
  const { prepararRelatorio, nomeArquivo } =
    await import("../assets/js/export/relatorio.js");
  const { criarPdf } = await import("../assets/js/export/pdf.js");
  const libs = {
    ...(await import("jspdf")),
    ...(await import("jspdf-autotable")),
    ...(await import("fflate")),
  };
  const s = await seed(true);
  s.escalaGerada.resultado[0].colaborador.nome = "Pessoa Única";
  s.escalaGerada.resultado[1].colaborador.nome = "Outra Pessoa";
  const r = prepararRelatorio(s);
  const bytes = await criarPdf(r, [r.pessoas[0]], { libs });
  const text = Buffer.from(bytes).toString("latin1");
  assert(text.startsWith("%PDF-"));
  assert(text.includes("Pessoa Única"));
  assert(!text.includes("Outra Pessoa"));
  assert.match(text, /MediaBox \[0 0 841/);
  const zip = libs.zipSync({ "pessoa-1.pdf": bytes, "pessoa-2.pdf": bytes });
  assert.equal(Object.keys(libs.unzipSync(zip)).length, 2);
  assert(!nomeArquivo("../../Pessoa / teste").includes("/"));
  const fs = require("node:fs");
  fs.writeFileSync("/tmp/reescala-individual.pdf", bytes);
  fs.writeFileSync(
    "/tmp/reescala-equipe.pdf",
    await criarPdf(r, r.pessoas, { libs, empregador: true }),
  );
});

const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const pdfSciFicticio = require("./helpers/pdf-sci-ficticio.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async function testarSci({ browser, baseURL }) {
  const pasta = await mkdtemp(path.join(tmpdir(), "sci-"));
  const arquivo = path.join(pasta, "horario-ficticio.pdf");
  await writeFile(arquivo, Buffer.from(await pdfSciFicticio()));
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://**/*", (r) => r.abort());
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await irParaEtapa(page, "#importacao-sci");
    await page.locator("#importacao-sci > summary").click();
    // Arquivo que não é PDF é recusado antes da leitura.
    await page.setInputFiles("#sci-arquivo", { name: "planilha.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
    assert.match(await page.locator("#sci-mensagem").innerText(), /relatório Horário de Trabalho da SCI em PDF/);
    await page.setInputFiles("#sci-arquivo", arquivo);
    await page.locator("#sci-previa").waitFor();
    assert.match(await page.locator("#sci-empresa").innerText(), /COMERCIO FICTICIO EXEMPLO LTDA/);
    assert.match(await page.locator("#sci-empresa").innerText(), /CNPJ: a informar/);
    assert.equal(await page.locator("#sci-linhas tr").count(), 3);
    // CNPJ obrigatório e validado antes de confirmar.
    assert.equal(await page.locator("#sci-confirmar").isDisabled(), true);
    await page.locator("#sci-cnpj").fill("11.222.333/0001-80");
    assert.match(await page.locator("#sci-cnpj-erro").innerText(), /CNPJ inválido/);
    assert.equal(await page.locator("#sci-confirmar").isDisabled(), true);
    await page.locator("#sci-cnpj").fill("11222333000181");
    assert.equal(await page.locator("#sci-cnpj-erro").innerText(), "");
    assert.match(await page.locator("#sci-empresa").innerText(), /CNPJ: 11\.222\.333\/0001-81/);
    await page.locator("#sci-confirmar").click();
    await page.waitForFunction(() => /Quadro importado/.test(document.getElementById("sci-mensagem").textContent));
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(s.colaboradores.length, 3);
    assert.equal(s.empresaDominio.cnpj, "11.222.333/0001-81");
    assert.equal(s.empresaDominio.sistema, "SCI");
    assert.equal(s.tipoEscala, "6x1");
    assert.deepEqual(s.colaboradores.map((c) => c.quadroDominio.ctps), ["1234567", "7654321", "0011223"]);
    assert.equal(await page.locator("#colaboradores-cadastrados").isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("OK: importação SCI em PDF com prévia, CNPJ obrigatório validado e aplicação no cadastro");
  } finally {
    await context.close();
    await rm(pasta, { recursive: true, force: true });
  }
};

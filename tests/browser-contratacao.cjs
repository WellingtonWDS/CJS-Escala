const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarCenariosSegmentos } = await import("../database/demo/segmentos.mjs");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate((s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)), criarCenariosSegmentos()[0].drafts[2].state);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await clicarCalculo(page, "#btn-converter");
    const sugestao = page.locator("[data-conv-sugestao-contratacao]");
    assert.match(await sugestao.innerText(), /Contratação sugerida: 1 Atendente \(42h\), 1 Caixa \(42h\)/);
    await clicarCalculo(page, "[data-conv-contratar]");
    await page.locator("[data-conv-contratados]").waitFor();
    assert.match(await page.locator("[data-conv-contratados]").innerText(), /A contratar 1 — Atendente \(42h\), A contratar 2 — Caixa \(42h\)/);
    assert.match(await page.locator("#resultado-proposta").innerText(), /A contratar 1 — Atendente/);
    let salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(salvo.destinoConversao.contratacoes.length, 2);
    assert.equal(salvo.escalaGerada.resultado.length, 2, "escala atual sem as contratações");
    await clicarCalculo(page, "[data-conv-sem-contratacao]");
    await page.locator("[data-conv-sugestao-contratacao]").waitFor();
    salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(salvo.destinoConversao.contratacoes.length, 0);
    assert.deepEqual(errors, []);
    console.log("OK: contratação sugerida incluída na proposta com horário na grade e removida em seguida");
  } finally {
    await ctx.close();
  }
};

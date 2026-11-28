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
    const s = criarCenariosSegmentos()[0].drafts[0].state;
    s.destinoConversao = { ...s.destinoConversao, periodo: "2028-02", fase: "definitivo40" };
    await page.evaluate((st) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(st)), s);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    const folgas = page.locator("#conversao-folgas");
    assert.equal(await folgas.locator('option[value="quinzenal"]').isDisabled(), false);
    await folgas.selectOption("quinzenal");
    assert.match(await page.locator("#conversao-folgas-ajuda").innerText(), /Semanas alternadas/);
    await clicarCalculo(page, "#btn-converter");
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(salvo.destinoConversao.folgas, "quinzenal");
    assert.equal(salvo.conversao.proposta.config.folgasQuinzenal, true);
    assert.match(await page.locator("#conversao-visao-geral").innerText(), /suficiente/);
    // Análise: nota do revezamento; Pontos de atenção: semanas com sábado como informação.
    await page.locator('[data-conv-aba="analise"]').click();
    assert.match(await page.locator("[data-revezamento-quinzenal]").innerText(), /não reduz o salário/);
    assert.match(await page.locator(".diagnostico-rateio").innerText(), /revezamento quinzenal/);
    assert.match(await page.locator("#conv-painel-atencao").textContent(), /semana com sábado no revezamento quinzenal/);
    // Escala fixa: opção indisponível, com o motivo.
    await page.evaluate((st) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify({ ...st, modeloEscala: "fixa", dataReferenciaFixa: "2027-12-16", conversao: null })), salvo);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    assert.equal(await folgas.locator('option[value="quinzenal"]').isDisabled(), true);
    assert.notEqual(await folgas.inputValue(), "quinzenal");
    assert.match(await page.locator("#conversao-folgas-ajuda").innerText(), /indisponível: .*escala mensal dinâmica/);
    assert.deepEqual(errors, []);
    console.log("OK: revezamento quinzenal do sábado na proposta (opção, geração, informação sem alerta e indisponível na escala fixa)");
  } finally {
    await ctx.close();
  }
};

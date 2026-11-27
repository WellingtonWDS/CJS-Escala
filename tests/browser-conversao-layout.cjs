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
    await page.evaluate((s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)), criarCenariosSegmentos()[0].drafts[1].state);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await clicarCalculo(page, "#btn-converter");
    // Faixa de ações: busca de ajustes e documentos visíveis antes das abas.
    const acoes = page.locator(".conv-acoes");
    await acoes.locator("#resultado-proposta-ajustes [data-ajuste-buscar]").waitFor();
    assert.equal(await page.locator("#resultado-proposta #resultado-proposta-ajustes").count(), 0);
    for (const sel of ['[data-export-pdf="empregador"][data-origem="proposta"]', '[data-export-pdf="colaboradores"][data-origem="proposta"]', "[data-termo-abrir]"])
      assert.ok(await acoes.locator(sel).isVisible(), sel);
    // Abas: grade visível; avisos movidos para "Pontos de atenção", com contador.
    assert.equal(await page.locator('[data-conv-aba="escala"]').getAttribute("aria-selected"), "true");
    assert.ok(await page.locator("#resultado-proposta [data-escala-quadro]").isVisible());
    assert.equal(await page.locator("#resultado-proposta [data-analises-escala]").count(), 0);
    assert.equal(await page.locator("#conv-painel-atencao [data-analises-escala]").count(), 1);
    assert.match(await page.locator("[data-conv-contador]").textContent(), /^\d+$/);
    // Teclado: setas trocam de aba e mostram o painel correspondente.
    await page.locator('[data-conv-aba="escala"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('[data-conv-aba="atencao"]').getAttribute("aria-selected"), "true");
    assert.ok(await page.locator("#conv-painel-atencao").isVisible());
    // A escala atual / prévia avulsa só aparece na aba da escala proposta.
    assert.equal(await page.locator("#escala-atual-previa").isVisible(), false);
    assert.equal(await page.locator("#conv-painel-escala").isHidden(), true);
    // Indicador de horas descobertas leva à análise da equipe.
    await page.locator('#conversao-visao-geral [data-conv-ir="analise"]').click();
    assert.ok(await page.locator("#conversao-comparacao [data-diagnostico-equipe]").isVisible());
    // Buscar ajustes pela faixa de ações e voltar à grade continua funcionando.
    await page.locator('[data-conv-aba="escala"]').click();
    assert.equal(await page.locator("#escala-atual-previa").isVisible(), true);
    await acoes.locator("[data-ajuste-buscar]").click();
    await page.waitForFunction(() => document.querySelector("#resultado-proposta-ajustes [data-ajuste-aplicar], #resultado-proposta-ajustes [data-ajuste-mensagem]")?.textContent?.trim() || document.querySelector("#resultado-proposta-ajustes [data-ajuste-aplicar]"), null, { timeout: 60000 });
    assert.equal(await page.locator("[id='resultado-proposta-ajustes']").count(), 1, "um único painel de ajustes");
    assert.deepEqual(errors, []);
    console.log("OK: conversão organizada em resumo, faixa de ações e abas (teclado, contador, indicadores e busca de ajustes)");
  } finally {
    await ctx.close();
  }
};

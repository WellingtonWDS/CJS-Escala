const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  try {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    const s = criarEstadoDemo();
    s.destinoConversao = { periodo: "2028-02", fase: "definitivo40", folgas: "fim_semana" };
    await page.evaluate((st) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(st)), s);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await clicarCalculo(page, "#btn-converter");
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao.proposta.config.escalaGerada.resultado);
    const r = (await saved())[0];
    const di = r.dias.findIndex((d) => d.data === "2028-02-07"); // segunda
    await page.locator(`#resultado-proposta [data-ri="0"][data-di="${di}"]`).click();
    const prompt = page.locator('dialog[data-app-dialog="prompt"][open]');
    await prompt.waitFor();
    await prompt.locator("select").selectOption("T");
    await prompt.locator("[data-dialog-accept]").click();
    const form = page.locator('dialog[data-app-dialog="form"][open]');
    await form.waitFor();
    for (const [k, v] of Object.entries({ entrada: "09:00", intInicio: "12:00", intFim: "13:00", saida: "18:00" }))
      await form.locator(`[data-dialog-time="${k}"]`).fill(v);
    await form.locator("[data-dialog-accept]").click();
    const rep = page.locator('dialog[data-app-dialog="replicar"][open]');
    await rep.waitFor();
    // Dias com o mesmo horário anterior já vêm marcados; sábado e domingo são folga e não aparecem.
    for (const w of [2, 3, 4, 5]) assert.equal(await rep.locator(`[data-replicar-dia="${w}"]`).isChecked(), true, String(w));
    assert.equal(await rep.locator('[data-replicar-dia="6"], [data-replicar-dia="0"]').count(), 0);
    assert.equal(await rep.locator('[name="replicar-escopo"][value="mes"]').isChecked(), true);
    await rep.locator('[data-replicar-dia="5"]').uncheck();
    await rep.locator("[data-replicar-sim]").click();
    await rep.waitFor({ state: "detached" });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao.proposta.config.escalaGerada.resultado[0].dias.find((d) => d.data === "2028-02-22").entradaMin === 540);
    const dias = (await saved())[0].dias.filter((d) => d.data.startsWith("2028-02") && d.status === "T");
    for (const d of dias) {
      const esperado = d.weekday === 5 ? 480 : 540; // sexta desmarcada mantém 08:00
      assert.equal(d.entradaMin, esperado, d.data);
    }
    assert.deepEqual(errors, []);
    console.log("OK: replicar horário editado para os dias escolhidos em todas as semanas do mês, sem mexer nos demais");
  } finally {
    await ctx.close();
  }
};

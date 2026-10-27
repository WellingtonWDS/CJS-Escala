const { clicarCalculo } = require("./helpers/calculo.cjs");
const {
  respondToDialogs,
  waitForDialogs,
  stopDialogResponses,
} = require("./helpers/dialogs.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarFeriados({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
    await page.route("https://**/*", (r) =>
      r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort(),
    );
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    assert.equal(
      await page.locator('[data-field="nome"]').first().inputValue(),
      "Colaborador 1",
    );
    await irParaEtapa(page, '[data-tipo="5x2"]');
    await page.locator('[data-tipo="5x2"]').click();
    await waitForDialogs(page);
    await irParaEtapa(page, '#weekday-picker [data-day="6"]');
    await page.locator('#weekday-picker [data-day="6"]').click();
    await waitForDialogs(page);
    await irParaEtapa(page, "#cadastro-manual-colaboradores > summary");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    await waitForDialogs(page);
    const horas = page.locator('[data-field="horasSemana"]').first();
    await horas.fill("40");
    await horas.dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    await waitForDialogs(page);
    const resumo = page.locator(
      '[data-resumo-semanal][data-colaborador="1"][data-semana="2026-10-12"]',
    );
    assert.match(await resumo.innerText(), /OK/);
    assert.match(
      await resumo.innerText(),
      /32:00 trabalhadas \+ 08:00 abonadas/,
    );
    assert.match(await resumo.innerText(), /total 40:00 \/ alvo 40:00/);
    assert.match(
      await resumo.innerText(),
      /Abono de feriado: 12\/10\/2026 — Nossa Senhora Aparecida \(08:00\)/,
    );
    const di = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("fintria-escala-dp-v2"),
      ).escalaGerada.resultado[0].dias.findIndex(
        (d) => d.data === "2026-10-13",
      ),
    );
    await respondToDialogs(page, (d) => d.accept("F"));
    await irParaEtapa(page, `[data-ri="0"][data-di="${di}"]`);
    await page.locator(`[data-ri="0"][data-di="${di}"]`).click();
    await waitForDialogs(page);
    assert.match(await resumo.innerText(), /ABAIXO/);
    assert.match(await resumo.innerText(), /total 32:00 \/ alvo 40:00/);
    assert.match(await resumo.innerText(), /Abono de feriado/);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.match(await resumo.innerText(), /ABAIXO/);
    assert.match(await resumo.innerText(), /08:00 abonadas/);
    assert.deepEqual(errors, []);
    console.log(
      "OK: abono de feriado no resumo semanal, faltas reais e restauração após recarregar",
    );
  } finally {
    await context.close();
  }
};

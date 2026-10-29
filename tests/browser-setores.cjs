const { baixarCsvLegado } = require("./helpers/csv-legado.cjs");
const { clicarCalculo } = require("./helpers/calculo.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarSetores({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
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
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    await irParaEtapa(page, '#feriados-list input[type="checkbox"]');
    await page.locator('#feriados-list input[type="checkbox"]').check();
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("10");
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("9");
    assert.equal(
      await page.locator('#feriados-list input[type="checkbox"]').isChecked(),
      true,
    );
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(
      await page.locator('#feriados-list input[type="checkbox"]').isChecked(),
      true,
    );
    await irParaEtapa(page, '[data-tipo="5x2"]');
    await page.locator('[data-tipo="5x2"]').click();
    await irParaEtapa(page, "#folga-tipo");
    await page.locator("#folga-tipo").selectOption("fim_semana");
    for (const [id, value] of [
      ["j-entrada", "22:00"],
      ["j-int-ini", "02:00"],
      ["j-int-fim", "03:00"],
      ["j-saida", "07:00"],
    ]) {
      await irParaEtapa(page, `#${id}`);
      await page.locator(`#${id}`).fill(value);
      await page.locator(`#${id}`).dispatchEvent("change");
    }
    await irParaEtapa(page, "#cadastro-manual-colaboradores > summary");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    const horas = page.locator('[data-field="horasSemana"]').first();
    await horas.fill("40");
    await horas.dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    let state = await saved();
    let d = state.escalaGerada.resultado[0].dias.find(
      (d) => d.data === "2026-10-19",
    );
    assert.equal(d.saidaMin, 1860);
    assert.equal(d.intervaloMin, 60);
    assert.ok(
      !state.escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "HORARIO_INVALIDO",
      ),
    );
    assert.ok(
      state.escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "TRABALHO_NOTURNO",
      ),
    );
    const indice = state.escalaGerada.resultado[0].dias.findIndex(
      (d) => d.data === "2026-10-19",
    );
    await irParaEtapa(page, `[data-ri="0"][data-di="${indice}"]`);
    assert.match(
      await page.locator(`[data-ri="0"][data-di="${indice}"]`).innerText(),
      /22:00–07:00 \(\+1d\)/,
    );
    const downloadPromise = page.waitForEvent("download");
    await irParaEtapa(page, "#btn-gerar");
    await baixarCsvLegado(page, false);
    const download = await downloadPromise;
    const { readFile } = require("node:fs/promises");
    const csv = await readFile(await download.path(), "utf8");
    assert.match(csv, /Data da saída/);
    assert.match(csv, /2026-10-19;T;22:00;07:00;.*;2026-10-20/);
    await irParaEtapa(page, "[data-remove-feriado]");
    await page.locator("[data-remove-feriado]").click();
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    state = await saved();
    assert.equal(
      state.escalaGerada.resultado[0].dias.find((d) => d.data === "2026-10-12")
        .feriado,
      null,
    );
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("10");
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("9");
    assert.equal(
      await page.locator('#feriados-list input[type="checkbox"]').count(),
      0,
    );
    await irParaEtapa(page, "#fer-dia");
    await page.locator("#fer-dia").fill("12");
    await irParaEtapa(page, "#fer-nome");
    await page.locator("#fer-nome").fill("Feriado restabelecido");
    await irParaEtapa(page, "#btn-add-feriado");
    await page.locator("#btn-add-feriado").click();
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    state = await saved();
    assert.equal(
      state.escalaGerada.resultado[0].dias.find((d) => d.data === "2026-10-12")
        .status,
      "F",
    );
    assert.ok(!state.feriadosExcluidos.includes("2026-10-12"));
    assert.deepEqual(errors, []);
    console.log(
      "OK: padaria noturna com saída no dia seguinte, CSV datado, feriado trabalhado preservado e exclusão/restauração de feriado",
    );
  } finally {
    await context.close();
  }
};

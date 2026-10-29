const { baixarCsvLegado } = require("./helpers/csv-legado.cjs");
const { clicarCalculo } = require("./helpers/calculo.cjs");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async function testarComputoCct({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
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
    await page.locator("#importacao-dominio > summary").click();
    await page
      .locator("#dominio-arquivo")
      .setInputFiles(path.join(__dirname, "fixtures/dominio/misto.xls"));
    await page.waitForFunction(
      () => !document.getElementById("dominio-confirmar").disabled,
    );
    await page.locator("#dominio-confirmar").click();
    // Isola o ciclo fictício 19–06 para conferir somente as condições desta categoria.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.colaboradores = s.colaboradores.slice(0, 1);
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    const id = (await saved()).colaboradores[0].id;
    await irParaEtapa(page, "#instrumento-compensacao");
    await page.locator("#instrumento-compensacao").selectOption("act_cct");
    await page.locator("#instrumento-detalhes > summary").click();
    for (const [campo, valor] of [
      ["act-identificacao", "CCT exemplo — plantões"],
      ["act-inicio", "2026-01-01"],
      ["act-fim", "2027-12-31"],
    ]) {
      await page.locator(`#${campo}`).fill(valor);
      await page.locator(`#${campo}`).dispatchEvent("change");
    }
    await page.locator("#act-12x36").check();
    await page.locator("#act-compativel").check();
    await page.locator("#act-intervalo-computado").check();
    await page.locator("#act-credito-noturno").check();
    let s = await saved();
    assert.equal(s.colaboradores[0].horasSemana, 42);
    await irParaEtapa(page, "#colab-list");
    const detalhe = page.locator(`[data-perfil-dominio="${id}"]`);
    await detalhe.locator("> summary").click();
    assert.match(await detalhe.innerText(), /Ciclo 12×36 identificado/);
    assert.match(
      await detalhe.innerText(),
      /Referência computada pela CCT: 42h/,
    );
    await detalhe.locator('[data-dominio="ancora"]').fill("2026-10-01");
    await detalhe.locator('[data-dominio="ancora"]').dispatchEvent("change");
    await page
      .locator('#colab-list [data-field="sexo"]')
      .selectOption("masculino");
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    s = await saved();
    const d = s.escalaGerada.resultado[0].dias.find(
      (d) => d.data === "2026-10-01",
    );
    assert.equal(d.horas, 10);
    assert.equal(d.creditoIntervaloCCT, 1);
    assert.equal(d.creditoNoturnoCCT, 1);
    assert.equal(d.horasComputadasCCT, 12);
    assert.equal(d.saidaMin, 1800);
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /intervalo computado \(CCT\)/,
    );
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /crédito noturno \(CCT\)/,
    );
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /12:00 computadas \(CCT\)/,
    );
    assert.ok(
      !s.escalaGerada.validacoes[0].issues.some((i) =>
        ["PLANTAO_12X36", "JORNADA_DIARIA", "INTERJORNADA"].includes(i.tipo),
      ),
    );
    const download = page.waitForEvent("download");
    await baixarCsvLegado(page, false);
    const csv = await fs.readFile(await (await download).path(), "utf8");
    assert.match(csv, /01:00;01:00;12:00/);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(
      (await saved()).instrumentoColetivo.creditoNoturnoUmaHora,
      true,
    );
    assert.equal(
      (await saved()).escalaGerada.resultado[0].dias.find(
        (d) => d.data === "2026-10-01",
      ).horasComputadasCCT,
      12,
    );
    await irParaEtapa(page, "#colab-list");
    await detalhe.locator("> summary").click();
    const saida = detalhe.locator('[data-dia="1"][data-horario="saida"]');
    await saida.fill("07:00");
    await saida.dispatchEvent("change");
    assert.match(
      await detalhe.innerText(),
      /Referência computada pela CCT: 45,?\.?5h/,
    );
    await saida.fill("06:00");
    await saida.dispatchEvent("change");
    assert.match(
      await detalhe.innerText(),
      /Referência computada pela CCT: 42h/,
    );
    await irParaEtapa(page, "#act-fim");
    if (
      (await page.locator("#instrumento-detalhes").getAttribute("open")) ===
      null
    )
      await page.locator("#instrumento-detalhes > summary").click();
    await page.locator("#act-fim").fill("2026-09-30");
    await page.locator("#act-fim").dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    const vencido = (await saved()).escalaGerada.resultado[0].dias.find(
      (d) => d.data === "2026-10-01",
    );
    assert.equal(vencido.creditoIntervaloCCT, 0);
    assert.equal(vencido.creditoNoturnoCCT, 0);
    assert.equal(vencido.saidaMin, 1800);
    assert.deepEqual(errors, []);
    console.log(
      "OK: CCT no ciclo importado, 10+1+1=12h, referência de 42h, horários reais, resumo/CSV, persistência e vencimento",
    );
  } finally {
    await context.close();
  }
};

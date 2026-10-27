const { clicarCalculo } = require("./helpers/calculo.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarPendencias({ browser, baseURL }) {
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
    const ir = (id) => page.locator(`[data-etapa-link="${id}"]`).click();
    const marcadas = () =>
      page
        .locator("[data-etapa-link][data-pendente]")
        .evaluateAll((els) => els.map((el) => el.dataset.etapaLink));
    const salvo = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    assert.deepEqual(await marcadas(), []);
    const nome = page.locator('#colab-list [data-field="nome"]').first();
    await nome.fill("");
    await nome.dispatchEvent("change");
    assert.deepEqual(await marcadas(), []);
    await page.locator("#btn-tutorial").click();
    for (let i = 0; i < 9; i++) await page.locator("#tutorial-proximo").click();
    assert.deepEqual(await marcadas(), []);
    assert.equal(
      await page.locator("#sec-config-pendencias").isVisible(),
      false,
    );
    await ir("sec-gerar");
    assert.deepEqual(await marcadas(), ["sec-config"]);
    assert.equal(
      await page
        .locator('[data-etapa-link="sec-config"] .etapa-pendencia-dot')
        .evaluate((el) => getComputedStyle(el).animationName),
      "pendencia-piscar",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator('[data-etapa-link="sec-config"] .etapa-pendencia-dot')
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await clicarCalculo(page, "#btn-converter");
    assert.equal((await salvo()).conversao, null);
    assert.match(
      await page.locator("#preenchimento-bloqueio").innerText(),
      /nome do colaborador/,
    );
    await page
      .locator('#preenchimento-bloqueio [data-pendencia-etapa="sec-config"]')
      .first()
      .click();
    assert.equal(await page.locator("#sec-config").isVisible(), true);
    assert.equal(
      await nome.evaluate((el) => el === document.activeElement),
      true,
    );
    await nome.fill("Pessoa corrigida");
    await nome.dispatchEvent("change");
    assert.deepEqual(await marcadas(), []);
    assert.equal(
      await page.locator("#sec-config-pendencias").isVisible(),
      false,
    );
    await ir("sec-gerar");
    assert.equal(
      await page.locator("#preenchimento-bloqueio").isVisible(),
      false,
    );
    await clicarCalculo(page, "#btn-converter");
    assert.ok((await salvo()).conversao);
    await ir("sec-jornada");
    await page.locator("#j-entrada").fill("");
    await page.locator("#j-entrada").dispatchEvent("change");
    await ir("sec-feriados");
    assert.deepEqual(await marcadas(), ["sec-jornada"]);
    await ir("sec-jornada");
    await page.locator("#j-entrada").fill("08:00");
    await page.locator("#j-entrada").dispatchEvent("change");
    assert.deepEqual(await marcadas(), []);
    await ir("sec-cobertura");
    await page.locator("#tg-cobertura").check();
    await ir("sec-folgas");
    assert.deepEqual(await marcadas(), ["sec-cobertura"]);
    await ir("sec-cobertura");
    await page.locator("#tg-cobertura").uncheck();
    assert.deepEqual(await marcadas(), []);
    await ir("sec-tipo");
    await page.locator("#instrumento-compensacao").selectOption("act_cct");
    await ir("sec-gerar");
    assert.deepEqual(await marcadas(), ["sec-tipo"]);
    await clicarCalculo(page, "#btn-converter");
    await page
      .locator(
        '#preenchimento-bloqueio [data-pendencia-seletor="#act-identificacao"]',
      )
      .click();
    assert.equal(
      await page.locator("#instrumento-detalhes").getAttribute("open"),
      "",
    );
    assert.equal(
      await page
        .locator("#act-identificacao")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#instrumento-compensacao").selectOption("nenhuma");
    assert.deepEqual(await marcadas(), []);
    await ir("sec-gerar");
    await page.locator("#conversao-periodo").fill("");
    await page.locator("#conversao-periodo").dispatchEvent("change");
    await ir("sec-pec");
    assert.deepEqual(await marcadas(), ["sec-gerar"]);
    await ir("sec-gerar");
    await page.locator("#conversao-periodo").fill("2027-01");
    await page.locator("#conversao-periodo").dispatchEvent("change");
    assert.deepEqual(await marcadas(), []);
    // Recarga direta na última etapa não significa que as demais foram visitadas.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.jornada.entrada = "";
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.deepEqual(await marcadas(), []);
    await page.locator("#btn-tutorial").click();
    for (let i = 0; i < 9; i++) await page.locator("#tutorial-proximo").click();
    assert.deepEqual(await marcadas(), []);
    await clicarCalculo(page, "#btn-converter");
    assert.equal(
      await page.locator("#preenchimento-bloqueio").isVisible(),
      true,
    );
    assert.deepEqual(await marcadas(), []);
    assert.deepEqual(errors, []);
    console.log(
      "OK: pendências após visita real, tutorial ignorado, correção imediata, opções condicionais, bloqueio da proposta e movimento reduzido",
    );
  } finally {
    await context.close();
  }
};

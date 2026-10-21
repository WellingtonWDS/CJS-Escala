const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const { createDevServer } = await import("../scripts/serve.js");
  const { gerarCsv } = await import("../assets/js/export/csv.js");
  const server = createDevServer({ root: path.resolve(__dirname, "../dist") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const context = await browser.newContext({
      timezoneId: "America/Sao_Paulo",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
    // Testa a aplicação sem depender da disponibilidade de fontes e Tailwind externos.
    await page.route("https://**/*", (route) =>
      route.request().url().includes("cdn.tailwindcss.com")
        ? route.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : route.abort(),
    );
    const errors = [],
      failedAssets = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("127.0.0.1") && response.status() >= 400)
        failedAssets.push(response.url());
    });
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    assert.equal(await page.locator("#cfg-mes").inputValue(), "9");
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    assert.equal(await page.locator("#ciclo-12x36-config").isVisible(), false);
    for (const type of ["6x1", "5x2", "12x36", "custom"]) {
      await page.locator(`[data-tipo="${type}"]`).click();
      assert.equal(
        await page.locator("#ciclo-12x36-config").isVisible(),
        type === "12x36",
      );
      await page.locator("#btn-gerar").click();
      assert.match(
        await page.locator("#resultado-gerar").innerText(),
        /Escala mensal/,
      );
    }
    console.log(
      "OK: modelos de escala e carregamento dos módulos na saída de produção",
    );
    await page.locator('[data-tipo="5x2"]').click();
    assert.equal(
      await page.locator("#importacao-colaboradores").getAttribute("open"),
      null,
    );
    assert.equal(
      await page.locator("#cadastro-manual-colaboradores").getAttribute("open"),
      null,
    );
    assert.deepEqual(
      await page
        .locator("#config-colaboradores > details")
        .evaluateAll((els) => els.map((el) => el.id)),
      ["importacao-colaboradores", "cadastro-manual-colaboradores"],
    );
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    await page.locator("#btn-add-colab").click();
    const name = page.locator('[data-field="nome"]').last();
    await name.fill('Pessoa; "Teste"');
    await name.dispatchEvent("change");
    await page.locator("#j-entrada").fill("07:00");
    await page.locator("#j-entrada").dispatchEvent("change");
    await page.reload();
    assert.equal(await page.locator("#j-entrada").inputValue(), "07:00");
    assert.equal(
      await page.locator('[data-field="nome"]').last().inputValue(),
      'Pessoa; "Teste"',
    );
    assert.equal((await saved()).colaboradores.length, 3);
    console.log(
      "OK: persistência compatível com a chave e o formato anteriores",
    );
    await page.locator("#btn-gerar").click();
    const horariosAntes = (await saved()).escalaGerada.resultado.map((r) =>
      r.dias.map((d) => [d.data, d.status, d.horas]),
    );
    assert.equal(await page.locator("#turnos-config").isVisible(), false);
    await page.locator("#tg-turnos").check();
    assert.equal(await page.locator("#turnos-config").isVisible(), true);
    assert.match(await page.locator("#turnos-resumo").innerText(), /Turno B/);
    assert.deepEqual(
      (await saved()).escalaGerada.resultado.map((r) =>
        r.dias.map((d) => [d.data, d.status, d.horas]),
      ),
      horariosAntes,
    );
    assert.ok(
      (await saved()).escalaGerada.resultado.some((r) =>
        r.dias.some((d) => d.turno === "B" && d.entradaMin === 840),
      ),
    );
    await page.locator("#entrada-turno-b").fill("15:00");
    await page.locator("#entrada-turno-b").dispatchEvent("change");
    assert.ok(
      (await saved()).escalaGerada.resultado.some((r) =>
        r.dias.some((d) => d.turno === "B" && d.entradaMin === 900),
      ),
    );
    await page.locator("#tg-turnos").uncheck();
    assert.ok(
      (await saved()).escalaGerada.resultado.every((r) =>
        r.dias.every((d) => d.turno === "A" && d.entradaMin === 420),
      ),
    );
    await page.locator("#tg-turnos").check();
    await page.locator("#entrada-turno-b").fill("14:00");
    await page.locator("#entrada-turno-b").dispatchEvent("change");
    console.log(
      "OK: toggle aplica turnos imediatamente, mostra grupos e preserva horas/folgas",
    );
    await page.locator("#btn-gerar").click();
    assert.match(await page.locator("#resultado-gerar").innerText(), /14:00/);
    await page.locator("#btn-simular-pec").click();
    assert.match(
      await page.locator("#pec-resultado").innerText(),
      /16\/12\/2027/,
    );
    page.removeAllListeners("dialog");
    let answers = ["T", "08:30"];
    page.on("dialog", (dialog) => dialog.accept(answers.shift()));
    await page.locator('[data-ri="0"][data-di="0"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).escalaGerada
          .resultado[0].dias[0].horas === 8.5,
    );
    await page.locator("#tg-turnos").uncheck();
    await page.locator("#tg-turnos").check();
    assert.equal((await saved()).escalaGerada.resultado[0].dias[0].horas, 8.5);
    const before = (await saved()).escalaGerada.resultado[0].dias[0];
    answers = ["T", "08:99"];
    await page.locator('[data-ri="0"][data-di="0"]').click();
    assert.deepEqual((await saved()).escalaGerada.resultado[0].dias[0], before);
    console.log("OK: edição manual e rejeição de horas inválidas");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#btn-exportar-csv").click();
    const download = await downloadPromise;
    assert.equal(
      await readFile(await download.path(), "utf8"),
      gerarCsv(await saved()),
    );
    console.log("OK: download CSV, inclusive nomes com separadores e aspas");
    await page.locator("#regime-jornada").selectOption("definitivo40");
    assert.equal((await saved()).escalaGerada, null);
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /Configuração alterada/,
    );
    assert.equal(await page.locator("#pec-resultado").innerText(), "");
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, []);
    console.log(
      "OK: invalidação da escala e ausência de erros JavaScript/arquivos locais",
    );
    await require("./browser-importacao.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-tutorial.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-setores.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-ec141.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-fim-semana.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-feriado-folga.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-folgas.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-sabado.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-feriados.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-cobertura.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

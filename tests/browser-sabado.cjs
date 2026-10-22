const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarSabado({ browser, baseURL }) {
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
    await irParaEtapa(page, "#tg-horario-dia");
    await page.locator("#tg-horario-dia").check();
    for (const [field, value] of Object.entries({
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "00:00",
      saida: "00:00",
    })) {
      const input = page.locator(
        `#jornada-por-dia-wrap [data-day="6"][data-field="${field}"]`,
      );
      await input.fill(value);
      await input.dispatchEvent("change");
    }
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const verificar = async () => {
      const dias = (await saved()).escalaGerada.resultado[0].dias;
      const sabado = dias.find((d) => d.data === "2026-10-31");
      assert.equal(sabado.horas, 4);
      assert.equal(sabado.entradaMin, 480);
      assert.equal(sabado.saidaMin, 720);
      assert.equal(sabado.intervaloMin, 0);
      const resumo = page.locator(
        '[data-resumo-semanal][data-colaborador="1"][data-semana="2026-10-26"]',
      );
      assert.match(await resumo.innerText(), /OK/);
      assert.match(await resumo.innerText(), /total 44:00 \/ alvo 44:00/);
    };
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await verificar();
    await page.reload();
    await verificar();
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await verificar();
    await irParaEtapa(page, "#cadastro-manual-colaboradores > summary");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    const horas = page.locator('[data-field="horasSemana"]').first();
    await horas.fill("60");
    await horas.dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    assert.equal(
      (await saved()).escalaGerada.resultado[0].dias.find(
        (d) => d.data === "2026-10-31",
      ).saidaMin,
      720,
    );
    await irParaEtapa(
      page,
      '[data-resumo-semanal][data-colaborador="1"][data-semana="2026-10-26"]',
    );
    assert.match(
      await page
        .locator(
          '[data-resumo-semanal][data-colaborador="1"][data-semana="2026-10-26"]',
        )
        .innerText(),
      /Contrato de referência: 60:00/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: sábado até meio-dia, fechamento de 44h, restauração e limite da fase sem prolongar o horário",
    );
  } finally {
    await context.close();
  }
};

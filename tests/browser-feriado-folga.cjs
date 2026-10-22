const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarFeriadoFolga({ browser, baseURL }) {
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
    await irParaEtapa(page, '[data-tipo="5x2"]');
    await page.locator('[data-tipo="5x2"]').click();
    await irParaEtapa(page, "#tg-horario-dia");
    await page.locator("#tg-horario-dia").check();
    for (let day = 1; day <= 6; day++) {
      const horario =
        day === 6
          ? {
              entrada: "08:00",
              intInicio: "12:00",
              intFim: "00:00",
              saida: "00:00",
            }
          : {
              entrada: "08:00",
              intInicio: "11:00",
              intFim: "13:00",
              saida: "18:00",
            };
      for (const [field, value] of Object.entries(horario)) {
        const input = page.locator(
          `#jornada-por-dia-wrap [data-day="${day}"][data-field="${field}"]`,
        );
        await input.fill(value);
        await input.dispatchEvent("change");
      }
    }
    const checkbox = page.getByLabel("Trabalhar neste feriado");
    await irParaEtapa(page, "#sec-feriados");
    await checkbox.waitFor();
    assert.equal(await checkbox.isChecked(), false);
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const conferir = async () => {
      const state = await saved();
      for (const r of state.escalaGerada.resultado) {
        const semana = r.dias.filter(
          (d) => d.data >= "2026-10-12" && d.data <= "2026-10-18",
        );
        assert.deepEqual(
          semana.filter((d) => d.status === "F").map((d) => d.data),
          ["2026-10-12", "2026-10-18"],
        );
        assert.equal(semana.filter((d) => d.status === "T").length, 5);
        assert.equal(semana.find((d) => d.data === "2026-10-17").saidaMin, 720);
        const resumo = page.locator(
          `[data-resumo-semanal][data-colaborador="${r.colaborador.id}"][data-semana="2026-10-12"]`,
        );
        assert.match(await resumo.innerText(), /OK/);
        assert.match(
          await resumo.innerText(),
          /36:00 trabalhadas \+ 08:00 abonadas/,
        );
        assert.match(await resumo.innerText(), /total 44:00 \/ alvo 44:00/);
        assert.match(await resumo.innerText(), /Folgas: 12\/10, 18\/10/);
      }
    };
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await conferir();
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await conferir();
    await irParaEtapa(page, "#sec-feriados");
    await checkbox.check();
    assert.equal((await saved()).escalaGerada, null);
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    const state = await saved();
    for (const r of state.escalaGerada.resultado) {
      const semana = r.dias.filter(
        (d) => d.data >= "2026-10-12" && d.data <= "2026-10-18",
      );
      assert.equal(semana[0].status, "FE");
      assert.equal(semana.filter((d) => d.status === "F").length, 2);
      assert.ok(
        !semana
          .filter((d) => d.status === "F")
          .some((d) => d.data === "2026-10-12"),
      );
    }
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(await checkbox.isChecked(), true);
    await irParaEtapa(page, "#sec-feriados");
    await checkbox.uncheck();
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await conferir();
    assert.deepEqual(errors, []);
    console.log(
      "OK: cenário da imagem com feriado entre as duas folgas, abono sem duplicação e checkbox de trabalho persistido",
    );
  } finally {
    await context.close();
  }
};

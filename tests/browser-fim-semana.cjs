const assert = require("node:assert/strict");
module.exports = async function testarFimSemana({ browser, baseURL }) {
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
      await page
        .locator('#instrumento-compensacao option[value="individual"]')
        .count(),
      0,
    );
    assert.equal(
      await page.locator("#folga-fim-semana-opcao").isDisabled(),
      true,
    );
    await page.locator('[data-tipo="5x2"]').click();
    assert.equal(
      await page.locator("#folga-fim-semana-opcao").isDisabled(),
      false,
    );
    await page.locator("#btn-gerar").click();
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const anterior = await saved();
    await page.locator("#folga-tipo").selectOption("fim_semana");
    assert.equal((await saved()).escalaGerada, null);
    assert.equal(await page.locator("#folga-dias-wrap").isVisible(), false);
    assert.match(
      await page.locator("#folga-modelo-explicacao").innerText(),
      /Todos os colaboradores folgam aos sábados e domingos/,
    );
    await page.locator("#btn-gerar").click();
    const conferir = async () => {
      const state = await saved();
      assert.equal(state.folgasFimSemana, true);
      assert.deepEqual(state.diasTrabalho, anterior.diasTrabalho);
      assert.deepEqual(state.folgaDiasPermitidos, anterior.folgaDiasPermitidos);
      for (const r of state.escalaGerada.resultado) {
        for (const dia of r.dias) {
          assert.equal(
            dia.status,
            [0, 6].includes(dia.weekday) || dia.data === "2026-10-12"
              ? "F"
              : "T",
            dia.data,
          );
        }
        const resumo = page.locator(
          `[data-resumo-semanal][data-colaborador="${r.colaborador.id}"][data-semana="2026-10-05"]`,
        );
        assert.match(await resumo.innerText(), /Folgas: 10\/10, 11\/10/);
      }
    };
    await conferir();
    await page.reload();
    assert.equal(await page.locator("#folga-tipo").inputValue(), "fim_semana");
    assert.equal(await page.locator("#folga-dias-wrap").isVisible(), false);
    await page.locator("#btn-gerar").click();
    await conferir();
    await page.locator('[data-tipo="6x1"]').click();
    assert.equal(
      await page.locator("#folga-fim-semana-opcao").isDisabled(),
      true,
    );
    assert.equal(await page.locator("#folga-tipo").inputValue(), "rotativa");
    await page.locator('[data-tipo="5x2"]').click();
    assert.equal(await page.locator("#folga-tipo").inputValue(), "fim_semana");
    await page.locator("#folga-tipo").selectOption("rotativa");
    assert.equal(await page.locator("#folga-dias-wrap").isVisible(), true);
    assert.deepEqual(
      (await saved()).folgaDiasPermitidos,
      anterior.folgaDiasPermitidos,
    );
    assert.equal((await saved()).folgasFimSemana, false);
    await page.locator("#btn-gerar").click();
    assert.ok(
      (await saved()).escalaGerada.resultado[0].dias.some(
        (d) => d.weekday === 6 && d.status === "T",
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: modelo 5x2 com sábado/domingo fixos, feriado, restauração, troca de escala e retorno à rotação; acordo individual indisponível",
    );
  } finally {
    await context.close();
  }
};

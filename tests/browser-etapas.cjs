const assert = require("node:assert/strict");
module.exports = async function testarEtapas({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
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
    const ids = [
      "sec-config",
      "sec-tipo",
      "sec-feriados",
      "sec-jornada",
      "sec-folgas",
      "sec-cobertura",
      "sec-pec",
      "sec-gerar",
    ];
    async function conferir(index) {
      assert.deepEqual(
        await page
          .locator("main > section[data-etapa]:visible")
          .evaluateAll((els) => els.map((el) => el.id)),
        [ids[index]],
      );
      assert.equal(
        await page
          .locator('[data-etapa-link][aria-current="step"]')
          .getAttribute("data-etapa-link"),
        ids[index],
      );
      assert.match(
        await page.locator("#etapas-status").innerText(),
        new RegExp(`Etapa ${index + 1} de 8`),
      );
      assert.equal(
        await page.locator("#etapa-anterior").isDisabled(),
        index === 0,
      );
      assert.equal(await page.locator("#etapa-proxima").isVisible(), index < 7);
    }
    await conferir(0);
    await page.locator("#cadastro-manual-colaboradores summary").click();
    await page.locator("#colab-nome").fill("Rascunho preservado");
    const original = await page.evaluate(() => JSON.stringify(localStorage));
    for (let i = 1; i < ids.length; i++) {
      await page.locator("#etapa-proxima").click();
      await conferir(i);
      assert.equal(
        await page
          .locator(`#${ids[i]} h2`)
          .first()
          .evaluate((el) => el === document.activeElement),
        true,
      );
    }
    for (let i = 6; i >= 0; i--) {
      await page.locator("#etapa-anterior").click();
      await conferir(i);
    }
    assert.equal(
      await page.locator("#colab-nome").inputValue(),
      "Rascunho preservado",
    );
    assert.equal(
      await page.evaluate(() => JSON.stringify(localStorage)),
      original,
    );
    await page.locator('[data-etapa-link="sec-cobertura"]').click();
    await conferir(5);
    await page.locator('[data-etapa-link="sec-feriados"]').click();
    await conferir(2);
    await page.goBack();
    await conferir(5);
    await page.goForward();
    await conferir(2);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await conferir(2);
    await page.locator('[data-etapa-link="sec-feriados"]').focus();
    await page.keyboard.press("End");
    await conferir(7);
    await page.keyboard.press("Home");
    await conferir(0);
    await page.keyboard.press("ArrowRight");
    await conferir(1);
    await page.keyboard.press("ArrowLeft");
    await conferir(0);
    await page.goto(baseURL + "/#colaboradores-cadastrados");
    await conferir(0);
    await page.goto(baseURL + "/#sec-inexistente");
    await conferir(0);
    await page.goto(baseURL + "/#%E0%A4%A");
    await conferir(0);
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await page.locator("#btn-gerar").click();
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /Escala mensal/,
    );
    await page.locator('[data-etapa-link="sec-config"]').click();
    await page.emulateMedia({ media: "print" });
    assert.deepEqual(
      await page
        .locator("main > section:visible")
        .evaluateAll((els) => els.map((el) => el.id)),
      ["sec-gerar"],
    );
    assert.equal(await page.locator("#etapas-nav").isVisible(), false);
    await page.emulateMedia({ media: "screen" });
    await conferir(0);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await conferir(7);
      const link = await page
        .locator('[data-etapa-link="sec-gerar"]')
        .boundingBox();
      assert.ok(link.x >= 0 && link.x + link.width <= width + 1);
      await page.locator('[data-etapa-link="sec-config"]').click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "OK: oito etapas isoladas, avançar/voltar, links, teclado, histórico, recarga, rascunhos, impressão e navegação móvel",
    );
  } finally {
    await context.close();
  }
};

const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");

module.exports = async function testarTutorial({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) =>
      route.request().url().includes("cdn.tailwindcss.com")
        ? route.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : route.abort(),
    );
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    const saved = await page.evaluate(() => JSON.stringify(localStorage));
    const result = await page.locator("#resultado-gerar").innerHTML();
    assert.equal(await page.locator("#tutorial-guiado").count(), 0);
    assert.equal(
      await page
        .locator("#btn-tutorial")
        .evaluate(
          (el) =>
            el.parentElement ===
            document.getElementById("btn-limpar-dados").parentElement,
        ),
      true,
    );
    const targets = [
      "config-periodo",
      "config-colaboradores",
      "sec-tipo",
      "sec-feriados",
      "sec-jornada",
      "sec-folgas",
      "sec-cobertura",
      "sec-pec",
      "sec-gerar",
    ];
    for (const viewport of [
      { width: 1366, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      const etapaAnterior = await page
        .locator("[data-etapa-link][aria-current]")
        .getAttribute("data-etapa-link");
      await irParaEtapa(page, "#btn-tutorial");
      await page.locator("#btn-tutorial").click();
      assert.equal(await page.locator("[role=dialog]").count(), 1);
      assert.equal(
        await page
          .locator("main")
          .evaluate((el) => el.closest("[inert]") !== null),
        true,
      );
      assert.equal(await page.locator("#tutorial-anterior").isDisabled(), true);
      for (const [index, target] of targets.entries()) {
        await irParaEtapa(page, "#tutorial-contador");
        assert.equal(
          await page.locator("#tutorial-contador").innerText(),
          `Etapa ${index + 1} de 9`,
        );
        assert.equal(
          await page.locator("#tutorial-guiado").getAttribute("data-target"),
          target,
        );
        await irParaEtapa(page, ".tutorial-highlight");
        assert.equal(await page.locator(`#${target}`).isVisible(), true);
        const highlight = await page
          .locator(".tutorial-highlight")
          .boundingBox();
        await irParaEtapa(page, ".tutorial-card");
        const card = await page.locator(".tutorial-card").boundingBox();
        for (const box of [highlight, card]) {
          assert.ok(box.width > 0 && box.height > 0);
          assert.ok(box.x >= 0 && box.y >= 0);
          assert.ok(box.x + box.width <= viewport.width + 1);
          assert.ok(box.y + box.height <= viewport.height + 1);
        }
        if (index === 6) {
          await irParaEtapa(page, "#tutorial-texto");
          assert.match(
            await page.locator("#tutorial-texto").innerText(),
            /Ative esta opção/,
          );
        }
        await irParaEtapa(page, "#tutorial-proximo");
        await page.locator("#tutorial-proximo").click();
      }
      assert.equal(await page.locator("#tutorial-guiado").count(), 0);
      assert.equal(
        await page
          .locator("[data-etapa-link][aria-current]")
          .getAttribute("data-etapa-link"),
        etapaAnterior,
      );
      assert.equal(
        await page
          .locator("#btn-tutorial")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        await page
          .locator("main")
          .evaluate((el) => el.closest("[inert]") !== null),
        false,
      );
      assert.equal(
        await page.evaluate(() => JSON.stringify(localStorage)),
        saved,
      );
      assert.equal(await page.locator("#resultado-gerar").innerHTML(), result);
      assert.equal(await page.locator("#tg-cobertura").isChecked(), false);
    }
    await irParaEtapa(page, "#btn-tutorial");
    await page.locator("#btn-tutorial").click();
    await irParaEtapa(page, "#tutorial-proximo");
    await page.locator("#tutorial-proximo").click();
    await irParaEtapa(page, "#tutorial-anterior");
    await page.locator("#tutorial-anterior").click();
    await irParaEtapa(page, "#tutorial-contador");
    assert.equal(
      await page.locator("#tutorial-contador").innerText(),
      "Etapa 1 de 9",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator("#tutorial-proximo")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("#tutorial-fechar")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#tutorial-guiado").count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await irParaEtapa(page, '[data-tipo="12x36"]');
    await page.locator('[data-tipo="12x36"]').click();
    await irParaEtapa(page, "#btn-tutorial");
    await page.locator("#btn-tutorial").click();
    await page.setViewportSize({ width: 768, height: 600 });
    await irParaEtapa(page, "#tutorial-fechar");
    await page.locator("#tutorial-fechar").click();
    await irParaEtapa(page, "#btn-tutorial");
    await page.locator("#btn-tutorial").click();
    await irParaEtapa(page, "#tutorial-contador");
    assert.equal(
      await page.locator("#tutorial-contador").innerText(),
      "Etapa 1 de 9",
    );
    await irParaEtapa(page, "#tutorial-fechar");
    await page.locator("#tutorial-fechar").click();
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(await page.locator("#tutorial-guiado").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "OK: tutorial de 9 etapas, destaque responsivo, navegação, teclado, encerramento e preservação da escala e dos dados",
    );
  } finally {
    await context.close();
  }
};

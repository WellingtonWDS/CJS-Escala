const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    const requests = [];
    await context.route("https://**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.match(await page.title(), /Reescala/);
    for (const image of [".app-brand img", ".sidebar-brand img"]) {
      assert.equal(await page.locator(image).evaluate(async (el) => { await el.decode(); return el.naturalWidth > 0; }), true);
    }
    assert.equal(
      await page
        .locator(".app-header")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
    );
    assert.equal(
      await page
        .locator("#btn-tutorial")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(63, 86, 106)",
    );
    assert.equal(
      requests.some((url) => url.includes("tailwind")),
      false,
    );
    const css = await page.request.get(baseURL + "/assets/css/utilities.css");
    assert.equal(css.status(), 200);
    await page.evaluate(() => {
      document.getElementById("app-sidebar").hidden = false;
      document.body.classList.add("has-app-sidebar", "sidebar-collapsed");
    });
    assert.equal(await page.locator(".sidebar-brand img").isVisible(), true);
    assert.equal(await page.locator(".sidebar-brand > span").isVisible(), false);
    await page.evaluate(() => {
      document.getElementById("app-sidebar").hidden = true;
      document.body.classList.remove("has-app-sidebar", "sidebar-collapsed");
    });
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const step of [
        "sec-config",
        "sec-tipo",
        "sec-feriados",
        "sec-jornada",
        "sec-folgas",
        "sec-cobertura",
        "sec-pec",
        "sec-gerar",
      ]) {
        await page.locator(`[data-etapa-link="${step}"]`).click();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Rolagem horizontal inesperada em ${step}, largura ${width}`,
        );
      }
    }
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("#etapas-nav").isVisible(), false);
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.goto(baseURL + "/login.html");
    assert.match(await page.title(), /Reescala/);
    assert.equal(await page.locator(".brand img").evaluate(async (el) => { await el.decode(); return el.naturalWidth > 0; }), true);
    const input = page.locator("#password");
    await input.waitFor();
    assert.ok((await input.boundingBox()).height >= 44);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log(
      "OK: interface — estilos locais sem Tailwind externo, contraste do cabeçalho, oito etapas em 1440/768/375/320px, impressão e login móvel.",
    );
  } finally {
    await context.close();
  }
};

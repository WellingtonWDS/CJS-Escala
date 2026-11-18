const assert = require("node:assert/strict");
module.exports = async function testarSobre({ browser, baseURL }) {
  for (const [nome, opcoes] of [["desktop", { viewport: { width: 1366, height: 900 } }], ["celular", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(opcoes);
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://**/*", (r) => r.abort());
      await page.goto(new URL("/sobre", baseURL).href);
      assert.match(await page.title(), /Reescala/);
      const texto = await page.locator("body").innerText();
      assert.match(texto, /sistemas contábeis mais usados/);
      // Sem citar sistemas contábeis específicos.
      assert.doesNotMatch(texto, /Dom[ií]nio|\bSCI\b/);
      const whats = page.locator("[data-whatsapp]");
      assert.equal(await whats.count(), 2);
      for (const href of await whats.evaluateAll((els) => els.map((e) => e.href)))
        assert.match(href, /^https:\/\/wa\.me\/5533988571697\?text=/);
      assert.equal(await page.locator('a[href="/login.html"]').count() >= 2, true);
      for (let y = 0; y < 20000; y += 700) await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${nome}: sem rolagem horizontal`);
      // Alternância de tema.
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator("[data-theme-toggle]").click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
      assert.deepEqual(errors, []);
    } finally {
      await ctx.close();
    }
  }
  console.log("OK: página pública /sobre com imagens, WhatsApp, login, tema e layout desktop/celular");
};

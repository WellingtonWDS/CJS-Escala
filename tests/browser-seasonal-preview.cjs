const assert = require("node:assert/strict");
const contrast = require("./helpers/contrast.cjs");
module.exports = async ({ browser, baseURL }) => {
  for (const role of ["operator", "manager", "admin"]) {
    const context = await browser.newContext();
    try {
      await context.route("https://**/*", (r) => r.abort());
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.evaluate(async (role) => {
        const { initNavigation } = await import("/assets/js/ui/navigation.js");
        initNavigation({
          session: {
            user: { name: "Pessoa de teste", role },
            persistenceEnabled: true,
          },
          document,
          window,
        });
      }, role);
      const open = page.locator("[data-seasonal-preview-open]");
      if (role !== "admin") {
        assert.equal(await open.count(), 0);
        assert.equal(
          await page.evaluate(async (role) => {
            const { openSeasonalPreview } = await import(
              "/assets/js/ui/seasonal-preview.js"
            );
            return openSeasonalPreview({ document, role });
          }, role),
          null,
        );
        continue;
      }
      await page.setViewportSize({ width: 1440, height: 768 });
      await page.waitForFunction(() => {
        const s = document.getElementById("app-sidebar");
        return (
          s.scrollWidth <= s.clientWidth + 1 &&
          s.scrollHeight <= s.clientHeight + 1
        );
      });
      const baseline = await page.evaluate(() => ({
        data: localStorage.getItem("fintria-escala-dp-v2"),
        theme: document.documentElement.dataset.theme,
        savedTheme: localStorage.getItem("reescala-theme"),
        real: document.querySelector("[data-seasonal-ornament]").innerHTML,
      }));
      await open.click();
      const dialog = page.locator("[data-seasonal-preview-dialog][open]");
      await dialog.waitFor();
      const select = dialog.locator("[data-preview-event]");
      assert.equal(await select.locator("option").count(), 20);
      const ids = await select
        .locator("option")
        .evaluateAll((opts) => opts.map((o) => o.value));
      for (const id of ids) {
        await select.selectOption(id);
        assert.equal(
          await dialog.locator("[data-preview-ornament]").count(),
          2,
        );
        assert.deepEqual(
          await dialog
            .locator("[data-preview-ornament]")
            .evaluateAll((els) => els.map((e) => e.dataset.seasonalTheme)),
          [id, id],
        );
      }
      await select.selectOption("ano-novo");
      await dialog.locator("[data-preview-replay]").click();
      assert.match(
        await dialog
          .locator(".seasonal-burst")
          .first()
          .evaluate((e) => getComputedStyle(e).animationName),
        /seasonal-fireworks/,
      );
      assert.match(
        await dialog.locator("[data-preview-message]").innerText(),
        /Feliz Ano Novo/,
      );
      for (const el of await dialog.locator("[data-preview-ornament]").all()) {
        assert(
          await el.evaluate((e) => {
            const caption = getComputedStyle(e, "::after");
            return (
              parseFloat(caption.width) > e.clientWidth &&
              parseFloat(caption.height) < 45
            );
          }),
          "Saudação legível, sem uma letra por linha",
        );
      }
      await select.selectOption("carnaval");
      await dialog.locator("[data-preview-replay]").click();
      assert.match(
        await dialog
          .locator(".seasonal-confetti")
          .first()
          .evaluate((e) => getComputedStyle(e).animationName),
        /seasonal-confetti/,
      );
      for (const actual of ["light", "dark"]) {
        await page.evaluate(
          (actual) => (document.documentElement.dataset.theme = actual),
          actual,
        );
        for (const sample of ["light", "dark"]) {
          await dialog
            .locator("[data-preview-appearance]")
            .selectOption(sample);
          assert.equal(
            await page.locator("html").getAttribute("data-theme"),
            actual,
          );
          assert.equal(
            await dialog
              .locator(".seasonal-preview-login")
              .evaluate((e) => getComputedStyle(e).backgroundColor),
            sample === "dark" ? "rgb(22, 33, 48)" : "rgb(255, 255, 255)",
          );
          assert.deepEqual(
            await contrast(page, "[data-seasonal-preview-dialog]"),
            [],
          );
        }
      }
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert(
          await dialog.evaluate((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth + 1 &&
              e.scrollWidth <= e.clientWidth + 1
            );
          }),
        );
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await select.selectOption("ano-novo");
      await dialog.locator("[data-preview-replay]").click();
      assert.equal(
        await dialog
          .locator(".seasonal-burst")
          .first()
          .evaluate((e) => getComputedStyle(e).animationName),
        "none",
      );
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        baseline.theme,
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert(await open.evaluate((e) => document.activeElement === e));
      assert.deepEqual(
        await page.evaluate(() => ({
          data: localStorage.getItem("fintria-escala-dp-v2"),
          theme: document.documentElement.dataset.theme,
          savedTheme: localStorage.getItem("reescala-theme"),
          real: document.querySelector("[data-seasonal-ornament]").innerHTML,
        })),
        baseline,
      );
      await open.click();
      await dialog.waitFor();
      await dialog.locator("[data-seasonal-preview-close]").first().click();
      await dialog.waitFor({ state: "detached" });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    "OK: prévia sazonal exclusiva do Admin, 20 temas/efeitos, amostras isoladas claro/escuro, mobile, replay, Escape/foco e nenhuma alteração do calendário/preenchimento.",
  );
};

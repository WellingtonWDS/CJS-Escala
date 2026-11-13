const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-12-26T02:59:30Z") });
    await page.goto(baseURL + "/login.html");
    const ornament = page.locator("[data-seasonal-ornament]");
    await ornament.waitFor();
    assert.equal(await ornament.getAttribute("data-seasonal-theme"), "natal");
    await page.locator("#password").fill("preenchimento-preservado");
    await ornament.hover();
    assert.equal(
      await ornament.evaluate((e) => getComputedStyle(e, "::after").content),
      '"Feliz Natal!"',
    );
    await page.clock.fastForward(61000);
    assert.equal(
      await ornament.getAttribute("data-seasonal-theme"),
      "ano-novo",
    );
    await page.mouse.move(0, 0);
    await ornament.hover();
    assert.match(
      await ornament
        .locator(".seasonal-burst")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
      /seasonal-fireworks/,
    );
    assert.equal(
      await page.locator("#password").inputValue(),
      "preenchimento-preservado",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await ornament
        .locator(".seasonal-burst")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const samples = [
      ["2027-01-07", null],
      ["2027-02-09", "carnaval"],
      ["2027-03-08", "mulheres"],
      ["2027-03-28", "pascoa"],
      ["2027-04-21", "tiradentes"],
      ["2027-04-25", "contabilidade"],
      ["2027-05-01", "trabalho"],
      ["2027-05-09", "maes"],
      ["2027-06-10", "namorados"],
      ["2027-06-24", "juninas"],
      ["2027-07-20", "amizade"],
      ["2027-08-08", "pais"],
      ["2027-09-07", "independencia"],
      ["2027-09-22", "contador"],
      ["2027-09-25", "primavera"],
      ["2027-10-12", "criancas"],
      ["2027-10-31", "halloween"],
      ["2027-11-15", "republica"],
      ["2027-11-20", "consciencia-negra"],
      ["2027-12-25", "natal"],
      ["2027-12-26", "ano-novo"],
    ];
    for (const [date, id] of samples) {
      await page.clock.setSystemTime(new Date(date + "T15:00:00Z"));
      await page.clock.fastForward(61000);
      if (!id) assert.equal(await ornament.isVisible(), false);
      else {
        assert.equal(
          await ornament.getAttribute("data-seasonal-theme"),
          id,
          date,
        );
        assert.equal(await ornament.locator("svg").count(), 1);
        assert(await ornament.isVisible());
      }
    }
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { initNavigation } = await import("/assets/js/ui/navigation.js");
      initNavigation({
        session: {
          user: { name: "Pessoa teste", role: "admin" },
          persistenceEnabled: true,
        },
        document,
        window,
      });
    });
    const sidebarOrnament = page.locator(
      ".sidebar-brand [data-seasonal-ornament]",
    );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const collapsed of [false, true]) {
          await page.evaluate(
            (collapsed) =>
              document.body.classList.toggle("sidebar-collapsed", collapsed),
            collapsed,
          );
          await page.waitForFunction(() => {
            const e = document.getElementById("app-sidebar");
            return (
              e.scrollWidth <= e.clientWidth + 1 &&
              e.scrollHeight <= e.clientHeight + 1
            );
          });
          assert(await sidebarOrnament.isVisible());
          await sidebarOrnament.click();
          assert.equal(new URL(page.url()).pathname, "/");
          assert(
            await sidebarOrnament.evaluate((e) =>
              e.classList.contains("is-celebrating"),
            ),
          );
        }
      }
    }
    // A visibilidade e o retorno à aba também recalculam, sem esperar um reload.
    const saved = await page.evaluate(() =>
      localStorage.getItem("fintria-escala-dp-v2"),
    );
    await page.clock.setSystemTime(new Date("2028-02-29T15:00:00Z"));
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    assert.equal(
      await sidebarOrnament.getAttribute("data-seasonal-theme"),
      "carnaval",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("fintria-escala-dp-v2")),
      saved,
    );
    await sidebarOrnament.hover();
    assert.match(
      await sidebarOrnament
        .locator(".seasonal-confetti")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
      /seasonal-confetti/,
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(await sidebarOrnament.isVisible(), false);
    const touch = await browser.newContext({
      isMobile: true,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    try {
      const mobile = await touch.newPage();
      await mobile.route("https://**/*", (r) => r.abort());
      await mobile.clock.install({ time: new Date("2026-12-26T15:00:00Z") });
      await mobile.goto(baseURL + "/login.html");
      const detail = mobile.locator("[data-seasonal-ornament]");
      await detail.tap();
      assert(
        await detail.evaluate((e) => e.classList.contains("is-celebrating")),
      );
      await mobile.clock.fastForward(300);
      assert.equal(
        await detail.evaluate((e) => getComputedStyle(e, "::after").visibility),
        "visible",
      );
      await mobile.clock.fastForward(2800);
      assert(
        !(await detail.evaluate((e) => e.classList.contains("is-celebrating"))),
      );
      await mobile.waitForFunction(
        () =>
          getComputedStyle(
            document.querySelector("[data-seasonal-ornament]"),
            "::after",
          ).visibility === "hidden",
      );
    } finally {
      await touch.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "OK: calendário sazonal — virada Natal/Ano Novo em São Paulo, todos os temas, fogos/confete, movimento reduzido, toque sem navegação, atualização aberta e layouts claro/escuro.",
    );
  } finally {
    await context.close();
  }
};

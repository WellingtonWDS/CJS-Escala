const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(
      await page.locator("#btn-exportar-csv,#btn-exportar-proposta").count(),
      0,
    );
    await page.evaluate(async () => {
      document.getElementById("remote-workspace")?.remove();
      const d = document.createElement("dialog");
      d.id = "remote-workspace";
      d.className = "remote-workspace";
      d.innerHTML =
        '<h2>Empresa atual e preenchimentos</h2><p>Seleção</p><div class="workspace-selector-scroll"><div class="company-combobox"><select hidden></select><button type="button" data-company-trigger>Empresa</button><div data-company-popup hidden class="company-combobox-popup"><input><div id="teste-options" role="listbox"></div><p role="status"></p></div></div><div>Preenchimentos</div></div><button id="fora-seletor">Outra ação</button>';
      document.body.append(d);
      const { createCompanyCombobox } =
        await import("/assets/js/ui/company-combobox.js");
      createCompanyCombobox({
        root: d.querySelector(".company-combobox"),
      }).setRows(
        Array.from({ length: 60 }, (_, i) => ({
          id: String(i),
          name: `Empresa ${i}`,
          cnpj: "00.000.000/0000-00",
        })),
      );
      d.showModal();
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 850 });
      const modal = page.locator("#remote-workspace"),
        trigger = page.locator("[data-company-trigger]");
      await modal.evaluate(async (e) => {
        await Promise.all(e.getAnimations().map((a) => a.finished));
      });
      const before = await modal.boundingBox();
      await trigger.click();
      const after = await modal.boundingBox();
      assert(Math.abs(before.height - after.height) < 1);
      const list = page.locator("[role=listbox]"),
        box = await list.boundingBox();
      await page.mouse.move(box.x + box.width - 2, box.y + 15);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height - 15, {
        steps: 5,
      });
      await page.mouse.up();
      await page.evaluate(() => {
        const input = document.querySelector("[data-company-popup] input");
        input.dispatchEvent(
          new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
        );
      });
      assert(await page.locator("[data-company-popup]").isVisible());
      await list.evaluate((e) => (e.scrollTop = e.scrollHeight));
      assert(await list.evaluate((e) => e.scrollTop > 0));
      await page.locator("#fora-seletor").focus();
      assert(!(await page.locator("[data-company-popup]").isVisible()));
    }
    console.log(
      "OK: seletor preserva abertura na barra de rolagem/foco nulo, fecha fora e modal mantém altura em desktop/celular; CSV removido.",
    );
  } finally {
    await ctx.close();
  }
};

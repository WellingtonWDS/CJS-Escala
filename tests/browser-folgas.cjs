const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarFolgas({ browser, baseURL }) {
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
    await irParaEtapa(page, '#weekday-picker [data-day="0"]');
    await page.locator('#weekday-picker [data-day="0"]').click();
    for (const day of [1, 5, 6]) {
      await irParaEtapa(page, `#folga-dias-permitidos [data-day="${day}"]`);
      await page.locator(`#folga-dias-permitidos [data-day="${day}"]`).click();
    }
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const conferir = async () => {
      const state = await saved();
      assert.equal(state.tipoEscala, "5x2");
      assert.deepEqual([...state.folgaDiasPermitidos].sort(), [0, 1, 2, 3, 4]);
      for (const r of state.escalaGerada.resultado) {
        let seguidos = 0;
        for (const d of r.dias) {
          seguidos = ["T", "FE"].includes(d.status) ? seguidos + 1 : 0;
          assert.ok(seguidos <= 6);
          assert.equal(d.repousoSeguranca, false);
        }
        for (let i = 0; i < r.dias.length; i += 7) {
          const semana = r.dias.slice(i, i + 7);
          assert.equal(
            semana.filter((d) => ["T", "FE"].includes(d.status)).length,
            5,
            semana[0].data,
          );
          assert.equal(
            semana.filter((d) => d.status === "F").length,
            2,
            semana[0].data,
          );
        }
      }
      assert.ok(
        state.escalaGerada.validacoes.every(
          (v) =>
            !v.issues.some((i) =>
              ["REPOUSO_AJUSTADO", "DIAS_CONSECUTIVOS"].includes(i.tipo),
            ),
        ),
      );
    };
    await conferir();
    await page.reload();
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    await conferir();
    assert.deepEqual(errors, []);
    console.log(
      "OK: 5x2 mantém duas folgas semanais sem sete dias consecutivos, inclusive após recarregar",
    );
  } finally {
    await context.close();
  }
};

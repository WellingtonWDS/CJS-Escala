const { irParaEtapa } = require("./helpers/etapas.cjs");
const contrast = require("./helpers/contrast.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarDomingos({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://**/*", (r) => r.abort());
    await page.goto(baseURL);
    await page.waitForFunction(() => document.getElementById("cfg-mes").options.length === 12);
    await irParaEtapa(page, "#tg-comercio");
    const autorizados = page.locator("#domingos-autorizados-wrap");
    assert.equal(await page.locator("#tg-comercio").isChecked(), false);
    assert.equal(await autorizados.isHidden(), true, "autorização só aparece para o comércio");
    await page.locator("#tg-comercio").check();
    assert.equal(await autorizados.isVisible(), true);
    await page.locator("#tg-domingos-autorizados").check();
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(salvo.atividadeComercio, true);
    assert.equal(salvo.domingosPermitidos, true);
    assert.match(await page.locator("#domingos-config").innerText(), /comércio a cada 3 semanas.*Portaria MTE nº 2\.041\/2026/s);
    // Instrumento coletivo: autorização para turnos ininterruptos acima de 6h.
    await irParaEtapa(page, "#instrumento-compensacao");
    await page.locator("#instrumento-detalhes summary").click();
    await page.locator("#act-turnos-ininterruptos").check();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).instrumentoColetivo.turnosIninterruptos), true);
    await irParaEtapa(page, "#tg-comercio");
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      assert.deepEqual(await contrast(page, "#domingos-config"), [], `contraste ${tema}`);
    }
    await page.setViewportSize({ width: 375, height: 740 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sem rolagem lateral no celular");
    // Reabrir a página mantém as escolhas.
    await page.reload();
    await page.waitForFunction(() => document.getElementById("cfg-mes").options.length === 12);
    await irParaEtapa(page, "#tg-comercio");
    assert.equal(await page.locator("#tg-comercio").isChecked(), true);
    assert.equal(await page.locator("#tg-domingos-autorizados").isChecked(), true);
    assert.deepEqual(errors, []);
    console.log("OK: repouso aos domingos — comércio e autorização, turnos ininterruptos no ACT/CCT, persistência, contraste e celular.");
  } finally {
    await context.close();
  }
};

const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-jornada"]').click();
    for (const [id, valor, esperado] of [["#margem-antes", "33", 35], ["#margem-depois", "999", 240]]) {
      await page.locator(id).fill(valor);
      await page.locator(id).dispatchEvent("change");
      assert.equal(await page.locator(id).inputValue(), String(esperado));
    }
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
    assert.equal(salvo.margemAntesAbertura, 35);
    assert.equal(salvo.margemDepoisFechamento, 240);
    await page.locator('[data-etapa-link="sec-tipo"]').click();
    assert.match(await page.locator("#instrumento-compensacao").locator("xpath=..").innerText(), /facultativo.*necessário/s);
    await page.locator("#instrumento-detalhes > summary").click();
    const guia = page.locator("[data-act-guia]");
    assert.match(await guia.innerText(), /Facultativo[\s\S]*Necessário[\s\S]*Mais de 8h24 por dia/);
    assert.deepEqual(errors, []);
    console.log("OK: margem antes/depois do funcionamento na Jornada e guia de quando preencher o ACT/CCT");
  } finally {
    await ctx.close();
  }
};

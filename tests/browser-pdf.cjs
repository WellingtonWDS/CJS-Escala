const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { unzipSync } = await import("fflate");
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({
      acceptDownloads: true,
      timezoneId: "America/Sao_Paulo",
    });
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      const seed = criarEstadoDemo();
      seed.modeloEscala = fixa ? "fixa" : "dinamica";
      await page.evaluate(
        (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
        seed,
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await clicarCalculo(page, "#btn-converter");
      for (const origem of ["atual", "proposta"])
        for (const tipo of ["empregador", "colaboradores"]) {
          const button = page.locator(
            `[data-export-pdf="${tipo}"][data-origem="${origem}"]`,
          );
          const waiting = page.waitForEvent("download");
          await button.click();
          const download = await waiting;
          const bytes = await fs.readFile(await download.path());
          if (tipo === "empregador") {
            assert(bytes.toString("latin1").startsWith("%PDF-"));
            assert(bytes.toString("latin1").includes("/Subtype /Image"));
            await fs.writeFile(
              `/tmp/reescala-${origem}-${fixa ? "fixa" : "dinamica"}.pdf`,
              bytes,
            );
          } else {
            const files = unzipSync(bytes);
            assert.equal(Object.keys(files).length, 5);
            for (const [name, data] of Object.entries(files)) {
              assert(name.endsWith(".pdf"));
              assert(Buffer.from(data).toString("latin1").startsWith("%PDF-"));
            }
          }
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-export-pdf][aria-busy="true"]'),
          );
        }
      assert.deepEqual(errors, []);
    } finally {
      await ctx.close();
    }
  }
};
if (require.main === module)
  (async () => {
    const { createDevServer } = await import("../scripts/serve.js");
    const { chromium } = require("playwright");
    const path = require("node:path");
    const server = createDevServer({
      root: path.resolve(__dirname, "../dist"),
      auth: false,
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
          "/usr/bin/chromium",
      });
      await module.exports({
        browser,
        baseURL: `http://127.0.0.1:${server.address().port}/`,
      });
      console.log("PDF e ZIP aprovados nos dois modos e nas duas origens.");
    } finally {
      await browser?.close();
      await new Promise((r) => server.close(r));
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { unzipSync } = await import("fflate");
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({ acceptDownloads: true, timezoneId: "America/Sao_Paulo" });
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-11-18T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      const seed = criarEstadoDemo();
      seed.modeloEscala = fixa ? "fixa" : "dinamica";
      await page.evaluate((s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)), seed);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await clicarCalculo(page, "#btn-converter");
      // Prévia do termo do primeiro colaborador.
      await page.locator("[data-termo-previa] > summary").click();
      // A prévia é montada no evento toggle, logo após abrir o painel.
      await page.waitForFunction(() => /TERMO ADITIVO/.test(document.querySelector("[data-termo-previa-conteudo]").textContent));
      const previa = await page.locator("[data-termo-previa-conteudo]").innerText();
      assert.match(previa, /TERMO ADITIVO AO CONTRATO INDIVIDUAL DE TRABALHO/);
      assert.match(previa, /CLÁUSULA 1ª – OBJETO/);
      assert.match(previa, /Emenda Constitucional nº 141/);
      assert.match(previa, /R\$ _{6,}/);
      assert.match(previa, /Não é parecer jurídico/);
      assert.match(previa, /inscrito\(a\) no CPF sob o nº _{6,}/);
      assert.doesNotMatch(previa, /CESSÃO DE USO DE IMAGEM/);
      // Modal: cláusulas obrigatórias travadas; a escolha muda a prévia e os arquivos.
      await page.locator("[data-termo-abrir]").click();
      const modal = page.locator("[data-termo-modal]");
      await modal.waitFor();
      assert.equal(await modal.locator('[data-termo-clausula="horario"]').isDisabled(), true);
      assert.equal(await modal.locator('[data-termo-clausula="imagem"]').isChecked(), false);
      await modal.locator('[data-termo-clausula="imagem"]').check();
      await modal.locator('[data-termo-clausula="salarioHora"]').uncheck();
      await page.waitForFunction(() => /CESSÃO DE USO DE IMAGEM/.test(document.querySelector("[data-termo-previa-conteudo]").textContent));
      assert.doesNotMatch(await page.locator("[data-termo-previa-conteudo]").innerText(), /SALÁRIO-HORA/);
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("cjs-termo-clausulas"))).includes("imagem"), true);
      const pessoas = seed.colaboradores.length;
      for (const formato of ["pdf", "docx"]) {
        const waiting = page.waitForEvent("download");
        await modal.locator(`[data-export-termo="${formato}"]`).click();
        const download = await waiting;
        assert.match(download.suggestedFilename(), new RegExp(`termos-aditivos-${formato === "pdf" ? "pdf" : "word"}\\.zip$`));
        const arquivos = unzipSync(new Uint8Array(await fs.readFile(await download.path())));
        const nomes = Object.keys(arquivos);
        assert(nomes.includes("LEIA-ME.txt"));
        assert.match(new TextDecoder().decode(arquivos["LEIA-ME.txt"]), /assessoria jurídica/);
        const termos = nomes.filter((n) => n.startsWith("termo-aditivo-") && n.endsWith(`.${formato}`));
        assert.equal(termos.length, pessoas);
        const primeiro = arquivos[termos[0]];
        if (formato === "pdf") assert.equal(new TextDecoder().decode(primeiro.slice(0, 5)), "%PDF-");
        else {
          const docXml = new TextDecoder().decode(unzipSync(primeiro)["word/document.xml"]);
          assert.match(docXml, /CLÁUSULA 2ª – DURAÇÃO DO TRABALHO/);
          assert.match(docXml, /CESSÃO DE USO DE IMAGEM E VOZ/);
          assert.doesNotMatch(docXml, /SALÁRIO-HORA/);
          assert.match(docXml, /CPF: _{6,}/);
          assert.doesNotMatch(docXml, /w:jc w:val="(left|start)"/);
        }
      }
      assert.match(await modal.locator("[data-termo-status]").innerText(), /baixados/);
      await modal.locator("[data-termo-fechar]").click();
      await modal.waitFor({ state: "detached" });
      assert.deepEqual(errors, []);
    } finally {
      await ctx.close();
    }
  }
  console.log("OK: termos aditivos com modal de cláusulas, prévia, ZIP em PDF e Word por colaborador e LEIA-ME, nos modelos dinâmico e fixo");
};

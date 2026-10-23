const assert = require("node:assert/strict");
module.exports = async function ({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { createDefaultState } = await import("/assets/js/state/store.js");
      const { converterEscala } = await import(
        "/assets/js/domain/conversao.js"
      );
      const s = createDefaultState(new Date(2026, 9, 23));
      s.colaboradores = [1, 2, 3].map((id) => ({
        id,
        nome: `Colaborador de Exemplo ${id}`,
        cargo: "Atendente",
        sexo: "masculino",
        horasSemana: 44,
      }));
      s.horarioPorDia = true;
      s.jornada = {
        entrada: "08:00",
        intInicio: "11:00",
        intFim: "13:00",
        saida: "18:00",
      };
      for (let d = 1; d <= 6; d++)
        s.jornadaPorDia[d] =
          d === 6
            ? {
                entrada: "08:00",
                intInicio: "12:00",
                intFim: "00:00",
                saida: "00:00",
              }
            : { ...s.jornada };
      s.conversao = converterEscala(s, {
        periodo: "2028-02",
        fase: "definitivo40",
        folgas: "fim_semana",
      });
      s.escalaGerada = structuredClone(s.conversao.origem.escala);
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    for (const id of ["resultado-gerar", "resultado-proposta"]) {
      const container = page.locator("#" + id);
      assert.equal(
        await container.evaluate((el) =>
          el.firstElementChild.matches("[data-escala-quadro]"),
        ),
        true,
      );
      const analises = container.locator("[data-analises-escala]");
      assert.equal(await analises.getAttribute("open"), null);
      await analises.locator("summary").first().click();
      assert.ok(await analises.locator("div").first().isVisible());
      await analises.locator("summary").first().click();
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 640, height: 450 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const grade = container.locator("[data-rolagem-escala]"),
          topo = container.locator("[data-rolagem-topo]");
        await topo.waitFor({ state: "visible" });
        assert.equal(
          await grade.evaluate((el) => getComputedStyle(el).overflowX),
          "auto",
        );
        assert.ok(
          await grade.evaluate((el) => el.scrollWidth > el.clientWidth),
        );
        await container.locator("[data-ver-resumo]").click();
        assert.ok(
          await grade.evaluate(
            (el) =>
              Math.abs(el.scrollLeft - (el.scrollWidth - el.clientWidth)) < 2,
          ),
        );
        assert.ok(
          await grade.evaluate((el) => {
            const a = el.getBoundingClientRect(),
              b = el
                .querySelector("tbody tr td:last-child")
                .getBoundingClientRect();
            return b.right <= a.right + 2 && b.left >= a.left;
          }),
        );
        await topo.evaluate((el) => (el.scrollLeft = 0));
        await page.waitForFunction(
          (id) =>
            document.querySelector("#" + id + " [data-rolagem-escala]")
              .scrollLeft === 0,
          id,
        );
        await grade.evaluate((el) => (el.scrollTop = 150));
        assert.ok(await grade.evaluate((el) => el.scrollTop > 0));
      }
      await page.emulateMedia({ media: "print" });
      assert.equal(
        await container
          .locator("[data-rolagem-escala]")
          .evaluate((el) => getComputedStyle(el).maxHeight),
        "none",
      );
      assert.equal(
        await container
          .locator("[data-rolagem-escala]")
          .evaluate((el) => getComputedStyle(el).overflow),
        "visible",
      );
      await page.emulateMedia({ media: "screen" });
    }
    // Recriar a grade após editar uma célula mantém as posições dos dois eixos.
    const gradeAtual = page.locator("#resultado-gerar [data-rolagem-escala]");
    await gradeAtual.evaluate((el) => {
      el.scrollLeft = 80;
      el.scrollTop = 150;
    });
    const aceitarFolga = (dialog) => dialog.accept("F");
    page.on("dialog", aceitarFolga);
    await page
      .locator('#resultado-gerar [data-ri="0"][data-di="0"]')
      .dispatchEvent("click");
    page.removeListener("dialog", aceitarFolga);
    assert.ok(
      await gradeAtual.evaluate(
        (el) =>
          Math.abs(el.scrollLeft - 80) < 2 && Math.abs(el.scrollTop - 150) < 2,
      ),
    );
    // Um erro real precisa aparecer aberto antes da grade, sem esconder a escala.
    await page.evaluate(() => {
      const key = "fintria-escala-dp-v2",
        s = JSON.parse(localStorage.getItem(key));
      const d = s.escalaGerada.resultado[0].dias.find(
        (d) => d.data === "2026-10-05",
      );
      d.horas = 10;
      d.saidaMin += 120;
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    const atual = page.locator("#resultado-gerar");
    assert.equal(
      await atual.evaluate((el) =>
        el.firstElementChild.matches("[data-erros-escala][open]"),
      ),
      true,
    );
    assert.match(
      await atual.locator("[data-erros-escala]").innerText(),
      /10:00 de trabalho efetivo/,
    );
    assert.ok(await atual.locator("[data-escala-quadro]").isVisible());
    assert.deepEqual(errors, []);
    console.log(
      "OK: grades antes das análises, erros abertos antes da escala, barra superior sincronizada, resumo acessível em zoom/celular e impressão sem cortes",
    );
  } finally {
    await context.close();
  }
};

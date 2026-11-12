const assert = require('node:assert/strict');
const contrast = require('./helpers/contrast.cjs');
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    await context.route('https://**/*', r => r.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.evaluate(async () => {
      const { createCompanyDiagnostics } = await import('/assets/js/ui/diagnostico-empresa.js');
      document.getElementById('scheduler-view').hidden = true;
      const root = document.getElementById('company-diagnostics');
      root.hidden = false;
      document.body.dataset.appView = 'diagnostics';
      const companies = Array.from({ length: 15 }, (_, i) => ({ id: `company-${i}`, officeId: 'office-1', name: i ? `Empresa ${i} de comércio e distribuição com razão social extensa para conferência visual` : 'Empresa de exemplo', cnpj: '48956412000126' }));
      await createCompanyDiagnostics({ document, window, service: {
        options: async () => ({ offices: [{ id: 'office-1', name: 'Escritório de exemplo' }], companies }),
        list: async () => [],
      } }).show();
    });
    const root = page.locator('#company-diagnostics'), trigger = root.locator('[data-company-trigger]');
    const geometry = () => root.evaluate(el => {
      const office = el.querySelector('[data-diag-office]').getBoundingClientRect();
      const company = el.querySelector('[data-company-trigger]').getBoundingClientRect();
      return { width: office.width, height: office.height, rowHeight: el.querySelector('.diag-selecao').getBoundingClientRect().height, bottomGap: office.bottom - company.bottom };
    });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.dataset.theme = dark ? 'dark' : 'light', dark);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.mouse.move(0, 0);
        const before = await geometry();
        await trigger.click();
        const after = await geometry();
        assert(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `Escritório estável ao abrir: ${JSON.stringify({ dark, width, before, after })}`);
        assert(Math.abs(after.rowHeight - before.rowHeight) < 1, 'Abrir o menu não desloca as seções seguintes');
        const selected = root.locator('[role="option"][aria-selected="true"]');
        await selected.hover();
        assert.deepEqual(await contrast(page, '#company-diagnostics .company-combobox-popup'), []);
        const search = root.locator('[data-company-popup] input');
        await search.fill('Empresa 1 de');
        await search.press('ArrowDown');
        await search.press('Enter');
        await root.locator('[data-company-popup]').waitFor({ state: 'hidden' });
        assert.match(await trigger.innerText(), /Empresa 1 de/);
        assert(Math.abs((await geometry()).height - before.height) < 1, 'Razão social longa não estica o campo Escritório');
        if (width > 650) assert(Math.abs((await geometry()).bottomGap) < 1, 'Campos alinhados pela base');
        const current = root.locator('[data-diag-step][aria-current="step"]');
        await current.hover();
        assert.deepEqual(await contrast(page, '#company-diagnostics [data-diag-step][aria-current="step"]'), [], 'Etapa selecionada legível no hover');
        await root.locator('[data-diag-next]').hover();
        assert.deepEqual(await contrast(page, '#company-diagnostics [data-diag-next]'), [], 'Ação principal legível no hover');
        assert(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Diagnóstico sem overflow horizontal');
      }
    }
    assert.deepEqual(errors, []);
    console.log('OK: diagnóstico — escritório estável, dropdown sobreposto, seleção/busca/teclado, nomes longos e contraste de hover nos temas claro/escuro em desktop/tablet/celular.');
  } finally { await context.close(); }
};

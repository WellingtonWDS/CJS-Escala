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
      window.__salvos = [];
      window.__voltou = null;
      window.__diag = createCompanyDiagnostics({ document, window, onBack: (ctx) => (window.__voltou = ctx), service: {
        save: async (body) => { window.__salvos.push(body); return { id: body.id, revision: 1, latestRevision: 1, status: body.status, data: body.data, updatedBy: 'Gerente', updatedAt: '2026-11-19T12:00:00Z', history: [{ revision: 1, status: body.status, savedAt: '2026-11-19T12:00:00Z', savedBy: 'Gerente' }] }; },
      } });
      await window.__diag.open({ officeId: 'office-1', companyId: 'company-1', companyName: 'Padaria Pão Bom de comércio e distribuição com razão social extensa', cnpj: '11222333000181', id: null });
    });
    const root = page.locator('#company-diagnostics');
    // A empresa vem do cartão: sem escolha de escritório/empresa.
    assert.equal(await root.locator('[data-diag-office], [data-company-trigger], [data-diag-record]').count(), 0);
    assert.match(await root.locator('[data-diag-company]').innerText(), /Padaria Pão Bom[\s\S]*CNPJ 11\.222\.333\/0001-81/);
    assert.equal(await root.locator('[data-diag-heading]').innerText(), 'Novo diagnóstico');
    assert.equal(await root.locator('[data-diag-step]').count(), 7, 'seis etapas e conferência');
    assert.match(await root.locator('[data-diag-step="0"]').innerText(), /Objetivo e responsáveis\s*0 de 4/);
    // Escolhas diretas, situação em pílulas e cabeçalho com a unidade.
    await root.locator('label:has(#diag-q01-0)').click();
    assert.equal(await root.locator('#diag-q01-0').isChecked(), true);
    await root.locator('#diag-q02').fill('Loja Centro');
    assert.equal(await root.locator('[data-diag-heading]').innerText(), 'Loja Centro');
    assert.match(await root.locator('[data-diag-step="0"]').innerText(), /2 de 4/);
    await root.locator('label:has(#diag-q04-certainty-pendente)').click();
    assert.match(await root.locator('[data-question="q04"] [data-answer-state]').innerText(), /Respondida/);
    await root.locator('[data-diag-step="3"]').click();
    await root.locator('label:has(#diag-q15-3)').click();
    assert.equal(await root.locator('#diag-q15-certainty-pendente').isChecked(), true, '"Não sei" marca a informação como pendente');
    await root.locator('[data-question="q17"] label:has-text("Sim")').click();
    assert.equal(await root.locator('[data-question="q17"] details.diag-obs').evaluate(d => d.open), true, '"Sim" abre o detalhe');
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.dataset.theme = dark ? 'dark' : 'light', dark);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await root.locator('[data-diag-step][aria-current="step"]').hover();
        assert.deepEqual(await contrast(page, '#company-diagnostics'), [], `contraste ${dark ? 'escuro' : 'claro'} ${width}`);
        await root.locator('[data-diag-next]').hover();
        assert.deepEqual(await contrast(page, '#company-diagnostics [data-diag-next]'), [], 'Ação principal legível no hover');
        assert(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Diagnóstico sem overflow horizontal');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Página sem rolagem lateral');
        if (process.env.DIAG_SCREENSHOT) await page.screenshot({ path: `${process.env.DIAG_SCREENSHOT}-${dark ? 'escuro' : 'claro'}-${width}.png`, fullPage: width === 390 });
      }
    }
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await root.locator('[data-diag-save]').click();
    await page.waitForFunction(() => window.__salvos.length === 1);
    const salvo = await page.evaluate(() => window.__salvos[0]);
    assert.equal(salvo.officeId, 'office-1');
    assert.equal(salvo.companyId, 'company-1');
    assert.equal(salvo.data.answers.q02.value, 'Loja Centro');
    assert.equal(salvo.data.answers.q15.certainty, 'pendente');
    assert.match(await root.locator('[data-diag-dirty]').innerText(), /Salvo · revisão 1/);
    await root.locator('[data-diag-step="6"]').click();
    assert.match(await root.locator('[data-diag-form]').innerText(), /Conferência do diagnóstico/);
    assert.equal(await root.locator('[data-diag-finish]').isVisible(), true);
    // Exportar PDF com a marca do escritório.
    await page.route('**/api/branding*', r => r.fulfill({ json: { officeId: 'office-1', revision: 1, displayName: 'Contabilidade Exemplo', logo: null, primaryColor: '#c4122f', secondaryColor: '#1f7a54' } }));
    assert.equal(await root.locator('[data-diag-pdf]').isVisible(), true);
    const baixando = page.waitForEvent('download');
    await root.locator('[data-diag-pdf]').click();
    const pdf = await baixando;
    assert.match(pdf.suggestedFilename(), /^diagnostico-padaria-pao-bom-de-comercio[\w-]*-\d{4}-\d{2}-\d{2}\.pdf$/);
    const bytes = require('node:fs').readFileSync(await pdf.path()).toString('latin1');
    assert.ok(bytes.startsWith('%PDF-'));
    assert.ok(bytes.includes('Loja Centro') && bytes.includes('Contabilidade Exemplo'));
    assert.match(bytes, /0\.769 0\.071 0\.184 rg/, 'cor principal do escritório');
    assert.match(await root.locator('[data-diag-status]').innerText(), /PDF do diagnóstico gerado/);
    await root.locator('[data-diag-backto]').click();
    assert.equal(await page.evaluate(() => window.__voltou.companyId), 'company-1');
    assert.deepEqual(errors, []);
    console.log('OK: diagnóstico — empresa definida pelo cartão, seis etapas com progresso, escolhas em pílulas, situação da informação, cabeçalho com a unidade, gravação, conferência, PDF com a marca do escritório e contraste claro/escuro em desktop/tablet/celular.');
  } finally { await context.close(); }
};

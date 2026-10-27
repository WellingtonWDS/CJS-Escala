// O cálculo roda em Worker: a ação só terminou quando o botão e o overlay liberam a tela.
async function clicarCalculo(page, seletor) {
  await page.locator(seletor).click();
  await page.waitForFunction(() => !document.querySelector('#btn-gerar[aria-busy="true"], #btn-converter[aria-busy="true"]'));
  await page.locator('[data-loading-overlay][open]').waitFor({state:'hidden'});
}
module.exports = { clicarCalculo };

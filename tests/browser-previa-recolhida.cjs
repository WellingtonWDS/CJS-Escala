const assert=require('node:assert/strict');
const {clicarCalculo}=require('./helpers/calculo.cjs');
module.exports=async({browser,baseURL})=>{
 const ctx=await browser.newContext({reducedMotion:'reduce'});
 try{
  const {criarEstadoDemo}=await import('../database/demo/state.mjs');
  const page=await ctx.newPage();await page.clock.install({time:new Date('2026-10-28T12:00:00Z')});
  await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(s=>localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s)),criarEstadoDemo());
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  const atual=page.locator('#escala-atual-previa');
  assert.equal(await atual.evaluate(e=>e.open),false);
  assert.equal(await page.locator('#btn-gerar').isVisible(),false);
  assert.equal(await atual.locator('[data-export-pdf]').first().isVisible(),false);
  await clicarCalculo(page,'#btn-converter');
  assert.equal(await atual.evaluate(e=>e.open),false);
  assert(await page.locator('#resultado-proposta').isVisible());
  await atual.locator('> summary').click();assert(await page.locator('#btn-gerar').isVisible());
  await clicarCalculo(page,'#btn-gerar');assert(await page.locator('#resultado-gerar').isVisible());
  await atual.locator('> summary').click();assert.equal(await page.locator('#resultado-gerar').isVisible(),false);
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  assert.equal(await atual.evaluate(e=>e.open),false);
  console.log('OK: geração, exportações e quadro atual recolhidos por padrão; proposta visível, abertura por clique e recarga sem expansão automática.');
 }finally{await ctx.close();}
};

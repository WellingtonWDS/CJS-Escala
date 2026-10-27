const assert = require('node:assert/strict');
const { clicarCalculo } = require('./helpers/calculo.cjs');
module.exports = async ({browser,baseURL}) => {
 const {criarEstadoDemo}=await import('../database/demo/state.mjs');
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try {
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-27T12:00:00Z')});
  await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(s=>localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s)),criarEstadoDemo());
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')));
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  const inicial=await saved();
  let release, requests=0;
  const gate=new Promise(r=>release=r);
  await page.route('**/assets/js/workers/calculo-escala.js',async r=>{requests++;await gate;try{await r.continue();}catch{}});
  await page.locator('#btn-gerar').click();
  const overlay=page.locator('[data-loading-overlay][open]');await overlay.waitFor({state:'visible'});
  assert.match(await overlay.locator('h2').textContent(),/Gerando escala/);
  assert.equal(await page.locator('#btn-gerar').isDisabled(),true);
  assert.deepEqual(await saved(),inicial);
  await page.evaluate(()=>document.getElementById('btn-gerar').click());
  assert.equal(requests,1);
  await page.keyboard.press('Escape');assert.equal(await overlay.isVisible(),true);
  await page.evaluate(()=>{window.__framesCalculo=0;const frame=()=>{window.__framesCalculo++;if(window.__framesCalculo<6)requestAnimationFrame(frame)};requestAnimationFrame(frame)});
  await page.waitForFunction(()=>window.__framesCalculo>=5);
  release();await page.waitForFunction(()=>!document.getElementById('btn-gerar').disabled);await overlay.waitFor({state:'hidden'});
  assert.equal((await saved()).escalaGerada.resultado.length,5);
  await page.unroute('**/assets/js/workers/calculo-escala.js');
  // A proposta usa o mesmo carregamento e deixa a referência intacta até terminar.
  let liberarProposta;const aguardar=new Promise(r=>liberarProposta=r);
  await page.route('**/assets/js/workers/calculo-escala.js',async r=>{await aguardar;try{await r.continue();}catch{}});
  const antes=await saved();await page.locator('#btn-converter').click();await overlay.waitFor({state:'visible'});
  assert.match(await overlay.locator('h2').textContent(),/Gerando proposta/);
  assert.deepEqual(await saved(),antes);
  liberarProposta();await page.waitForFunction(()=>!document.getElementById('btn-converter').disabled);await overlay.waitFor({state:'hidden'});
  assert.equal((await saved()).conversao.proposta.config.tipoEscala,'5x2');
  await page.unroute('**/assets/js/workers/calculo-escala.js');
  // Falha de rede libera a tela e conserva a escala já salva.
  const anterior=(await saved()).escalaGerada;
  await page.route('**/assets/js/workers/calculo-escala.js',r=>r.abort());
  await clicarCalculo(page,'#btn-gerar');
  assert.match(await page.locator('#resultado-gerar').textContent(),/Não foi possível concluir o cálculo/);
  assert.deepEqual((await saved()).escalaGerada,anterior);
  await page.unroute('**/assets/js/workers/calculo-escala.js');
  // Resultado de um preenchimento que mudou durante o cálculo não é aplicado.
  let soltar;const pendente=new Promise(r=>soltar=r);
  await page.route('**/assets/js/workers/calculo-escala.js',async r=>{await pendente;try{await r.continue();}catch{}});
  await page.locator('#btn-gerar').click();await overlay.waitFor({state:'visible'});
  await page.evaluate(()=>{const el=document.querySelector('[data-field="nome"]');el.value='Pessoa alterada durante cálculo';el.dispatchEvent(new Event('change',{bubbles:true}));});
  soltar();await page.waitForFunction(()=>!document.getElementById('btn-gerar').disabled);await overlay.waitFor({state:'hidden'});
  assert.match(await page.locator('#resultado-gerar').textContent(),/dados mudaram durante o cálculo/);
  assert.equal((await saved()).colaboradores[0].nome,'Pessoa alterada durante cálculo');
  assert.equal((await saved()).escalaGerada,null);
  await page.unroute('**/assets/js/workers/calculo-escala.js');
  // Navegadores sem Worker continuam gerando, com pintura do overlay antes do cálculo local.
  await page.evaluate(()=>{window.Worker=undefined;});
  await clicarCalculo(page,'#btn-gerar');
  assert.equal((await saved()).escalaGerada.resultado.length,5);
  assert.deepEqual(errors,[]);
  console.log('OK: geração/proposta em Worker, overlay antes do cálculo, UI responsiva, duplicação bloqueada, erro/rede, dados alterados, limpeza e fallback sem Worker.');
 }finally{await context.close();}
};

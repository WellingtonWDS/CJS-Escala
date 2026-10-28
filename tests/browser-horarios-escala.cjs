const assert=require('node:assert/strict');
const {clicarCalculo}=require('./helpers/calculo.cjs');
module.exports=async({browser,baseURL})=>{
 const {criarEstadoDemo}=await import('../database/demo/state.mjs');
 for(const fixa of [false,true]){
  const ctx=await browser.newContext({timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'});
  try{
   await ctx.route('https://**/*',r=>r.abort());
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-28T12:00:00Z')});
   await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   const seed=criarEstadoDemo();seed.modeloEscala=fixa?'fixa':'dinamica';
   await page.evaluate(s=>localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s)),seed);
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   await page.locator('[data-etapa-link="sec-gerar"]').click();await clicarCalculo(page,'#btn-converter');
   const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')));
   const original=(await saved()).escalaGerada;
   const result=page.locator('#resultado-proposta'),resumo=result.locator('[data-resumo-semanal][data-colaborador="1"]').first();
   const badge=()=>resumo.locator('span.font-bold').first();
   assert.match(await badge().getAttribute('class'),/text-fintria-verde/);
   async function abrir(wd,status){
    const state=await saved(),r=state.conversao.proposta.config.escalaGerada.resultado[0];
    let di=r.dias.findIndex(d=>d.weekday===wd);
    if(fixa){const p=await import('../assets/js/domain/modelo-escala.js');di=r.dias.indexOf(p.diasDoModelo(state.conversao.proposta.config,r.dias).find(d=>d.weekday===wd));}
    await result.locator(`[data-ri="0"][data-di="${di}"]`).click();
    const dialog=page.locator('dialog[data-app-dialog="prompt"][open]');await dialog.waitFor();
    await dialog.locator('select').selectOption(status);await dialog.locator('[data-dialog-accept]').click();
    if(status==='T')await page.locator('dialog[data-app-dialog="form"][open]').waitFor();
    return r.dias[di].data;
   }
   const form=page.locator('dialog[data-app-dialog="form"][open]');
   async function preencher(values){for(const [k,v]of Object.entries(values))await form.locator(`[data-dialog-time="${k}"]`).fill(v);}
   async function salvar(){await form.locator('[data-dialog-accept]').click();await form.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));}
   const data=await abrir(2,'T');
   // Horários reais, inclusive o intervalo da jornada gerada, preenchem o formulário.
   assert.equal(await form.locator('[data-dialog-time="entrada"]').inputValue(),'08:00');
   assert.equal(await form.locator('[data-dialog-time="intInicio"]').inputValue(),'11:00');
   const snapshot=await saved();
   await preencher({intFim:''});await form.locator('[data-dialog-accept]').click();
   assert.match(await form.locator('[data-dialog-error]').textContent(),/dois vazios/);
   assert.deepEqual(await saved(),snapshot);
   await preencher({entrada:'09:00',intInicio:'',intFim:'',saida:'13:00'});await salvar();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')).conversao.proposta.config.escalaGerada.resultado[0].dias.some(d=>d.horas===4&&d.ajusteManual));
   let state=await saved(),r=state.conversao.proposta.config.escalaGerada.resultado[0];
   assert.equal(r.dias.find(d=>d.data===data).entradaMin,540);
   assert.equal(r.dias.find(d=>d.data===data).intervaloMin,0);
   if(fixa)assert(r.dias.filter(d=>d.weekday===2).every(d=>d.horas===4));
   else assert(r.dias.filter(d=>d.weekday===2&&d.data!==data).every(d=>d.horas===8));
   assert.match(await badge().getAttribute('class'),/text-fintria-ambar/);assert.match(await resumo.textContent(),/36:00/);
   await abrir(2,'T');await preencher({entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'});await salvar();
   assert.match(await badge().getAttribute('class'),/text-fintria-verde/);
   await abrir(6,'T');await preencher({entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'});await salvar();
   assert.match(await badge().getAttribute('class'),/text-fintria-vermelho/);
   assert.match(await resumo.textContent(),/44:00/);
   assert(await result.locator('[data-erros-escala]').isVisible());
   await abrir(6,'F');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
   assert.match(await badge().getAttribute('class'),/text-fintria-verde/);
   if(fixa){
    await abrir(2,'F');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.match(await badge().getAttribute('class'),/text-fintria-ambar/);
    await result.locator('[data-fixo-desfazer]').click();
    assert.match(await badge().getAttribute('class'),/text-fintria-verde/);
   }
   // Cancelamento e teclado conservam o último resultado; noites mantêm a virada.
   await abrir(2,'T');const antes=await saved();await page.keyboard.press('Escape');await form.waitFor({state:'hidden'});assert.deepEqual(await saved(),antes);
   await abrir(2,'T');await preencher({entrada:'22:00',intInicio:'02:00',intFim:'03:00',saida:'06:00'});await salvar();
   state=await saved();r=state.conversao.proposta.config.escalaGerada.resultado[0];
   assert(r.dias.filter(d=>fixa?d.weekday===2:d.data===data).every(d=>d.saidaMin===1800&&d.intervaloMin===60));
   assert.deepEqual(state.escalaGerada,original);
   await abrir(2,'F');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
   await abrir(2,'T');
   assert.equal(await form.locator('[data-dialog-time="entrada"]').inputValue(),'22:00');
   assert.equal(await form.locator('[data-dialog-time="saida"]').inputValue(),'06:00');
   await salvar();
   await page.setViewportSize({width:320,height:844});await abrir(2,'T');
   assert(await form.evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.keyboard.press('Escape');await form.waitFor({state:'hidden'});
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   assert((await saved()).conversao.proposta.config.escalaGerada.resultado[0].dias.some(d=>d.saidaMin===1800));
   assert.deepEqual(errors,[]);
   console.log(`OK: edição de horários ${fixa?'fixa recorrente':'dinâmica por data'}, resumo verde/amarelo/vermelho, intervalo opcional/validação, folga, cobertura, noite, cancelamento, origem, mobile e persistência.`);
  }finally{await ctx.close();}
 }
};

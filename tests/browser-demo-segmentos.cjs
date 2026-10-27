const assert = require('node:assert/strict');
module.exports = async ({browser,baseURL}) => {
 const {criarCenariosSegmentos}=await import('../database/demo/segmentos.mjs');
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try{
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(), erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.clock.install({time:new Date('2026-10-27T12:00:00Z')});
  await page.goto(baseURL);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  for(const empresa of criarCenariosSegmentos()) for(const modelo of empresa.drafts){
   await page.evaluate(s=>localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s)),modelo.state);
   await page.goto(baseURL);
   await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   assert.equal(await page.locator('#colab-list > div').count(),modelo.state.colaboradores.length);
   await page.locator('[data-etapa-link="sec-gerar"]').click();
   await page.locator('#btn-gerar').click();
   await page.locator('#resultado-gerar .escala-mensal').first().waitFor();
   const estado=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')));
   assert.equal((await estado()).escalaGerada.resultado.length,modelo.state.colaboradores.length);
   if(!empresa.name.startsWith('Entidade')){
    await page.locator('#btn-converter').click();
    await page.locator('#resultado-proposta .escala-mensal').first().waitFor();
    const s=await estado();
    if(modelo.tipo==='contratacao')assert.equal(s.conversao.comparacao.status,'insuficiente');
    assert.equal(s.colaboradores.length,modelo.state.colaboradores.length);
   }else{
    const s=await estado();
    assert.equal(s.colaboradores.filter(c=>c.quadroDominio.tipo==='ciclo').length,modelo.state.colaboradores.length-2);
    assert.equal(s.feriados.find(f=>f.dia===12).trabalhado,true);
   }
  }
  assert.deepEqual(erros,[]);
  console.log('OK: 11 modelos DEMO completos em navegador: geração atual, propostas comerciais/rurais/padaria, insuficiência e 12×36 misto com administrativo.');
 }finally{await context.close();}
};

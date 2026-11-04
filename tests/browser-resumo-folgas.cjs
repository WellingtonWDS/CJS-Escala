const assert=require('node:assert/strict');
const contrast=require('./helpers/contrast.cjs');
module.exports=async({browser,baseURL})=>{
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try{
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);
  const pronta=()=>page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await pronta();
  async function simular(extra={}){
   await page.evaluate(async extra=>{
    const {createDefaultState}=await import('/assets/js/state/store.js');
    const s=createDefaultState();Object.assign(s,{
     jornada:{entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'},
     diasTrabalho:[1,2,3,4,5,6],horarioPorDia:true,...extra,
    });localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
   },extra);
   await page.reload();await pronta();
   await page.locator('[data-etapa-link="sec-folgas"]').click();
  }
  const campo=nome=>page.locator(`#resumo-grid [data-resumo-horario="${nome}"]`);
  await simular();
  assert.match(await campo('entrada').innerText(),/08:00/);
  assert.match(await campo('intervalo').innerText(),/11:00–13:00/);
  assert.match(await campo('saida').innerText(),/18:00/);
  assert.equal(await page.locator('#resumo-grid dl').count(),0,'Horários iguais não precisam ser discriminados por dia');
  assert.doesNotMatch(await page.locator('#resumo-grid').innerText(),/Por dia/);
  await simular({jornadaPorDia:{6:{entrada:'09:00',intInicio:'12:00',intFim:'00:00',saida:'00:00'},0:{entrada:'01:00',intInicio:'02:00',intFim:'03:00',saida:'04:00'}}});
  assert.match(await campo('entrada').innerText(),/Seg, Ter, Qua, Qui, Sex\s+08:00.*Sáb\s+09:00/s);
  assert.match(await campo('intervalo').innerText(),/11:00–13:00.*Sáb\s+Sem intervalo/s);
  assert.match(await campo('saida').innerText(),/18:00.*Sáb\s+12:00/s);
  assert.doesNotMatch(await page.locator('#resumo-grid').innerText(),/01:00|04:00|00:00/,'Dias fechados e sentinelas não aparecem como horários operacionais');
  await page.locator('[data-etapa-link="sec-jornada"]').click();
  await page.locator('#jornada-por-dia-wrap input[data-day="6"][data-field="entrada"]').fill('08:30');
  await page.locator('#jornada-por-dia-wrap input[data-day="6"][data-field="entrada"]').dispatchEvent('change');
  await page.locator('[data-etapa-link="sec-folgas"]').click();
  assert.match(await campo('entrada').innerText(),/08:30/);
  await page.reload();await pronta();await page.locator('[data-etapa-link="sec-folgas"]').click();
  assert.match(await campo('entrada').innerText(),/08:30/,'Resumo restaura horários salvos');
  for(const dark of [false,true]){
   if(dark)await page.locator('#btn-theme').click();
   await page.setViewportSize({width:375,height:812});
   assert(await page.locator('#resumo-grid').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert.deepEqual(await contrast(page,'#resumo-grid'),[]);
  }
  await page.setViewportSize({width:1280,height:900});
  await page.locator('[data-etapa-link="sec-jornada"]').click();
  await page.locator('#tg-horario-dia').uncheck();
  await page.locator('[data-etapa-link="sec-folgas"]').click();
  assert.match(await campo('saida').innerText(),/18:00/);assert.equal(await page.locator('#resumo-grid dl').count(),0);
  await simular({jornada:{entrada:'22:00',intInicio:'',intFim:'',saida:'06:00'},horarioPorDia:false});
  assert.match(await campo('intervalo').innerText(),/Sem intervalo/);assert.match(await campo('saida').innerText(),/06:00 \(\+1d\)/);
  await simular({tipoEscala:'12x36',jornadaPorDia:{6:{entrada:'09:00',intInicio:'',intFim:'',saida:'12:00'}}});
  assert.match(await campo('saida').innerText(),/18:00/);assert.doesNotMatch(await campo('saida').innerText(),/12:00/);
  await simular({diasTrabalho:[]});assert.match(await campo('entrada').innerText(),/Não informado/);
  await simular({jornada:{entrada:'',intInicio:'',intFim:'',saida:''}});assert.match(await campo('saida').innerText(),/Não informado/);
  assert.deepEqual(errors,[]);
  console.log('OK: resumo de Folgas exibe horários reais, agrupamento por campo/dia, edição/toggle/recarga, sábado contínuo, noite, 12×36, sem dias e contraste móvel claro/escuro.');
 }finally{await context.close();}
};

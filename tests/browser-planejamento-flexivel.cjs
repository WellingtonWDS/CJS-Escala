const assert = require('node:assert/strict');
const {clicarCalculo} = require('./helpers/calculo.cjs');
module.exports = async ({browser,baseURL}) => {
 const context = await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try {
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-26T12:00:00Z')});
  await page.goto(baseURL);
  const pronta=()=>page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await pronta();
  const salvo=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')));
  for(const fixa of [false,true]) {
   await page.evaluate(async fixa=>{
    const {createDefaultState}=await import('/assets/js/state/store.js');
    const s=createDefaultState(new Date(2026,9,26));
    Object.assign(s,{modeloEscala:fixa?'fixa':'dinamica',dataReferenciaFixa:'2026-10-26',diaInicio:26,tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],modoRegime:'simulacao',regimeJornada:'definitivo40',jornada:{entrada:'08:00',intInicio:'12:00',intFim:'13:00',saida:'17:00'},coberturaAtiva:true});
    s.colaboradores=[{id:1,nome:'Pessoa de teste',cargo:'Atendente',funcoesHabilitadas:['Caixa'],sexo:'masculino',horasSemana:40}];
    s.demandasCobertura=[['Atendente','08:00','11:00'],['Caixa','11:00','12:00'],['Atendente','13:00','17:00']].map(([funcao,inicio,fim],i)=>({id:i+1,funcao,inicio,fim,minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:true}));
    localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
   },fixa);
   await page.reload();await pronta();
   await page.locator('[data-etapa-link="sec-gerar"]').click();
   await clicarCalculo(page,'#btn-gerar');
   const original=(await salvo()).escalaGerada;
   const painel=page.locator('#resultado-gerar-ajustes');
   await painel.locator('[data-ajuste-buscar]').click();
   const modal=page.locator('dialog[data-app-dialog][open]');
   await modal.waitFor();assert.match(await modal.innerText(),/Sugestão encontrada/);
   await modal.locator('[data-dialog-accept]').click();
   await painel.locator('[data-ajuste-aplicar]').waitFor();
   assert.deepEqual((await salvo()).escalaGerada,original,'Busca apresenta prévia sem modificar a escala');
   assert.match(await painel.locator('[data-ajuste-previa]').innerText(),/11:00–12:00: Caixa/);
   await painel.locator('[data-ajuste-aplicar]').click();
   const depois=(await salvo()).escalaGerada;
   assert.equal(depois.coberturaOperacional.lacunas.length,0);
   assert(depois.resultado[0].dias.some(d=>d.alocacoesFuncao?.some(a=>a.funcao==='Caixa')));
   assert.match(await page.locator('#resultado-gerar [data-escala-quadro]').innerText(),/11:00–12:00: Caixa/);
   const filtro=page.locator('#resultado-gerar [data-filtro-funcao]');
   await filtro.selectOption('funcao:caixa');
   assert.match(await filtro.innerText(),/Caixa/);
   await page.reload();await pronta();
   await page.locator('[data-etapa-link="sec-gerar"]').click();
   assert.equal((await salvo()).escalaGerada.coberturaOperacional.lacunas.length,0);
   await page.locator('#resultado-gerar-ajustes [data-ajuste-desfazer]').click();
   assert.deepEqual((await salvo()).escalaGerada.resultado,original.resultado);
  }
  assert.deepEqual(errors,[]);
  console.log('OK: alternância por período em Worker nas grades dinâmica/fixa, modal/prévia sem mutação, aplicação, cards/filtro, persistência e desfazer.');
 } finally {await context.close();}
};

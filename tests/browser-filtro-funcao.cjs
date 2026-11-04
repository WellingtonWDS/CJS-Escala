const assert = require('node:assert/strict');
const {respondToDialogs, waitForDialogs} = require('./helpers/dialogs.cjs');
module.exports = async ({browser,baseURL}) => {
 const context = await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try {
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  async function seed(modelo) {
   await page.evaluate(async modelo=>{
    const {createDefaultState}=await import('/assets/js/state/store.js');
    const {createDomain}=await import('/assets/js/domain/index.js');
    const s=createDefaultState();
    Object.assign(s,{modeloEscala:modelo,dataReferenciaFixa:'2028-02-01',tipoEscala:'5x2',modoRegime:'simulacao',regimeJornada:'definitivo40',diasTrabalho:[1,2,3,4,5],coberturaAtiva:true,jornada:{entrada:'08:00',intInicio:'12:00',intFim:'13:00',saida:'18:00'}});
    s.colaboradores=[{id:1,nome:'Pessoa 1',cargo:'Aténdente',sexo:'masculino',horasSemana:40},{id:2,nome:'Pessoa 2',cargo:'atendente',sexo:'masculino',horasSemana:40},{id:3,nome:'Pessoa 3',cargo:'Caixa',sexo:'masculino',horasSemana:40}];
    s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'09:00',fim:'18:00',minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:false}];
    s.escalaGerada=createDomain(s).gerarDadosEscala();
    localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
   },modelo);
   await page.reload();
   await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   await page.locator('[data-etapa-link="sec-gerar"]').click();
  }
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')));
  for(const modelo of ['dinamica','fixa']) {
   await seed(modelo);
   assert.equal(await page.locator('#btn-imprimir').count(),0);
   const root=page.locator('#resultado-gerar'), filtro=root.locator('[data-filtro-funcao]');
   const before=await saved();
   assert.equal(await filtro.locator('option').count(),3,'Normaliza cargo com acentos/maiúsculas');
   await filtro.selectOption('funcao:atendente');
   assert.equal(await root.locator('[data-ri="2"][data-di]:visible').count(),0);
   assert(await root.locator('[data-ri="0"][data-di]:visible').count());
   assert.equal(await root.locator('[data-resumo-semanal][data-colaborador="3"]:visible').count(),0);
   if(modelo==='fixa')assert.equal(await root.locator('[data-fixo-colaborador="3"]').isVisible(),false);
   else assert.equal(await root.locator('[data-resumo-mensal="3"]').isVisible(),false);
   assert.deepEqual(await saved(),before,'Filtrar não modifica os dados da escala');
   await filtro.selectOption('funcao:caixa');
   assert(await root.locator('[data-ri="2"][data-di]:visible').count(),'Índices originais preservados');
   await respondToDialogs(page, async d=>d.type()==='prompt'?d.accept('F'):d.accept());
   const card=root.locator('[data-ri="2"][data-di]:visible').first();
   const di=Number(await card.getAttribute('data-di'));
   await card.click();await waitForDialogs(page);
   await page.waitForFunction(di=>JSON.parse(localStorage.getItem('fintria-escala-dp-v2')).escalaGerada.resultado[2].dias[di].ajusteManual,di);
   assert.equal(await filtro.inputValue(),'funcao:caixa','Mantém filtro após editar');
   assert.equal((await saved()).escalaGerada.resultado[0].dias[di].ajusteManual,undefined,'Edita a pessoa correta após filtrar');
   await filtro.selectOption('');
   assert(await root.locator('[data-ri="0"][data-di]:visible').count());
  }
  // The recurring adjustment panel must execute the actual Worker, apply and undo.
  await seed('fixa');
  const original=(await saved()).escalaGerada.resultado;
  const panel=page.locator('#resultado-gerar-ajustes');
  assert(await panel.locator('[data-ajuste-buscar]').isVisible());
  await page.locator('#resultado-gerar [data-filtro-funcao]').selectOption('funcao:caixa');
  await panel.locator('[data-ajuste-buscar]').click();
  await panel.locator('[data-ajuste-aplicar]').waitFor({timeout:60000});
  assert.match(await panel.locator('[data-ajuste-previa]').innerText(),/Dia da semana/);
  assert.deepEqual((await saved()).escalaGerada.resultado,original,'Prévia sem mutação');
  await panel.locator('[data-ajuste-aplicar]').click();
  await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('fintria-escala-dp-v2')).escalaGerada.ajustesCobertura);
  const adjusted=await saved();
  assert.notDeepEqual(adjusted.escalaGerada.resultado,original);
  for(const r of adjusted.escalaGerada.resultado) {
   const dias=new Map();
   for(const d of [...r.diasContexto,...r.diasApuracao,...r.dias]) {
    const value=JSON.stringify([d.status,d.entradaMin,d.saidaMin,d.intervaloInicioMin,d.intervaloFimMin]);
    if(dias.has(d.weekday))assert.equal(value,dias.get(d.weekday),'Mudança fixa recorrente');
    dias.set(d.weekday,value);
   }
  }
  assert.equal(await page.locator('#resultado-gerar [data-filtro-funcao]').inputValue(),'funcao:caixa');
  await panel.locator('[data-ajuste-desfazer]').click();
  await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('fintria-escala-dp-v2')).escalaGerada.ajustesCobertura);
  assert.deepEqual((await saved()).escalaGerada.resultado,original);
  await page.setViewportSize({width:390,height:844});
  const box=await page.locator('#resultado-gerar [data-filtro-funcao]').boundingBox();
  assert(box.x>=0&&box.x+box.width<=390);
  await page.evaluate(()=>{
   const key='fintria-escala-dp-v2',s=JSON.parse(localStorage.getItem(key));
   s.coberturaAtiva=false;localStorage.setItem(key,JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  assert(await panel.locator('[data-ajuste-buscar]').isVisible());
  assert(await panel.locator('[data-ajuste-buscar]').isDisabled());
  await panel.locator('[data-ajuste-configurar]').click();
  assert(await page.locator('#sec-cobertura').isVisible(),'Orienta a ativar cobertura quando opcional está desligada');
  // An actual allocated role also becomes an option and is visible in the fixed card.
  await seed('fixa');
  await page.evaluate(()=>{
   const key='fintria-escala-dp-v2',s=JSON.parse(localStorage.getItem(key)),r=s.escalaGerada.resultado[0];
   s.colaboradores[0].funcoesHabilitadas=['Supervisor de Atendimento e Operações'];r.colaborador.funcoesHabilitadas=['Supervisor de Atendimento e Operações'];
   for(const d of [...r.dias,...r.diasContexto,...r.diasApuracao])if(d.weekday===1&&d.status==='T')d.funcaoAlocada='Supervisor de Atendimento e Operações';
   localStorage.setItem(key,JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  await page.locator('#resultado-gerar [data-filtro-funcao]').selectOption('funcao:supervisor de atendimento e operacoes');
  assert.equal(await page.locator('#resultado-gerar [data-ri="1"][data-di]:visible').count(),0);
  assert.match((await page.locator('#resultado-gerar [data-ri="0"][data-di]:visible').allTextContents()).join(' '),/Função: Supervisor de Atendimento e Operações/);
  assert.deepEqual(errors,[]);
  console.log('OK: filtro por função nas grades dinâmica/fixa, resumos, índices/edição e dados preservados; readequação fixa em Worker, prévia/aplicar/desfazer e recorrência; impressão removida.');
 }finally{await context.close();}
};

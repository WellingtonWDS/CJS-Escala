const assert=require('node:assert/strict');
const {clicarCalculo}=require('./helpers/calculo.cjs');
module.exports=async({browser,baseURL})=>{
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try{
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-31T12:00:00Z')});
  await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(async()=>{
   const {createDefaultState}=await import('/assets/js/state/store.js');
   const {converterEscala}=await import('/assets/js/domain/conversao.js');
   const s=createDefaultState();s.modeloEscala='fixa';s.dataReferenciaFixa='2026-10-31';s.horarioPorDia=false;
   s.jornada={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
   s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
   s.colaboradores.forEach((c,i)=>{c.cargo=i?'VENDEDOR DE COMERCIO VAREJISTA':'MOTORISTA DE CAMINHAO';c.sexo='masculino';});
   s.coberturaAtiva=true;
   s.demandasCobertura=s.colaboradores.map((c,i)=>({id:i+1,funcao:c.cargo,inicio:'08:00',fim:'14:00',minimo:1,diasSemana:[6],incluirFeriados:true}));
   s.conversao=converterEscala(s,{fase:'definitivo40',folgas:'fim_semana'});s.escalaGerada=s.conversao.origem.escala;
   s.conversao.comparacao.diagnostico.grupos.forEach(g=>g.resumo='Mensagem antiga do preenchimento');
   localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  const groups=page.locator('#conversao-comparacao [data-diagnostico-faixa]');
  assert.equal(await groups.count(),2);
  for(const g of await groups.all())assert.match(await g.locator('h4').innerText(),/^Aos sábados, das 08:00 às 14:00: falta 1 pessoa/);
  assert.doesNotMatch(await page.locator('#conversao-comparacao').innerText(),/Mensagem antiga/);
  await page.evaluate(async()=>{
   const {createDefaultState}=await import('/assets/js/state/store.js');const {createDomain}=await import('/assets/js/domain/index.js');
   const s=createDefaultState();Object.assign(s,{modeloEscala:'fixa',dataReferenciaFixa:'2027-06-16',tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],instrumentoCompensacao:'act_cct'});
   s.colaboradores=s.colaboradores.slice(0,1).map(c=>({...c,sexo:'masculino',horasSemana:40}));
   Object.assign(s.instrumentoColetivo,{identificacao:'CCT teste',inicio:'2027-06-15',fim:'2027-06-15',compativelEC141:true,compensacaoDiaria:true,limiteDiario:10});
   s.escalaGerada=createDomain(s).gerarDadosEscala();localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  const aviso=page.locator('#resultado-gerar [data-aviso-tipo="INSTRUMENTO_FORA_VIGENCIA"]');
  assert.match(await aviso.innerText(),/16\/06\/2027/);assert.match(await aviso.innerText(),/15\/06\/2027/);
  assert.match(await aviso.locator('.aviso-escala-acao').innerText(),/campo Data de referência/);
  await page.locator('[data-etapa-link="sec-config"]').click();
  await page.locator('#cfg-referencia-fixa').fill('2027-06-15');
  await page.locator('#cfg-referencia-fixa').dispatchEvent('change');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  await clicarCalculo(page,'#btn-gerar');
  assert.equal(await aviso.count(),0,'ACT válido na referência não depende do calendário interno');
  assert.deepEqual(errors,[]);
  console.log('OK: faixas contínuas/gramática no diagnóstico salvo, ACT da escala fixa conferido pela referência jurídica visível.');
 }finally{await context.close();}
};

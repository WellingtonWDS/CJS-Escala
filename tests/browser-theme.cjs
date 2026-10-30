const assert=require('node:assert/strict');
const contrast=require('./helpers/contrast.cjs');
module.exports=async({browser,baseURL})=>{
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo'});
 try {
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  const light=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.locator('#btn-theme').click();
  assert.equal(await page.locator('#btn-theme').getAttribute('aria-checked'),'true');
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  const capture=async name=>{
   if(!process.env.REESCALA_THEME_SCREENSHOTS)return;
   const dir=process.env.REESCALA_THEME_SCREENSHOTS;
   await require('node:fs/promises').mkdir(dir,{recursive:true});
   await page.evaluate(async()=>{await Promise.all(document.body.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
   await page.screenshot({path:require('node:path').join(dir,name+'.png')});
  };
  await capture('01-configuracao');
  const failures=[];
  const lightSurfaces=[];
  const boundaries="#btn-gerar, #btn-imprimir, [data-export-pdf], [data-escala-quadro], .escala-mensal th, .escala-mensal td";
  for(const id of ['sec-config','sec-tipo','sec-feriados','sec-jornada','sec-folgas','sec-cobertura','sec-pec','sec-gerar']){
   await page.locator(`[data-etapa-link="${id}"]`).click();
   if(id==='sec-config') await page.locator('#sec-config details').evaluateAll(els=>els.forEach(el=>el.open=true));
   const summary=page.locator('#'+id+' summary:visible').first();
   if(await summary.count())await summary.hover();
   failures.push(...await contrast(page)); lightSurfaces.push(...await contrast.lightSurfaces(page));
  }
  // Inspect the real primary control's disabled presentation without running
  // a calculation or changing the scheduling data.
  const primary=page.locator('#btn-converter');
  const primaryColor=await primary.evaluate(el=>getComputedStyle(el).backgroundColor);
  const wasDisabled=await primary.evaluate(el=>{const previous=el.disabled;el.disabled=true;return previous;});
  assert.notEqual(await primary.evaluate(el=>getComputedStyle(el).backgroundColor),primaryColor,'Ação desabilitada não mantém a aparência primária');
  await primary.evaluate((el,value)=>{el.disabled=value;},wasDisabled);
  await page.evaluate(async()=>{
   const {converterEscala}=await import('/assets/js/domain/conversao.js');
   const {createDefaultState}=await import('/assets/js/state/store.js');
   const s=createDefaultState();s.jornada={entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'};
   s.horarioPorDia=true;s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
   s.conversao=converterEscala(s,{periodo:'2028-02',fase:'definitivo40',folgas:'fim_semana'});s.escalaGerada=s.conversao.origem.escala;
   const {aplicarHorarioManual}=await import('/assets/js/domain/horario-manual.js');
   const {compararConversao}=await import('/assets/js/domain/conversao.js');
   const proposta=s.conversao.proposta.config,id=proposta.colaboradores[0].id;
   proposta.escalaGerada=aplicarHorarioManual(proposta,id,'2028-02-07','T',{entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'19:00'});
   proposta.escalaGerada=aplicarHorarioManual(proposta,id,'2028-02-14','T',{entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'17:00'});
   s.conversao.comparacao=compararConversao(s.conversao);
   localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  for(const status of ['ACIMA','ABAIXO','HORAS OK'])assert((await page.locator('#resultado-proposta [data-resumo-semanal]').allTextContents()).some(text=>text.includes(status)));
  await page.locator('#conversao-comparacao details').evaluateAll(els=>els.forEach(el=>el.open=true));
  failures.push(...await contrast(page)); lightSurfaces.push(...await contrast.lightSurfaces(page));
  assert.deepEqual(await contrast.borders(page,boundaries),[],"Bordas dinâmicas com contraste 3:1");
  await page.locator('#resultado-proposta').scrollIntoViewIfNeeded();
  await capture('02-escala');
  assert.notEqual(await page.locator('#btn-converter').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#btn-gerar').evaluate(el=>getComputedStyle(el).backgroundColor),'Ação principal e secundária visualmente distintas');
  await page.locator('#btn-gerar').hover();
  failures.push(...await contrast(page));
  await page.locator('#conversao-periodo').focus();
  assert.notEqual(await page.locator('#conversao-periodo').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await page.evaluate(async()=>{const {getDialogs}=await import('/assets/js/ui/dialogs.js');getDialogs(document).confirm('Confira o contraste e os botões deste modal.',{title:'Revisar escala'});});
  await page.locator('dialog[open]').waitFor();failures.push(...await contrast(page,'dialog[open]'));
  await capture('03-confirmacao');
  await page.locator('[data-dialog-cancel]').click();
  // Fixed grade: same statuses and weekly summary, with recurring days.
  await page.evaluate(async()=>{
   const {converterEscala}=await import('/assets/js/domain/conversao.js');
   const s=JSON.parse(localStorage.getItem('fintria-escala-dp-v2'));
   s.modeloEscala='fixa';s.dataReferenciaFixa='2028-02-01';s.conversao=null;s.escalaGerada=null;
   s.conversao=converterEscala(s,{periodo:'2028-02',fase:'definitivo40',folgas:'fim_semana'});s.escalaGerada=s.conversao.origem.escala;
   localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  assert(await page.locator('#resultado-proposta .escala-fixa').isVisible());
  assert.deepEqual(await contrast.borders(page,boundaries),[],"Bordas fixas com contraste 3:1");
  failures.push(...await contrast(page)); lightSurfaces.push(...await contrast.lightSurfaces(page));
  // Role-based administration and its forms use the same dark palette.
  const options={platformAdmin:true,currentUserId:'owner',offices:[{id:'office',name:'Escritório de teste',active:true,canCreate:true}],companies:[{id:'company',officeId:'office',name:'Empresa de teste',cnpj:'48956412000126'}],users:[{id:'operator',officeId:'office',name:'Operador de teste',email:'operador@example.test',role:'operator',active:true,membershipActive:true,accountActive:true,canEdit:true,companyIds:['company'],revision:1}]};
  await page.route('**/api/admin',r=>r.fulfill({json:options}));
  await page.route('**/api/companies',r=>r.fulfill({json:options}));
  await page.evaluate(async()=>{const {initNavigation}=await import('/assets/js/ui/navigation.js');initNavigation({session:{user:{id:'owner',name:'Admin de teste',role:'admin'},persistenceEnabled:false},document,window});});
  assert(await page.locator('#btn-theme').evaluate(el=>el.nextElementSibling.id==='btn-sair'));
  for(const view of ['companies','offices','users']) {
   await page.locator(`[data-app-view="${view}"]`).click();
   await page.waitForFunction(()=>!document.querySelector('.app-sidebar nav button:disabled'));
   if(view==='users'){await page.locator('[data-user-new]').click();}
   assert(await page.locator('footer a').isVisible());
   failures.push(...await contrast(page)); lightSurfaces.push(...await contrast.lightSurfaces(page));
  }
  await page.locator('[data-app-view="schedule"]').click();
  await page.evaluate(async()=>{
   const {initRemoteWorkspace}=await import('/assets/js/ui/remote-workspace.js');
   const {createWorkspace}=await import('/assets/js/state/workspace.js');
   await initRemoteWorkspace({app:{state:JSON.parse(localStorage.getItem('fintria-escala-dp-v2'))},workspace:createWorkspace(localStorage,'10000000-0000-0000-0000-000000000001'),document,window,
    service:{listOffices:async()=>[{id:'office',name:'Escritório de teste'}],listCompanies:async()=>[{id:'company',name:'Empresa de teste',cnpj:'48956412000126'}],listDrafts:async()=>[]}});
  });
  await page.locator('#btn-remote-workspace').click();
  await page.locator('[data-remote-office] option').first().waitFor({state:'attached'});
  assert.equal(await page.locator('[data-remote-open]').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#btn-converter').evaluate(el=>getComputedStyle(el).backgroundColor),'Abrir preenchimento usa a cor primária');
  await page.locator('[data-company-trigger]').click();
  failures.push(...await contrast(page,'#remote-workspace')); lightSurfaces.push(...await contrast.lightSurfaces(page));
  await capture('04-empresas');
  await page.locator('#remote-workspace .remote-close').click();
  await page.locator('#remote-workspace').waitFor({state:'hidden'});
  await page.locator('#btn-workspace-fab').click();
  failures.push(...await contrast(page,'#current-workspace')); lightSurfaces.push(...await contrast.lightSurfaces(page));
  await page.locator('.workspace-minimize').click();
  await page.locator('#btn-tutorial').click();
  await page.locator('.tutorial-card').waitFor();
  failures.push(...await contrast(page,'.tutorial-card')); lightSurfaces.push(...await contrast.lightSurfaces(page));
  await capture('05-tutorial');
  await page.keyboard.press('Escape');
  await page.locator('.tutorial-card').waitFor({state:'hidden'});
  await page.locator('#sidebar-toggle').click();
  assert(await page.locator('#btn-theme').isVisible());
  await page.locator('#sidebar-toggle').click();
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('#btn-theme').isVisible());
  await capture('06-celular');
  await page.locator('#btn-theme').click();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),light);
  await page.locator('#btn-theme').click();
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  await page.emulateMedia({media:'screen'});
  await page.goto(baseURL+'/login.html');await page.locator('#login-form').waitFor();
  assert.equal(await page.locator('#login-description').count(),0);
  assert.match(await page.locator('.brand').innerText(),/Jornadas em equilíbrio/);
  const fintria=page.locator('footer a');assert.equal(await fintria.getAttribute('href'),'https://fintria.com.br');assert.equal(await fintria.getAttribute('target'),'_blank');
  failures.push(...await contrast(page)); lightSurfaces.push(...await contrast.lightSurfaces(page));
  await capture('07-login');
  assert.deepEqual([...new Map(failures.map(f=>[f.cls+f.text,f])).values()],[],'Contraste AA dos textos visíveis');
  assert.deepEqual([...new Map(lightSurfaces.map(f=>[f.cls+f.id,f])).values()],[],"Nenhuma superfície clara residual no modo escuro");
  assert.deepEqual(errors,[]);
  console.log('OK: temas claro/escuro persistentes, contraste AA nas oito etapas/grades/avisos/modal/login, celular, impressão, slogan e crédito.');
 }finally{await context.close();}
};

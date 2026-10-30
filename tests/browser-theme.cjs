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
  const failures=[];
  const boundaries="#btn-gerar, #btn-imprimir, [data-escala-quadro], .escala-mensal th, .escala-mensal td";
  for(const id of ['sec-config','sec-tipo','sec-feriados','sec-jornada','sec-folgas','sec-cobertura','sec-pec','sec-gerar']){
   await page.locator(`[data-etapa-link="${id}"]`).click();
   if(id==='sec-config') await page.locator('#sec-config details').evaluateAll(els=>els.forEach(el=>el.open=true));
   failures.push(...await contrast(page));
  }
  await page.evaluate(async()=>{
   const {converterEscala}=await import('/assets/js/domain/conversao.js');
   const {createDefaultState}=await import('/assets/js/state/store.js');
   const s=createDefaultState();s.jornada={entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'};
   s.horarioPorDia=true;s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
   s.conversao=converterEscala(s,{periodo:'2028-02',fase:'definitivo40',folgas:'fim_semana'});s.escalaGerada=s.conversao.origem.escala;
   localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
  });
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('[data-etapa-link="sec-gerar"]').click();
  await page.locator('#conversao-comparacao details').evaluateAll(els=>els.forEach(el=>el.open=true));
  failures.push(...await contrast(page));
  assert.deepEqual(await contrast.borders(page,boundaries),[],"Bordas dinâmicas com contraste 3:1");
  await page.evaluate(async()=>{const {getDialogs}=await import('/assets/js/ui/dialogs.js');getDialogs(document).confirm('Confira o contraste e os botões deste modal.',{title:'Revisar escala'});});
  await page.locator('dialog[open]').waitFor();failures.push(...await contrast(page,'dialog[open]'));
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
  failures.push(...await contrast(page));
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
   failures.push(...await contrast(page));
  }
  await page.locator('[data-app-view="schedule"]').click();
  await page.locator('#sidebar-toggle').click();
  assert(await page.locator('#btn-theme').isVisible());
  await page.locator('#sidebar-toggle').click();
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('#btn-theme').isVisible());
  await page.locator('#btn-theme').click();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),light);
  await page.locator('#btn-theme').click();
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  await page.emulateMedia({media:'screen'});
  await page.goto(baseURL+'/login.html');await page.locator('#login-form').waitFor();
  assert.equal(await page.locator('#login-description').count(),0);
  assert.match(await page.locator('.brand').innerText(),/Jornadas em equilíbrio/);
  const fintria=page.locator('footer a');assert.equal(await fintria.getAttribute('href'),'https://fintria.com.br');assert.equal(await fintria.getAttribute('target'),'_blank');
  failures.push(...await contrast(page));
  assert.deepEqual([...new Map(failures.map(f=>[f.cls+f.text,f])).values()],[],'Contraste AA dos textos visíveis');
  assert.deepEqual(errors,[]);
  console.log('OK: temas claro/escuro persistentes, contraste AA nas oito etapas/grades/avisos/modal/login, celular, impressão, slogan e crédito.');
 }finally{await context.close();}
};

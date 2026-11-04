const assert=require('node:assert/strict');
const {clicarCalculo}=require('./helpers/calculo.cjs');
module.exports=async({browser,baseURL})=>{
 const context=await browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1200,height:900}});
 try{
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});
  await page.goto(baseURL);const pronta=()=>page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await pronta();
  for(const fixa of [false,true]){
   await page.evaluate(async fixa=>{
    const{createDefaultState}=await import('/assets/js/state/store.js');
    const s=createDefaultState();Object.assign(s,{modeloEscala:fixa?'fixa':'dinamica',dataReferenciaFixa:'2028-02-01',tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],modoRegime:'simulacao',regimeJornada:'definitivo40'});
    s.colaboradores=s.colaboradores.map((c,i)=>({...c,sexo:'masculino',horasSemana:40,nome:i?'Pessoa de teste':'Pessoa com nome completo longo para conferir a estabilidade dos cartões durante a rolagem'}));
    localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(s));
   },fixa);
   await page.reload();await pronta();await page.locator('[data-etapa-link="sec-gerar"]').click();await clicarCalculo(page,'#btn-gerar');
   const grade=page.locator('#resultado-gerar [data-rolagem-escala]'),topo=page.locator('#resultado-gerar [data-rolagem-topo]');
   await grade.scrollIntoViewIfNeeded();
   await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
   // Intercala um gesto novo com o evento atrasado do espelhamento anterior.
   const corrida=await grade.evaluate(v=>{
    const t=v.closest('[data-escala-quadro]').querySelector('[data-rolagem-topo]');
    v.scrollLeft=80;v.dispatchEvent(new Event('scroll'));
    v.scrollLeft=160;t.dispatchEvent(new Event('scroll'));
    const principal=v.scrollLeft;v.dispatchEvent(new Event('scroll'));
    t.scrollLeft=200;t.dispatchEvent(new Event('scroll'));
    t.scrollLeft=240;v.dispatchEvent(new Event('scroll'));
    const superior=t.scrollLeft;t.dispatchEvent(new Event('scroll'));
    return{principal,superior,grade:v.scrollLeft,topo:t.scrollLeft};
   });
   assert.deepEqual(corrida,{principal:160,superior:240,grade:240,topo:240});
   await grade.evaluate(async v=>{
    v.scrollLeft=0;v.dispatchEvent(new Event('scroll'));
    for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
    window.__mudancasAltura=0;
    window.__monitorAltura=new MutationObserver(es=>window.__mudancasAltura+=es.length);
    window.__monitorAltura.observe(v.querySelector('table'),{subtree:true,attributes:true,attributeFilter:['style']});
   });
   const captura=()=>grade.evaluate(v=>{
    const card=v.querySelector('.escala-colaborador'),r=card.getBoundingClientRect();
    return{left:v.scrollLeft,top:v.scrollTop,x:r.left+v.scrollLeft,y:r.top+v.scrollTop,h:r.height};
   });
   const inicial=await captura();let anterior=inicial.left;
   const box=await grade.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(100,box.height/2));
   for(let i=0;i<8;i++){
    await page.mouse.wheel(45,0);
    await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
    const atual=await captura();assert(atual.left>=anterior,'Rolagem do quadro não pode recuar');
    assert(Math.abs(atual.x-inicial.x)<1);assert(Math.abs(atual.y-inicial.y)<1);assert.equal(atual.h,inicial.h);assert.equal(atual.top,inicial.top);anterior=atual.left;
   }
   assert(anterior>inicial.left,'Gesto real deslocou o quadro');
   const b=await topo.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
   for(let i=0;i<5;i++){
    await page.mouse.wheel(-40,0);
    await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
    const atual=await captura();assert(atual.left<=anterior,'Barra superior não pode devolver uma posição antiga');anterior=atual.left;
    assert(Math.abs((await topo.evaluate(t=>t.scrollLeft))-atual.left)<1);
   }
   const escritas=await page.evaluate(()=>{window.__monitorAltura.disconnect();return window.__mudancasAltura;});
   assert.equal(escritas,0,'Rolar não reescreve as alturas dos cards');
   // Conteúdo novo continua disparando a normalização de alturas.
   await grade.locator('.escala-colaborador').first().evaluate(c=>{const texto=document.createElement('div');texto.textContent='Atividade detalhada '.repeat(35);c.append(texto);});
   await page.waitForFunction(h=>document.querySelector('#resultado-gerar .escala-colaborador').getBoundingClientRect().height>h+20,inicial.h);
   const alturas=await grade.locator('.escala-colaborador').evaluateAll(cs=>cs.filter(c=>c.getClientRects().length).map(c=>c.getBoundingClientRect().height));
   assert(Math.max(...alturas)-Math.min(...alturas)<1,'Cards continuam uniformes ao mudar o conteúdo');
   await page.setViewportSize({width:390,height:844});
   await page.locator('#resultado-gerar [data-ver-resumo]').click();
   await page.waitForFunction(()=>{const v=document.querySelector('#resultado-gerar [data-rolagem-escala]');return Math.abs(v.scrollLeft-(v.scrollWidth-v.clientWidth))<2;});
   await page.setViewportSize({width:1200,height:900});
  }
  assert.deepEqual(errors,[]);
  console.log('OK: rolagem horizontal sem recuos/trepidação, eventos defasados nas duas barras, gesto real sem recalcular alturas, conteúdo variável, cards uniformes e resumo no celular, fixa/dinâmica.');
 }finally{await context.close();}
};

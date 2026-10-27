const assert = require('node:assert/strict');
module.exports = async ({browser,baseURL}) => {
 const {criarEstadoDemo}=await import('../database/demo/state.mjs');
 for(const cssAntigo of [false,true]) {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  try {
   await context.route('https://**/*',r=>r.abort());
   if(cssAntigo) await context.route('**/assets/css/interface.css*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).split('/* Identidade Reescala:')[0];
    await route.fulfill({response,body});
   });
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(baseURL);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   await page.evaluate(state=>localStorage.setItem('fintria-escala-dp-v2',JSON.stringify(state)),criarEstadoDemo());
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   assert.equal(await page.locator('#colab-list > div').count(),5);
   await page.evaluate(async()=>{
    const {initNavigation}=await import('/assets/js/ui/navigation.js');
    initNavigation({session:{user:{name:'Administrador Demo',role:'admin'},persistenceEnabled:true},document,window});
   });
   const logo=page.locator('.sidebar-brand img');await logo.evaluate(el=>el.decode());
   const box=await logo.boundingBox();assert.ok(box.width<=40 && box.height<=35);
   if(!cssAntigo) {
    for(const height of [900,768]) {
     await page.setViewportSize({width:1440,height});
     const sizes=await page.locator('#app-sidebar').evaluate(el=>({w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight}));
     assert.ok(sizes.sw<=sizes.w+1 && sizes.sh<=sizes.h+1,JSON.stringify(sizes));
    }
    await page.locator('#sidebar-toggle').click();assert.equal(await logo.isVisible(),true);
    const compact=await logo.boundingBox();assert.ok(compact.width<=40 && compact.height<=35);
    await page.locator('#sidebar-toggle').click();
   }
   await page.locator('[data-etapa-link="sec-gerar"]').click();
   await page.locator('#btn-gerar').click();
   await page.locator('#resultado-gerar .escala-marca').first().waitFor();
   await page.locator('#btn-converter').click();
   await page.locator('#resultado-proposta .escala-marca').first().waitFor();
   for(const img of await page.locator('.escala-identidade img').all()) {
    await img.evaluate(el=>el.decode());
    // Inline bounds and intrinsic attributes survive a stale stylesheet too.
    const size=await img.evaluate(el=>({w:parseFloat(getComputedStyle(el).width),h:parseFloat(getComputedStyle(el).height)}));
    assert.ok(size.w<=36 && size.h<=32,JSON.stringify(size));
   }
   if(!cssAntigo) {
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.escala-marca').first().isVisible(),false);
    assert.equal(await page.locator('.escala-marca-impressao').first().isVisible(),true);
    await page.emulateMedia({media:'screen'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log('OK: logos limitadas com CSS atual/antigo, menu Admin sem rolagem por marca, DEMO com cinco colaboradores, geração atual/proposta, impressão e celular.');
};

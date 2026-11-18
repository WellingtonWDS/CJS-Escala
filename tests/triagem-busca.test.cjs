const {test}=require('node:test');
const assert=require('node:assert/strict');
const cenario=require('./helpers/cenario-explicacao-busca.cjs');

test('sábado curto sem cobertura possível é comprovado de imediato, com recomendação, sem liberar folgas fixas',async()=>{
 const {converterEscala}=await import('../assets/js/domain/conversao.js');
 const {buscarAjustesCobertura:buscar}=await import('../assets/js/domain/ajustes-cobertura.js');
 for(const fixa of[true,false]){
  const seed=await cenario(fixa);
  // Dois motoristas e dois vendedores com sábado das 08h às 14h: quem trabalha
  // no sábado não fecha 42h. A lacuna do sábado é inevitável sem reduzir carga.
  seed.colaboradores=seed.colaboradores.filter(c=>c.id!==3);
  const p=converterEscala(seed,seed.destinoConversao).proposta.config;
  const antes=structuredClone(p),plano=buscar(p,{agora:()=>0});
  assert.equal(plano.alteracoes.length,0);
  assert.equal(plano.antes.minutosFaltantes,plano.depois.minutosFaltantes);
  if(fixa)assert.equal(plano.depois.minutosFaltantes,720);
  assert.equal(plano.limitesCobertura.comprovado,true);
  assert.equal(plano.limitesCobertura.limiteInferiorMin,plano.depois.minutosFaltantes);
  const textos=plano.limitesCobertura.explicacoes.join(' ');
  assert.match(textos,/Resultado ótimo comprovado/);
  assert.match(textos,/Aos sábados a empresa funciona das 08:00 às 14:00/);
  assert.match(textos,/contratar colaborador\(es\) específico\(s\) para os sábados/);
  assert.match(textos,/redução salarial é vedada/);
  assert.deepEqual(p,antes);
 }
});

test('triagem não substitui avaliações quando existe uma redistribuição válida',async()=>{
 const {buscarAjustesCobertura:buscar,aplicarAjustesCobertura:aplicar}=await import('../assets/js/domain/ajustes-cobertura.js');
 const s=await require('./helpers/cenario-redistribuicao.cjs')();
 const p=buscar(s,{agora:()=>0});
 assert(p.tentativas>0);assert(p.alteracoes.length>0);assert.equal(p.depois.minutosFaltantes,0);
 assert.equal(p.diagnosticoBusca.tipos.reduce((n,t)=>n+t.avaliadas,0),p.tentativas);
 assert.equal(aplicar(s,p).coberturaOperacional.lacunas.length,0);
});

test('contagens de triagem são completas, exemplos limitados e HTML escapado',async()=>{
 const {criarRegistroBusca}=await import('../assets/js/domain/explicacao-busca.js');
 const {renderExplicacaoBusca}=await import('../assets/js/ui/explicacao-busca.js');
 const r=criarRegistroBusca({resultado:[]});
 for(let i=0;i<1000;i++)r.registrarTriagem('folgas_fixas','Folgas fixas',{
  nome:'<img src=x onerror=alert(1)>',funcao:'Atendente',dataOrigem:'2027-02-12',dataLacuna:'2027-02-13'});
 const d=r.resultado();assert.equal(d.triagem[0].total,1000);assert.equal(d.triagem[0].exemplos.length,2);
 assert.equal(d.tipos.length,0);assert(JSON.stringify(d).length<2000);
 const html=renderExplicacaoBusca({tentativas:0,acoes:[],limiteTentativas:12000,diagnosticoBusca:{...d,encerramento:'sem_alternativas',lacunas:[],capacidade:null}});
 assert.match(html,/não são tentativas completas/);assert.doesNotMatch(html,/tempo máximo|30 segundos|Tempo de busca/);
 assert.match(html,/&lt;img/);assert(!html.includes('<img src=x'));
});

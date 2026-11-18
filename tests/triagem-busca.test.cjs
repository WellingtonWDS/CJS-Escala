const {test}=require('node:test');
const assert=require('node:assert/strict');
const cenario=require('./helpers/cenario-explicacao-busca.cjs');

test('regressão 36 para zero: opções da sexta não alcançam sábado com folgas fixas',async()=>{
 const {converterEscala}=await import('../assets/js/domain/conversao.js');
 const {buscarAjustesCobertura:buscar}=await import('../assets/js/domain/ajustes-cobertura.js');
 for(const fixa of[true,false]){
  const seed=await cenario(fixa);
  // Dois motoristas e dois vendedores: o registro da versão 2bde7eb
  // avaliava 36 alternativas sem melhoria para o sábado do padrão fixo.
  seed.colaboradores=seed.colaboradores.filter(c=>c.id!==3);
  const p=converterEscala(seed,seed.destinoConversao).proposta.config;
  const antes=structuredClone(p),plano=buscar(p,{agora:()=>0});
  assert.equal(plano.tentativas,0);assert.equal(plano.alteracoes.length,0);
  assert.equal(plano.diagnosticoBusca.encerramento,'sem_alternativas');
  assert.equal(plano.antes.minutosFaltantes,plano.depois.minutosFaltantes);
  if(fixa)assert.equal(plano.depois.minutosFaltantes,720);
  const triagem=plano.diagnosticoBusca.triagem;
  const dias=fixa?1:plano.antes.dias;
  assert.equal(triagem.find(t=>t.codigo==='dia_anterior_sem_alcance').total,4*dias);
  assert.equal(triagem.find(t=>t.codigo==='folgas_fixas').total,4*dias);
  for(const e of triagem.find(t=>t.codigo==='dia_anterior_sem_alcance').exemplos){
   assert.equal(new Date(e.dataOrigem+'T12:00:00').getDay(),5);
   assert.equal(new Date(e.dataLacuna+'T12:00:00').getDay(),6);
  }
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
 assert.match(html,/não são tentativas completas/);assert.match(html,/tempo máximo/);
 assert.match(html,/&lt;img/);assert(!html.includes('<img src=x'));
});

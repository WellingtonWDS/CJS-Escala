const { test } = require('node:test');
const assert = require('node:assert/strict');
const horario = (entrada,saida,intInicio='',intFim='') => ({entrada,saida,intInicio,intFim});
test('janela global respeita toggle por dia, fallback, meio período legado e erros de configuração',async()=>{
 const {validarFuncionamentoEmpresa:validar}=await import('../assets/js/domain/funcionamento-empresa.js');
 const config={tipoEscala:'5x2',diasTrabalho:[1,6],horarioPorDia:true,jornada:horario('08:00','18:00','11:00','13:00'),jornadaPorDia:{6:horario('08:00','00:00','12:00','00:00')}};
 assert.doesNotThrow(()=>validar(config,{weekday:6},{entrada:480,saida:720}));
 assert.throws(()=>validar(config,{weekday:6},{entrada:480,saida:721}),/08:00–12:00/);
 assert.doesNotThrow(()=>validar(config,{weekday:1},{entrada:480,saida:1080}));
 config.horarioPorDia=false;
 assert.doesNotThrow(()=>validar(config,{weekday:6},{entrada:480,saida:1080}));
 config.horarioPorDia=true;config.jornadaPorDia[6]=horario('08:00','','12:00','');
 assert.throws(()=>validar(config,{weekday:6},{entrada:480,saida:721}),/08:00–12:00/);
 for(const j of [horario('08:00','08:00'),horario('08:00','12:00','10:00',''),horario('08:00','12:00','13:00','14:00')]){
  config.jornadaPorDia[6]=j;
  assert.throws(()=>validar(config,{weekday:6},{entrada:480,saida:720}),/Revise o horário/);
 }
});
test('horário noturno exige limites de entrada e saída absolutos e a pausa pode ser redistribuída dentro da abertura',async()=>{
 const {validarFuncionamentoEmpresa:validar,trabalhoDentroDoFuncionamento:cabe}=await import('../assets/js/domain/funcionamento-empresa.js');
 const config={tipoEscala:'5x2',diasTrabalho:[6],horarioPorDia:false,jornada:horario('22:00','06:00','02:00','03:00')};
 assert.doesNotThrow(()=>validar(config,{weekday:6},{entrada:1320,saida:1800}));
 assert.throws(()=>validar(config,{weekday:6},{entrada:1319,saida:1800}),/22:00–06:00 \(\+1d\)/);
 assert.throws(()=>validar(config,{weekday:6},{entrada:1320,saida:1801}),/funcionamento/);
 assert(!cabe(config,{weekday:6,status:'T',entradaMin:1320,saidaMin:1801}));
 assert(!cabe(config,{weekday:0,status:'T',entradaMin:1320,saidaMin:1800}));
 assert(cabe(config,{weekday:0,status:'F'}));
 assert(!cabe(config,{weekday:6,status:'T'}));
 config.jornada=horario('08:00','18:00','11:00','13:00');
 assert.doesNotThrow(()=>validar(config,{weekday:6},{entrada:480,saida:1080,intInicio:720,intFim:840}));
});

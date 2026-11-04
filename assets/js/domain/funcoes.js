export const normalizarFuncao = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
export function funcoesHabilitadas(c) {
  const nomes = [
    c.cargo,
    ...(Array.isArray(c.funcoesHabilitadas) ? c.funcoesHabilitadas : []),
  ];
  const mapa = new Map();
  for (const nome of nomes)
    if (typeof nome === "string" && normalizarFuncao(nome))
      mapa.set(normalizarFuncao(nome), nome.trim());
  return [...mapa.values()];
}
export const habilitadoPara = (c, funcao) =>
  funcoesHabilitadas(c).some(
    (f) => normalizarFuncao(f) === normalizarFuncao(funcao),
  );
export function funcaoDoDia(c, d) {
  return d.funcaoAlocada || c.cargo;
}

/** Alocações exclusivas no tempo. Pausas nunca são contadas como presença. */
export function validarAlocacoesFuncao(c, d) {
  if (d.alocacoesFuncao == null) return null;
  if (!Array.isArray(d.alocacoesFuncao)) return "Alocações de função inválidas.";
  if(d.alocacoesFuncao.some(a=>!a || typeof a!=="object")) return "Alocações de função inválidas.";
  const ordenadas = [...d.alocacoesFuncao].sort((a,b) => a.inicioMin-b.inicioMin);
  for (let i=0;i<ordenadas.length;i++) {
    const a = ordenadas[i];
    if (!a || !Number.isInteger(a.inicioMin) || !Number.isInteger(a.fimMin) ||
        a.inicioMin < d.entradaMin || a.fimMin > d.saidaMin || a.fimMin <= a.inicioMin ||
        (i && ordenadas[i-1].fimMin > a.inicioMin) || !habilitadoPara(c,a.funcao))
      return "Revise os horários, a habilitação e a exclusividade das funções alocadas.";
  }
  return null;
}
export function alocacoesDoDia(c, d, partes = null) {
  if (!["T","FE"].includes(d.status)) return [];
  partes ||= d.intervaloMin > 0
    ? [[d.entradaMin,d.intervaloInicioMin],[d.intervaloFimMin,d.saidaMin]]
    : [[d.entradaMin,d.saidaMin]];
  const alocacoes = Array.isArray(d.alocacoesFuncao) ? d.alocacoesFuncao.filter(a=>a && Number.isFinite(a.inicioMin) && Number.isFinite(a.fimMin)) : [], resultado = [];
  for (const [inicio,fim] of partes) {
    if (!(fim>inicio)) continue;
    const pontos = [...new Set([inicio,fim,...alocacoes.flatMap(a=>[a.inicioMin,a.fimMin]).filter(x=>x>inicio&&x<fim)])].sort((a,b)=>a-b);
    for (let i=0;i<pontos.length-1;i++) {
      const a=pontos[i],b=pontos[i+1];
      const funcao=alocacoes.find(x=>x.inicioMin<=a&&x.fimMin>=b)?.funcao || funcaoDoDia(c,d);
      const ultimo=resultado.at(-1);
      if(ultimo?.fimMin===a && normalizarFuncao(ultimo.funcao)===normalizarFuncao(funcao)) ultimo.fimMin=b;
      else resultado.push({inicioMin:a,fimMin:b,funcao});
    }
  }
  return resultado;
}
export function alocarFuncaoNoPeriodo(c,d,funcao,inicio,fim) {
  const partes=alocacoesDoDia(c,d), alocacoes=[];
  for(const p of partes) {
    const a=Math.max(inicio,p.inicioMin), b=Math.min(fim,p.fimMin);
    if(b<=a) {alocacoes.push(p);continue;}
    if(p.inicioMin<a) alocacoes.push({...p,fimMin:a});
    alocacoes.push({inicioMin:a,fimMin:b,funcao});
    if(b<p.fimMin) alocacoes.push({...p,inicioMin:b});
  }
  return {...d,alocacoesFuncao:alocacoes};
}
export function semAlocacoesFuncao(d) {
  const {alocacoesFuncao,...resto}=d;
  return resto;
}

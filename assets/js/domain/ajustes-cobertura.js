import { candidatosRateio, deficitContratual } from "./ajustes-rateio.js";
import { analisarRateioSemanal } from "./rateio-semanal.js";
import { alternativasIntervalo, faixaInicioIntervalo } from "./intervalos-cobertura.js";
import { configDaEscala } from "./contexto-escala.js";
import { trabalhoDentroDoFuncionamento, validarFuncionamentoEmpresa } from "./funcionamento-empresa.js";
import { criarRegistroBusca, explicarResultadoBusca } from "./explicacao-busca.js";
import { janelasDeclaradas as janelas } from "./disponibilidade.js";
import { analisarCobertura, normalizarFuncao } from "./cobertura.js";
import { habilitadoPara, funcaoDoDia, alocarFuncaoNoPeriodo, alocacoesDoDia, semAlocacoesFuncao } from "./funcoes.js";
import { createDomain } from "./index.js";
import { configDoPerfil } from "./perfil-dominio.js";
import {
  bloqueioNaData,
  violacoesDia,
  validarRestricoes,
} from "./restricoes.js";
import { apurarSemana } from "./resumo-semanal.js";
import { VERSAO_REGRAS } from "./ec141.js";
import {
  timeToMin,
  minToTime,
  dateFromKey,
  getMonday,
  isoDate,
} from "./datas-horas.js";

const trabalha = (d) => ["T", "FE"].includes(d.status);
const diaSerial = (data) =>
  Date.UTC(...data.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) /
  86400000;
const chave = (date) =>
  isoDate(date.getFullYear(), date.getMonth(), date.getDate());
const semana = (data) => chave(getMonday(dateFromKey(data)));
function noPeriodo(config, d) {
  const data = dateFromKey(d.data);
  return (
    data.getFullYear() === config.ano &&
    data.getMonth() === config.mes &&
    data.getDate() >= config.diaInicio
  );
}
const minutosFaltantes = (rel) =>
  rel.lacunas.reduce((s, l) => s + (l.fimMin - l.inicioMin) * l.faltantes, 0);
const resumo = (rel) => ({
  minutosFaltantes: minutosFaltantes(rel),
  faixas: rel.lacunas.length,
  dias: new Set(rel.lacunas.map((l) => l.data)).size,
});
export function assinaturaAjustes(config, escala = config.escalaGerada) {
  config = configDaEscala(config, escala);
  const { escalaGerada, conversao, ...entrada } = config;
  const raw = JSON.stringify({
    entrada,
    resultado: escala?.resultado,
    versao: escala?.versaoRegras,
    dataInicio: escala?.dataInicio,
    dataFim: escala?.dataFim,
  });
  // Identificador de versão do rascunho, sem finalidade de autenticação.
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul(a ^ raw.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ raw.charCodeAt(i);
  }
  return `${raw.length}:${a >>> 0}:${b >>> 0}`;
}
function validarEntrada(config, escala) {
  if (!escala?.resultado?.length)
    throw new Error("Gere uma escala antes de buscar ajustes de cobertura.");
  if (escala.versaoRegras !== VERSAO_REGRAS)
    throw new Error("Gere novamente a escala com as regras atuais.");
  if (config.coberturaAtiva === false || !config.demandasCobertura?.length)
    throw new Error("Ative a cobertura e cadastre as faixas necessárias.");
  if (
    new Set(escala.resultado.map((r) => r.colaborador.id)).size !==
    escala.resultado.length
  )
    throw new Error("Confira os identificadores dos colaboradores.");
  for (const r of escala.resultado)
    if (validarRestricoes(r.colaborador).length)
      throw new Error(
        `${r.colaborador.nome}: revise as restrições antes de buscar ajustes.`,
      );
  const rel = analisarCobertura(config, escala.resultado);
  if (rel.avisos.length || !rel.periodos.length)
    throw new Error(
      "Corrija os avisos de cobertura e confira as faixas aplicáveis antes de buscar ajustes.",
    );
  return rel;
}
export function atualizarRelatoriosAjustes(config, escala) {
  config = configDaEscala(config, escala);
  const domain = createDomain(config);
  escala.validacoes = escala.resultado.map((r) => ({
    colaborador: r.colaborador,
    issues: domain.validarLegal(
      r.colaborador,
      r.dias,
      r.diasContexto,
      r.diasApuracao,
    ),
  }));
  escala.recomendacoesRateio = analisarRateioSemanal(config,escala.resultado);
  escala.avisosCobertura = domain.validarCobertura(escala.resultado);
  escala.coberturaOperacional = analisarCobertura(config, escala.resultado);
  return escala;
}
/** Mantém as cópias da mesma data coerentes, inclusive depois de restaurar JSON. */
function substituir(escala, alteracoes) {
  const mapa = new Map();
  for (const a of alteracoes) {
    if (!mapa.has(a.colaboradorId)) mapa.set(a.colaboradorId, new Map());
    mapa.get(a.colaboradorId).set(a.data, a.depois);
  }
  return {
    ...escala,
    resultado: escala.resultado.map((r) => {
      const datas = mapa.get(r.colaborador.id);
      if (!datas) return r;
      const novo = { ...r };
      for (const campo of ["dias", "diasContexto", "diasApuracao"])
        if (r[campo])
          novo[campo] = r[campo].map((d) =>
            datas.has(d.data) ? structuredClone(datas.get(d.data)) : d,
          );
      return novo;
    }),
  };
}
function horario(config, c, base, modelo, inicio, funcao, conferirJanela=true) {
  const duracao = Math.round(modelo.horas * 60 + modelo.intervaloMin);
  if (
    inicio < 0 ||
    inicio >= 1440 ||
    duracao <= 0 ||
    (conferirJanela && !janelas(config, c, base).some(
      (j) => inicio >= j.inicio && inicio + duracao <= j.fim,
    ))
  )
    return null;
  const pausa = modelo.intervaloMin;
  const distancia =
    modelo.intervaloInicioMin == null
      ? Math.min(240, duracao - pausa)
      : modelo.intervaloInicioMin - modelo.entradaMin;
  const pInicio = inicio + Math.max(0, Math.min(distancia, duracao - pausa));
  const saida = inicio + duracao;
  const novo = {
    ...base,
    status: base.feriado?.trabalhado ? "FE" : "T",
    horas: modelo.horas,
    entradaMin: inicio,
    saidaMin: saida,
    intervaloMin: pausa,
    intervaloInicioMin: pausa ? pInicio : null,
    intervaloFimMin: pausa ? pInicio + pausa : null,
    funcaoAlocada: funcao,
    previsto: true,
    horasPrevistas: modelo.horas,
    turno:
      config.turnosRevezamento && inicio === timeToMin(config.entradaTurnoB)
        ? "B"
        : "A",
    creditoIntervaloCCT: 0,
    creditoNoturnoCCT: 0,
    horasComputadasCCT: modelo.horas,
  };
  if (pausa && modelo.horas >= 7 && modelo.horas <= 9) {
    const faixa = faixaInicioIntervalo(novo);
    if (faixa.inicio > faixa.fim) return null;
    novo.intervaloInicioMin = Math.max(faixa.inicio, Math.min(pInicio, faixa.fim));
    novo.intervaloFimMin = novo.intervaloInicioMin + pausa;
  }
  novo.jornadaAplicada = {
    entrada: minToTime(inicio),
    intInicio: minToTime(pausa ? novo.intervaloInicioMin : saida),
    intFim: minToTime(pausa ? novo.intervaloFimMin : saida),
    saida: minToTime(saida),
  };
  delete novo.alocacoesFuncao;
  delete novo.ajusteRestricao;
  if (
    violacoesDia(c, novo).length ||
    (c.quadroDominio?.admissaoIso && novo.data < c.quadroDominio.admissaoIso)
  )
    return null;
  return novo;
}
function inicios(config, c, base, modelo, lacuna) {
  const offset = (diaSerial(lacuna.data) - diaSerial(base.data)) * 1440;
  const duracao = Math.round(modelo.horas * 60 + modelo.intervaloMin);
  return [
    ...new Set([
      modelo.entradaMin,
      timeToMin(config.entradaTurnoB),
      lacuna.inicioMin + offset,
      lacuna.fimMin + offset - duracao,
      ...janelas(config, c, base).flatMap((j) => [j.inicio, j.fim - duracao]),
      modelo.entradaMin + 30,
      modelo.entradaMin - 30,
      modelo.entradaMin + 60,
      modelo.entradaMin - 60,
    ]),
  ]
    .filter(Number.isFinite)
    .map(Math.round)
    .filter((m) => m >= 0 && m < 1440)
    .sort((a, b) => {
      // Tenta primeiro a entrada que cobre a maior parte da faixa procurada,
      // evitando consumir o orçamento com avanços de poucos minutos.
      const coberto = (inicio) => Math.max(0,
        Math.min(inicio + duracao, lacuna.fimMin + offset) -
        Math.max(inicio, lacuna.inicioMin + offset));
      return coberto(b) - coberto(a) ||
        Math.abs(a - modelo.entradaMin) - Math.abs(b - modelo.entradaMin) || a - b;
    });
}
function podeMudar(config, c, d) {
  return (
    (config.modeloEscala === "fixa" || noPeriodo(config, d)) &&
    !d.ajusteManual &&
    (!d.restricao || d.restricao.tipo === "horario") &&
    !bloqueioNaData(c, d.data) &&
    !["VA", "AF", "I", "NC", "FC"].includes(d.status)
  );
}
function podeVirarFolga(config, c, d) {
  const proprio = configDoPerfil(config, c) || config;
  if (proprio.folgasFimSemana) return false;
  if (config.aplicarProposta5x2)
    return (
      !(config.folgasFixasOrigemCobertura || []).includes(d.weekday) &&
      (config.folgaDiasPermitidos?.length
        ? config.folgaDiasPermitidos.includes(d.weekday)
        : true)
    );
  return (
    proprio.folgaTipo !== "fixa" &&
    (!proprio.folgaDiasPermitidos?.length ||
      proprio.folgaDiasPermitidos.includes(d.weekday))
  );
}
function transformarEmFolga(de) {
  const folga = {
    ...de,
    status: "F",
    horas: 0,
    previsto: false,
    intervaloMin: 0,
    intervaloInicioMin: null,
    intervaloFimMin: null,
    creditoIntervaloCCT: 0,
    creditoNoturnoCCT: 0,
    horasComputadasCCT: 0,
    ajusteAutomatico: true,
  };
  delete folga.alocacoesFuncao;
  delete folga.funcaoAlocada;
  delete folga.ajusteRestricao;
  return folga;
}
function* trocasEntrePessoas(config, escala, c, d, de, primeiras) {
  let parceiros = 0;
  for (const r of escala.resultado) {
    const p = r.colaborador;
    if (p.id === c.id || !habilitadoPara(p, funcaoDoDia(c, de))) continue;
    const trabalhaNoDestino = r.dias.find((x) => x.data === d.data),
      folgaNaOrigem = r.dias.find((x) => x.data === de.data);
    if (
      !trabalhaNoDestino ||
      !folgaNaOrigem ||
      !trabalha(trabalhaNoDestino) ||
      folgaNaOrigem.status !== "F" ||
      folgaNaOrigem.repousoSeguranca ||
      !podeMudar(config, p, trabalhaNoDestino) ||
      !podeMudar(config, p, folgaNaOrigem) ||
      !podeVirarFolga(config, p, trabalhaNoDestino)
    )
      continue;
    if (++parceiros > 20) break;
    const referencia = {
      data: de.data,
      inicioMin: de.entradaMin,
      fimMin: de.saidaMin,
    };
    for (const inicio of inicios(
      config,
      p,
      folgaNaOrigem,
      trabalhaNoDestino,
      referencia,
    )) {
      const trabalho = horario(
        config,
        p,
        folgaNaOrigem,
        trabalhaNoDestino,
        inicio,
        funcaoDoDia(c, de),
      );
      if (!trabalho) continue;
      yield {
        tipo: "troca_folgas",
        alteracoes: [
          ...primeiras,
          {
            colaboradorId: p.id,
            data: trabalhaNoDestino.data,
            antes: structuredClone(trabalhaNoDestino),
            depois: transformarEmFolga(trabalhaNoDestino),
          },
          {
            colaboradorId: p.id,
            data: folgaNaOrigem.data,
            antes: structuredClone(folgaNaOrigem),
            depois: { ...trabalho, ajusteAutomatico: true },
          },
        ],
      };
    }
  }
}
/** No padrão fixo uma sugestão é uma alteração semanal, inclusive nas
 * semanas de contexto usadas para validar os descansos na virada. */
function expandirRecorrencia(config, escala, alteracoes) {
  if (config.modeloEscala !== "fixa") return alteracoes;
  const mapa = new Map();
  for (const a of alteracoes) {
    const r = escala.resultado.find((r) => r.colaborador.id === a.colaboradorId);
    const dias = new Map([
      ...(r.diasContexto || []), ...(r.diasApuracao || []), ...r.dias,
    ].map((d) => [d.data, d]));
    for (const d of dias.values()) {
      if (d.weekday !== a.depois.weekday) continue;
      if (!podeMudar(config, r.colaborador, d)) return null;
      // Replica somente os campos alterados pelo ajuste. Data, dia do mês,
      // alvo e demais metadados continuam pertencendo à própria ocorrência.
      const depois = structuredClone(d);
      for (const key of new Set([...Object.keys(a.antes), ...Object.keys(a.depois)])) {
        if (JSON.stringify(a.antes[key]) === JSON.stringify(a.depois[key])) continue;
        if (Object.hasOwn(a.depois, key)) depois[key] = structuredClone(a.depois[key]);
        else delete depois[key];
      }
      mapa.set(`${a.colaboradorId}:${d.data}`, {
        colaboradorId: a.colaboradorId, data: d.data,
        antes: structuredClone(d), depois,
      });
    }
  }
  return [...mapa.values()];
}
/** Pode ser necessário cobrir primeiro a função de quem será realocado.
 * A dupla é avaliada atomicamente para não descobrir outra função. */
function* realocacoesComReforco(config, escala, c, d, novo) {
  const funcao = funcaoDoDia(c, d);
  for (const r of escala.resultado) {
    if (r.colaborador.id === c.id || !habilitadoPara(r.colaborador, funcao)) continue;
    const dia = r.dias.find((x) => x.data === d.data);
    const proprio = configDoPerfil(config, r.colaborador) || config;
    if (!dia || !trabalha(dia) || !podeMudar(config, r.colaborador, dia) ||
        proprio.tipoEscala === "12x36" || proprio.cicloQuadro ||
        normalizarFuncao(funcaoDoDia(r.colaborador, dia)) === normalizarFuncao(funcao)) continue;
    yield { tipo: "funcoes_combinadas", alteracoes: [
      { colaboradorId: c.id, data: d.data, antes: structuredClone(d),
        depois: { ...novo, ajusteAutomatico: true } },
      { colaboradorId: r.colaborador.id, data: dia.data, antes: structuredClone(dia),
        depois: semAlocacoesFuncao({ ...dia, funcaoAlocada: funcao, ajusteAutomatico: true }) },
    ] };
  }
}
function* candidatos(config, escala, lacuna, registrarTriagem = () => {}) {
  for (const r of escala.resultado) {
    const c = r.colaborador,
      proprio = configDoPerfil(config, c) || config;
    if (
      !habilitadoPara(c, lacuna.funcao) ||
      proprio.tipoEscala === "12x36" ||
      proprio.cicloQuadro
    )
      continue;
    for (const d of r.dias) {
      if (
        !podeMudar(config, c, d) ||
        ![0, 1].includes(diaSerial(lacuna.data) - diaSerial(d.data))
      )
        continue;
      // O dia anterior só pode atender à lacuna por uma janela noturna real.
      // Não percorra combinações de intervalos diurnos que nunca alcançam a faixa.
      if(d.data!==lacuna.data && !janelas(config,c,d).some(j=>
        j.inicio<lacuna.fimMin+1440 && j.fim>lacuna.inicioMin+1440)){
        registrarTriagem("dia_anterior_sem_alcance","A janela de trabalho no dia anterior não alcança o horário descoberto. Alterar seus intervalos ou funções não cobriria essa lacuna.",{nome:c.nome,funcao:lacuna.funcao,dataOrigem:d.data,dataLacuna:lacuna.data});
        continue;
      }
      // Com folgas fixas, nenhuma troca de dia na semana pode ser gerada.
      if(d.status==="F" && proprio.folgasFimSemana){
        // Materializa as trocas concretas para avaliá-las e explicar o bloqueio.
        // A regra permanece obrigatória na validação central e na aplicação.
        for(const de of r.dias){
          if(!trabalha(de) || semana(de.data)!==semana(d.data) || !podeMudar(config,c,de))continue;
          const novo=horario(config,c,d,de,de.entradaMin,lacuna.funcao,false);
          if(novo)yield {tipo:"folga",alteracoes:[
            {colaboradorId:c.id,data:d.data,antes:structuredClone(d),depois:{...novo,ajusteAutomatico:true}},
            {colaboradorId:c.id,data:de.data,antes:structuredClone(de),depois:transformarEmFolga(de)},
          ]};
        }
        continue;
      }
      const alterar = (depois) => ({
        colaboradorId: c.id,
        data: d.data,
        antes: structuredClone(d),
        depois: { ...depois, ajusteAutomatico: true },
      });
      if (trabalha(d)) {
        const offset=(diaSerial(lacuna.data)-diaSerial(d.data))*1440;
        const inicio=lacuna.inicioMin+offset, fim=lacuna.fimMin+offset;
        const parcial=alocarFuncaoNoPeriodo(c,d,lacuna.funcao,inicio,fim);
        yield {tipo:"funcao_periodo",alteracoes:[alterar(parcial)]};
        // Suporte habilitado pode assumir a função liberada só neste período.
        for(const origem of alocacoesDoDia(c,d).filter(a=>a.fimMin>inicio&&a.inicioMin<fim)) {
          if(normalizarFuncao(origem.funcao)===normalizarFuncao(lacuna.funcao)) continue;
          for(const outro of escala.resultado) {
            const dia=outro.dias.find(x=>x.data===d.data);
            const perfil=configDoPerfil(config,outro.colaborador)||config;
            if(outro.colaborador.id===c.id || !habilitadoPara(outro.colaborador,origem.funcao) ||
              !dia || !trabalha(dia) || !podeMudar(config,outro.colaborador,dia) ||
              perfil.tipoEscala==="12x36" || perfil.cicloQuadro) continue;
            yield {tipo:"funcoes_periodo_combinadas",alteracoes:[alterar(parcial),{
              colaboradorId:outro.colaborador.id,data:dia.data,antes:structuredClone(dia),
              depois:{...alocarFuncaoNoPeriodo(outro.colaborador,dia,origem.funcao,
                Math.max(inicio,origem.inicioMin),Math.min(fim,origem.fimMin)),ajusteAutomatico:true}
            }]};
          }
        }
        for (const novo of alternativasIntervalo(c, d))
          yield { tipo: "intervalo", alteracoes: [alterar(novo)] };
        // A realocação para outra função vale pelo plantão, sem contagem simultânea.
        if (
          normalizarFuncao(funcaoDoDia(c, d)) !==
          normalizarFuncao(lacuna.funcao)
        ) {
          const novo = semAlocacoesFuncao({ ...d, funcaoAlocada: lacuna.funcao });
          yield { tipo: "funcao", alteracoes: [alterar(novo)] };
          yield* realocacoesComReforco(config, escala, c, d, novo);
        }
        for (const inicio of inicios(config, c, d, d, lacuna)) {
          if (
            inicio === d.entradaMin &&
            normalizarFuncao(funcaoDoDia(c, d)) ===
              normalizarFuncao(lacuna.funcao)
          )
            continue;
          const novo = horario(config, c, d, d, inicio, lacuna.funcao);
          if (novo) {
            yield { tipo: "horario", alteracoes: [alterar(novo)] };
            // Mover o turno e a pausa pode ser necessário no mesmo passo;
            // isoladamente cada mudança pode abrir uma nova lacuna.
            for (const pausa of alternativasIntervalo(c, novo))
              yield { tipo: "horario_intervalo", alteracoes: [alterar(pausa)] };
          }
        }
      } else if (
        d.status === "F" &&
        !d.repousoSeguranca &&
        !(d.feriado && !d.feriado.trabalhado) &&
        janelas(config, c, d).length
      ) {
        for (const de of r.dias) {
          if (
            !trabalha(de) ||
            semana(de.data) !== semana(d.data) ||
            !podeMudar(config, c, de) ||
            !podeVirarFolga(config, c, de)
          )
            continue;
          for (const inicio of inicios(config, c, d, de, lacuna)) {
            const novo = horario(config, c, d, de, inicio, lacuna.funcao);
            if (!novo) continue;
            const folga = transformarEmFolga(de);
            const alteracoes = [
              alterar(novo),
              {
                colaboradorId: c.id,
                data: de.data,
                antes: structuredClone(de),
                depois: folga,
              },
            ];
            yield { tipo: "folga", alteracoes };
            yield* trocasEntrePessoas(config, escala, c, d, de, alteracoes);
          }
        }
      }
    }
  }
}
/** Uma redução global não pode mascarar uma nova lacuna em outra função ou horário. */
export function coberturaNaoPiora(antes, depois) {
  if (depois.avisos.length) return false;
  for (const novo of depois.lacunas) {
    const anteriores = antes.lacunas
      .filter(
        (a) =>
          a.data === novo.data &&
          normalizarFuncao(a.funcao) === normalizarFuncao(novo.funcao) &&
          a.fimMin > novo.inicioMin &&
          a.inicioMin < novo.fimMin,
      )
      .sort((a, b) => a.inicioMin - b.inicioMin);
    let cursor = novo.inicioMin;
    for (const a of anteriores) {
      if (a.inicioMin > cursor || a.faltantes < novo.faltantes) return false;
      cursor = Math.max(cursor, a.fimMin);
      if (cursor >= novo.fimMin) break;
    }
    if (cursor < novo.fimMin) return false;
  }
  return true;
}
function motivoConfiguracao(config,escala,alteracoes){
  for(const a of alteracoes){
    const c=escala.resultado.find(r=>r.colaborador.id===a.colaboradorId)?.colaborador;
    if(c && trabalha(a.antes) && !trabalha(a.depois) && !podeVirarFolga(config,c,a.antes))
      return {codigo:"configuracao",mensagem:`${c.nome}: trocar o trabalho de ${a.antes.data} pela folga de outro dia contraria as folgas fixas ou os dias permitidos cadastrados. A alternativa foi verificada e não será aplicada.`};
  }
  return null;
}
function motivoInseguro(config, antes, depois, alteracoes) {
  const configuracao=motivoConfiguracao(config,antes,alteracoes);if(configuracao)return configuracao;
  for (const a of alteracoes) if (!trabalhoDentroDoFuncionamento(config, a.depois)) {
    try { validarFuncionamentoEmpresa(config, a.depois, {entrada:a.depois.entradaMin,saida:a.depois.saidaMin}); }
    catch (e) { return {codigo:"funcionamento",mensagem:e.message}; }
    return {codigo:"funcionamento",mensagem:"Horário inválido para o funcionamento da empresa."};
  }
  const domain = createDomain(config);
  for (const a of alteracoes) {
    const r = depois.resultado.find(
      (r) => r.colaborador.id === a.colaboradorId,
    );
    if(!r || !podeMudar(config,r.colaborador,a.antes)) return {codigo:"preservado",mensagem:"O dia está protegido contra alterações automáticas."};
    if (
      trabalha(a.depois) &&
      !janelas(config, r.colaborador, a.depois).some(
        (j) => a.depois.entradaMin >= j.inicio && a.depois.saidaMin <= j.fim,
      )
    )
      return {codigo:"janela",mensagem:"O horário proposto não cabe na disponibilidade declarada para o colaborador."};
  }
  for (const id of new Set(alteracoes.map((a) => a.colaboradorId))) {
    const r = depois.resultado.find((r) => r.colaborador.id === id),
      anterior = antes.resultado.find((r) => r.colaborador.id === id);
    const erro = domain.validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
      .find(i => i.severidade === "erro");
    if (erro) return {codigo:"legal",mensagem:`${r.colaborador.nome}: ${erro.mensagem}`};
    for (const key of new Set(
      alteracoes
        .filter((a) => a.colaboradorId === id)
        .map((a) => semana(a.data)),
    )) {
      const a = anterior.dias.filter((d) => semana(d.data) === key),
        b = r.dias.filter((d) => semana(d.data) === key);
      if (a.filter(trabalha).length !== b.filter(trabalha).length) return {codigo:"dias",mensagem:`${r.colaborador.nome}: a troca mudaria a quantidade de dias de trabalho nesta semana.`};
      const previo = apurarSemana(r.colaborador, a, config),
        atual = apurarSemana(r.colaborador, b, config);
      if (
        (Math.abs(atual.computadas - previo.computadas) > 0.001 &&
          !(atual.computadas > previo.computadas && atual.computadas <= atual.alvo + 0.001)) ||
        atual.alvo !== previo.alvo
      )
        return {codigo:"carga",mensagem:`${r.colaborador.nome}: a alternativa reduziria as horas computadas, ultrapassaria a meta ou mudaria o alvo semanal.`};
    }
  }
  return null;
}
function seguro(config, antes, depois, alteracoes) {
  return !motivoInseguro(config, antes, depois, alteracoes);
}

const chaveDiaBusca=d=>JSON.stringify([d.status,d.horas,d.entradaMin,d.saidaMin,d.intervaloInicioMin,d.intervaloFimMin,d.funcaoAlocada,d.alocacoesFuncao]);

// Identificador compacto do estado operacional, independente da ordem das trocas.
function chaveEstadoBusca(config,alteracoes) {
  const raw=JSON.stringify(alteracoes.map(a=>{
    const c=config.colaboradores.find(c=>c.id===a.colaboradorId) || {};
    const dia=d=>[d.status,d.horas,d.entradaMin,d.saidaMin,d.intervaloInicioMin,d.intervaloFimMin,alocacoesDoDia(c,d)];
    return JSON.stringify(dia(a.antes))===JSON.stringify(dia(a.depois))?null:[a.colaboradorId,a.data,dia(a.depois)];
  }).filter(Boolean).sort((a,b)=>String(a[0]).localeCompare(String(b[0])) || a[1].localeCompare(b[1])));
  let a=2166136261,b=5381;
  for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b,33)^raw.charCodeAt(i);}
  return `${raw.length}:${a>>>0}:${b>>>0}`;
}

/** Fronteira iterativa de sequências, sem teto fixo de profundidade. Limita
 * memória e tempo, evita revisitar estados e nunca aplica estados parciais.
 * O consumidor devolve em expandir/pontuacao se o estado é seguro para explorar. */
function* redistribuicoesCombinadas(config,escala,rel,sementes,controle) {
  const fronteira=sementes.map(s=>({...s,profundidade:1}));
  const visitados=new Set([chaveEstadoBusca(config,[]),...sementes.map(s=>chaveEstadoBusca(config,s.candidato.alteracoes))]);
  while(fronteira.length && !controle.esgotado()) {
    const s=fronteira.shift(),parcial=substituir(escala,s.candidato.alteracoes);
    const cobertura=analisarCobertura(config,parcial.resultado);
    const lacunas=[...cobertura.lacunas].sort((a,b)=>
      Number(!coberturaNaoPiora(rel,{lacunas:[b],avisos:[]}))-Number(!coberturaNaoPiora(rel,{lacunas:[a],avisos:[]})) ||
      (b.fimMin-b.inicioMin)*b.faltantes-(a.fimMin-a.inicioMin)*a.faltantes || a.data.localeCompare(b.data));
    let geradas=0;
    proximoEstado: for(const l of lacunas.slice(0,8)) for(const segunda of candidatos(config,parcial,l,controle.registrarTriagem)) {
      if(++geradas>160 || controle.esgotado())break proximoEstado;
      const recorrentes=expandirRecorrencia(config,parcial,segunda.alteracoes);
      if(!recorrentes)continue;
      const mapa=new Map(s.candidato.alteracoes.map(a=>[`${a.colaboradorId}:${a.data}`,a]));
      for(const a of recorrentes) {
        const key=`${a.colaboradorId}:${a.data}`,primeira=mapa.get(key);
        mapa.set(key,{...a,antes:primeira?.antes || a.antes});
      }
      const alteracoes=[...mapa.values()].filter(a=>chaveDiaBusca(a.antes)!==chaveDiaBusca(a.depois));
      const key=chaveEstadoBusca(config,alteracoes);
      if(!alteracoes.length || visitados.has(key))continue;
      if(visitados.size>=4096){controle.memoriaLimitada=true;break proximoEstado;}
      visitados.add(key);
      const candidato={tipo:"redistribuicao_combinada",recorrentes:true,alteracoes,profundidade:s.profundidade+1};
      yield candidato;
      if(candidato.expandir && !controle.esgotado()) {
        fronteira.push({candidato,profundidade:candidato.profundidade,pontuacao:candidato.pontuacao});
        fronteira.sort((a,b)=>a.pontuacao-b.pontuacao || a.profundidade-b.profundidade);
        if(fronteira.length>12){controle.memoriaLimitada=true;fronteira.splice(12);}
      }
    }
  }
}
export function buscarAjustesCobertura(config, opcoes = {}) {
  config = configDaEscala(config);
  const original = config.escalaGerada;
  let rel = validarEntrada(config, original),
    escala = structuredClone(original);
  const antes = resumo(rel),
    acoes = [],
    alteracoes = new Map();
  const ampliada=opcoes.ampliada!==false;
  const agora=opcoes.agora || (()=>performance.now());
  const inicioBusca=agora();
  const limiteTempoMs=Math.min(30000,Math.max(1,Number(opcoes.limiteTempoMs)||30000));
  const controle={memoriaLimitada:false,esgotado:()=>agora()-inicioBusca>=limiteTempoMs};
  let profundidadeMaxima=0;
  const limiteTentativas = Math.min(
    ampliada?12000:1200,
    Math.max(1, Math.trunc(opcoes.limiteTentativas || (ampliada?12000:600))),
  );
  // Sem teto separado de operações: os recursos de busca limitam o trabalho.
  const limiteAcoes = Math.min(limiteTentativas,Math.max(1,Math.trunc(opcoes.limiteAcoes || (ampliada?limiteTentativas:20))));
  const rejeicoes={semMelhoria:0,novaLacuna:0,regras:0,recorrencia:0};
  const registroBusca=criarRegistroBusca(original);
  controle.registrarTriagem=registroBusca.registrarTriagem;
  let tentativas = 0;
  const progresso = () =>
    opcoes.onProgresso?.({
      tentativas,
      limiteTentativas,
      ajustes: acoes.length,
      profundidadeMaxima,tempoDecorridoMs:Math.round(agora()-inicioBusca),limiteTempoMs,
    });
  progresso();
  while (
    (rel.lacunas.length || deficitContratual(config,escala)>0) &&
    tentativas < limiteTentativas &&
    acoes.length < limiteAcoes && !controle.esgotado()
  ) {
    let aceito = false;
    const vistos = new Set();
    const sementes=[];
    const prioritarias = [...rel.lacunas].sort((a, b) =>
      (b.fimMin - b.inicioMin) * b.faltantes - (a.fimMin - a.inicioMin) * a.faltantes ||
      (ampliada?b.data.localeCompare(a.data):a.data.localeCompare(b.data)) || b.inicioMin - a.inicioMin ||
      normalizarFuncao(a.funcao).localeCompare(normalizarFuncao(b.funcao)));
    function* propostas() {
      function* diretas() {
        yield* candidatosRateio(config,escala,podeMudar);
        for(const lacuna of prioritarias) yield* candidatos(config,escala,lacuna,registroBusca.registrarTriagem);
      }
      const tetoDiretas=Math.min(limiteTentativas,tentativas+Math.max(1,Math.min(80,Math.floor((limiteTentativas-tentativas)/3))));
      for(const candidata of diretas()) {
        if(controle.esgotado() || (ampliada && tentativas>=tetoDiretas && sementes.length))break;
        yield candidata;
      }
      if(ampliada)yield* redistribuicoesCombinadas(config,escala,rel,sementes,controle);
    }
    busca: for (const gerado of propostas()) {
        if(controle.esgotado())break busca;
        const recorrentes = gerado.recorrentes ? gerado.alteracoes : expandirRecorrencia(config, escala, gerado.alteracoes);
        if (!recorrentes) {rejeicoes.recorrencia++;registroBusca.registrar(gerado,"recorrencia","A alteração não pode ser replicada em todas as ocorrências do padrão.",false);continue;}
        const candidato = { ...gerado, alteracoes: recorrentes };
        const chaveCandidato = JSON.stringify(
          candidato.alteracoes.map((a) => [
            a.colaboradorId,
            a.data,
            a.depois.status,
            a.depois.entradaMin,
            a.depois.intervaloInicioMin,
            a.depois.intervaloFimMin,
            a.depois.funcaoAlocada,
            a.depois.horas, a.depois.saidaMin, a.depois.alocacoesFuncao,
          ]),
        );
        if (vistos.has(chaveCandidato)) continue;
        vistos.add(chaveCandidato);
        tentativas++;
        profundidadeMaxima=Math.max(profundidadeMaxima,gerado.profundidade || 1);
        if (tentativas % 10 === 0) progresso();
        const novo = substituir(escala, candidato.alteracoes);
        const cobertura = analisarCobertura(config, novo.resultado);
        const melhoria=minutosFaltantes(cobertura)<minutosFaltantes(rel) ||
          deficitContratual(config,novo)<deficitContratual(config,escala);
        const preserva=melhoria && coberturaNaoPiora(rel,cobertura);
        const bloqueioConfiguracao=motivoConfiguracao(config,escala,candidato.alteracoes);
        const impedimento=bloqueioConfiguracao || (preserva ? motivoInseguro(config,escala,novo,candidato.alteracoes) : null);
        const valido=preserva && !impedimento;
        const codigo=bloqueioConfiguracao?"configuracao":!melhoria?"sem_melhoria":!preserva?"nova_lacuna":impedimento?.codigo;
        let motivo=impedimento?.mensagem || "";
        if(codigo==="nova_lacuna") {
          const nova=cobertura.lacunas.find(l=>!coberturaNaoPiora(rel,{lacunas:[l],avisos:[]}));
          if(nova)motivo=`${nova.data}: descobriria ou agravaria a função ${nova.funcao}, das ${minToTime(nova.inicioMin)} às ${minToTime(nova.fimMin)} (${nova.faltantes} pessoa(s) faltando).`;
        }
        registroBusca.registrar(candidato,codigo,motivo);
        if(ampliada && gerado.tipo==="redistribuicao_combinada" && !valido) {
          gerado.expandir=!motivoInseguro(config,escala,novo,candidato.alteracoes);
          gerado.pontuacao=minutosFaltantes(cobertura);
        }
        if(ampliada && !valido && !["redistribuicao_combinada","funcao_periodo"].includes(candidato.tipo) &&
          candidato.alteracoes.some(a=>chaveDiaBusca(a.antes)!==chaveDiaBusca(a.depois))) {
          const grupo=[...new Set(candidato.alteracoes.map(a=>`${a.colaboradorId}:${config.modeloEscala==="fixa"?a.depois.weekday:a.data}`))].sort().join(",");
          const pontuacao=minutosFaltantes(cobertura);
          const deslocamento=candidato.alteracoes.reduce((n,a)=>n+Math.abs((a.depois.entradaMin||0)-(a.antes.entradaMin||0)),0);
          const iguais=sementes.filter(s=>s.grupo===grupo);
          const pior=iguais.sort((a,b)=>b.pontuacao-a.pontuacao)[0];
          if((iguais.length<2 || pontuacao<pior.pontuacao) &&
            (sementes.length<12 || pontuacao<sementes.at(-1).pontuacao) &&
            !motivoInseguro(config,escala,novo,candidato.alteracoes)) {
            if(iguais.length>=2)sementes.splice(sementes.indexOf(pior),1);
            sementes.push({candidato,grupo,pontuacao,deslocamento});
            sementes.sort((a,b)=>a.pontuacao-b.pontuacao || b.deslocamento-a.deslocamento);
            sementes.splice(12);
          }
        }
        if(bloqueioConfiguracao) rejeicoes.regras++;
        else if(!melhoria) rejeicoes.semMelhoria++;
        else if(!preserva) rejeicoes.novaLacuna++;
        else if(!valido) rejeicoes.regras++;
        if (valido) {
          for (const a of candidato.alteracoes) {
            const k = `${a.colaboradorId}:${a.data}`,
              velho = alteracoes.get(k);
            alteracoes.set(k, { ...a, antes: velho?.antes || a.antes });
          }
          acoes.push({
            tipo: candidato.tipo,
            profundidade:candidato.profundidade || 1,
            reducaoMinutos: minutosFaltantes(rel) - minutosFaltantes(cobertura),
          });
          escala = novo;
          rel = cobertura;
          aceito = true;
          break busca;
        }
        if (tentativas >= limiteTentativas) break busca;
      }
    if (!aceito) break;
  }
  progresso();
  const duracaoBuscaMs=Math.round(agora()-inicioBusca),limiteTempoAtingido=controle.esgotado();
  const explicacoes = [];
  if(ampliada)explicacoes.push("A busca considera mudanças de dias, horários, intervalos e funções. Confira as propostas verificadas e seus impedimentos nos detalhes. Nenhuma alteração foi aplicada automaticamente; folgas fixas, dias protegidos, funcionamento e limites legais continuam respeitados.");
  if(!acoes.length) explicacoes.push(!rel.lacunas.length && !deficitContratual(config,escala)
    ? "As faixas cadastradas já estão cobertas e não há saldo contratual a distribuir em semanas completas."
    : `${tentativas} alternativas foram avaliadas. Não foi encontrada melhoria que preservasse cobertura, descansos, restrições e carga semanal. Isso não comprova inviabilidade da escala.`);
  if(rejeicoes.novaLacuna) explicacoes.push(`${rejeicoes.novaLacuna} alternativa(s) descartadas porque abririam ou agravariam lacunas em outro horário ou função.`);
  if(rejeicoes.regras) explicacoes.push(`${rejeicoes.regras} alternativa(s) descartadas na conferência das folgas configuradas, jornada, descanso, restrições ou carga semanal. Confira também as incompatibilidades já sinalizadas na escala.`);
  if(rejeicoes.recorrencia) explicacoes.push(`${rejeicoes.recorrencia} alternativa(s) não puderam ser repetidas com segurança em todas as semanas do padrão fixo.`);
  if (rel.lacunas.length)
    explicacoes.push(
      "Persistem horários descobertos. A busca é limitada e não comprova, isoladamente, necessidade de contratação. Revise disponibilidades, funções habilitadas e a demanda restante.",
    );
  if (tentativas >= limiteTentativas || acoes.length >= limiteAcoes || limiteTempoAtingido)
    explicacoes.push(
      "O limite desta busca foi atingido. Após aplicar, é possível buscar novos ajustes.",
    );
  if (
    original.resultado.some((r) => {
      const p = configDoPerfil(config, r.colaborador) || config;
      return p.tipoEscala === "12x36" || p.cicloQuadro;
    })
  )
    explicacoes.push(
      "Plantões 12×36 e ciclos importados diferenciados foram preservados; não são alterados automaticamente.",
    );
  if (original.resultado.some((r) => r.dias.some((d) => d.ajusteManual)))
    explicacoes.push("Dias editados manualmente foram preservados.");
  if (
    original.validacoes?.some((v) =>
      v.issues.some((i) => i.severidade === "erro"),
    )
  )
    explicacoes.push(
      "Colaboradores com incompatibilidades objetivas precisam de revisão antes de receber ajustes automáticos.",
    );
  const domainFinal = createDomain(config);
  const afetados = new Set(
    [...alteracoes.values()].map((a) => a.colaboradorId),
  );
  const avisosValidacao = escala.resultado
    .filter((r) => afetados.has(r.colaborador.id))
    .flatMap((r) =>
      domainFinal
        .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
        .filter((i) => ["pendencia", "alerta"].includes(i.severidade))
        .map((i) => ({ ...i, nome: r.colaborador.nome })),
    );
  const encerramento=!rel.lacunas.length && !deficitContratual(config,escala)?"objetivos_atendidos"
    :limiteTempoAtingido?"limite_tempo":tentativas>=limiteTentativas?"limite_tentativas":acoes.length>=limiteAcoes?"limite_acoes"
    :tentativas?"sem_melhoria":"sem_alternativas";
  const diagnosticoBusca=explicarResultadoBusca(config,escala,rel,registroBusca.resultado(),encerramento,{podeMudar,podeVirarFolga,ampliada});
  return {
    buscaAmpliada:ampliada,
    buscaEncadeada:ampliada,limiteTempoMs,duracaoBuscaMs,profundidadeMaxima,memoriaLimitada:controle.memoriaLimitada,
    diagnosticoBusca,
    avisosValidacao,
    versaoRegras: VERSAO_REGRAS,
    assinaturaAntes: assinaturaAjustes(config, original),
    assinaturaDepois: assinaturaAjustes(config, escala),
    antes,
    depois: resumo(rel),
    deficitAntesMin: deficitContratual(config,original),
    deficitDepoisMin: deficitContratual(config,escala),
    alteracoes: [...alteracoes.values()],
    acoes,
    tentativas,
    rejeicoes,
    limiteTentativas,
    limiteAcoes,
    explicacoes,
  };
}
function conferirAlteracoes(config, escala, alteracoes) {
  const vistos = new Set();
  for (const a of alteracoes) {
    const r = escala.resultado.find(
      (r) => r.colaborador.id === a.colaboradorId,
    );
    const d = [...(r?.dias || []), ...(r?.diasContexto || []), ...(r?.diasApuracao || [])]
        .find((d) => d.data === a.data),
      chave = `${a.colaboradorId}:${a.data}`;
    if (
      !r ||
      !d ||
      vistos.has(chave) ||
      JSON.stringify(d) !== JSON.stringify(a.antes) ||
      a.depois.data !== d.data ||
      a.depois.weekday !== d.weekday ||
      a.depois.colaboradorId !== d.colaboradorId ||
      !podeMudar(config, r.colaborador, d)
    )
      return false;
    vistos.add(chave);
    const proprio = configDoPerfil(config, r.colaborador) || config;
    if (proprio.tipoEscala === "12x36" || proprio.cicloQuadro) return false;
    if (
      trabalha(d) &&
      !trabalha(a.depois) &&
      !podeVirarFolga(config, r.colaborador, d)
    )
      return false;
    if (
      trabalha(a.depois) &&
      (!habilitadoPara(r.colaborador, funcaoDoDia(r.colaborador, a.depois)) ||
        !janelas(config, r.colaborador, a.depois).some(
          (j) => a.depois.entradaMin >= j.inicio && a.depois.saidaMin <= j.fim,
        ))
    )
      return false;
  }
  return true;
}
export function aplicarAjustesCobertura(config, plano) {
  config = configDaEscala(config);
  const original = config.escalaGerada;
  if (
    plano?.versaoRegras !== VERSAO_REGRAS ||
    plano.assinaturaAntes !== assinaturaAjustes(config, original)
  )
    throw new Error(
      "A escala ou a configuração mudou. Busque novas sugestões antes de aplicar.",
    );
  if (!plano.alteracoes?.length)
    throw new Error("Não há ajustes para aplicar.");
  if (!conferirAlteracoes(config, original, plano.alteracoes))
    throw new Error(
      "A proposta de ajuste não passou pela conferência. Busque novas sugestões.",
    );
  const antes = validarEntrada(config, original),
    novo = substituir(original, plano.alteracoes),
    depois = analisarCobertura(config, novo.resultado);
  if (
    assinaturaAjustes(config, novo) !== plano.assinaturaDepois ||
    !coberturaNaoPiora(antes, depois) ||
    (minutosFaltantes(depois) >= minutosFaltantes(antes) &&
      deficitContratual(config,novo) >= deficitContratual(config,original)) ||
    !seguro(config, original, novo, plano.alteracoes)
  )
    throw new Error(
      "A proposta de ajuste não passou pela conferência. Busque novas sugestões.",
    );
  atualizarRelatoriosAjustes(config, novo);
  novo.ajustesCobertura = {
    ...structuredClone(plano),
    aplicadoEm: new Date().toISOString(),
  };
  return novo;
}
export function desfazerAjustesCobertura(config) {
  config = configDaEscala(config);
  const original = config.escalaGerada,
    plano = original?.ajustesCobertura;
  if (!plano || plano.assinaturaDepois !== assinaturaAjustes(config, original))
    throw new Error(
      "A escala foi alterada após o ajuste. O desfazer está indisponível para preservar as alterações posteriores.",
    );
  const novo = substituir(
    original,
    plano.alteracoes.map((a) => ({ ...a, depois: a.antes })),
  );
  delete novo.ajustesCobertura;
  return atualizarRelatoriosAjustes(config, novo);
}

// Operações de dia reutilizadas na edição assistida, mantendo os três calendários coerentes.
export {
  substituir as substituirDiasDaEscala,
  transformarEmFolga as criarFolga,
  horario as criarHorarioCompativel,
  podeVirarFolga as permiteFolga,
};

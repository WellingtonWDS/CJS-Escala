import { analisarCobertura, normalizarFuncao } from "./cobertura.js";
import { habilitadoPara, funcaoDoDia } from "./funcoes.js";
import { createDomain } from "./index.js";
import { configDoPerfil, perfilAtivo } from "./perfil-dominio.js";
import {
  bloqueioNaData,
  violacoesDia,
  janelaPermitida,
  validarRestricoes,
} from "./restricoes.js";
import { apurarSemana } from "./resumo-semanal.js";
import { VERSAO_REGRAS } from "./ec141.js";
import {
  normalizarJornada,
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
function janelas(config, c, d) {
  const proprio = configDoPerfil(config, c) || config;
  if (
    proprio.tipoEscala === "12x36" ||
    proprio.cicloQuadro ||
    !proprio.diasTrabalho.includes(d.weekday) ||
    bloqueioNaData(c, d.data) ||
    (d.feriado && !d.feriado.trabalhado)
  )
    return [];
  const origem = config.horariosOrigemCobertura || config;
  const fonte = perfilAtivo(c)
    ? c.quadroDominio.semana?.[d.weekday]?.jornada
    : origem.horarioPorDia
      ? origem.jornadaPorDia?.[d.weekday] || origem.jornada
      : origem.jornada;
  const j = normalizarJornada(fonte);
  if (!j) return [];
  const opcoes = [{ inicio: j.entrada, fim: j.saida }];
  if (!perfilAtivo(c) && origem.turnosRevezamento) {
    const inicio = timeToMin(origem.entradaTurnoB);
    if (Number.isFinite(inicio))
      opcoes.push({ inicio, fim: inicio + j.saida - j.entrada });
  }
  const permitida = janelaPermitida(c, d);
  return opcoes
    .map((o) => ({
      inicio: Math.max(o.inicio, permitida?.inicio ?? o.inicio),
      fim: Math.min(o.fim, permitida?.fim ?? o.fim),
    }))
    .filter((o) => o.fim > o.inicio);
}
function horario(config, c, base, modelo, inicio, funcao) {
  const duracao = Math.round(modelo.horas * 60 + modelo.intervaloMin);
  if (
    inicio < 0 ||
    inicio >= 1440 ||
    duracao <= 0 ||
    !janelas(config, c, base).some(
      (j) => inicio >= j.inicio && inicio + duracao <= j.fim,
    )
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
  novo.jornadaAplicada = {
    entrada: minToTime(inicio),
    intInicio: minToTime(pausa ? pInicio : saida),
    intFim: minToTime(pausa ? pInicio + pausa : saida),
    saida: minToTime(saida),
  };
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
    .sort((a, b) => a - b);
}
function podeMudar(config, c, d) {
  return (
    noPeriodo(config, d) &&
    !d.ajusteManual &&
    !d.restricao &&
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
function* candidatos(config, escala, lacuna) {
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
      const alterar = (depois) => ({
        colaboradorId: c.id,
        data: d.data,
        antes: structuredClone(d),
        depois: { ...depois, ajusteAutomatico: true },
      });
      if (trabalha(d)) {
        // A realocação para outra função vale pelo plantão, sem contagem simultânea.
        if (
          normalizarFuncao(funcaoDoDia(c, d)) !==
          normalizarFuncao(lacuna.funcao)
        )
          yield {
            tipo: "funcao",
            alteracoes: [alterar({ ...d, funcaoAlocada: lacuna.funcao })],
          };
        for (const inicio of inicios(config, c, d, d, lacuna)) {
          if (
            inicio === d.entradaMin &&
            normalizarFuncao(funcaoDoDia(c, d)) ===
              normalizarFuncao(lacuna.funcao)
          )
            continue;
          const novo = horario(config, c, d, d, inicio, lacuna.funcao);
          if (novo) yield { tipo: "horario", alteracoes: [alterar(novo)] };
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
function seguro(config, antes, depois, alteracoes) {
  const domain = createDomain(config);
  for (const a of alteracoes) {
    const r = depois.resultado.find(
      (r) => r.colaborador.id === a.colaboradorId,
    );
    if (
      trabalha(a.depois) &&
      !janelas(config, r.colaborador, a.depois).some(
        (j) => a.depois.entradaMin >= j.inicio && a.depois.saidaMin <= j.fim,
      )
    )
      return false;
  }
  for (const id of new Set(alteracoes.map((a) => a.colaboradorId))) {
    const r = depois.resultado.find((r) => r.colaborador.id === id),
      anterior = antes.resultado.find((r) => r.colaborador.id === id);
    if (
      domain
        .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
        .some((i) => i.severidade === "erro")
    )
      return false;
    for (const key of new Set(
      alteracoes
        .filter((a) => a.colaboradorId === id)
        .map((a) => semana(a.data)),
    )) {
      const a = anterior.dias.filter((d) => semana(d.data) === key),
        b = r.dias.filter((d) => semana(d.data) === key);
      if (a.filter(trabalha).length !== b.filter(trabalha).length) return false;
      const previo = apurarSemana(r.colaborador, a, config),
        atual = apurarSemana(r.colaborador, b, config);
      if (
        Math.abs(atual.computadas - previo.computadas) > 0.001 ||
        atual.alvo !== previo.alvo
      )
        return false;
    }
  }
  return true;
}
export function buscarAjustesCobertura(config, opcoes = {}) {
  const original = config.escalaGerada;
  let rel = validarEntrada(config, original),
    escala = structuredClone(original);
  const antes = resumo(rel),
    acoes = [],
    alteracoes = new Map();
  const limiteTentativas = Math.min(
    1200,
    Math.max(1, Math.trunc(opcoes.limiteTentativas || 600)),
  );
  const limiteAcoes = Math.min(
    40,
    Math.max(1, Math.trunc(opcoes.limiteAcoes || 20)),
  );
  let tentativas = 0;
  const progresso = () =>
    opcoes.onProgresso?.({
      tentativas,
      limiteTentativas,
      ajustes: acoes.length,
    });
  progresso();
  while (
    rel.lacunas.length &&
    tentativas < limiteTentativas &&
    acoes.length < limiteAcoes
  ) {
    let aceito = false;
    const vistos = new Set();
    busca: for (const lacuna of rel.lacunas)
      for (const candidato of candidatos(config, escala, lacuna)) {
        const chaveCandidato = JSON.stringify(
          candidato.alteracoes.map((a) => [
            a.colaboradorId,
            a.data,
            a.depois.status,
            a.depois.entradaMin,
            a.depois.funcaoAlocada,
          ]),
        );
        if (vistos.has(chaveCandidato)) continue;
        vistos.add(chaveCandidato);
        tentativas++;
        if (tentativas % 10 === 0) progresso();
        const novo = substituir(escala, candidato.alteracoes);
        const cobertura = analisarCobertura(config, novo.resultado);
        if (
          minutosFaltantes(cobertura) < minutosFaltantes(rel) &&
          coberturaNaoPiora(rel, cobertura) &&
          seguro(config, escala, novo, candidato.alteracoes)
        ) {
          for (const a of candidato.alteracoes) {
            const k = `${a.colaboradorId}:${a.data}`,
              velho = alteracoes.get(k);
            alteracoes.set(k, { ...a, antes: velho?.antes || a.antes });
          }
          acoes.push({
            tipo: candidato.tipo,
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
  const explicacoes = [];
  if (rel.lacunas.length)
    explicacoes.push(
      "Persistem horários descobertos. A busca é limitada e não comprova, isoladamente, necessidade de contratação. Revise disponibilidades, funções habilitadas e a demanda restante.",
    );
  if (tentativas >= limiteTentativas || acoes.length >= limiteAcoes)
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
  return {
    avisosValidacao,
    versaoRegras: VERSAO_REGRAS,
    assinaturaAntes: assinaturaAjustes(config, original),
    assinaturaDepois: assinaturaAjustes(config, escala),
    antes,
    depois: resumo(rel),
    alteracoes: [...alteracoes.values()],
    acoes,
    tentativas,
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
    const d = r?.dias.find((d) => d.data === a.data),
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
    minutosFaltantes(depois) >= minutosFaltantes(antes) ||
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

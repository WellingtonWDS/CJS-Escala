import { habilitadoPara, funcaoDoDia } from "./funcoes.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { janelasDeclaradas } from "./disponibilidade.js";
import {
  dateFromKey,
  getMonday,
  isoDate,
  fmtHoras,
  normalizarJornada,
} from "./datas-horas.js";
import { createJornada } from "./jornada.js";
import { limiteDiario } from "./ec141.js";
import { apurarSemana } from "./resumo-semanal.js";
import {
  diagnosticarEquipe,
  TITULOS_DIAGNOSTICO,
} from "./diagnostico-equipe.js";

export const TIPOS_TENTATIVA = {
  redistribuicao_combinada: "Redistribuição encadeada de operações",
  rateio: "Ratear saldo semanal",
  intervalo: "Redistribuir intervalos",
  horario: "Alterar entrada e saída",
  horario_intervalo: "Combinar turno e intervalo",
  folga: "Trocar trabalho e folga",
  troca_folgas: "Trocar folgas entre colaboradores",
  funcao: "Realocar função",
  funcao_periodo: "Alternar função por horário",
  funcoes_combinadas: "Realocar funções com substituto",
  funcoes_periodo_combinadas: "Combinar funções por horário",
};
export const MOTIVOS_BUSCA = {
  configuracao:["Troca incompatível com as folgas cadastradas","As trocas propostas foram verificadas, mas não podem substituir folgas fixas ou desrespeitar os dias permitidos."],
  sem_melhoria: [
    "Não reduz a lacuna nem o saldo",
    "A alternativa não melhorou a cobertura ou a carga contratual nas semanas completas.",
  ],
  nova_lacuna: [
    "Transfere o problema para outro horário",
    "Cobrir uma faixa não pode descobrir outra função ou piorar outra faixa.",
  ],
  funcionamento: [
    "Fora do funcionamento da empresa",
    "Revise os horários da empresa; um ajuste não pode ultrapassar a abertura cadastrada.",
  ],
  preservado: [
    "Dia protegido para edição automática",
    "Confira férias, afastamentos, indisponibilidades, compensações e edições manuais.",
  ],
  janela: [
    "Fora da disponibilidade permitida",
    "Confira as janelas individuais e os dias em que é permitido trabalhar.",
  ],
  legal: [
    "Incompatibilidade de jornada ou descanso",
    "Veja a regra concreta no exemplo. A busca também considera incompatibilidades já existentes na escala.",
  ],
  dias: [
    "Altera a quantidade de dias trabalhados",
    "A redistribuição precisa preservar a quantidade de dias de trabalho na semana.",
  ],
  carga: [
    "Não preserva a carga contratual",
    "A busca não reduz a meta contratual nem fabrica abonos para fechar a conta.",
  ],
  recorrencia: [
    "Não se repete com segurança no padrão fixo",
    "Uma troca no modelo fixo precisa funcionar em todas as semanas e nos seus limites.",
  ],
};

const inicioSemana = (data) => {
  const d = getMonday(dateFromKey(data));
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
};
const trabalha = (d) => ["T", "FE"].includes(d.status);
const breve = (d, c) => ({
  data: d.data,
  status: d.status,
  entradaMin: d.entradaMin,
  saidaMin: d.saidaMin,
  intervaloInicioMin: d.intervaloInicioMin,
  intervaloFimMin: d.intervaloFimMin,
  funcao: funcaoDoDia(c, d),
  alocacoesFuncao: (d.alocacoesFuncao || []).slice(0, 4).map((a) => ({
    funcao: a.funcao,
    inicioMin: a.inicioMin,
    fimMin: a.fimMin,
  })),
  alocacoesOmitidas: Math.max(0, (d.alocacoesFuncao?.length || 0) - 4),
});

/** Contagens completas e amostras limitadas: não guarda centenas de escalas. */
export function criarRegistroBusca(escala) {
  const tipos = new Map(),
    motivos = new Map(),
    triagem = new Map();
  return {
    registrarTriagem(codigo, texto, exemplo) {
      if(!triagem.has(codigo))triagem.set(codigo,{codigo,texto,total:0,exemplos:[]});
      const item=triagem.get(codigo);item.total++;
      if(item.exemplos.length<2)item.exemplos.push(exemplo);
    },
    registrar(candidato, codigo, mensagem = "", avaliada = true) {
      const tipo = candidato.tipo;
      if (!tipos.has(tipo))
        tipos.set(tipo, {
          tipo,
          titulo: TIPOS_TENTATIVA[tipo] || tipo,
          avaliadas: 0,
          aceitas: 0,
          descartadas: 0,
          filtradas: 0,
        });
      const t = tipos.get(tipo);
      if (avaliada) {
        t.avaliadas++;
        t[codigo ? "descartadas" : "aceitas"]++;
      } else t.filtradas++;
      if (!codigo) return;
      if (!motivos.has(codigo))
        motivos.set(codigo, {
          codigo,
          titulo: MOTIVOS_BUSCA[codigo][0],
          orientacao: MOTIVOS_BUSCA[codigo][1],
          total: 0,
          exemplos: [],
        });
      const m = motivos.get(codigo);
      m.total++;
      if (m.exemplos.length < 2) {
        const distintos=new Map();
        for(const a of candidato.alteracoes){
          const key=JSON.stringify([a.colaboradorId,a.depois.weekday ?? dateFromKey(a.depois.data).getDay(),a.antes.status,a.depois.status]);
          if(!distintos.has(key))distintos.set(key,a);
        }
        m.exemplos.push({
          tipo: TIPOS_TENTATIVA[tipo] || tipo,
          profundidade:candidato.profundidade || 1,
          mensagem,
          alteracoes: [...distintos.values()].slice(0, 2).map((a) => {
            const c =
              escala.resultado.find((r) => r.colaborador.id === a.colaboradorId)
                ?.colaborador || {};
            return {
              nome: c.nome || "Colaborador",
              antes: breve(a.antes, c),
              depois: breve(a.depois, c),
            };
          }),
        });
      }
    },
    resultado() {
      return {
        tipos: [...tipos.values()],
        triagem:[...triagem.values()],
        motivos: [...motivos.values()].sort((a, b) => b.total - a.total),
      };
    },
  };
}

// Limite superior otimista, sem descontar pausas: não é uma escala sugerida,
// nem uma prova de necessidade de contratar. Explica o conflito com a meta.
function tetoComDiaCurto(config, r, dia) {
  const p = configDoPerfil(config, r.colaborador) || config;
  if (
    p.tipoEscala !== "5x2" ||
    dia.status !== "F" ||
    (p.instrumentoCompensacao === "act_cct" &&
      (p.instrumentoColetivo?.repousoMensal ||
        p.instrumentoColetivo?.compensacaoHoras)) ||
    r.dias.some((d) => d.creditoIntervaloCCT || d.creditoNoturnoCCT)
  )
    return null;
  const semana = inicioSemana(dia.data),
    dias = r.dias.filter((d) => inicioSemana(d.data) === semana);
  const resumo = apurarSemana(r.colaborador, dias, p);
  if (
    !resumo.completa ||
    dias.some(
      (d) => d.feriado || d.restricao || ["VA", "AF", "NC"].includes(d.status),
    )
  )
    return null;
  const capacidade = (d) => {
    if (!config.diasTrabalho.includes(d.weekday)) return 0;
    const j = normalizarJornada(
      createJornada(config).obterJornadaDoDia(d.weekday),
    );
    return j
      ? Math.min(
          j.saida - j.entrada,
          Math.round(limiteDiario(p, d.data, r.colaborador) * 60),
        )
      : 0;
  };
  const curto = capacidade(dia),
    outros = dias
      .filter((d) => d.data !== dia.data)
      .map(capacidade)
      .sort((a, b) => b - a)
      .slice(0, 4);
  const teto = curto + outros.reduce((s, n) => s + n, 0),
    alvo = Math.round(resumo.alvo * 60);
  if (!curto || teto >= alvo) return null;
  return `Incluindo este dia entre os cinco dias de trabalho, o limite superior é ${fmtHoras(teto / 60)} na semana (${outros.map((n) => fmtHoras(n / 60)).join(" + ")} + ${fmtHoras(curto / 60)}), contra a referência contratual de ${fmtHoras(alvo / 60)} (diferença mínima de ${fmtHoras((alvo - teto) / 60)}). Esse teto ainda não desconta os intervalos; com as pausas, a capacidade pode ser menor. É um conflito com a meta contratual, não uma prova isolada de falta de pessoal.`;
}

/** Triagem separada das tentativas: explica inclusive por que nada foi gerado. */
export function explicarResultadoBusca(
  config,
  escala,
  rel,
  registro,
  estado,
  { podeMudar, podeVirarFolga, ampliada = false },
) {
  const grupos = new Map();
  let lacunasLimitadas = false;
  for (const l of rel.lacunas) {
    const key = JSON.stringify([
      l.funcao,
      dateFromKey(l.data).getDay(),
      l.inicioMin,
      l.fimMin,
      l.faltantes,
    ]);
    if (grupos.has(key)) {
      grupos.get(key).ocorrencias++;
      continue;
    }
    if (grupos.size >= 16) {
      lacunasLimitadas = true;
      continue;
    }
    const grupo = {
        ...l,
        ocorrencias: 1,
        habilitados: 0,
        bloqueios: [],
        limitesContratuais: [],
      },
      bloqueios = new Map();
    const bloquear = (codigo, texto, nome) => {
      if (!bloqueios.has(codigo))
        bloqueios.set(codigo, { codigo, texto, total: 0, nomes: [] });
      const b = bloqueios.get(codigo);
      b.total++;
      if (b.nomes.length < 3) b.nomes.push(nome);
    };
    for (const r of escala.resultado) {
      const c = r.colaborador,
        p = configDoPerfil(config, c) || config;
      if (!habilitadoPara(c, l.funcao)) continue;
      grupo.habilitados++;
      const d = r.dias.find((d) => d.data === l.data);
      if (!d) continue;
      const teto = tetoComDiaCurto(config, r, d);
      if (teto && grupo.limitesContratuais.length < 2)
        grupo.limitesContratuais.push({ nome: c.nome, mensagem: teto });
      if (p.tipoEscala === "12x36" || p.cicloQuadro)
        bloquear(
          "ciclo",
          "Plantão/ciclo preservado pela busca automática.",
          c.nome,
        );
      else if (d.ajusteManual)
        bloquear(
          "edicao_manual",
          "Dia editado manualmente e preservado pela busca. Revise a edição no quadro se quiser permitir outra distribuição.",
          c.nome,
        );
      else if (!podeMudar(config, c, d))
        bloquear(
          "protegido",
          "Dia preservado: edição manual, ausência, restrição ou limite do período.",
          c.nome,
        );
      else if (d.status === "F" && p.folgasFimSemana)
        bloquear(
          "folgas_fim_semana",
          `Sábado e domingo estão definidos como folgas fixas. A busca não substitui essa escolha por folga em dia útil. Para testar rodízio, ${config.aplicarProposta5x2 ? "altere Folgas da proposta para distribuir as folgas" : "revise as folgas fixas na etapa Folgas"} e gere novamente.`,
          c.nome,
        );
      else if (
        d.status === "F" &&
        (d.repousoSeguranca || (d.feriado && !d.feriado.trabalhado))
      )
        bloquear(
          "repouso",
          "Folga protegida por descanso ou feriado dispensado.",
          c.nome,
        );
      else if (
        d.status === "F" &&
        !r.dias.some(
          (de) =>
            trabalha(de) &&
            inicioSemana(de.data) === inicioSemana(d.data) &&
            podeMudar(config, c, de) &&
            podeVirarFolga(config, c, de),
        )
      )
        bloquear(
          "folgas_permitidas",
          "Não há dia de trabalho na mesma semana que possa virar folga segundo as configurações cadastradas.",
          c.nome,
        );
      else if (
        !janelasDeclaradas(config, c, d).some(
          (j) => j.inicio < l.fimMin && j.fim > l.inicioMin,
        )
      )
        bloquear(
          "janela",
          "Não há janela declarada compatível para iniciar trabalho nesta data. Plantões iniciados no dia anterior também podem ser avaliados pela busca.",
          c.nome,
        );
    }
    if (!grupo.habilitados)
      bloquear(
        "habilitacao",
        "Nenhum colaborador possui habilitação cadastrada para esta função.",
        "",
      );
    if (bloqueios.has("habilitacao")) bloqueios.get("habilitacao").total = 0;
    grupo.bloqueios = [...bloqueios.values()];
    grupos.set(key, grupo);
  }
  const capacidade = rel.lacunas.length
    ? diagnosticarEquipe(config, escala.resultado, rel)
    : null;
  const motivos = registro.motivos;
  const bloqueios = [...grupos.values()].flatMap(g=>g.bloqueios);
  const bloqueio = bloqueios.find(b=>b.codigo==="folgas_fim_semana") || (!motivos.length ? bloqueios[0] : null);
  const resumo = bloqueio
    ? bloqueio.texto
    : motivos.length
      ? `${motivos[0].titulo}: ${motivos[0].total} alternativa(s). ${motivos[0].orientacao}`
      : "Confira a triagem das lacunas e as configurações preservadas abaixo.";
  return {
    versao: 1,
    ...registro,
    encerramento: estado,
    resumo,
    lacunas: [...grupos.values()],
    lacunasLimitadas,
    capacidade: capacidade
      ? {
          status: capacidade.status,
          titulo:
            capacidade.status === "redistribuicao"
              ? ampliada
                ? "A busca de redistribuição ainda não fechou a cobertura com segurança."
                : "A capacidade agregada não demonstra falta de pessoal, mas a busca inicial ainda não fechou a cobertura."
              : TITULOS_DIAGNOSTICO[capacidade.status],
          provas: capacidade.provas.slice(0, 4).map((p) => p.mensagem),
          avisos: capacidade.avisos.slice(0, 4),
          orientacao:
            capacidade.status === "capacidade_insuficiente"
              ? "Há limites de capacidade demonstrados nas condições cadastradas. Avalie reforço parcial/temporário, disponibilidade e dimensionamento da operação; a quantidade e o tipo de contratação dependem dessa revisão."
              : `${capacidade.status === "redistribuicao" ? (ampliada ? `Foram avaliadas ${registro.tipos.find((t) => t.tipo === "redistribuicao_combinada")?.avaliadas || 0} sequências de operações dentro dos limites desta busca. Outros arranjos podem existir. ` : "Use Buscar ajustes de cobertura para testar mudanças encadeadas. ") : ""}O insucesso desta busca não prova que contratar seja a única saída. Capacidade total, cobertura por horário e cumprimento da meta contratual são análises diferentes.`,
        }
      : null,
  };
}

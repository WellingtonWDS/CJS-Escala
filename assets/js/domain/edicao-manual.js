import { configDaEscala } from "./contexto-escala.js";
import { createDomain } from "./index.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { analisarCobertura } from "./cobertura.js";
import { violacoesDia } from "./restricoes.js";
import { janelasDeclaradas } from "./disponibilidade.js";
import { funcaoDoDia, habilitadoPara } from "./funcoes.js";
import { apurarSemana } from "./resumo-semanal.js";
import { referenciaSemana, VERSAO_REGRAS, unirDias } from "./ec141.js";
import { dateFromKey, getMonday, isoDate, fmtHoras } from "./datas-horas.js";
import {
  assinaturaAjustes,
  substituirDiasDaEscala,
  criarFolga,
  criarHorarioCompativel,
  permiteFolga,
  buscarAjustesCobertura,
  coberturaNaoPiora,
  atualizarRelatoriosAjustes,
} from "./ajustes-cobertura.js";
const trabalha = (d) => ["T", "FE"].includes(d.status) && d.horas > 0;
const semana = (data) => {
  const d = getMonday(dateFromKey(data));
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
};
const diasSemana = (r, key) =>
  unirDias(r.diasContexto, r.diasApuracao, r.dias).filter(
    (d) => semana(d.data) === key,
  );
function contexto(state) {
  const config = configDaEscala(state),
    escala = config.escalaGerada,
    registro = escala?.ultimaEdicaoManual;
  if (!registro || registro.assinatura !== assinaturaAjustes(config))
    throw new Error(
      "A escala mudou. Faça uma nova edição para recalcular as sugestões.",
    );
  const r = escala.resultado.find(
      (r) => r.colaborador.id === registro.colaboradorId,
    ),
    dia = r?.dias.find((d) => d.data === registro.data);
  if (!dia) throw new Error("Não foi possível localizar o dia editado.");
  const antes = substituirDiasDaEscala(escala, [
    {
      colaboradorId: registro.colaboradorId,
      data: registro.data,
      depois: registro.antes,
    },
  ]);
  return { config, escala, registro, r, dia, antes };
}
export function resumirEdicaoManual(state) {
  const { config, registro, r, dia } = contexto(state),
    key = semana(dia.data),
    dias = diasSemana(r, key),
    individual = configDoPerfil(config, r.colaborador) || config;
  const apuracao = apurarSemana(r.colaborador, dias, config),
    ref = referenciaSemana(individual, dias, r.colaborador);
  const exigidos = Math.max(
      ref.folgas,
      individual.tipoEscala === "5x2" ? 2 : 1,
    ),
    repousos = dias.filter((d) => ["F", "FC"].includes(d.status)).length;
  const avisos = [];
  if (repousos < exigidos)
    avisos.push(
      `A semana ficou com ${repousos} dia(s) de repouso; referência do modelo: ${exigidos}. Escolha outro dia para a folga e confira eventuais condições coletivas.`,
    );
  if (
    Number.isFinite(apuracao.alvo) &&
    apuracao.computadas > apuracao.alvo + 0.001
  )
    avisos.push(
      `A semana soma ${fmtHoras(apuracao.computadas)} horas computadas, acima do alvo de ${fmtHoras(apuracao.alvo)}. A folga retirada não pode simplesmente virar um dia extra de trabalho.`,
    );
  const erros = createDomain(config)
    .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
    .filter((i) => i.severidade === "erro");
  if (erros.length)
    avisos.push(
      "A escala contém incompatibilidades. A alteração é um rascunho até a revisão; as ocorrências continuam listadas antes da grade.",
    );
  return {
    nome: r.colaborador.nome,
    data: registro.data,
    semana: key,
    horas: apuracao.computadas,
    alvo: apuracao.alvo,
    repousos,
    exigidos,
    avisos,
    antes: registro.antes,
    depois: dia,
  };
}
function diferencas(antes, depois) {
  const out = [];
  for (const r of depois.resultado) {
    const base = antes.resultado.find(
      (b) => b.colaborador.id === r.colaborador.id,
    );
    for (const d of r.dias) {
      const a = base?.dias.find((a) => a.data === d.data);
      if (a && JSON.stringify(a) !== JSON.stringify(d))
        out.push({
          colaboradorId: r.colaborador.id,
          data: d.data,
          antes: structuredClone(a),
          depois: structuredClone(d),
        });
    }
  }
  return out;
}
function permitido(config, original, novo, registro, alteracoes) {
  const domain = createDomain(config),
    editado = novo.resultado
      .find((r) => r.colaborador.id === registro.colaboradorId)
      ?.dias.find((d) => d.data === registro.data);
  if (trabalha(registro.antes) !== trabalha(editado)) {
    const pessoa = novo.resultado.find(
      (r) => r.colaborador.id === registro.colaboradorId,
    );
    const dias = diasSemana(pessoa, semana(registro.data));
    const anteriores = diasSemana(
      original.resultado.find(
        (r) => r.colaborador.id === registro.colaboradorId,
      ),
      semana(registro.data),
    ).map((d) => (d.data === registro.data ? registro.antes : d));
    if (dias.filter(trabalha).length !== anteriores.filter(trabalha).length)
      return false;
  }
  const atual = original.resultado
    .find((r) => r.colaborador.id === registro.colaboradorId)
    ?.dias.find((d) => d.data === registro.data);
  if (JSON.stringify(editado) !== JSON.stringify(atual)) return false;
  for (const id of new Set([
    registro.colaboradorId,
    ...alteracoes.map((a) => a.colaboradorId),
  ])) {
    const r = novo.resultado.find((r) => r.colaborador.id === id);
    if (
      !r ||
      domain
        .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
        .some((i) => i.severidade === "erro")
    )
      return false;
    if (id !== registro.colaboradorId) {
      const anterior = original.resultado.find((r) => r.colaborador.id === id),
        key = semana(registro.data),
        dAntes = diasSemana(anterior, key),
        dDepois = diasSemana(r, key);
      if (
        Math.abs(
          apurarSemana(r.colaborador, dAntes, config).computadas -
            apurarSemana(r.colaborador, dDepois, config).computadas,
        ) > 0.001 ||
        dAntes.filter(trabalha).length !== dDepois.filter(trabalha).length
      )
        return false;
    }
    for (const a of alteracoes.filter((a) => a.colaboradorId === id)) {
      const velho = original.resultado
        .find((r) => r.colaborador.id === id)
        ?.dias.find((d) => d.data === a.data);
      if (
        !velho ||
        velho.ajusteManual ||
        semana(a.data) !== semana(registro.data) ||
        velho.restricao ||
        velho.status === "NC"
      )
        return false;
      const d = r.dias.find((d) => d.data === a.data);
      if (violacoesDia(r.colaborador, d).length) return false;
      if (
        trabalha(d) &&
        (!habilitadoPara(r.colaborador, funcaoDoDia(r.colaborador, d)) ||
          !janelasDeclaradas(config, r.colaborador, d).some(
            (j) => d.entradaMin >= j.inicio && d.saidaMin <= j.fim,
          ))
      )
        return false;
      if (
        trabalha(velho) &&
        !trabalha(d) &&
        !permiteFolga(config, r.colaborador, velho)
      )
        return false;
    }
  }
  return true;
}
export function buscarReadequacoesManuais(state, opcoes = {}) {
  const { config, escala, registro, r, dia, antes } = contexto(state),
    resumo = resumirEdicaoManual(config),
    individual = configDoPerfil(config, r.colaborador) || config;
  const relAntes = analisarCobertura(config, antes.resultado),
    avaliavel =
      relAntes.configurada &&
      relAntes.periodos.length > 0 &&
      !relAntes.avisos.length;
  const retorno = {
    assinatura: registro.assinatura,
    versaoRegras: VERSAO_REGRAS,
    resumo,
    alternativas: [],
    avisos: [],
    semAjustesNecessarios: false,
  };
  if (individual.tipoEscala === "12x36" || individual.cicloQuadro) {
    retorno.avisos.push(
      "Ciclos 12×36 e ciclos importados não recebem troca automática de folga. Revise o ciclo e a âncora antes de manter a alteração.",
    );
    return retorno;
  }
  const mudouTrabalho = trabalha(dia) !== trabalha(registro.antes),
    bases = [];
  bases.push({ escala, diaFolga: null });
  if (mudouTrabalho)
    for (const d of r.dias) {
      if (
        d.data === dia.data ||
        semana(d.data) !== semana(dia.data) ||
        d.ajusteManual ||
        d.restricao ||
        d.feriado
      )
        continue;
      let novo = null;
      if (
        trabalha(dia) &&
        trabalha(d) &&
        permiteFolga(config, r.colaborador, d)
      )
        novo = { ...criarFolga(d), ajusteManual: true };
      if (
        !trabalha(dia) &&
        d.status === "F" &&
        !(individual.folgasFimSemana && [0, 6].includes(d.weekday))
      )
        novo = criarHorarioCompativel(
          config,
          r.colaborador,
          d,
          registro.antes,
          registro.antes.entradaMin,
          funcaoDoDia(r.colaborador, registro.antes),
        );
      if (!novo) continue;
      novo.ajusteManual = true;
      bases.push({
        escala: substituirDiasDaEscala(escala, [
          { colaboradorId: r.colaborador.id, data: d.data, depois: novo },
        ]),
        diaFolga: trabalha(dia) ? d.data : dia.data,
      });
    }
  let avaliadas = 0;
  for (const base of bases.slice(0, 7)) {
    opcoes.onProgresso?.({
      avaliadas: avaliadas++,
      total: Math.min(7, bases.length),
    });
    let nova = base.escala;
    if (
      avaliavel &&
      !coberturaNaoPiora(relAntes, analisarCobertura(config, nova.resultado))
    ) {
      const plano = buscarAjustesCobertura(
        { ...config, escalaGerada: nova },
        { limiteTentativas: 100, limiteAcoes: 8 },
      );
      if (plano.alteracoes.length)
        nova = substituirDiasDaEscala(nova, plano.alteracoes);
    }
    const alteracoes = diferencas(escala, nova),
      rel = analisarCobertura(config, nova.resultado);
    if (!permitido(config, escala, nova, registro, alteracoes)) continue;
    if (avaliavel && !coberturaNaoPiora(relAntes, rel)) continue;
    // A troca não pode criar horas além da meta semanal do colaborador editado.
    const pessoa = nova.resultado.find(
        (x) => x.colaborador.id === r.colaborador.id,
      ),
      apuracao = apurarSemana(
        pessoa.colaborador,
        diasSemana(pessoa, semana(dia.data)),
        config,
      );
    if (
      Number.isFinite(apuracao.alvo) &&
      apuracao.computadas > apuracao.alvo + 0.001
    )
      continue;
    if (!alteracoes.length) {
      retorno.semAjustesNecessarios = true;
      continue;
    }
    const adicionais = new Set(
      alteracoes
        .filter((a) => a.colaboradorId !== registro.colaboradorId)
        .map((a) => a.colaboradorId),
    ).size;
    retorno.alternativas.push({
      diaFolga: base.diaFolga,
      alteracoes,
      adicionais,
      horas: apuracao.computadas,
      alvo: apuracao.alvo,
      coberturaAvaliada: !!avaliavel,
      coberturaCompleta: !!avaliavel && !rel.lacunas.length,
      assinaturaDepois: assinaturaAjustes(config, nova),
    });
  }
  if (retorno.semAjustesNecessarios) retorno.alternativas = [];
  retorno.alternativas.sort(
    (a, b) =>
      a.adicionais - b.adicionais ||
      a.alteracoes.length - b.alteracoes.length ||
      (a.diaFolga || "").localeCompare(b.diaFolga || ""),
  );
  if (!avaliavel)
    retorno.avisos.push(
      "Cobertura não avaliada: ative faixas válidas para conferir o impacto sobre a operação.",
    );
  if (!retorno.alternativas.length && !retorno.semAjustesNecessarios)
    retorno.avisos.push(
      "Não foi encontrada readequação segura nesta busca limitada. Revise os erros, folgas fixas, disponibilidades e a cobertura. Isso não comprova necessidade de contratação.",
    );
  opcoes.onProgresso?.({ avaliadas, total: Math.min(7, bases.length) });
  return retorno;
}
export function aplicarReadequacaoManual(state, plano, indice) {
  const { config, escala, registro, antes } = contexto(state),
    opcao = plano?.alternativas?.[indice];
  if (
    plano?.versaoRegras !== VERSAO_REGRAS ||
    plano.assinatura !== assinaturaAjustes(config) ||
    !opcao
  )
    throw new Error("A sugestão está desatualizada. Busque novamente.");
  const novo = substituirDiasDaEscala(escala, opcao.alteracoes);
  const rel = analisarCobertura(config, antes.resultado),
    avaliavel =
      rel.configurada && rel.periodos.length > 0 && !rel.avisos.length;
  if (
    assinaturaAjustes(config, novo) !== opcao.assinaturaDepois ||
    !permitido(config, escala, novo, registro, opcao.alteracoes) ||
    (avaliavel &&
      !coberturaNaoPiora(rel, analisarCobertura(config, novo.resultado)))
  )
    throw new Error(
      "A proposta não passou pela conferência. Revise a edição e busque novamente.",
    );
  const pessoa = novo.resultado.find(
      (r) => r.colaborador.id === registro.colaboradorId,
    ),
    a = apurarSemana(
      pessoa.colaborador,
      diasSemana(pessoa, semana(registro.data)),
      config,
    );
  if (Number.isFinite(a.alvo) && a.computadas > a.alvo + 0.001)
    throw new Error("A troca ultrapassaria o alvo semanal.");
  delete novo.ultimaEdicaoManual;
  return atualizarRelatoriosAjustes(config, novo);
}
export function desfazerUltimaEdicaoManual(state) {
  const { config, antes } = contexto(state);
  delete antes.ultimaEdicaoManual;
  return atualizarRelatoriosAjustes(config, antes);
}

import { preencherSexoPorNome } from "../domain/sexo-por-nome.js";
import {
  ciclo12x36,
  computoDaJornada,
  politicaPlantaoDeclarada,
} from "../domain/computo-cct.js";
import {
  normalizarJornada,
  jornadaValidaEstrutural,
  timeToMin,
} from "../domain/datas-horas.js";
import { dataValida } from "../domain/ec141.js";
import { createDefaultState } from "../state/store.js";
export const texto = (value) => String(value ?? "").trim();
const norm = (value) =>
  texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const DIA = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};
const COLUNAS = {
  codigo: "codigo",
  nome: "nome",
  datadeadmissao: "admissao",
  cargo: "cargo",
  nctps: "ctps",
  noctps: "ctps",
  serie: "serie",
  diasdasemana: "dia",
  entrada: "entrada",
  intervalo: "intervalo",
  saida: "saida",
  compensadofolga: "situacao",
  vistofiscal: "vistoFiscal",
};
export function interpretarDias(label) {
  const value = norm(label);
  const ciclo = value.match(/^(\d{1,2})(?:o)?dia$/);
  if (ciclo) return { ciclo: Number(ciclo[1]) };
  const dias = Object.keys(DIA)
    .filter((d) => value.includes(d))
    .sort((a, b) => value.indexOf(a) - value.indexOf(b));
  if (!dias.length) return null;
  if (
    dias.length === 2 &&
    /(?:a|ate)/.test(
      value.slice(
        value.indexOf(dias[0]) + dias[0].length,
        value.indexOf(dias[1]),
      ),
    )
  ) {
    const inicio = DIA[dias[0]],
      fim = DIA[dias[1]],
      result = [];
    for (let d = inicio; result.length < 7; d = (d + 1) % 7) {
      result.push(d);
      if (d === fim) break;
    }
    return { dias: result };
  }
  return { dias: dias.map((d) => DIA[d]) };
}
export function interpretarHorario(entrada, intervalo, saida, situacao) {
  if (/compensado/.test(norm(situacao))) {
    const h = interpretarHorario(entrada, intervalo, saida, "");
    return {
      status: "compensado",
      situacao: texto(situacao),
      ...(h.status === "trabalho" ? { jornada: h.jornada } : {}),
    };
  }
  if (/folga|repouso/.test(norm(situacao)))
    return { status: "folga", situacao: texto(situacao) };
  const a = texto(entrada),
    b = texto(saida),
    pausa = texto(intervalo);
  if (
    !Number.isFinite(timeToMin(a)) ||
    !Number.isFinite(timeToMin(b)) ||
    a === b
  )
    return {
      status: "nao_informado",
      jornada: { entrada: a, intInicio: b, intFim: b, saida: b },
      motivo:
        "Entrada e saída ausentes ou iguais, sem indicação explícita de folga.",
    };
  let inicio = b,
    fim = b;
  if (pausa) {
    const match = pausa.match(
      /^(\d{1,2}:\d{2})\s*(?:as|às|a|à|[-–])\s*(\d{1,2}:\d{2})$/i,
    );
    if (!match)
      return {
        status: "nao_informado",
        motivo: "Intervalo não reconhecido: " + pausa,
      };
    inicio = match[1].padStart(5, "0");
    fim = match[2].padStart(5, "0");
  }
  const jornada = { entrada: a, intInicio: inicio, intFim: fim, saida: b };
  const j = normalizarJornada(jornada);
  let duracao = timeToMin(b) - timeToMin(a);
  if (duracao <= 0) duracao += 1440;
  if (
    !j ||
    !jornadaValidaEstrutural(jornada) ||
    j.saida - j.entrada !== duracao
  )
    return {
      status: "nao_informado",
      jornada,
      motivo:
        "Intervalo fora da jornada ou horário inconsistente; confira os valores originais.",
    };
  return {
    status: "trabalho",
    jornada,
    horas: (duracao - j.intervalo) / 60,
    semIntervalo: !pausa,
  };
}

export function atualizarPerfilDominio(c, config) {
  const p = c.quadroDominio;
  if (!p) return;
  const entradas = Object.values(p.tipo === "ciclo" ? p.ciclo : p.semana);
  p.pendencias = [];
  for (const [key, h] of Object.entries(
    p.tipo === "ciclo" ? p.ciclo : p.semana,
  )) {
    if (h.status === "trabalho") {
      const j = normalizarJornada(h.jornada);
      if (!j || !jornadaValidaEstrutural(h.jornada)) {
        p.pendencias.push(`Dia ${key}: horário inválido.`);
        continue;
      }
      h.horas = (j.saida - j.entrada - j.intervalo) / 60;
      if (h.horas > 6 && j.intervalo === 0)
        p.pendencias.push(
          `Dia ${key}: jornada de ${h.horas}h sem intervalo informado.`,
        );
    } else if (
      h.status !== "folga" &&
      !(p.tipo === "semanal" && key === "6" && h.status === "compensado")
    )
      p.pendencias.push(
        `Dia ${key}: ${h.motivo || "horário não informado; defina trabalho ou folga."}`,
      );
  }
  if (p.tipo === "ciclo" && !dataValida(p.ancora))
    p.pendencias.push(
      "Informe a data em que ocorre o 1º dia do ciclo para este colaborador.",
    );
  if (p.admissao && !dataValida(p.admissaoIso))
    p.pendencias.push(
      "Confira a data de admissão, que está ausente ou inválida.",
    );
  if (c.sexo === "nao_informado")
    p.pendencias.push(
      "Sexo não consta no relatório; informe para avaliar regras específicas de repouso aos domingos.",
    );
  const completos = entradas.every(
    (h) =>
      h.status === "folga" ||
      (p.tipo === "semanal" &&
        p.semana?.[6] === h &&
        h.status === "compensado") ||
      (h.status === "trabalho" && jornadaValidaEstrutural(h.jornada)),
  );
  p.horasCalculadas = completos
    ? Math.round(
        entradas.reduce(
          (s, h) => s + (h.status === "trabalho" ? h.horas : 0),
          0,
        ) *
          (p.tipo === "ciclo" ? 7 / entradas.length : 1) *
          100,
      ) / 100
    : null;
  p.horasComputadasCalculadas =
    config &&
    completos &&
    politicaPlantaoDeclarada(config) &&
    ciclo12x36(config, p)
      ? Math.round(
          ((entradas.reduce(
            (s, h) =>
              s +
              (h.status === "trabalho"
                ? computoDaJornada(
                    { ...config, tipoEscala: "12x36" },
                    h.jornada,
                    "",
                    true,
                  ).horasComputadasCCT
                : 0),
            0,
          ) *
            7) /
            entradas.length) *
            100,
        ) / 100
      : null;
  if (!p.cargaConfirmada)
    c.horasSemana = p.horasComputadasCalculadas ?? p.horasCalculadas;
  if (Number(c.horasSemana) > 44)
    p.pendencias.push(
      "ERRO: jornada contratual de referência acima de 44h semanais. Corrija a carga contratual; horas extras não integram este campo.",
    );
  const calculadas = p.horasComputadasCalculadas ?? p.horasCalculadas;
  if (
    p.cargaConfirmada &&
    Number.isFinite(calculadas) &&
    Number.isFinite(c.horasSemana) &&
    Math.abs(calculadas - c.horasSemana) > 0.01
  )
    p.pendencias.push(
      `Carga incoerente: os horários somam ${calculadas}h/semana e a carga contratual mantida é ${c.horasSemana}h. Revise os horários, o contrato e eventual reposição no sábado; marcar a confirmação não elimina a diferença.`,
    );
  const dias = Object.entries(p.semana)
    .filter(([, h]) => h.status === "trabalho" || h.status === "compensado")
    .map(([d]) => Number(d));
  p.modelo =
    p.tipo === "ciclo"
      ? "ciclo"
      : dias.length === 6
        ? "6x1"
        : dias.length === 5
          ? "5x2"
          : "custom";
}

export function analisarQuadroDominio(abas, arquivo = "") {
  let empresa = {
    codigo: "",
    nome: "",
    empregador: "",
    cnpj: "",
    endereco: "",
    paginas: [],
    titulo: "",
    licenciadoPara: "",
  };
  const pessoas = new Map(),
    extras = [],
    avisos = [];
  let reconhecido = false;
  for (const aba of abas) {
    let columns = null,
      atual = null;
    for (let i = 0; i < aba.linhas.length; i++) {
      const row = aba.linhas[i],
        values = row.map(texto),
        keys = values.map(norm);
      if (
        keys.includes("codigo") &&
        keys.includes("nome") &&
        keys.includes("diasdasemana")
      ) {
        columns = {};
        keys.forEach((key, col) => {
          if (Object.hasOwn(COLUNAS, key)) columns[COLUNAS[key]] = col;
        });
        if (
          ![
            "nome",
            "cargo",
            "dia",
            "entrada",
            "intervalo",
            "saida",
            "situacao",
          ].every((k) => k in columns)
        )
          throw new Error(
            `Aba ${aba.nome}, linha ${i + 1}: cabeçalho incompleto do Quadro de Horário de Trabalho.`,
          );
        reconhecido = true;
        continue;
      }
      const primeiro = keys.findIndex(Boolean),
        tag = keys[primeiro];
      if (["empresa", "cnpj", "empregador", "endereco"].includes(tag)) {
        const valor = values.slice(primeiro + 1).find(Boolean) || "";
        if (tag === "empresa") {
          const m = valor.match(/^(\d+)\s*-\s*(.*)$/);
          if (m) {
            empresa.codigo = m[1];
            empresa.nome = m[2];
          } else empresa.nome = valor;
        } else {
          if (tag === "cnpj" && empresa.cnpj && empresa.cnpj !== valor)
            throw new Error(
              "O arquivo contém empresas diferentes. Importe uma empresa por vez.",
            );
          empresa[tag] = valor;
        }
        extras.push({ aba: aba.nome, linha: i + 1, celulas: values });
        const page = keys.indexOf("pagina");
        if (page >= 0) {
          const value = values.slice(page + 1).find(Boolean);
          if (value && !empresa.paginas.includes(value))
            empresa.paginas.push(value);
        }
        continue;
      }
      if (tag === "horariodetrabalho") {
        empresa.titulo = values[primeiro];
        continue;
      }
      if (tag?.startsWith("sistemalicenciadopara")) {
        empresa.licenciadoPara = values[primeiro];
        continue;
      }
      if (!columns || !values.some(Boolean)) continue;
      const val = (k) => values[columns[k]] || "";
      if (val("nome") && val("codigo")) {
        const code = val("codigo"),
          anterior = pessoas.get(code);
        if (
          anterior &&
          (anterior.nome !== val("nome") || anterior.cargo !== val("cargo"))
        )
          throw new Error(
            `Código ${code} repetido com dados diferentes. Importe relatórios de uma empresa por vez.`,
          );
        atual = anterior || {
          nome: val("nome"),
          cargo: val("cargo"),
          sexo: "nao_informado",
          horasSemana: null,
          quadroDominio: {
            codigo: code,
            admissao: val("admissao"),
            ctps: val("ctps"),
            serie: val("serie"),
            vistoFiscal: val("vistoFiscal"),
            arquivo,
            aba: aba.nome,
            linha: i + 1,
            tipo: "semanal",
            semana: {},
            ciclo: {},
            linhasOriginais: [],
            cargaConfirmada: false,
            ancora: "",
          },
        };
        pessoas.set(code, atual);
        const adm = atual.quadroDominio.admissao.match(
          /^(\d{2})\/(\d{2})\/(\d{4})$/,
        );
        if (adm) {
          const iso = `${adm[3]}-${adm[2]}-${adm[1]}`;
          if (dataValida(iso)) atual.quadroDominio.admissaoIso = iso;
        }
      }
      if (!atual || !val("dia")) {
        extras.push({ aba: aba.nome, linha: i + 1, celulas: values });
        continue;
      }
      const dias = interpretarDias(val("dia"));
      const horario = interpretarHorario(
        val("entrada"),
        val("intervalo"),
        val("saida"),
        val("situacao"),
      );
      const original = {
        aba: aba.nome,
        linha: i + 1,
        dias: val("dia"),
        entrada: val("entrada"),
        intervalo: val("intervalo"),
        saida: val("saida"),
        situacao: val("situacao"),
        celulas: values,
      };
      atual.quadroDominio.linhasOriginais.push(original);
      if (!dias)
        throw new Error(
          `Aba ${aba.nome}, linha ${i + 1}: dia ou ciclo não reconhecido: ${val("dia")}.`,
        );
      if (dias.ciclo) {
        if (dias.ciclo > 31)
          throw new Error("Ciclo com mais de 31 dias não suportado.");
        atual.quadroDominio.tipo = "ciclo";
        atual.quadroDominio.ciclo[dias.ciclo] = structuredClone(
          horario.status === "compensado"
            ? { ...horario, status: "folga" }
            : horario,
        );
      } else
        for (const dia of dias.dias) {
          const doDia =
            horario.status === "compensado" && dia !== 6
              ? { ...horario, status: "folga" }
              : horario;
          const anterior = atual.quadroDominio.semana[dia];
          if (anterior && JSON.stringify(anterior) !== JSON.stringify(doDia)) {
            atual.quadroDominio.semana[dia] = {
              status: "nao_informado",
              motivo:
                "Linhas do relatório divergem para este dia; confira os dados originais.",
            };
          } else atual.quadroDominio.semana[dia] = structuredClone(doDia);
        }
    }
  }
  if (!reconhecido || !pessoas.size || !empresa.nome)
    throw new Error(
      "Não foi identificado um Quadro de Horário de Trabalho da Domínio com empresa e colaboradores.",
    );
  if (pessoas.size > 500)
    throw new Error("Limite de 500 colaboradores por importação.");
  const colaboradores = [...pessoas.values()];
  for (const c of colaboradores) {
    const p = c.quadroDominio;
    if (!c.cargo) throw new Error(`Código ${p.codigo}: cargo não informado.`);
    if (p.tipo === "semanal")
      for (let d = 0; d < 7; d++)
        p.semana[d] ??= {
          status: "folga",
          ausente: true,
          motivo: "Dia da semana não listado no relatório; considerado folga.",
        };
    else
      for (let d = 1; d <= Math.max(...Object.keys(p.ciclo).map(Number)); d++)
        p.ciclo[d] ??= { status: "nao_informado", ausente: true };
    atualizarPerfilDominio(c);
  }
  if (colaboradores.some((c) => c.quadroDominio.pendencias.length))
    avisos.push(
      "Há dados que precisam de revisão. Confira as pendências no cadastro dos colaboradores.",
    );
  return { empresa, colaboradores, avisos, extras, arquivo };
}

export function prepararDominio(state, quadro, modo) {
  if (!["adicionar", "substituir"].includes(modo))
    throw new Error("Escolha adicionar ou substituir.");
  if (
    modo === "adicionar" &&
    state.empresaDominio?.cnpj &&
    state.empresaDominio.cnpj !== quadro.empresa.cnpj
  )
    throw new Error(
      "O cadastro atual pertence a outra empresa. Use substituir para importar esta empresa separadamente.",
    );
  const atuais = modo === "adicionar" ? state.colaboradores : [];
  if (atuais.length + quadro.colaboradores.length > 500)
    throw new Error("O cadastro resultante excede 500 colaboradores.");
  const codigos = new Set(
    atuais.filter((c) => c.quadroDominio).map((c) => c.quadroDominio.codigo),
  );
  if (quadro.colaboradores.some((c) => codigos.has(c.quadroDominio.codigo)))
    throw new Error(
      "Há códigos da Domínio já cadastrados. Use substituir ou revise o arquivo para evitar duplicar pessoas.",
    );
  let id = Math.max(
    state.proximoId || 1,
    ...state.colaboradores.map((c) => c.id + 1),
  );
  const novos = structuredClone(quadro.colaboradores).map((c) => {
    c.id = id++;
    preencherSexoPorNome(c);
    for (const h of Object.values(c.quadroDominio.semana))
      if (h.ausente && h.status === "nao_informado") {
        h.status = "folga";
        h.motivo = "Dia da semana não listado no relatório; considerado folga.";
      }
    atualizarPerfilDominio(c);
    return c;
  });
  const colaboradores = [...atuais, ...novos];
  const trocaEmpresa =
    state.empresaDominio?.cnpj &&
    state.empresaDominio.cnpj !== quadro.empresa.cnpj;
  const padrao = trocaEmpresa
    ? createDefaultState(new Date(state.ano, state.mes, 1))
    : null;
  const reset = padrao
    ? {
        coberturaAtiva: false,
        demandasCobertura: [],
        proximaDemandaId: 1,
        instrumentoCompensacao: "nenhuma",
        instrumentoColetivo: padrao.instrumentoColetivo,
        feriados: [],
        feriadosLocais: [],
        feriadosConfigurados: [],
        feriadosExcluidos: [],
        politicaFeriados: padrao.politicaFeriados,
      }
    : {};
  const tipos = new Set(
    colaboradores.map((c) => c.quadroDominio?.modelo || state.tipoEscala),
  );
  const dias = new Set();
  for (const c of colaboradores)
    for (const [d, h] of Object.entries(c.quadroDominio?.semana || {}))
      if (h.status === "trabalho") dias.add(Number(d));
  if (colaboradores.some((c) => c.quadroDominio?.tipo === "ciclo"))
    for (let d = 0; d < 7; d++) dias.add(d);
  return {
    ...reset,
    colaboradores,
    proximoId: id,
    empresaDominio: structuredClone(quadro.empresa),
    relatorioDominio: {
      arquivo: quadro.arquivo,
      extras: structuredClone(quadro.extras),
      avisos: quadro.avisos,
    },
    tipoEscala:
      tipos.size === 1 && !tipos.has("ciclo") ? [...tipos][0] : "custom",
    diasTrabalho: [
      ...new Set([
        ...(modo === "adicionar" ? state.diasTrabalho : []),
        ...dias,
      ]),
    ].sort(),
    turnosRevezamento: false,
    folgasFimSemana: false,
  };
}

/* Relatório "Horário de Trabalho" da SCI Sistemas (folha SCI Visual Practice),
 * exportado em PDF. O PDF é lido no navegador e convertido para a mesma
 * estrutura da importação Domínio (empresa + colaboradores com horário semanal),
 * reaproveitando prévia, aplicação, pendências e perfil individual.
 *
 * O relatório não traz CNPJ nem data de admissão: o CNPJ é pedido ao usuário
 * antes de confirmar; a admissão fica em branco. Nada é presumido. */
import { interpretarDias, interpretarHorario, atualizarPerfilDominio, texto } from "./dominio.js";

export const MAX_SCI_BYTES = 5 * 1024 * 1024;
export const MAX_SCI_PAGINAS = 50;

const semAcento = (v) => texto(v).normalize("NFD").replace(/[̀-ͯ]/g, "");
const chave = (v) => semAcento(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const HORA = "\\d{1,2}:\\d{2}";
const ABREVIACOES = { dom: "domingo", seg: "segunda", ter: "terca", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sabado" };

/** Agrupa os trechos de texto de cada página em linhas (mesma altura) ordenadas. */
export function linhasDasPaginas(paginas) {
  const linhas = [];
  paginas.forEach((itens, indice) => {
    const grupos = [];
    for (const item of itens) {
      if (!texto(item.str)) continue;
      let g = grupos.find((x) => Math.abs(x.y - item.y) <= 2.5);
      if (!g) grupos.push((g = { y: item.y, itens: [] }));
      g.itens.push({ str: item.str, x: item.x });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x);
      linhas.push({ pagina: indice + 1, y: g.y, itens: g.itens,
        texto: g.itens.map((i) => texto(i.str)).join(" ").replace(/\s+/g, " ").trim() });
    }
  });
  return linhas;
}

/** "Seg, Ter, Qua, Qui, Sex", "Seg a Sex", "Sábado" → dias da semana. */
export function diasSCI(rotulo) {
  const expandido = semAcento(rotulo).toLowerCase()
    .replace(/\b(dom|seg|ter|qua|qui|sex|sab)\b\.?/g, (m, a) => ABREVIACOES[a]);
  const r = interpretarDias(expandido);
  return r?.dias ? r.dias : null;
}

function horarioDaLinha(entrada, intInicio, intFim, saida) {
  const intervalo = intInicio && intFim ? `${intInicio} as ${intFim}` : "";
  return interpretarHorario(entrada, intervalo, saida, "");
}

export function analisarHorarioSCI(paginas, arquivo = "") {
  if (paginas.length > MAX_SCI_PAGINAS) throw new Error(`O PDF excede ${MAX_SCI_PAGINAS} páginas.`);
  const linhas = linhasDasPaginas(paginas);
  const empresa = { codigo: "", nome: "", empregador: "", cnpj: "", endereco: "", atividade: "",
    paginas: [], titulo: "", licenciadoPara: "", sistema: "SCI" };
  const pessoas = new Map(), extras = [], avisos = [];
  const antesDoTitulo = [];
  let reconhecido = false, cabecalho = null, atual = null, rodape = false, linhaPagina = 0, paginaAtual = 0;
  const agendar = (p, dias, horario, original) => {
    p.quadroDominio.linhasOriginais.push(original);
    for (const dia of dias) {
      const anterior = p.quadroDominio.semana[dia];
      if (anterior && JSON.stringify(anterior) !== JSON.stringify(horario))
        p.quadroDominio.semana[dia] = { status: "nao_informado",
          motivo: "Linhas do relatório divergem para este dia; confira os dados originais." };
      else p.quadroDominio.semana[dia] = structuredClone(horario);
    }
  };
  for (const linha of linhas) {
    if (linha.pagina !== paginaAtual) { paginaAtual = linha.pagina; linhaPagina = 0; rodape = false; cabecalho = null; }
    linhaPagina++;
    const t = linha.texto, k = chave(t);
    const origem = { aba: `Página ${linha.pagina}`, linha: linhaPagina, celulas: [t] };
    // Cabeçalho, repetido em cada página.
    if (/pag\d+$/.test(k) && (!reconhecido || linhaPagina <= 2)) {
      const pagina = t.match(/Pag:?\s*(\d+)/i)?.[1];
      if (pagina && !empresa.paginas.includes(pagina)) empresa.paginas.push(pagina);
      const resto = texto(t.replace(/Pag:?\s*\d+\s*$/i, ""));
      if (resto && !reconhecido) antesDoTitulo.push(resto);
      continue;
    }
    if (k.includes("horariodetrabalho")) {
      // Antes do título: escritório (quem emitiu) e razão social da empresa.
      if (!reconhecido) { empresa.licenciadoPara ||= antesDoTitulo[0] || ""; empresa.nome ||= antesDoTitulo.at(-1) || ""; }
      reconhecido = true; empresa.titulo = "HORÁRIO DE TRABALHO"; continue;
    }
    const campo = t.match(/^(Empregador|Endere[cç]o|Atividade)\s*:\s*(.*)$/i);
    if (campo) {
      const nome = chave(campo[1]), valor = texto(campo[2]);
      if (nome === "empregador") {
        if (empresa.empregador && empresa.empregador !== valor)
          throw new Error("O arquivo contém empresas diferentes. Importe uma empresa por vez.");
        empresa.empregador = valor; empresa.nome = valor;
      } else if (nome === "endereco") empresa.endereco = valor;
      else empresa.atividade = valor;
      extras.push(origem);
      continue;
    }
    if (k.startsWith("codigo") && k.includes("funcionario") && k.includes("cargo")) {
      cabecalho = Object.fromEntries(linha.itens.map((i) => [chave(i.str), i.x]));
      continue;
    }
    if (!reconhecido) { antesDoTitulo.push(t); continue; }
    if (!cabecalho) continue;
    if (/^mod\.?\s*aprovado|^observa[cç][oõ]es|folhasci|^[A-ZÀ-Ü' ]+,\s*\d{1,2}\s+de\s+/i.test(semAcento(t)) || k.startsWith("folhasci")) {
      rodape = true; extras.push(origem); continue;
    }
    if (rodape) { extras.push(origem); continue; }
    // Linha especial de um dia: "*** SÁBADO : 08:00 as 12:00".
    const especial = t.match(new RegExp(`^\\*+\\s*([A-Za-zÀ-ÿ]+)\\s*:\\s*(${HORA})\\s+(?:(${HORA})\\s+)?as\\s+(?:(${HORA})\\s+)?(${HORA})\\s*$`, "i"));
    const especialTexto = !especial && t.match(/^\*+\s*([A-Za-zÀ-ÿ]+)\s*:\s*(.+)$/);
    if ((especial || especialTexto) && atual) {
      const dias = diasSCI((especial || especialTexto)[1]);
      if (!dias) throw new Error(`Página ${linha.pagina}: dia não reconhecido: ${(especial || especialTexto)[1]}.`);
      const horario = especial
        ? horarioDaLinha(especial[2], especial[3], especial[4], especial[5])
        : interpretarHorario("", "", "", especialTexto[2]).status === "nao_informado"
          ? { status: "nao_informado", motivo: `Indicação não reconhecida: ${especialTexto[2]}.` }
          : interpretarHorario("", "", "", especialTexto[2]);
      agendar(atual, dias, horario, { ...origem, dias: (especial || especialTexto)[1], entrada: especial?.[2] || "",
        intervalo: especial?.[3] ? `${especial[3]} as ${especial[4]}` : "", saida: especial?.[5] || "", situacao: especialTexto?.[2] || "" });
      continue;
    }
    // Linha principal: dias, entrada, intervalo, saída e descanso semanal.
    const jornada = t.match(new RegExp(`^(.+?)\\s+(${HORA})\\s+(?:(${HORA})\\s+)?as\\s+(?:(${HORA})\\s+)?(${HORA})(?:\\s+(.*))?$`, "i"))
      || t.match(new RegExp(`^(.+?)\\s+(${HORA})\\s+()()(${HORA})(?:\\s+(.*))?$`, "i"));
    if (jornada && atual) {
      const dias = diasSCI(jornada[1]);
      if (!dias) throw new Error(`Página ${linha.pagina}: dias não reconhecidos: ${jornada[1]}.`);
      agendar(atual, dias, horarioDaLinha(jornada[2], jornada[3], jornada[4], jornada[5]),
        { ...origem, dias: jornada[1], entrada: jornada[2], intervalo: jornada[3] ? `${jornada[3]} as ${jornada[4]}` : "", saida: jornada[5], situacao: "" });
      const descanso = texto((jornada[6] || "").replace(/_+/g, ""));
      if (descanso) {
        const diasDescanso = diasSCI(descanso);
        if (!diasDescanso) avisos.push(`${atual.nome}: descanso semanal não reconhecido (${descanso}).`);
        else agendar(atual, diasDescanso, { status: "folga", situacao: `Descanso semanal: ${descanso}` },
          { ...origem, dias: descanso, entrada: "", intervalo: "", saida: "", situacao: "Descanso semanal" });
      }
      continue;
    }
    // Início de um funcionário: "51 ALAN PEREIRA DOS SANTOS".
    const inicio = t.match(/^(\d{1,9})\s+(\D.*)$/);
    if (inicio && !new RegExp(HORA).test(t)) {
      const codigo = inicio[1], nome = texto(inicio[2]);
      if (pessoas.has(codigo) && pessoas.get(codigo).nome !== nome)
        throw new Error(`Código ${codigo} repetido com dados diferentes. Importe relatórios de uma empresa por vez.`);
      atual = pessoas.get(codigo) || { nome, cargo: "", sexo: "nao_informado", horasSemana: null,
        quadroDominio: { codigo, admissao: "", ctps: "", serie: "", vistoFiscal: "", arquivo, aba: origem.aba,
          linha: linhaPagina, tipo: "semanal", semana: {}, ciclo: {}, linhasOriginais: [], cargaConfirmada: false,
          ancora: "", sistema: "SCI" } };
      pessoas.set(codigo, atual);
      continue;
    }
    if (!atual) { extras.push(origem); continue; }
    // Cargo e Cart.Trab./Série: números alinhados à coluna da carteira são CTPS e série.
    const limite = (cabecalho.carttrab ?? Infinity) - 30;
    const numeros = [], palavras = [];
    for (const i of linha.itens) {
      const partes = texto(i.str).split(/\s+/).filter(Boolean);
      for (const parte of partes) (/^\d+$/.test(parte) && i.x >= limite ? numeros : palavras).push(parte);
    }
    if (palavras.length && !atual.cargo) atual.cargo = palavras.join(" ");
    else if (palavras.length) extras.push(origem);
    if (numeros.length && !atual.quadroDominio.ctps) {
      atual.quadroDominio.ctps = numeros[0];
      atual.quadroDominio.serie = numeros[1] || "";
    }
  }
  if (!reconhecido || !pessoas.size || !empresa.nome)
    throw new Error("Não foi identificado um relatório Horário de Trabalho da SCI com empresa e funcionários. Exporte o relatório em PDF pela folha SCI.");
  if (pessoas.size > 500) throw new Error("Limite de 500 colaboradores por importação.");
  const colaboradores = [...pessoas.values()];
  for (const c of colaboradores) {
    const p = c.quadroDominio;
    if (!c.cargo) throw new Error(`Código ${p.codigo}: cargo não informado.`);
    if (!p.linhasOriginais.length) throw new Error(`Código ${p.codigo}: horário não encontrado no relatório.`);
    for (let d = 0; d < 7; d++)
      p.semana[d] ??= { status: "folga", ausente: true, motivo: "Dia da semana não listado no relatório; considerado folga." };
    atualizarPerfilDominio(c);
  }
  if (colaboradores.some((c) => c.quadroDominio.pendencias.length))
    avisos.push("Há dados que precisam de revisão. Confira as pendências no cadastro dos colaboradores.");
  return { empresa, colaboradores, avisos, extras, arquivo };
}

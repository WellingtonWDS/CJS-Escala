/* Modelo de termo aditivo ao contrato de trabalho para a adequação à EC 141.
 * Preenchido a partir da proposta 5×2 (horário semanal, folgas e carga). É uma
 * referência para o escritório: salário e fundamento da distribuição diária
 * ficam em branco e todo o texto deve ser conferido pela assessoria. */
import { configDaEscala } from "../domain/contexto-escala.js";
import { diasDoModelo } from "../domain/modelo-escala.js";
import { instrumentoValido } from "../domain/ec141.js";
import { dateFromKey, getMonday, isoDate, horarioComDia } from "../domain/datas-horas.js";
import { formatCnpj } from "../shared/empresas.js";

export const AVISO_TERMO = "Modelo de referência gerado pelo Reescala a partir da proposta 5×2. Não é parecer jurídico: confira o texto com a assessoria jurídica e contábil, a convenção ou o acordo coletivo da categoria e os dados do contrato antes da assinatura. Salário e fundamento da distribuição diária devem ser preenchidos pelo escritório.";
const NOMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const LINHA = "____________________";
const trabalha = (d) => ["T", "FE"].includes(d.status);
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const horas = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h} horas`;
};
/** "segunda a sexta-feira", "segunda, quarta e sexta-feira". */
export function listaDias(dias) {
  const ord = ORDEM.filter((d) => dias.includes(d));
  if (!ord.length) return "";
  const pos = ord.map((d) => ORDEM.indexOf(d));
  const seguidos = pos.every((p, i) => !i || p === pos[i - 1] + 1);
  const nome = (d) => NOMES[d].replace("-feira", "");
  if (ord.length > 2 && seguidos) return `${nome(ord[0])} a ${NOMES[ord.at(-1)]}`;
  if (ord.length === 1) return NOMES[ord[0]];
  // "segunda, terça e sexta-feira"; com sábado/domingo no fim, nomes completos.
  const curto = NOMES[ord.at(-1)].endsWith("-feira") ? nome : (d) => NOMES[d];
  return `${ord.slice(0, -1).map(curto).join(", ")} e ${NOMES[ord.at(-1)]}`;
}

/** Padrão semanal mais frequente nas semanas completas, sem feriados nem ausências. */
function padraoSemanal(config, r) {
  if (config.modeloEscala === "fixa") return { dias: diasDoModelo(config, r.dias), variavel: false };
  const semanas = new Map();
  for (const d of r.dias) {
    const m = getMonday(dateFromKey(d.data)), k = isoDate(m.getFullYear(), m.getMonth(), m.getDate());
    if (!semanas.has(k)) semanas.set(k, []);
    semanas.get(k).push(d);
  }
  const completas = [...semanas.values()].filter((s) => s.length === 7 &&
    !s.some((d) => (d.feriado && !d.feriado.trabalhado) || ["VA", "AF", "I", "NC", "FC"].includes(d.status)));
  const base = completas.length ? completas : [...semanas.values()].filter((s) => s.length === 7);
  if (!base.length) return null;
  const assinatura = (s) => JSON.stringify(s.map((d) => [d.weekday, trabalha(d), d.entradaMin, d.intervaloInicioMin, d.saidaMin]).sort((a, b) => a[0] - b[0]));
  const contagem = new Map();
  for (const s of base) contagem.set(assinatura(s), [...(contagem.get(assinatura(s)) || []), s]);
  const [escolhida] = [...contagem.values()].sort((a, b) => b.length - a.length);
  return { dias: escolhida[0], variavel: contagem.size > 1 };
}

export function montarTermosAditivos(state, { empresa = "", servidor = null } = {}) {
  if (!state.conversao || state.conversao.desatualizada)
    throw Error("Gere uma proposta 5×2 atualizada antes de preparar os termos aditivos.");
  const config = configDaEscala(structuredClone(state.conversao.proposta.config));
  if (!config.escalaGerada?.resultado?.length) throw Error("Gere a proposta antes de preparar os termos aditivos.");
  // Com empresa do servidor, razão social e CNPJ cadastrados prevalecem sobre os do relatório importado.
  const e = config.empresaDominio || {};
  const nomeEmpresa = servidor?.nome || e.nome || empresa || LINHA;
  const cnpjBase = servidor?.nome ? servidor.cnpj : e.cnpj;
  const cnpj = cnpjBase ? formatCnpj(cnpjBase) : LINHA;
  const termos = [];
  for (const r of config.escalaGerada.resultado) {
    const c = r.colaborador, padrao = padraoSemanal(config, r);
    if (!padrao) continue;
    const dias = padrao.dias;
    const trabalho = dias.filter(trabalha);
    const fase40 = trabalho.length && trabalho.every((d) => d.regimeAplicado === "definitivo40");
    const inicioVigencia = fase40 ? "16/12/2027" : "16/12/2026";
    const limite = fase40 ? 40 : 42;
    // Grupos de dias com o mesmo horário.
    const grupos = new Map();
    for (const d of trabalho) {
      const intervalo = d.intervaloInicioMin != null ? `${horarioComDia(d.intervaloInicioMin)} às ${horarioComDia(d.intervaloFimMin)}` : "sem intervalo";
      const k = [horarioComDia(d.entradaMin), intervalo, horarioComDia(d.saidaMin)].join("|");
      if (!grupos.has(k)) grupos.set(k, { dias: [], entrada: horarioComDia(d.entradaMin), intervalo, saida: horarioComDia(d.saidaMin), minutos: Math.round(d.horas * 60) });
      grupos.get(k).dias.push(d.weekday);
    }
    const horario = [...grupos.values()].sort((a, b) => ORDEM.indexOf(a.dias[0]) - ORDEM.indexOf(b.dias[0]))
      .map((g) => ({ ...g, rotulo: maiuscula(listaDias(g.dias)), horas: horas(g.minutos) }));
    const folgas = dias.filter((d) => !trabalha(d)).map((d) => d.weekday);
    const semanaMin = trabalho.reduce((s, d) => s + Math.round(d.horas * 60), 0);
    const contratoMin = Math.round(Number(c.horasSemana) * 60);
    const maiorDia = Math.max(0, ...trabalho.map((d) => Math.round(d.horas * 60)));
    const q = c.quadroDominio || {};
    const ctps = q.ctps || LINHA, serie = q.serie || LINHA;
    const clausulas = [];
    const add = (titulo, texto) => clausulas.push({ numero: clausulas.length + 1, titulo, texto });
    add("Objeto", `O presente termo aditivo tem por objeto adequar a jornada de trabalho do EMPREGADO às disposições da Emenda Constitucional nº 141, de 16 de outubro de 2026.`);
    const reduz = contratoMin > limite * 60;
    add("Duração do trabalho", reduz
      ? `A partir de ${inicioVigencia}, ou da data de assinatura deste termo, se posterior, a duração normal do trabalho do EMPREGADO passa de ${horas(contratoMin)} para ${horas(Math.min(semanaMin || limite * 60, limite * 60))} semanais.`
      : contratoMin <= 40 * 60
        ? `Fica mantida a duração contratual de ${horas(contratoMin)} semanais, sem redução proporcional, nos termos do art. 4º da Emenda Constitucional nº 141, aplicando-se o repouso semanal previsto neste termo.`
        : `Fica mantida a duração contratual de ${horas(contratoMin)} semanais, compatível com o limite de ${limite} horas semanais vigente a partir de ${inicioVigencia}, aplicando-se o repouso semanal previsto neste termo.`);
    add("Horário de trabalho", `O EMPREGADO cumprirá o seguinte horário de trabalho:${padrao.variavel ? " Os dias de trabalho e de repouso poderão variar conforme a escala mensal informada previamente ao EMPREGADO, observados os limites deste termo." : ""}`);
    add("Repouso semanal remunerado", padrao.variavel || !folgas.length
      ? "O EMPREGADO terá 2 (dois) dias de repouso semanal remunerado, sendo um deles preferencialmente aos domingos, conforme a escala informada previamente."
      : `O EMPREGADO terá 2 (dois) dias de repouso semanal remunerado, sendo um deles preferencialmente aos domingos, fixados em: ${listaDias(folgas)}.`);
    add("Remuneração", `${reduz ? "A redução da duração do trabalho e o incremento do repouso semanal remunerado não implicam" : "O incremento do repouso semanal remunerado não implica"} redução salarial nominal, proporcional ou de qualquer outra espécie, inclusive em relação ao piso salarial, nos termos do art. 2º da Emenda Constitucional nº 141. O salário mensal do EMPREGADO permanece em R$ ____________ (__________________________________________).`);
    // Decreto nº 13.173/2026, art. 5º; Portaria MTE nº 2.041/2026, art. 10.
    const horasNormais = Math.min(contratoMin / 60, limite);
    const divisor = Math.round(horasNormais * 5 * 100) / 100;
    add("Salário-hora", `Para o cálculo do salário-hora e das parcelas calculadas por hora, aplica-se o divisor ${numero(divisor)} (${extenso(divisor)}), correspondente à duração normal de ${horas(Math.round(horasNormais * 60))} semanais, nos termos do art. 5º do Decreto nº 13.173, de 19 de novembro de 2026, e do art. 10 da Portaria MTE nº 2.041, de 19 de novembro de 2026, prevalecendo o divisor mais favorável previsto em lei, convenção ou acordo coletivo, contrato ou regulamento da empresa.${!fase40 && contratoMin > 40 * 60 ? " A partir de 16/12/2027, com a duração normal de 40 horas semanais, aplica-se o divisor 200 (duzentos)." : ""} A aplicação do divisor decorre da adequação à nova duração do trabalho e não constitui reajuste, aumento ou revisão do salário mensal contratual, que permanece em seu valor nominal.`);
    if (maiorDia > 480) {
      const i = config.instrumentoColetivo || {};
      const act = trabalho.find((d) => instrumentoValido(config, d.data, "compensacaoDiaria"));
      add("Distribuição diária da jornada", `A distribuição da jornada em até ${horas(maiorDia)} diárias observa o seguinte fundamento: ${act && i.identificacao ? `${i.identificacao}, vigente de ${i.inicio.split("-").reverse().join("/")} a ${i.fim.split("-").reverse().join("/")}` : "______________________________________________________________"}.`);
    }
    if (!fase40 && contratoMin > 40 * 60) add("Segunda etapa da redução", "A partir de 16/12/2027, a duração normal do trabalho não excederá 40 (quarenta) horas semanais, mediante novo ajuste de horário entre as partes.");
    add("Ratificação", "Permanecem inalteradas e em pleno vigor as demais cláusulas e condições do contrato de trabalho que não conflitem com o presente termo.");
    termos.push({
      id: c.id, nome: c.nome, cargo: c.cargo || LINHA, ctps, serie,
      empresa: { nome: nomeEmpresa, cnpj, endereco: e.endereco || LINHA },
      partes: `${nomeEmpresa}, inscrita no CNPJ sob o nº ${cnpj}, com sede em ${e.endereco || LINHA}, doravante denominada EMPREGADOR, e ${c.nome}, portador(a) da CTPS nº ${ctps}, série ${serie}, ocupante do cargo de ${c.cargo || LINHA}, doravante denominado(a) EMPREGADO, ajustam o presente termo aditivo ao contrato individual de trabalho, mediante as cláusulas a seguir.`,
      horario, folgas, variavel: padrao.variavel, clausulas, fase: limite,
      local: "_____________________, ____ de ____________________ de ________.",
    });
  }
  if (!termos.length) throw Error("Não há semanas completas na proposta para montar os termos aditivos.");
  return { termos, aviso: AVISO_TERMO, titulo: "TERMO ADITIVO AO CONTRATO INDIVIDUAL DE TRABALHO" };
}

const numero = (v) => String(v).replace(".", ",");
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
/** Número por extenso (inteiros até 999; decimais lidos como "vírgula"). */
export function extenso(v) {
  const inteiro = (n) => {
    if (n === 0) return "zero";
    if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100;
    const resto = r < 20 ? UNIDADES[r] : [DEZENAS[Math.floor(r / 10)], UNIDADES[r % 10]].filter(Boolean).join(" e ");
    return [CENTENAS[c], resto].filter(Boolean).join(" e ");
  };
  const [a, b] = String(v).split(".");
  return b ? `${inteiro(Number(a))} vírgula ${inteiro(Number(b))}` : inteiro(Number(a));
}

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

/* Catálogo de cláusulas escolhidas no modal "Gerar termo aditivo". As de adequação à
 * EC 141 são preenchidas pela proposta; "quando aplicável" só entra para quem precisa.
 * As complementares seguem os modelos de referência do escritório e têm texto fixo. */
export const CATALOGO_CLAUSULAS = [
  { id: "objeto", titulo: "Objeto", grupo: "ec141", obrigatoria: true },
  { id: "duracao", titulo: "Duração do trabalho", grupo: "ec141", obrigatoria: true },
  { id: "horario", titulo: "Horário de trabalho", grupo: "ec141", obrigatoria: true },
  { id: "repouso", titulo: "Repouso semanal remunerado", grupo: "ec141", obrigatoria: true },
  { id: "remuneracao", titulo: "Remuneração", grupo: "ec141", padrao: true },
  { id: "salarioHora", titulo: "Salário-hora", grupo: "ec141", padrao: true },
  { id: "distribuicao", titulo: "Distribuição diária da jornada", grupo: "ec141", padrao: true, condicional: "jornada diária acima de 8h" },
  { id: "segundaEtapa", titulo: "Segunda etapa da redução", grupo: "ec141", padrao: true, condicional: "contratos acima de 40h na fase de 42h" },
  { id: "auxilio", titulo: "Colaboração com outras áreas", grupo: "complementar" },
  { id: "compensacao", titulo: "Compensação e prorrogação de jornada", grupo: "complementar" },
  { id: "horasExtras", titulo: "Controle e autorização de horas extras", grupo: "complementar" },
  { id: "deveres", titulo: "Deveres e normas internas", grupo: "complementar" },
  { id: "extincao", titulo: "Extinção do contrato e justa causa", grupo: "complementar" },
  { id: "transferencia", titulo: "Transferência e alteração do local de trabalho", grupo: "complementar" },
  { id: "viagens", titulo: "Viagens a serviço", grupo: "complementar" },
  { id: "eventos", titulo: "Eventos sociais, esportivos e treinamentos facultativos", grupo: "complementar" },
  { id: "atestados", titulo: "Justificativa de faltas e atestados médicos", grupo: "complementar" },
  { id: "danos", titulo: "Responsabilidade por danos", grupo: "complementar" },
  { id: "celular", titulo: "Uso de telefone celular particular", grupo: "complementar" },
  { id: "cameras", titulo: "Monitoramento por câmeras e tratamento de dados", grupo: "complementar" },
  { id: "equipamentos", titulo: "Uso de equipamentos corporativos e monitoramento digital", grupo: "complementar" },
  { id: "sigilo", titulo: "Sigilo, confidencialidade e segurança da informação", grupo: "complementar" },
  { id: "imagem", titulo: "Cessão de uso de imagem e voz", grupo: "complementar" },
  { id: "ratificacao", titulo: "Disposições finais", grupo: "final", padrao: true },
  { id: "foro", titulo: "Foro", grupo: "final" },
];
export const CLAUSULAS_PADRAO = CATALOGO_CLAUSULAS.filter((c) => c.obrigatoria || c.padrao).map((c) => c.id);

const COMPLEMENTARES = {
  auxilio: "Nos termos do parágrafo único do art. 456 da CLT, o EMPREGADO obriga-se a executar todas as tarefas inerentes ao seu cargo, bem como a prestar auxílio operacional, administrativo ou de apoio a outras áreas ou setores do EMPREGADOR, especialmente em períodos de maior movimento, eventos, campanhas ou cobertura temporária de ausências, desde que dentro da sua jornada contratual e compatíveis com sua qualificação profissional, não caracterizando tal colaboração acúmulo ou desvio de função.",
  compensacao: "Fica ajustada a possibilidade de prorrogação e compensação de horas de trabalho, inclusive em período noturno, observadas as formalidades legais e os limites previstos no art. 59 da CLT, mediante acordo individual escrito, banco de horas ou norma coletiva aplicável.",
  horasExtras: "A realização de horas extraordinárias depende de prévia e expressa autorização do EMPREGADOR. O EMPREGADO compromete-se a observar rigorosamente os horários contratados, abstendo-se de iniciar atividades antes do expediente, permanecer no posto após o término ou trabalhar durante os intervalos sem autorização formal.\nParágrafo único: O descumprimento desta regra sujeitará o EMPREGADO às medidas disciplinares cabíveis, sem prejuízo do pagamento ou da compensação das horas extraordinárias efetivamente trabalhadas e registradas no controle de ponto.",
  deveres: "O EMPREGADO compromete-se a desempenhar suas funções com zelo, lealdade e urbanidade, cumprindo o regulamento interno do EMPREGADOR, as normas de saúde e segurança do trabalho e as determinações de seus superiores hierárquicos.",
  extincao: "Aplicam-se ao contrato de trabalho as normas relativas aos contratos individuais de trabalho por prazo indeterminado previstas na CLT, inclusive quanto ao aviso prévio (arts. 487 e seguintes da CLT e Lei nº 12.506/2011) e às hipóteses de rescisão por justa causa ou rescisão indireta dispostas nos arts. 482 e 483 da CLT.",
  transferencia: "Observado o disposto no art. 469 da CLT, o EMPREGADOR poderá transferir o EMPREGADO para outra unidade ou estabelecimento dentro do mesmo município ou região metropolitana, desde que não acarrete mudança de domicílio. Havendo real necessidade de serviço, fica autorizada a transferência provisória ou definitiva para outra localidade, mediante pagamento do adicional legal quando aplicável.",
  viagens: "Em razão das atividades do EMPREGADOR, o EMPREGADO declara ciência e concordância em realizar viagens profissionais para outros municípios ou estados, quando previamente comunicado e necessário ao serviço. As despesas de transporte, hospedagem e alimentação serão custeadas ou reembolsadas pelo EMPREGADOR conforme política interna, não configurando transferência definitiva nem alteração contratual.",
  eventos: "O EMPREGADOR poderá promover ou ofertar, fora do horário normal de trabalho, eventos sociais, confraternizações, atividades recreativas ou de bem-estar, bem como cursos, palestras e eventos de aperfeiçoamento profissional.\nParágrafo primeiro: Quando expressamente informados como de adesão facultativa, a participação do EMPREGADO será inteiramente livre e voluntária, não constituindo obrigação contratual nem gerando qualquer prejuízo funcional, disciplinar ou salarial em caso de não comparecimento.\nParágrafo segundo: Nas hipóteses de participação facultativa previstas nesta cláusula, o tempo despendido no evento, no deslocamento ou na atividade não será considerado tempo à disposição do EMPREGADOR (art. 4º da CLT).\nParágrafo terceiro: Quando optar pela não participação, o EMPREGADO deverá comunicar a sua recusa à gestão, por escrito ou por meio eletrônico corporativo, certificando-se da confirmação de recebimento, sem que tal oposição acarrete qualquer penalidade ou prejuízo funcional.\nParágrafo quarto: Treinamentos, cursos ou reuniões de trabalho exigidos pelo EMPREGADOR ou indispensáveis ao exercício das funções seguirão a legislação trabalhista vigente.",
  atestados: "Em caso de ausência por motivo de doença ou acidente, o EMPREGADO deverá comunicar o EMPREGADOR imediatamente e apresentar o respectivo atestado médico, físico ou digital, no prazo de até 48 (quarenta e oito) horas a contar do afastamento, ou em até 24 (vinte e quatro) horas caso ocorra no último dia do mês, para fins de fechamento da folha, sob pena de desconto dos dias não justificados, ressalvados os casos de impossibilidade comprovada de locomoção ou internação.",
  danos: "O EMPREGADO responderá pelos prejuízos materiais causados ao EMPREGADOR ou a terceiros decorrentes de atos praticados com dolo ou culpa (imprudência, negligência ou imperícia), autorizando expressamente o desconto dos respectivos valores em sua remuneração ou verbas rescisórias, nos termos do art. 462, § 1º, da CLT, respeitados os limites legais de desconto salarial.",
  celular: "Conforme as normas internas, é vedado o uso de aparelho celular particular durante o horário de expediente para fins pessoais, exceto em casos de urgência pessoal ou familiar.",
  cameras: "O EMPREGADO declara ciência de que as dependências do EMPREGADOR, exceto banheiros, vestiários e locais de intimidade, são monitoradas por câmeras de segurança para fins legítimos de proteção patrimonial, segurança pessoal e controle operacional. Os dados e imagens captados serão armazenados com acesso restrito pelo prazo necessário e tratados em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD).",
  equipamentos: "Os equipamentos, sistemas, e-mails e recursos tecnológicos fornecidos pelo EMPREGADOR destinam-se exclusivamente ao uso profissional, não havendo expectativa de privacidade sobre os dados neles armazenados ou trafegados. O EMPREGADOR poderá auditar e monitorar tais ferramentas para fins de segurança da informação, proteção patrimonial e apuração de irregularidades, podendo utilizar os registros como prova administrativa ou judicial, observada a LGPD.",
  sigilo: "O EMPREGADO compromete-se a manter absoluta confidencialidade e sigilo sobre todos os dados, documentos e informações cadastrais, financeiras, contábeis, trabalhistas e administrativas de clientes, fornecedores, parceiros e do próprio EMPREGADOR a que tiver acesso em razão de suas funções, inclusive dados pessoais e dados pessoais sensíveis nos termos da Lei nº 13.709/2018 – LGPD.\nParágrafo primeiro: É expressamente proibido copiar, fotografar, gravar, extrair, divulgar, repassar a terceiros ou utilizar para fins particulares qualquer cadastro, registro, documento ou informação sigilosa obtida no exercício de suas funções, obrigação que permanece vigente mesmo após o término do contrato de trabalho.\nParágrafo segundo: O descumprimento das normas de sigilo e das diretrizes de segurança da informação e da LGPD constituirá falta grave, passível de rescisão contratual por justa causa (art. 482, alínea 'g', da CLT), sem prejuízo da responsabilização civil e penal cabível.",
  imagem: "O EMPREGADO autoriza expressamente, a título gratuito, o uso de sua imagem, voz e nome captados em fotografias, vídeos ou gravações realizados nas dependências do EMPREGADOR ou em eventos por ele promovidos, para fins exclusivamente institucionais, educacionais, de divulgação interna ou de comunicação institucional, veiculados em redes sociais oficiais, site institucional, murais internos e materiais de comunicação do EMPREGADOR.\nParágrafo primeiro: A presente autorização é concedida de forma livre e por prazo indeterminado, sem que caiba ao EMPREGADO qualquer pedido de indenização a título de remuneração, direitos autorais ou conexos pelo uso de sua imagem.\nParágrafo segundo: Fica facultado ao EMPREGADO manifestar sua recusa, por escrito ou por meio eletrônico corporativo, em participar de captações de imagem ou voz em determinado evento ou campanha, desde que o faça previamente ao registro e se certifique da confirmação de recebimento pela gestão, sem que tal oposição lhe acarrete qualquer prejuízo funcional ou disciplinar.",
};

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

export function montarTermosAditivos(state, { empresa = "", servidor = null, clausulas: escolhidas = CLAUSULAS_PADRAO } = {}) {
  const incluir = new Set([...escolhidas, ...CATALOGO_CLAUSULAS.filter((c) => c.obrigatoria).map((c) => c.id)]);
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
  // Pessoas a contratar (simulação) não têm contrato a aditar.
  for (const r of config.escalaGerada.resultado.filter((x) => !x.colaborador.aContratar)) {
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
    const textos = new Map();
    const add = (id, texto) => textos.set(id, texto);
    add("objeto", `O presente termo aditivo tem por objeto adequar a jornada de trabalho do EMPREGADO às disposições da Emenda Constitucional nº 141, de 16 de outubro de 2026.`);
    const reduz = contratoMin > limite * 60;
    add("duracao", reduz
      ? `A partir de ${inicioVigencia}, ou da data de assinatura deste termo, se posterior, a duração normal do trabalho do EMPREGADO passa de ${horas(contratoMin)} para ${horas(Math.min(semanaMin || limite * 60, limite * 60))} semanais.`
      : contratoMin <= 40 * 60
        ? `Fica mantida a duração contratual de ${horas(contratoMin)} semanais, sem redução proporcional, nos termos do art. 4º da Emenda Constitucional nº 141, aplicando-se o repouso semanal previsto neste termo.`
        : `Fica mantida a duração contratual de ${horas(contratoMin)} semanais, compatível com o limite de ${limite} horas semanais vigente a partir de ${inicioVigencia}, aplicando-se o repouso semanal previsto neste termo.`);
    add("horario", `O EMPREGADO cumprirá o seguinte horário de trabalho:${padrao.variavel ? " Os dias de trabalho e de repouso poderão variar conforme a escala mensal informada previamente ao EMPREGADO, observados os limites deste termo." : ""}`);
    add("repouso", padrao.variavel || !folgas.length
      ? "O EMPREGADO terá 2 (dois) dias de repouso semanal remunerado, sendo um deles preferencialmente aos domingos, conforme a escala informada previamente."
      : `O EMPREGADO terá 2 (dois) dias de repouso semanal remunerado, sendo um deles preferencialmente aos domingos, fixados em: ${listaDias(folgas)}.`);
    add("remuneracao", `${reduz ? "A redução da duração do trabalho e o incremento do repouso semanal remunerado não implicam" : "O incremento do repouso semanal remunerado não implica"} redução salarial nominal, proporcional ou de qualquer outra espécie, inclusive em relação ao piso salarial, nos termos do art. 2º da Emenda Constitucional nº 141. O salário mensal do EMPREGADO permanece em R$ ____________ (__________________________________________).`);
    // Decreto nº 13.173/2026, art. 5º; Portaria MTE nº 2.041/2026, art. 10.
    const horasNormais = Math.min(contratoMin / 60, limite);
    const divisor = Math.round(horasNormais * 5 * 100) / 100;
    add("salarioHora", `Para o cálculo do salário-hora e das parcelas calculadas por hora, aplica-se o divisor ${numero(divisor)} (${extenso(divisor)}), correspondente à duração normal de ${horas(Math.round(horasNormais * 60))} semanais, nos termos do art. 5º do Decreto nº 13.173, de 19 de novembro de 2026, e do art. 10 da Portaria MTE nº 2.041, de 19 de novembro de 2026, prevalecendo o divisor mais favorável previsto em lei, convenção ou acordo coletivo, contrato ou regulamento da empresa.${!fase40 && contratoMin > 40 * 60 ? " A partir de 16/12/2027, com a duração normal de 40 horas semanais, aplica-se o divisor 200 (duzentos)." : ""} A aplicação do divisor decorre da adequação à nova duração do trabalho e não constitui reajuste, aumento ou revisão do salário mensal contratual, que permanece em seu valor nominal.`);
    if (maiorDia > 480) {
      const i = config.instrumentoColetivo || {};
      const act = trabalho.find((d) => instrumentoValido(config, d.data, "compensacaoDiaria"));
      add("distribuicao", `A distribuição da jornada em até ${horas(maiorDia)} diárias observa o seguinte fundamento: ${act && i.identificacao ? `${i.identificacao}, vigente de ${i.inicio.split("-").reverse().join("/")} a ${i.fim.split("-").reverse().join("/")}` : "______________________________________________________________"}.`);
    }
    if (!fase40 && contratoMin > 40 * 60) add("segundaEtapa", "A partir de 16/12/2027, a duração normal do trabalho não excederá 40 (quarenta) horas semanais, mediante novo ajuste de horário entre as partes.");
    for (const [id, texto] of Object.entries(COMPLEMENTARES)) add(id, texto);
    add("ratificacao", "O presente termo aditivo passa a fazer parte integrante do contrato de trabalho firmado entre as partes. Permanecem inalteradas e em pleno vigor as demais cláusulas e condições do contrato de trabalho que não conflitem com o presente termo.");
    add("foro", `As partes elegem o foro da Justiça do Trabalho da jurisdição de ${LINHA} para dirimir quaisquer controvérsias oriundas deste termo e do contrato de trabalho.`);
    const clausulas = CATALOGO_CLAUSULAS.filter((c) => incluir.has(c.id) && textos.has(c.id))
      .map((c, i) => ({ numero: i + 1, id: c.id, titulo: c.titulo, texto: textos.get(c.id) }));
    termos.push({
      id: c.id, nome: c.nome, cargo: c.cargo || LINHA, ctps, serie,
      empresa: { nome: nomeEmpresa, cnpj, endereco: e.endereco || LINHA },
      cpf: LINHA,
      partes: `${nomeEmpresa}, inscrita no CNPJ sob o nº ${cnpj}, com sede em ${e.endereco || LINHA}, doravante denominada EMPREGADOR, e ${c.nome}, inscrito(a) no CPF sob o nº ${LINHA}, portador(a) da CTPS nº ${ctps}, série ${serie}, ocupante do cargo de ${c.cargo || LINHA}, doravante denominado(a) EMPREGADO, ajustam, de comum acordo e nos termos do art. 468 da Consolidação das Leis do Trabalho (CLT), o presente termo aditivo ao contrato individual de trabalho, mediante as cláusulas a seguir.`,
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

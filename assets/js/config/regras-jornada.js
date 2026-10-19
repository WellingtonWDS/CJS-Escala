export const STORAGE_KEY = "fintria-escala-dp-v2";
export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const REGIMES = {
  atual44: {
    nome: "Antes da 1ª fase — até 44h/semana",
    horas: 44,
    folgas: 1,
    futuro: false,
  },
  transicao42: {
    nome: "1ª fase — 42h/semana · a partir de 16/12/2026",
    horas: 42,
    folgas: 2,
    futuro: true,
  },
  definitivo40: {
    nome: "2ª fase — 40h/semana · a partir de 16/12/2027",
    horas: 40,
    folgas: 2,
    futuro: true,
  },
};

export const TIPO_INFO = {
  "6x1":
    "Seis dias de trabalho e uma folga por ciclo semanal. Antes da primeira fase, a referência geral é até 44h/semana. A partir de 16/12/2026, a EC 141 exige o segundo repouso semanal remunerado. A escala 6×1 deixa de ser o modelo geral, ressalvada compensação excepcional por acordo ou convenção coletiva, nos limites da EC 141.",
  "5x2":
    "Cinco dias de trabalho e dois dias de repouso. Se a empresa funcionar em 6 dias, configure os 6 dias operacionais e deixe a escala distribuir uma folga entre eles; o dia em que a empresa não funciona permanece como repouso.",
  "12x36":
    "Doze horas consecutivas de trabalho por 36 horas de descanso. É um regime especial previsto no art. 59-A da CLT, com requisitos próprios; não deve ser tratado como uma simples variação de 5×2 ou 6×1.",
  custom:
    "Escala personalizada/cíclica. Não é uma categoria legal autônoma: a ferramenta verifica limites gerais e sinaliza os pontos que dependem de instrumento coletivo, compensação ou regime especial.",
};

export const TIPOS = [
  ["6x1", "6×1"],
  ["5x2", "5×2"],
  ["12x36", "12×36"],
  ["custom", "Personalizada"],
];

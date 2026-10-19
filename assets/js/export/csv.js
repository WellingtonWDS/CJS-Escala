import { dateFromKey } from "../domain/datas-horas.js";
import { csvCell } from "../shared/formatacao.js";
export function gerarCsv(state) {
  const { resultado } = state.escalaGerada;
  const dias = resultado[0]
    ? resultado[0].dias.filter((d) => {
        const dt = dateFromKey(d.data);
        return (
          dt &&
          dt.getMonth() === state.mes &&
          dt.getFullYear() === state.ano &&
          dt.getDate() >= state.diaInicio
        );
      })
    : [];
  let csv =
    "\uFEFFColaborador;Cargo;" + dias.map((d) => d.dia).join(";") + "\n";
  resultado.forEach((r) => {
    const mesDias = r.dias.filter((d) => dias.some((x) => x.data === d.data));
    csv += `${csvCell(r.colaborador.nome)};${csvCell(r.colaborador.cargo)};${mesDias.map((d) => d.status).join(";")}\n`;
  });

  return csv;
}

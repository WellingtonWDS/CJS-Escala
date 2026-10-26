import {
  companyLabel,
  matchesCompany,
  normalizeCnpj,
} from "../shared/empresas.js";
// Busca digitada e select nativo compartilham a mesma seleção por UUID.
export function createCompanyPicker({ input, select, onChange = () => {} }) {
  let rows = [];
  function render() {
    const selected = select.value;
    const matches = rows.filter((row) => matchesCompany(row, input.value));
    const current = rows.find((row) => row.id === selected);
    if (current && !matches.includes(current)) matches.unshift(current);
    select.replaceChildren(
      new Option(
        matches.length ? "Selecione a empresa" : "Nenhuma empresa encontrada",
        "",
      ),
      ...matches.map((row) => new Option(companyLabel(row), row.id)),
    );
    select.value = rows.some((row) => row.id === selected) ? selected : "";
  }
  input.addEventListener("input", () => {
    render();
    const term = normalizeCnpj(input.value);
    const exact = rows.filter(
      (row) =>
        (term.length === 14 && normalizeCnpj(row.cnpj) === term) ||
        companyLabel(row).toLowerCase() === input.value.trim().toLowerCase(),
    );
    if (exact.length === 1 && select.value !== exact[0].id) {
      select.value = exact[0].id;
      onChange();
    }
  });
  select.addEventListener("change", () => onChange());
  return {
    setRows(next, selected = "") {
      rows = next;
      input.value = "";
      select.replaceChildren(
        ...rows.map((row) => new Option(companyLabel(row), row.id)),
      );
      select.value = selected || rows[0]?.id || "";
      render();
    },
  };
}

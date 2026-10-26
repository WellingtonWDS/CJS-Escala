export const normalizeCnpj = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[.\/\-\s]/g, "");
export function validCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj))
    return false;
  for (let length = 12; length <= 13; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++)
      sum += (cnpj.charCodeAt(i) - 48) * (((length - 1 - i) % 8) + 2);
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(cnpj[length])) return false;
  }
  return true;
}
export function formatCnpj(value) {
  const cnpj = normalizeCnpj(value);
  return cnpj.length === 14
    ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    : cnpj;
}
export const companyLabel = (row) =>
  `${row.name} — ${row.cnpj ? formatCnpj(row.cnpj) : "CNPJ não informado"}`;
export const searchText = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function matchesCompany(row, query) {
  const term = searchText(query).trim();
  return (
    !term ||
    searchText(companyLabel(row)).includes(term) ||
    (normalizeCnpj(query).length > 0 &&
      normalizeCnpj(row.cnpj).includes(normalizeCnpj(query)))
  );
}

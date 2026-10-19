export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function csvCell(value) {
  const str = String(value ?? "");
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

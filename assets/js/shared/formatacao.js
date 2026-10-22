export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function csvCell(value) {
  let str = String(value ?? "");
  if (typeof value === "string" && /^[\s\x00-\x1f]*[=+@-]/.test(str))
    str = "'" + str;
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

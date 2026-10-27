export function draftTitle(
  prefix = "Planejamento de escala",
  date = new Date(),
) {
  const suffix = ` — ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)}`;
  return `${prefix.slice(0, 160 - suffix.length)}${suffix}`;
}

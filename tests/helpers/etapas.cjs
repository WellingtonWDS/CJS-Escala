// Navega pelos mesmos links disponíveis ao usuário antes de operar um campo.
async function irParaEtapa(page, seletor) {
  const campo = page.locator(seletor).first();
  if (!(await campo.count())) return;
  const painel = await campo.evaluate(
    (el) => el.closest("main > section[data-etapa]")?.id,
  );
  if (!painel) return;
  const link = page.locator(`[data-etapa-link="${painel}"]`);
  if ((await link.getAttribute("aria-current")) !== "step") await link.click();
}
module.exports = { irParaEtapa };

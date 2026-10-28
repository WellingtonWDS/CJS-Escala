const states = new WeakMap();
async function respondToDialogs(page, handler) {
  if (states.has(page)) {
    states.get(page).handler = handler;
    return;
  }
  const state = { handler };
  states.set(page, state);
  await page.exposeBinding("__respondAppDialog", async (_source, data) => {
    if (!state.handler) return;
    const root = page.locator("dialog[data-app-dialog][open]").last();
    const response = {
      type: () => data.type,
      message: () => data.message,
      defaultValue: () => data.value,
      async accept(value) {
        if (data.type === "form") {
          for (const [key, fieldValue] of Object.entries(value || {}))
            await root.locator(`[data-dialog-time="${key}"]`).fill(fieldValue);
          await root.locator("[data-dialog-accept]").click();
          return;
        }
        const input = root.locator("[data-dialog-input]");
        if (data.type === "prompt" && value !== undefined) {
          if ((await input.evaluate((el) => el.tagName)) === "SELECT")
            await input.selectOption(value);
          else await input.fill(value);
        }
        await root.locator("[data-dialog-accept]").click();
      },
      async dismiss() {
        if (data.type === "alert")
          await root.locator("[data-dialog-accept]").click();
        else await root.locator("[data-dialog-cancel]").click();
      },
    };
    await state.handler(response);
  });
  function observe() {
    if (window.__watchAppDialogs) return;
    window.__watchAppDialogs = true;
    const seen = new WeakSet();
    new MutationObserver(() => {
      for (const dialog of document.querySelectorAll(
        "dialog[data-app-dialog][open]",
      )) {
        if (seen.has(dialog)) continue;
        seen.add(dialog);
        window.__testDialogBusy = (window.__testDialogBusy || 0) + 1;
        window
          .__respondAppDialog({
            type: dialog.dataset.appDialog,
            message: dialog.querySelector("p").textContent,
            value: dialog.querySelector("[data-dialog-input]")?.value,
          })
          .catch((error) => (window.__testDialogError = error.message))
          .finally(() => window.__testDialogBusy--);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  }
  await page.addInitScript(observe);
  await page.evaluate(observe);
}
async function waitForDialogs(page) {
  await page.waitForFunction(
    () =>
      window.__testDialogError ||
      (!document.querySelector("dialog[data-app-dialog][open]") &&
        !window.__testDialogBusy),
  );
  const error = await page.evaluate(() => window.__testDialogError);
  if (error) throw Error(error);
}
function stopDialogResponses(page) {
  if (states.has(page)) states.get(page).handler = null;
}
module.exports = { respondToDialogs, waitForDialogs, stopDialogResponses };

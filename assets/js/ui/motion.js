const jobs = new WeakMap();
export const reducedMotion = (document) =>
  !!document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches;
export function cancelClosing(dialog) {
  jobs.get(dialog)?.cancel();
}
export function closeDialog(dialog, { remove = false } = {}) {
  if (jobs.has(dialog)) return jobs.get(dialog).promise;
  if (!dialog.open || reducedMotion(dialog.ownerDocument)) {
    dialog.close();
    if (remove) dialog.remove();
    return Promise.resolve(true);
  }
  const previousInert = dialog.inert;
  let resolve, timer;
  const promise = new Promise((done) => (resolve = done));
  function cleanup() {
    clearTimeout(timer);
    dialog.removeEventListener("animationend", ended);
    dialog.classList.remove("is-closing");
    dialog.inert = previousInert;
    jobs.delete(dialog);
  }
  function ended(event) {
    if (event.target === dialog) finish();
  }
  function finish() {
    cleanup();
    dialog.close();
    if (remove) dialog.remove();
    resolve(true);
  }
  const cancel = () => {
    cleanup();
    resolve(false);
  };
  jobs.set(dialog, { promise, cancel });
  dialog.inert = true;
  dialog.classList.add("is-closing");
  dialog.addEventListener("animationend", ended);
  timer = setTimeout(finish, 220);
  return promise;
}
export function initWindowMotion(document) {
  if (document.documentElement.dataset.motionReady) return;
  document.documentElement.dataset.motionReady = "true";
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (
        form.matches?.('form[method="dialog"]') &&
        form.closest("#remote-workspace")
      ) {
        event.preventDefault();
        closeDialog(form.closest("dialog"));
      }
    },
    true,
  );
  document.addEventListener(
    "cancel",
    (event) => {
      if (event.target.id === "remote-workspace") {
        event.preventDefault();
        closeDialog(event.target);
      }
    },
    true,
  );
}

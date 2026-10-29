// Regression coverage for the retained CSV serializer, independent of removed UI controls.
exports.baixarCsvLegado = async (page, proposta = false) =>
  page.evaluate(async (proposta) => {
    const { gerarCsv } = await import("/assets/js/export/csv.js");
    const state = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
    const config = proposta ? state.conversao.proposta.config : state;
    const url = URL.createObjectURL(
      new Blob([gerarCsv(config)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = proposta
      ? config.modeloEscala === "fixa"
        ? "proposta-5x2-fixa.csv"
        : `proposta-5x2-${state.destinoConversao.periodo}.csv`
      : "escala.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, proposta);

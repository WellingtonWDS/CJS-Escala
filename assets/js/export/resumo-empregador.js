import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { dateFromKey, horarioComDia } from "../domain/datas-horas.js";
const iso = /^\d{4}-\d{2}-\d{2}$/;
const br = (s) => s.split("-").reverse().join("/");
const proxima = (s) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
export function resumirDatas(datas, { mes } = {}) {
  const values = [...new Set(datas)].sort();
  if (!values.length) return "";
  if (!values.every((d) => iso.test(d))) return values.join(", ");
  const formato =
    mes && values.every((d) => d.startsWith(mes + "-"))
      ? (d) => d.slice(8)
      : br;
  const grupos = [];
  for (const d of values) {
    const ultimo = grupos.at(-1);
    if (ultimo && proxima(ultimo[1]) === d) ultimo[1] = d;
    else grupos.push([d, d]);
  }
  return grupos
    .map(([a, b]) => (a === b ? formato(a) : `${formato(a)} a ${formato(b)}`))
    .join(", ");
}
function dataDaLinha(linha) {
  const match = String(linha[0]).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : linha[0];
}
/** Agrupa somente horários e situações integralmente iguais, preservando cada data. */
export function agruparHorarios(rel, pessoas) {
  const mes = `${rel.config.ano}-${String(rel.config.mes + 1).padStart(2, "0")}`;
  return pessoas.flatMap((p, indice) => {
    const grupos = new Map();
    for (const linha of p.linhas) {
      const detalhes = linha.slice(1),
        key = JSON.stringify(detalhes);
      if (!grupos.has(key))
        grupos.set(key, { indice, nome: p.nome, detalhes, datas: [] });
      grupos.get(key).datas.push(rel.fixa ? linha[0] : dataDaLinha(linha));
    }
    return [...grupos.values()].map((g) => ({
      ...g,
      dias: rel.fixa ? g.datas.join(", ") : resumirDatas(g.datas, { mes }),
    }));
  });
}
/** Retira apenas a referência inicial. Datas/valores dentro do texto não são apagados. */
export function agruparConferencias(pessoas, fixa = false) {
  const grupos = new Map();
  pessoas.forEach((p, indice) => {
    for (const issue of p.ocorrencias) {
      let mensagem = String(issue.mensagem || "");
      const refs = new Set();
      const prefixo = mensagem.match(/^(\d{4}-\d{2}-\d{2}):\s*/);
      if (prefixo) {
        refs.add(prefixo[1]);
        mensagem = mensagem.slice(prefixo[0].length);
      } else if (fixa) {
        const dia = DIAS_SEMANA.find((d) => mensagem.startsWith(d + ":"));
        if (dia) {
          refs.add(dia);
          mensagem = mensagem.slice(dia.length + 1).trimStart();
        }
      }
      if (issue.data) refs.add(String(issue.data));
      if (fixa)
        for (const d of [...refs])
          if (iso.test(d)) {
            refs.delete(d);
            refs.add(DIAS_SEMANA[dateFromKey(d).getDay()]);
          }
      if (p.nome && mensagem.startsWith(p.nome + ":"))
        mensagem = mensagem.slice(p.nome.length + 1).trimStart();
      const key = JSON.stringify([
        issue.severidade,
        issue.tipo,
        mensagem,
        issue.acao || "",
      ]);
      if (!grupos.has(key))
        grupos.set(key, {
          severidade: issue.severidade,
          tipo: issue.tipo,
          mensagem,
          acao: issue.acao || "",
          ocorrencias: 0,
          pessoas: new Map(),
        });
      const grupo = grupos.get(key);
      grupo.ocorrencias++;
      if (!grupo.pessoas.has(indice))
        grupo.pessoas.set(indice, { nome: p.nome, referencias: new Set() });
      refs.forEach((r) => grupo.pessoas.get(indice).referencias.add(r));
    }
  });
  const nivel = { erro: 0, alerta: 1, pendencia: 2, info: 3 };
  return [...grupos.values()]
    .sort((a, b) => (nivel[a.severidade] ?? 4) - (nivel[b.severidade] ?? 4))
    .map((g) => ({
      ...g,
      pessoas: [...g.pessoas].map(([indice, p]) => ({
        indice,
        nome: p.nome,
        referencias: [...p.referencias].sort(),
      })),
    }));
}
export function referenciasConferencia(grupo, totalPessoas) {
  const porRefs = new Map();
  grupo.pessoas.forEach((p) => {
    const key = JSON.stringify(p.referencias);
    if (!porRefs.has(key))
      porRefs.set(key, { referencias: p.referencias, nomes: [] });
    porRefs.get(key).nomes.push(`${p.indice + 1}. ${p.nome}`);
  });
  return [...porRefs.values()]
    .map((g) => {
      const nomes =
        g.nomes.length === totalPessoas
          ? `Toda a equipe (${totalPessoas})`
          : g.nomes.join(", ");
      const refs = resumirDatas(g.referencias);
      return refs ? `${nomes}\nReferências: ${refs}` : nomes;
    })
    .join("\n");
}
/** Une faixas contíguas com o mesmo déficit e reúne as datas com a mesma faixa. */
export function agruparLacunas(lacunas, rel) {
  const porDia = new Map();
  for (const l of lacunas) {
    const key = JSON.stringify([l.data, l.funcao, l.faltantes]);
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key).push({ ...l });
  }
  const faixas = [];
  for (const lista of porDia.values()) {
    lista.sort((a, b) => a.inicioMin - b.inicioMin);
    const unidas = [];
    for (const l of lista) {
      const anterior = unidas.at(-1);
      if (anterior && l.inicioMin <= anterior.fimMin)
        anterior.fimMin = Math.max(anterior.fimMin, l.fimMin);
      else unidas.push(l);
    }
    faixas.push(...unidas);
  }
  const grupos = new Map();
  for (const l of faixas) {
    const key = JSON.stringify([l.funcao, l.inicioMin, l.fimMin, l.faltantes]);
    if (!grupos.has(key)) grupos.set(key, { ...l, datas: [] });
    grupos.get(key).datas.push(l.data);
  }
  const mes = `${rel.config.ano}-${String(rel.config.mes + 1).padStart(2, "0")}`;
  return [...grupos.values()].map((g) => ({
    ...g,
    dias: rel.fixa
      ? [
          ...new Set(g.datas.map((d) => DIAS_SEMANA[dateFromKey(d).getDay()])),
        ].join(", ")
      : resumirDatas(g.datas, { mes }),
    horario: `${horarioComDia(g.inicioMin)} a ${horarioComDia(g.fimMin)}`,
  }));
}

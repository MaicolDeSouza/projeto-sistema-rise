/** Formatacao e cores dos estudos de viabilidade, para a lista e o relatorio lerem o mesmo. */

export const moeda = (valor) =>
  valor === null || valor === undefined ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export const data = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export const porcento = (valor) => (valor === null || valor === undefined ? "—" : `${String(valor).replace(".", ",")}%`);

/** Verde vale, ambar com ressalva, vermelho nao vale; cinza enquanto esta na fila. */
export const COR_DO_VEREDITO = {
  VALE: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  VALE_COM_RESSALVA: "bg-amber-100 text-amber-800 ring-amber-600/20",
  NAO_VALE: "bg-rose-100 text-rose-800 ring-rose-600/20",
};

export const ROTULO_DA_DEMANDA = { FORTE: "Forte", MEDIA: "Média", FRACA: "Fraca" };

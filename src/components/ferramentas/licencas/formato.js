import { formatarDataCurta } from "@/lib/ferramentas/licencas/regras";

/**
 * Formatos da tela de licencas. Dois tipos de data: o DIA guardado como @db.Date (comprada, renovada, data da linha),
 * que e meia-noite UTC e no fuso de Sao Paulo cairia no dia anterior; e o INSTANTE (lido do portal, ultimo uso,
 * enviado em), que se mostra no fuso de Sao Paulo.
 */

export const COR_DO_PONTO = { verde: "bg-emerald-500", ambar: "bg-amber-400", cinza: "bg-slate-300", vermelho: "bg-red-500" };
export const COR_DO_TEXTO = { verde: "text-texto", ambar: "text-amber-800", cinza: "text-suave", vermelho: "text-red-700" };

/** Dia @db.Date -> "05/11/26". */
export const dia = (iso) => (iso ? formatarDataCurta(iso) : "");

/** Instante -> "05/11/26" em Sao Paulo. */
export function diaEmSaoPaulo(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Instante -> "05/11/26 14:03" em Sao Paulo. */
export function diaEHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Hoje em Sao Paulo, no formato do <input type="date">. */
export const hojeParaCampo = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Dia @db.Date ("2026-10-01T00:00:00.000Z") no formato do <input type="date">. */
export const diaParaCampo = (iso) => (iso ? String(iso).slice(0, 10) : "");

export function tamanho(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Os ultimos 6 digitos do pedido (o numero inteiro fica na dica). */
export const pedidoCurto = (numero) => {
  const texto = String(numero ?? "");
  return texto.length > 8 ? `…${texto.slice(-6)}` : texto;
};

export const CLASSE_CAMPO = "w-full rounded-md border border-borda bg-superficie px-2.5 py-1.5 text-sm outline-none focus:border-acento disabled:bg-fundo disabled:text-suave";
export const CLASSE_BOTAO = "inline-flex items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 py-1.5 text-sm font-medium transition-colors hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50";
export const CLASSE_PRINCIPAL = "inline-flex items-center gap-1.5 rounded-md bg-acento px-3 py-1.5 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

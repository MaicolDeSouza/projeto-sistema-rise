"use client";

import { ExternalLink } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { ABAS_LI } from "@/lib/canaisDeVenda/li/validacao";

const CLASSE_DO_PROBLEMA = {
  bloqueante: "border-red-200 bg-red-50 text-red-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
};

const dataEHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O vinculo do produto com o canal da LI DENTRO do Bling (`vinculoBlingLI`, lido ao abrir o editor), em
 * uma frase. `tipo` "ok" so aparece na aba Status; "atencao" tambem vai para o topo do editor.
 */
export function situacaoDoBling(bling) {
  if (!bling) return null;
  if (!bling.ok) return { tipo: "info", texto: bling.erro ?? "Não foi possível ler o Bling." };
  switch (bling.situacao) {
    case "ligado":
      return {
        tipo: "ok",
        texto: `Bling: ligado à Loja Integrada (produto ${bling.codigo || "?"} na loja${bling.preco !== null && bling.preco !== undefined ? `, preço ${MOEDA.format(bling.preco)} no vínculo` : ""}). Estoque e pedidos passam pelo Bling; o preço vai pelo Sincronizar do Rise.`,
      };
    case "codigo_diferente":
      return { tipo: "atencao", texto: `No Bling, este produto está ligado a OUTRO produto da Loja Integrada (${bling.codigo}): o estoque vai para ele. Corrija o vínculo no Bling.` };
    case "sem_vinculo":
      return { tipo: "atencao", texto: "O produto está no Bling, mas sem o canal da Loja Integrada: o estoque não chega à loja e os pedidos não entram no Bling. Ligue o produto à loja Loja_Integrada no Bling." };
    case "sem_produto_no_bling":
      return { tipo: "atencao", texto: "O produto não está no Bling: é o Bling que controla o estoque e recebe os pedidos da Loja Integrada. Cadastre o produto no Bling e ligue-o à loja Loja_Integrada." };
    case "duplicado":
      return { tipo: "atencao", texto: "Há mais de um produto com este código no Bling: deixe um só para o vínculo com a Loja Integrada ser conferido." };
    default:
      return { tipo: "info", texto: bling.erro ?? "Não foi possível conferir o Bling." };
  }
}

// A mesma situacao do Bling em poucas palavras para o cartao da aba Status; a frase inteira vai na bolha "i".
const ROTULO_DO_BLING = {
  ligado: "Sincronizado",
  codigo_diferente: "Ligado a outro produto da loja",
  sem_vinculo: "Sem a Loja Integrada no Bling",
  sem_produto_no_bling: "Não está no Bling",
  duplicado: "Código duplicado no Bling",
};

const COR_DO_PONTO = { ok: "bg-emerald-500", atencao: "bg-amber-500", neutro: "bg-slate-300" };

function Dado({ rotulo, ajuda, children }) {
  return (
    <div className="rounded border border-borda bg-fundo px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-suave">
        {rotulo}
        {ajuda && <BolhaDeAjuda variante="inline" texto={ajuda} />}
      </p>
      <div className="mt-1 text-base font-semibold">{children}</div>
    </div>
  );
}

function Estado({ tom, children }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_PONTO[tom]}`} />
      {children}
    </span>
  );
}

const Vazio = ({ children }) => <span className="font-normal text-suave">{children}</span>;

function agruparPorAba(problemas) {
  return ABAS_LI.map((aba) => {
    const dela = problemas.filter((problema) => problema.aba === aba.id);
    return { aba, problemas: [...dela.filter((p) => p.bloqueante), ...dela.filter((p) => !p.bloqueante)] };
  }).filter((grupo) => grupo.problemas.length > 0);
}

/**
 * Aba Status (era "Prévia e sincronização"; pedido do dono em 26/10/2026): o que o operador quer saber de relance, em quatro
 * cartões: o id do produto na loja, se esta ativo la, quando foi a ultima sincronizacao e se o Bling esta ligado a loja. So
 * aparece algo a mais quando ha o que corrigir: erro do ultimo envio, envio bloqueado e os problemas das outras abas (cada um
 * leva a aba que o resolve). Nao envia nada: Cadastrar e Sincronizar ficam no rodape do editor, e as diferencas com a loja na
 * aba Divergencias.
 */
export default function AbaStatus({ irPara, todosProblemas, vinculo, leitura, bling }) {
  const doBling = situacaoDoBling(bling);
  const grupos = agruparPorAba(todosProblemas);
  const bloqueantes = todosProblemas.filter((problema) => problema.bloqueante).length;
  const naLoja = Boolean(vinculo?.idExterno);
  const linkSeguro = /^https?:\/\//i.test(String(vinculo?.urlExterna ?? ""));
  const ativaNaLoja = vinculo?.situacaoCanal === "ATIVA";
  const rotuloDoBling = !bling ? null : bling.ok ? (ROTULO_DO_BLING[bling.situacao] ?? "Não conferido") : "Não conferido";
  const tomDoBling = bling?.ok ? (bling.situacao === "ligado" ? "ok" : "atencao") : "neutro";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Dado rotulo="ID na LI">
          {naLoja ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-mono tabular-nums">{vinculo.idExterno}</span>
              {linkSeguro && (
                <a
                  href={vinculo.urlExterna}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir o produto no site da loja"
                  aria-label="Abrir o produto no site da loja"
                  className="rounded p-1 text-acento transition-colors duration-150 hover:bg-superficie focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </span>
          ) : (
            <Vazio>Ainda não está na loja</Vazio>
          )}
        </Dado>

        <Dado rotulo="Situação na loja">
          {naLoja ? (
            <Estado tom={ativaNaLoja ? "ok" : "neutro"}>{ativaNaLoja ? "Ativo" : vinculo.situacaoCanal === "PAUSADA" ? "Inativo" : "Não confirmada"}</Estado>
          ) : (
            <Vazio>—</Vazio>
          )}
        </Dado>

        <Dado rotulo="Última sincronização">
          {vinculo?.sincronizadoEm ? <span className="tabular-nums">{dataEHora.format(new Date(vinculo.sincronizadoEm))}</span> : <Vazio>Nunca sincronizado</Vazio>}
        </Dado>

        <Dado rotulo="Bling" ajuda={doBling?.texto}>
          {rotuloDoBling ? <Estado tom={tomDoBling}>{rotuloDoBling}</Estado> : <Vazio>Conferindo...</Vazio>}
        </Dado>
      </div>

      {(vinculo?.erro || (leitura?.ok && leitura.escrita?.liberada === false)) && (
        <ul className="space-y-2 text-sm">
          {vinculo?.erro && (
            <li className={`rounded border px-3 py-2 ${CLASSE_DO_PROBLEMA.bloqueante}`}>
              <span className="font-medium">O último envio falhou.</span> {vinculo.erro}
            </li>
          )}
          {leitura?.ok && leitura.escrita?.liberada === false && (
            <li className={`rounded border px-3 py-2 ${CLASSE_DO_PROBLEMA.alerta}`}>
              <span className="font-medium">Envio bloqueado agora.</span> {leitura.escrita.motivo}
            </li>
          )}
        </ul>
      )}

      {grupos.length > 0 && (
        <div className="space-y-4">
          <p className={`text-sm font-semibold ${bloqueantes > 0 ? "text-red-700" : "text-amber-700"}`}>
            {bloqueantes > 0 ? `${bloqueantes} problema(s) impedem o envio` : "Para conferir antes de enviar"}
          </p>
          {grupos.map(({ aba, problemas }) => (
            <div key={aba.id}>
              <p className="text-sm font-semibold">{aba.rotulo}</p>
              <ul className="mt-2 space-y-2">
                {problemas.map((item, posicao) => (
                  <li
                    key={posicao}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${CLASSE_DO_PROBLEMA[item.bloqueante ? "bloqueante" : "alerta"]}`}
                  >
                    <span className="min-w-0 flex-1">{item.problema}</span>
                    <button
                      type="button"
                      onClick={() => irPara(aba.id)}
                      className="shrink-0 rounded border border-borda bg-superficie px-2 py-1 text-xs text-texto transition-colors duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
                    >
                      Ir para {aba.rotulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

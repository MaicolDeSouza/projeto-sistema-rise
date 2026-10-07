import Link from "next/link";
import { Handshake } from "lucide-react";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ROTULO_DO_TIPO_ML, STATUS_ML } from "@/lib/canaisDeVenda/ml/rotulos";

/**
 * Lista dos anuncios do Mercado Livre (so leitura; a busca e a paginacao moram na pagina).
 * Cada linha leva ao anuncio. Componente de servidor: o clique e um link comum no codigo e
 * no titulo, sem estado de cliente. Situacao e tipo vem de `rotulos.js`, o mesmo do editor.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataEHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // O servidor pode estar em outro fuso (na VPS, UTC): a loja le a hora de Sao Paulo.
  timeZone: "America/Sao_Paulo",
});

const enderecoDe = (linha) => `/canais-de-venda/mercado-livre/${linha.id}`;

export default function TabelaAnunciosML({ linhas, busca }) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={Handshake}
        titulo={busca ? `Nenhum anúncio encontrado para "${busca}"` : "Nenhum anúncio do Mercado Livre ainda"}
        descricao={
          busca
            ? "Tente outro termo (título, código do produto ou código do kit), ou limpe a busca."
            : 'Clique em "Novo anúncio" e informe o código de um produto Conferido, ou use o ícone do Mercado Livre na lista de Produtos.'
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr className="divide-x divide-borda">
            <th className="px-3 py-2.5 font-medium">Código</th>
            <th className="px-3 py-2.5 font-medium">Título</th>
            <th className="px-3 py-2.5 font-medium">Tipo</th>
            <th className="px-3 py-2.5 text-right font-medium">Preço</th>
            <th className="px-3 py-2.5 font-medium">Situação</th>
            <th className="px-3 py-2.5 font-medium">Atualizado em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => {
            const situacao = STATUS_ML[linha.status] ?? STATUS_ML.RASCUNHO;
            return (
              <tr key={linha.id} className="hover:bg-fundo">
                <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                  <Link href={enderecoDe(linha)} className="text-acento hover:underline">
                    {linha.codigo}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={enderecoDe(linha)} className="hover:underline">
                    {linha.titulo || <span className="text-suave italic">Sem título</span>}
                  </Link>
                </td>
                <td className="px-3 py-2.5">{ROTULO_DO_TIPO_ML[linha.tipoAnuncio] ?? "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {typeof linha.preco === "number" ? moeda.format(linha.preco) : "-"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-suave tabular-nums">
                  {dataEHora.format(new Date(linha.atualizadoEm))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

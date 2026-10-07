import Link from "next/link";
import { ExternalLink, ShoppingBag } from "lucide-react";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { STATUS_LI } from "@/lib/canaisDeVenda/li/rotulos";

/**
 * Lista dos anuncios da Loja Integrada (so leitura; busca e paginacao moram na pagina). Componente de
 * servidor: o clique e um link comum. "Na loja" leva ao produto na loja, em outra aba.
 */

const dataEHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // O servidor pode estar em outro fuso (na VPS, UTC): a loja le a hora de Sao Paulo.
  timeZone: "America/Sao_Paulo",
});

const enderecoDe = (linha) => `/canais-de-venda/loja-integrada/${linha.id}`;
const ehLinkSeguro = (url) => /^https?:\/\//i.test(String(url ?? ""));

export default function TabelaAnunciosLI({ linhas, busca }) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={ShoppingBag}
        titulo={busca ? `Nenhum anúncio encontrado para "${busca}"` : "Nenhum anúncio da Loja Integrada ainda"}
        descricao={
          busca
            ? "Tente outro termo (título ou código do produto), ou limpe a busca."
            : "Clique em \"Novo anúncio\" e informe o código de um produto Conferido, ou abra o ícone da Loja Integrada na lista de Produtos (o produto que já existe na loja é vinculado pelo código)."
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
            <th className="px-3 py-2.5 font-medium">Situação</th>
            <th className="px-3 py-2.5 font-medium">Na loja</th>
            <th className="px-3 py-2.5 font-medium">Sincronizado em</th>
            <th className="px-3 py-2.5 font-medium">Atualizado em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => {
            const situacao = STATUS_LI[linha.status] ?? STATUS_LI.RASCUNHO;
            return (
              <tr key={linha.id} className="hover:bg-fundo">
                <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                  <Link href={enderecoDe(linha)} className="text-acento hover:underline">
                    {linha.sku}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={enderecoDe(linha)} className="hover:underline">
                    {linha.titulo || <span className="text-suave italic">Sem título</span>}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {linha.idExterno ? (
                    ehLinkSeguro(linha.urlExterna) ? (
                      <a href={linha.urlExterna} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                        id {linha.idExterno}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="tabular-nums">id {linha.idExterno}</span>
                    )
                  ) : (
                    <span className="text-suave">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-suave tabular-nums">
                  {linha.sincronizadoEm ? dataEHora.format(new Date(linha.sincronizadoEm)) : "nunca"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-suave tabular-nums">{dataEHora.format(new Date(linha.atualizadoEm))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

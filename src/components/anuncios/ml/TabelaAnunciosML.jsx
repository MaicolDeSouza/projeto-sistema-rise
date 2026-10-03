import Link from "next/link";
import { Handshake } from "lucide-react";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Lista dos anuncios do Mercado Livre (so leitura; a busca e a paginacao moram na pagina).
 * Cada linha leva ao anuncio. Componente de servidor: o clique e um link comum no codigo e
 * no titulo, sem estado de cliente.
 *
 * O texto da situacao e do tipo repete o que o editor mostra (`EditorAnuncioML`, `AbaGeral`):
 * aquele arquivo e de cliente, e exportar dele para ca viraria referencia de cliente, nao o mapa.
 */

const SITUACOES = {
  RASCUNHO: { rotulo: "Rascunho", tom: "neutro" },
  VALIDADO: { rotulo: "Validado", tom: "info" },
  PUBLICANDO: { rotulo: "Publicando", tom: "alerta" },
  PUBLICADO: { rotulo: "Publicado", tom: "sucesso" },
  ERRO: { rotulo: "Erro", tom: "erro" },
};

const TIPOS = { gold_special: "Classico", gold_pro: "Premium" };

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
        titulo={busca ? `Nenhum anuncio encontrado para "${busca}"` : "Nenhum anuncio do Mercado Livre ainda"}
        descricao={
          busca
            ? "Tente outro termo (titulo, codigo do produto ou codigo do kit), ou limpe a busca."
            : 'Clique em "Novo anuncio" e informe o codigo de um produto Conferido, ou use o icone do Mercado Livre na lista de Produtos.'
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr className="divide-x divide-borda">
            <th className="px-3 py-2.5 font-medium">Codigo</th>
            <th className="px-3 py-2.5 font-medium">Titulo</th>
            <th className="px-3 py-2.5 font-medium">Tipo</th>
            <th className="px-3 py-2.5 text-right font-medium">Preco</th>
            <th className="px-3 py-2.5 font-medium">Situacao</th>
            <th className="px-3 py-2.5 font-medium">Atualizado em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => {
            const situacao = SITUACOES[linha.status] ?? SITUACOES.RASCUNHO;
            return (
              <tr key={linha.id} className="hover:bg-fundo">
                <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                  <Link href={enderecoDe(linha)} className="text-acento hover:underline">
                    {linha.codigo}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={enderecoDe(linha)} className="hover:underline">
                    {linha.titulo || <span className="text-suave italic">Sem titulo</span>}
                  </Link>
                </td>
                <td className="px-3 py-2.5">{TIPOS[linha.tipoAnuncio] ?? "-"}</td>
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

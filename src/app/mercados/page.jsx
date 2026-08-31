import Link from "next/link";
import { Radar, Store } from "lucide-react";

import { prisma } from "@/lib/db";
import { normalizar } from "@/lib/texto";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import TabelaMercados from "@/components/mercados/TabelaMercados";
import BotaoAtualizar from "@/components/mercados/BotaoAtualizar";

export const dynamic = "force-dynamic";

/// Teto de resultados por consulta. A tela e para procurar um produto, nao para
/// folhear vinte mil linhas — e sem limite, a busca vazia carregaria a tabela
/// inteira na memoria do servidor.
const LIMITE = 100;

/**
 * Monta o filtro da busca.
 *
 * O termo e quebrado em palavras e TODAS sao exigidas. Sem isso, "kingston nv2"
 * devolveria tudo da Kingston mais tudo que tem "nv2" — e o que o operador quer
 * e a intersecao, nao a uniao.
 *
 * A comparacao usa `buscaTexto`, que ja foi normalizado na gravacao: e o que
 * faz "fone" achar "Fone" sem depender de extensao do Postgres.
 */
function filtroDe(termo) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return undefined;

  return {
    AND: palavras.map((palavra) => ({
      buscaTexto: { contains: palavra },
    })),
  };
}

export default async function MercadosPage({ searchParams }) {
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();

  let paginas = null;
  let totalFontes = 0;
  let erro = null;

  try {
    [paginas, totalFontes] = await Promise.all([
      prisma.paginaColetada.findMany({
        where: filtroDe(busca),
        orderBy: [{ disponivel: "desc" }, { vistoEm: "desc" }],
        take: LIMITE,
        // A descricao NAO entra aqui: sao uns 10 KB por linha, meio megabyte
        // para cem resultados, e quase nada disso chega a ser lido. Ela vem no
        // clique, por detalhePagina().
        select: {
          id: true,
          titulo: true,
          marca: true,
          mpn: true,
          skuFonte: true,
          precoAtual: true,
          disponivel: true,
          vistoEm: true,
          fonte: { select: { nome: true, tipo: true } },
        },
      }),
      prisma.fonteColeta.count(),
    ]);
  } catch (excecao) {
    erro = excecao;
  }

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente.
  const linhas = (paginas ?? []).map((pagina) => ({
    id: pagina.id,
    titulo: pagina.titulo,
    marca: pagina.marca,
    mpn: pagina.mpn,
    skuFonte: pagina.skuFonte,
    precoAtual: pagina.precoAtual === null ? null : Number(pagina.precoAtual),
    disponivel: pagina.disponivel,
    vistoEm: pagina.vistoEm,
    fonteNome: pagina.fonte.nome,
    fonteTipo: pagina.fonte.tipo,
  }));

  return (
    <>
      <PageHeader
        titulo="Mercados"
        descricao="Produtos, precos e codigos coletados dos sites de concorrentes e fornecedores."
        acao={
          <div className="flex items-start gap-2">
            <Link
              href="/mercados/fontes"
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm font-medium hover:bg-fundo"
            >
              <Store size={16} />
              Sites ({totalFontes})
            </Link>
            <BotaoAtualizar />
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <CampoBusca
            valorInicial={busca}
            rotulo="Buscar por codigo, marca, modelo ou titulo"
            className="mb-4 max-w-lg"
          />

          {linhas.length === 0 ? (
            <EmptyState
              icone={Radar}
              titulo={
                busca
                  ? `Nada encontrado para "${busca}"`
                  : totalFontes === 0
                    ? "Nenhum site cadastrado ainda"
                    : "Nenhuma pagina coletada ainda"
              }
              descricao={
                busca
                  ? "Tente outro termo. A busca cobre titulo, marca, modelo e os codigos publicados pela loja — nao a descricao."
                  : totalFontes === 0
                    ? "Cadastre o primeiro site de concorrente ou fornecedor para comecar a coletar."
                    : 'Os sites estao cadastrados, mas ainda nao foram varridos. Use "Atualizar tabelas".'
              }
              acao={
                totalFontes === 0 && !busca ? (
                  <Link
                    href="/mercados/fontes"
                    className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    <Store size={16} />
                    Cadastrar um site
                  </Link>
                ) : null
              }
            />
          ) : (
            <TabelaMercados linhas={linhas} />
          )}

          {linhas.length > 0 && (
            <p className="mt-3 text-xs text-suave">
              {linhas.length === LIMITE
                ? `Mostrando os ${LIMITE} mais recentes. Refine a busca para ver outros.`
                : `${linhas.length} pagina(s) · clique numa linha para ver os detalhes`}
            </p>
          )}
        </>
      )}
    </>
  );
}

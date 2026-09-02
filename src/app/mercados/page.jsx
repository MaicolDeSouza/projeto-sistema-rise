import Link from "next/link";
import { Radar, Store } from "lucide-react";

import { prisma } from "@/lib/db";
import { produtosColetados } from "@/lib/coleta/arquivo";
import { normalizar } from "@/lib/texto";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import TabelaMercados from "@/components/mercados/TabelaMercados";
import FiltrosMercados from "@/components/mercados/FiltrosMercados";
import BotaoAtualizar from "@/components/mercados/BotaoAtualizar";

export const dynamic = "force-dynamic";

/// Teto de resultados por consulta. A tela e para procurar um produto, nao para
/// folhear vinte mil linhas.
///
/// FOLGADO O BASTANTE PARA NENHUMA FONTE SUMIR. Sao 20 produtos por fonte, e a
/// data de coleta e da COLETA INTEIRA, nao de cada produto — entao a ordenacao
/// agrupa por fonte, e um teto apertado corta a fonte mais antiga por completo,
/// nao algumas linhas dela. Com 100, a Casa da Robotica desaparecia da tela
/// inteira sendo que tinha 20 produtos coletados.
const LIMITE = 300;

/**
 * O texto onde a busca procura.
 *
 * Os mesmos campos que o `buscaTexto` do banco juntava na gravacao. A descricao
 * fica de fora de proposito: procurar nela devolveria o produto errado toda vez
 * que a loja citasse uma marca concorrente no texto de venda.
 */
function textoDeBusca(produto) {
  return normalizar(
    [produto.name, produto.brand, produto.model, produto.code, produto.mpn, produto.ean]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * O termo e quebrado em palavras e TODAS sao exigidas. Sem isso, "kingston nv2"
 * devolveria tudo da Kingston mais tudo que tem "nv2" — e o que o operador quer
 * e a intersecao, nao a uniao.
 */
function combina(produto, termo) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;

  const alvo = textoDeBusca(produto);
  return palavras.every((palavra) => alvo.includes(palavra));
}

export default async function MercadosPage({ searchParams }) {
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();

  // Valor de fora da URL nao entra cru: so o que a tela oferece vale, senao
  // "?tipo=qualquer-coisa" devolveria lista vazia sem explicacao.
  const tipo = ["CONCORRENTE", "FORNECEDOR"].includes(params?.tipo) ? params.tipo : "";
  const ordem = ["menor", "maior"].includes(params?.ordem) ? params.ordem : "";

  // OS PRODUTOS VEM DO JSON, as fontes vem do banco.
  //
  // Enquanto os testes correm, a coleta grava em dados/coleta/<dominio>/ e a
  // tabela `paginaColetada` fica vazia — ler dela mostraria tela vazia depois de
  // uma varredura bem-sucedida. O cadastro das fontes continua no banco, que e
  // onde ele sempre esteve.
  //
  // Quando o banco entrar, e `produtosColetados()` que muda; esta tela nao.
  let produtos = [];
  let totalFontes = 0;
  let erro = null;

  try {
    [produtos, totalFontes] = await Promise.all([
      produtosColetados(),
      prisma.fonteColeta.count(),
    ]);
  } catch (excecao) {
    erro = excecao;
  }

  const selecionados = produtos
    .filter((produto) => combina(produto, busca))
    .filter((produto) => !tipo || produto.fonte?.tipo === tipo);

  const linhas = selecionados
    /**
     * Ordem pedida pelo operador; sem pedido, a de sempre.
     *
     * Produto SEM PRECO vai para o fim nas duas ordenacoes, nunca para o topo
     * de "menor valor": fornecedor de atacado nao publica preco, e null tratado
     * como zero poria os vinte da Nightech na frente de tudo.
     */
    .sort((a, b) => {
      if (ordem === "menor" || ordem === "maior") {
        const precoA = a.prices?.promotional ?? a.prices?.normal ?? null;
        const precoB = b.prices?.promotional ?? b.prices?.normal ?? null;
        if (precoA === null && precoB === null) return 0;
        if (precoA === null) return 1;
        if (precoB === null) return -1;
        return ordem === "menor" ? precoA - precoB : precoB - precoA;
      }

      const disponivelA = a.stock?.status === "AVAILABLE" ? 1 : 0;
      const disponivelB = b.stock?.status === "AVAILABLE" ? 1 : 0;
      if (disponivelA !== disponivelB) return disponivelB - disponivelA;
      return String(b.coletadoEm).localeCompare(String(a.coletadoEm));
    })
    .slice(0, LIMITE)
    .map((produto) => ({
      id: produto.id,
      titulo: produto.name,
      marca: produto.brand,
      mpn: produto.mpn,
      skuFonte: produto.code,
      // So a PRIMEIRA imagem: e a miniatura da linha, e mandar a galeria
      // inteira de cem produtos seria carga que ninguem le.
      imagem: produto.images?.[0] ?? null,
      url: produto.url,
      origem: produto.origem,
      precoAtual: produto.prices?.normal ?? null,
      precoPromocional: produto.prices?.promotional ?? null,
      // Status desconhecido NAO e indisponivel: marcar assim poria metade das
      // lojas de luto sem que nenhuma tenha dito isso. So quem declarou
      // OutOfStock aparece como sem estoque.
      semEstoque: produto.stock?.status === "OUT_OF_STOCK",
      estoqueConhecido: produto.stock?.status === "AVAILABLE",
      quantidade:
        typeof produto.stock?.quantity === "number" ? produto.stock.quantity : null,
      vistoEm: produto.coletadoEm,
      fonteNome: produto.fonte?.nome ?? "?",
      fonteTipo: produto.fonte?.tipo ?? "OUTRO",
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
              Fontes ({totalFontes})
            </Link>
            <BotaoAtualizar />
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          {/*
            A CONTAGEM FICA AO LADO DA BUSCA, e nao so no rodape: com o filtro
            ligado, o numero e a resposta imediata de "quantos sobraram" — no
            fim da tabela, ele exige rolar cento e vinte linhas para ser lido.
          */}
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <CampoBusca
              valorInicial={busca}
              rotulo="Buscar por codigo, marca, modelo ou titulo"
              className="w-full max-w-lg"
            />
            <p className="text-sm text-suave">
              {selecionados.length === produtos.length ? (
                <>
                  <span className="font-medium text-texto tabular-nums">
                    {produtos.length}
                  </span>{" "}
                  produto(s)
                </>
              ) : (
                // Com filtro, os dois numeros: sozinho, "20" nao diz se a loja
                // tem 20 ou se o filtro escondeu 100.
                <>
                  <span className="font-medium text-texto tabular-nums">
                    {selecionados.length}
                  </span>{" "}
                  de <span className="tabular-nums">{produtos.length}</span> produto(s)
                </>
              )}
            </p>
          </div>

          <FiltrosMercados tipo={tipo} ordem={ordem} />

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
                    : 'Os sites estao cadastrados, mas ainda nao foram varridos. Use "Atualizar dados" — com o worker rodando (npm run worker).'
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
            // A contagem subiu para o lado da busca; aqui fica so o que o
            // rodape ainda responde: como abrir o detalhe, e o aviso de que a
            // lista foi cortada no teto.
            <p className="mt-3 text-xs text-suave">
              {selecionados.length > LIMITE
                ? `Mostrando ${LIMITE} de ${selecionados.length}. Refine a busca para ver os outros.`
                : "Clique numa linha para ver os detalhes"}
            </p>
          )}
        </>
      )}
    </>
  );
}

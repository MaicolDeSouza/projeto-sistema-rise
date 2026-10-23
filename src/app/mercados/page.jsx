import Link from "next/link";
import { Radar, Store } from "lucide-react";

import { prisma } from "@/lib/db";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { abasDoScraper } from "@/lib/acessos/projecoes";
import { listarProdutos, miniaturas } from "@/lib/coleta/banco";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import BotaoBuscaAmpla from "@/components/ui/BotaoBuscaAmpla";
import { textoDoSelo } from "@/lib/buscaAmpla";
import TabelaMercados from "@/components/mercados/TabelaMercados";
import FiltrosMercados from "@/components/mercados/FiltrosMercados";
import BotaoAtualizar from "@/components/mercados/BotaoAtualizar";
import Paginacao from "@/components/mercados/Paginacao";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import { porPaginaDaUrl } from "@/lib/porPagina";
import VoltarAoTopo from "@/components/ui/VoltarAoTopo";

export const dynamic = "force-dynamic";

/// Linhas por pagina.
///
/// Antes daqui havia um TETO de 300: o resto da lista simplesmente nao existia
/// para a tela, e o rodape mandava "refinar a busca" para ver produtos que o
/// operador tinha coletado. Com a Fortek e a Nightech em disco sao 2.469, entao
/// o corte deixou de ser teorico — 88% do acervo estava inalcancavel.
///
/// Era 100 (o mesmo numero do Bling, de onde veio o pedido original); baixado
/// para 25 a pedido do dono em 29/09/2026, o mesmo numero da lista de Produtos.
// Desde 23/10/2026 o tamanho vem da URL: 25 ao abrir, 100 com o botao "100 por página" (lib/porPagina.js).

export default async function MercadosPage({ searchParams }) {
  // Acessos: o Scraper em ver, e so as abas liberadas (fornecedor com Custo, concorrente com Concorrentes).
  const { pode } = await exigirAcessoNaPagina("tela.scraper", "ver");
  const abas = abasDoScraper(pode);
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();

  // Valor de fora da URL nao entra cru: so o que a tela oferece vale, senao
  // "?tipo=qualquer-coisa" devolveria lista vazia sem explicacao. Com uma aba so, o tipo e o dela.
  const tiposLiberados = abas.map((aba) => (aba === "fornecedores" ? "FORNECEDOR" : "CONCORRENTE"));
  const tipo =
    tiposLiberados.length === 1 ? tiposLiberados[0] : tiposLiberados.includes(params?.tipo) ? params.tipo : "";
  // Ordem pelo cabecalho da coluna (23/10/2026, como em Produtos). O link antigo ?ordem=menor|maior vira a coluna Valor.
  const COLUNAS = ["nome", "codigo", "estoque", "valor", "atualizado"];
  const ordemAntiga = ["menor", "maior"].includes(params?.ordem) ? params.ordem : "";
  const ordenar = COLUNAS.includes(params?.ordenar) ? params.ordenar : ordemAntiga ? "valor" : "";
  const direcao = ordenar
    ? params?.direcao === "desc" || (!params?.ordenar && ordemAntiga === "maior") ? "desc" : "asc"
    : "";
  // Busca ampla (09/10/2026): procura tambem na descricao, ficha e SEO. So vale com algo digitado.
  const ampla = params?.ampla === "1";

  /*
    VARIAS FONTES AO MESMO TEMPO: ?fonte=A&fonte=B.

    O Next entrega uma string quando o parametro aparece uma vez e um array
    quando repete — ler so um dos dois casos faria o filtro de uma fonte
    funcionar e o de duas nao, ou o contrario. Nome que nao existe mais (fonte
    excluida, link antigo) e descartado em silencio mais abaixo: manter travaria
    a tela numa lista vazia sem explicacao.
  */
  const pedidas = params?.fonte === undefined ? [] : [params.fonte].flat();
  const pedida = Number.parseInt(params?.pagina ?? "1", 10);
  const porPagina = porPaginaDaUrl(params?.por);

  /*
    FILTRO, ORDEM, CONTAGEM E PAGINA SAO DO BANCO (17/09/2026).

    A tela lia a lista inteira e fazia tudo em memoria. Com 2 mil produtos
    passava; com 35.226 eram 20 MB montados em 2,3 s A CADA clique — marcar uma
    fonte, trocar de aba, limpar filtro. Hoje o Postgres devolve so as linhas da
    pagina (porPagina) e as contagens, e a miniatura vem so para essas.
  */
  let resultado = { linhas: [], total: 0, totalGeral: 0, contagemPorFonte: [] };
  let totalFontes = 0;
  let erro = null;

  try {
    // Sem aba liberada nada e consultado.
    [resultado, totalFontes] = abas.length === 0 ? [resultado, 0] : await Promise.all([
      listarProdutos({
        tipo,
        fontes: pedidas,
        busca,
        ordenar,
        direcao,
        ampla,
        pagina: Math.max(Number.isFinite(pedida) ? pedida : 1, 1),
        porPagina,
      }),
      prisma.fonteColeta.count(),
    ]);
  } catch (excecao) {
    erro = excecao;
  }

  /*
    AS FONTES QUE O FILTRO OFERECE sao todas as cadastradas da aba, com 0 quando
    ainda nao tem produto (pedido do dono em 09/10/2026). Respeitam o filtro de
    tipo — com "Fornecedores" ligado, listar concorrentes no seletor so daria
    escolha que se anula.
  */
  const fontes = resultado.contagemPorFonte;
  const nomesValidos = new Set(fontes.map((item) => item.nome));
  const fonte = pedidas.filter((nome) => nomesValidos.has(nome));

  /*
    A PAGINA E CORRIGIDA PARA DENTRO DA LISTA, nunca aceita como veio.

    "?pagina=99" numa lista de tres paginas mostraria tabela vazia, e o mesmo
    acontece sozinho quando a varredura seguinte encolhe a lista com o link
    guardado. Aqui a pagina fora do intervalo vira a ultima valida, entao a tela
    sempre tem o que mostrar — e so a pagina fora do intervalo custa uma segunda
    consulta.
  */
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / porPagina));
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

  if (!erro && abas.length > 0 && pagina !== Math.max(Number.isFinite(pedida) ? pedida : 1, 1)) {
    resultado = await listarProdutos({
      tipo,
      fontes: fonte,
      busca,
      ordenar,
      direcao,
      ampla,
      pagina,
      porPagina,
    });
  }

  const paginaAtual = resultado.linhas;
  const inicio = (pagina - 1) * porPagina;

  /*
    A ORDEM AGORA E DO BANCO (`listarProdutos`): "menor valor" ordena por
    COALESCE(normal, promocional) com os SEM PRECO sempre no fim — fornecedor de
    atacado nao publica preco, e null tratado como zero poria os da Nightech na
    frente de tudo. Sem pedido, disponivel primeiro e coleta mais recente depois.
  */

  // So as cem da pagina ganham foto. Na Fortek a miniatura e base64: trazer a
  // de todos os 2.400 produtos para mostrar cem seria carga que ninguem ve.
  const fotos = await miniaturas(paginaAtual.map((produto) => produto.id));

  const linhas = paginaAtual.map((produto) => ({
      id: produto.id,
      titulo: produto.name,
      marca: produto.brand,
      mpn: produto.mpn,
      skuFonte: produto.code,
      // So a PRIMEIRA imagem: e a miniatura da linha, e mandar a galeria
      // inteira de cem produtos seria carga que ninguem le.
      imagem: fotos.get(produto.id) ?? null,
      url: produto.url,
      origem: produto.origem,
      precoAtual: produto.prices?.normal ?? null,
      precoPromocional: produto.prices?.promotional ?? null,
      // So preenchido quando ha reserva (o que vai chegar, comprado e em
      // transito) — nunca substitui o normal, sao precos de coisas diferentes.
      precoReserva:
        typeof produto.prices?.reserva === "number" ? produto.prices.reserva : null,
      // Status desconhecido NAO e indisponivel: marcar assim poria metade das
      // lojas de luto sem que nenhuma tenha dito isso. So quem declarou
      // OutOfStock aparece como sem estoque.
      semEstoque: produto.stock?.status === "OUT_OF_STOCK",
      /*
        DOIS NOMES PARA O MESMO FATO: o raspador de site grava "AVAILABLE" e os
        leitores de arquivo gravam "IN_STOCK". A tela so conhecia o primeiro, e
        os 1.592 produtos EM ESTOQUE da Fortek apareciam sem linha nenhuma de
        estoque — nem disponivel, nem esgotado, nada. Status desconhecido
        continua nao virando indisponivel: so quem declarou OutOfStock aparece
        como sem estoque.
      */
      estoqueConhecido: ["AVAILABLE", "IN_STOCK"].includes(produto.stock?.status),
      quantidade:
        typeof produto.stock?.quantity === "number" ? produto.stock.quantity : null,
      // O que esta comprado e em transito. NUNCA somado a pronta entrega: um
      // numero so prometeria entrega que nao existe.
      aChegar: typeof produto.stock?.aChegar === "number" ? produto.stock.aChegar : null,
      // Distribuidor cobra imposto por fora — a Benser escreve "Preco unit. sem
      // IPI". Sem isto a lista compara o preco de vitrine do concorrente com um
      // custo de fornecedor que ninguem paga.
      precoComImpostos:
        typeof produto.prices?.comImpostos === "number" ? produto.prices.comImpostos : null,
      impostos: produto.taxes ?? [],
      // Faixas por quantidade (a Santana publica 3-4 e 5+ un., com desconto
      // sobre a unidade): a lista mostra todas, o detalhe (RegrasDeCompra)
      // repete a mesma tabela com o multiplo de venda ao lado.
      precosPorQuantidade: produto.precosPorQuantidade ?? [],
      vistoEm: produto.coletadoEm,
      // Quando foi visto pela ultima vez, se a ultima varredura da loja nao o viu (a tabela marca).
      naoVistoDesde: produto.naoVistoDesde ?? null,
      // Busca ampla: onde a palavra foi achada, quando nao estava no nome (a tabela mostra o selo).
      achado: textoDoSelo(produto.achadoEm),
      fonteNome: produto.fonte?.nome ?? "?",
      fonteTipo: produto.fonte?.tipo ?? "OUTRO",
      // So para o link de fallback quando o produto nao tem URL propria.
      fonteDominio: produto.fonte?.dominio ?? null,
    }));

  return (
    <>
      <PageHeader
        titulo="Scraper"
        descricao="Produtos, preços e códigos coletados dos sites de concorrentes e fornecedores."
        acao={
          <div className="flex items-start gap-2">
            {pode("tela.scraper.fontes", "ver") && (
            <Link
              href="/mercados/fontes"
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm font-medium hover:bg-fundo"
            >
              <Store size={16} />
              Fontes ({totalFontes})
            </Link>
            )}
            {pode("acao.scraper.varrer", "executar") && <BotaoAtualizar />}
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {abas.length === 0 && (
        <EmptyState
          icone={Radar}
          titulo="Nada liberado para o seu acesso"
          descricao="Os produtos de fornecedores e de concorrentes dependem do acesso ao custo e aos concorrentes. Peça ao administrador."
        />
      )}

      {!erro && abas.length > 0 && (
        <>
          {/*
            A CONTAGEM FICA AO LADO DA BUSCA, e nao so no rodape: com o filtro
            ligado, o numero e a resposta imediata de "quantos sobraram" — no
            fim da tabela, ele exige rolar cento e vinte linhas para ser lido.
          */}
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <div className="flex w-full max-w-2xl items-center gap-2">
              <CampoBusca
                valorInicial={busca}
                rotulo={ampla ? "Buscar também em descrição, ficha, SEO e fonte" : "Buscar por código, marca, modelo ou título"}
                className="w-full max-w-lg"
              />
              <BotaoBuscaAmpla
                ligada={ampla}
                ajuda="Procura também na descrição, na ficha técnica, na categoria e no SEO de cada loja, e no nome da fonte: digitar o nome de uma loja traz todos os produtos dela. Os achados pelo nome vêm primeiro."
              />
            </div>
            <p className="text-sm text-suave">
              {resultado.total === resultado.totalGeral ? (
                <>
                  <span className="font-medium text-texto tabular-nums">
                    {resultado.totalGeral.toLocaleString("pt-BR")}
                  </span>{" "}
                  produto(s)
                </>
              ) : (
                // Com filtro, os dois numeros: sozinho, "20" nao diz se a loja
                // tem 20 ou se o filtro escondeu 100.
                <>
                  <span className="font-medium text-texto tabular-nums">
                    {resultado.total.toLocaleString("pt-BR")}
                  </span>{" "}
                  de{" "}
                  <span className="tabular-nums">
                    {resultado.totalGeral.toLocaleString("pt-BR")}
                  </span>{" "}
                  produto(s)
                </>
              )}
            </p>
          </div>

          {/*
            Filtros a esquerda, navegacao a direita, na MESMA linha — foi onde o
            dono pediu. Em tela estreita o `flex-wrap` poe a navegacao embaixo
            em vez de espremer as duas.
          */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4">
            <FiltrosMercados tipo={tipo} ordenar={ordenar} direcao={direcao} fonte={fonte} fontes={fontes} abas={abas} />
            <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={resultado.total} porPagina={porPagina} />
          </div>

          {linhas.length === 0 ? (
            <EmptyState
              icone={Radar}
              titulo={
                busca
                  ? `Nada encontrado para "${busca}"`
                  : totalFontes === 0
                    ? "Nenhum site cadastrado ainda"
                    : "Nenhuma página coletada ainda"
              }
              descricao={
                busca
                  ? "Tente outro termo. A busca cobre título, marca, modelo e os códigos publicados pela loja — não a descrição."
                  : totalFontes === 0
                    ? "Cadastre o primeiro site de concorrente ou fornecedor para começar a coletar."
                    : 'Os sites estão cadastrados, mas ainda não foram varridos. Use "Atualizar dados" — com o worker rodando (npm run worker).'
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
            <TabelaMercados linhas={linhas} ordenar={ordenar} direcao={direcao} />
          )}

          {linhas.length > 0 && (
            <>
              {/*
                A NAVEGACAO SE REPETE NO FIM. Quem chega ao rodape acabou de
                rolar cem linhas; mandar rolar tudo de volta so para clicar em
                "Proxima" desfaz o trabalho que a paginacao deveria poupar.
              */}
              <div className="border-t border-borda">
                <Paginacao
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  primeiro={inicio + 1}
                  ultimo={inicio + linhas.length}
                  total={resultado.total}
                />
              </div>

              <p className="text-xs text-suave">Clique numa linha para ver os detalhes</p>
            </>
          )}
        </>
      )}

      <VoltarAoTopo />
    </>
  );
}

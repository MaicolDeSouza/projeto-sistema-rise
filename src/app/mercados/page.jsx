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
import Paginacao from "@/components/mercados/Paginacao";
import VoltarAoTopo from "@/components/ui/VoltarAoTopo";

export const dynamic = "force-dynamic";

/// Linhas por pagina.
///
/// Antes daqui havia um TETO de 300: o resto da lista simplesmente nao existia
/// para a tela, e o rodape mandava "refinar a busca" para ver produtos que o
/// operador tinha coletado. Com a Fortek e a Nightech em disco sao 2.469, entao
/// o corte deixou de ser teorico — 88% do acervo estava inalcancavel.
///
/// Cem e o que cabe numa rolagem sem a pagina ficar pesada, e e o mesmo numero
/// que o Bling usa, de onde veio o pedido.
const POR_PAGINA = 100;

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

  /*
    AS FONTES QUE O FILTRO OFERECE saem dos produtos coletados, nao do cadastro:
    fonte cadastrada e ainda nao varrida ofereceria um filtro que devolve lista
    vazia. Respeitam o filtro de tipo — com "Fornecedores" ligado, listar
    concorrentes no seletor so daria escolha que se anula.
  */
  const doTipo = produtos.filter((produto) => !tipo || produto.fonte?.tipo === tipo);

  const contagemPorFonte = new Map();
  for (const produto of doTipo) {
    const nome = produto.fonte?.nome;
    if (nome) contagemPorFonte.set(nome, (contagemPorFonte.get(nome) ?? 0) + 1);
  }
  const fontes = [...contagemPorFonte]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  /*
    VARIAS FONTES AO MESMO TEMPO: ?fonte=A&fonte=B.

    O Next entrega uma string quando o parametro aparece uma vez e um array
    quando repete — ler so um dos dois casos faria o filtro de uma fonte
    funcionar e o de duas nao, ou o contrario. Nome que nao existe mais (fonte
    excluida, link antigo) e descartado em silencio: manter travaria a tela numa
    lista vazia sem explicacao.
  */
  const pedidas = params?.fonte === undefined ? [] : [params.fonte].flat();
  const fonte = pedidas.filter((nome) => contagemPorFonte.has(nome));

  const selecionados = doTipo
    .filter((produto) => combina(produto, busca))
    .filter((produto) => fonte.length === 0 || fonte.includes(produto.fonte?.nome));

  /*
    A PAGINA E CORRIGIDA PARA DENTRO DA LISTA, nunca aceita como veio.

    "?pagina=99" numa lista de tres paginas mostraria tabela vazia, e o mesmo
    acontece sozinho quando a varredura seguinte encolhe a lista com o link
    guardado. Aqui a pagina fora do intervalo vira a ultima valida, entao a tela
    sempre tem o que mostrar.
  */
  const totalPaginas = Math.max(1, Math.ceil(selecionados.length / POR_PAGINA));
  const pedida = Number.parseInt(params?.pagina ?? "1", 10);
  const pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);
  const inicio = (pagina - 1) * POR_PAGINA;

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
    .slice(inicio, inicio + POR_PAGINA)
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

          {/*
            Filtros a esquerda, navegacao a direita, na MESMA linha — foi onde o
            dono pediu. Em tela estreita o `flex-wrap` poe a navegacao embaixo
            em vez de espremer as duas.
          */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4">
            <FiltrosMercados tipo={tipo} ordem={ordem} fonte={fonte} fontes={fontes} />
            <Paginacao
              compacto
              pagina={pagina}
              totalPaginas={totalPaginas}
              primeiro={inicio + 1}
              ultimo={inicio + linhas.length}
              total={selecionados.length}
            />
          </div>

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
                  total={selecionados.length}
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

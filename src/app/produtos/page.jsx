import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { idsDaBuscaDeProdutos, ondeAchouNoProduto, palavrasDaBusca, textoDoSelo } from "@/lib/buscaAmpla";
import { CANAIS, separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import { estadoDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import { INCLUDE_DO_ICONE_BLING, iconeBlingDoProduto } from "@/lib/blingSync/estado";
import { documentosDoProduto } from "@/lib/canaisDeVenda/li/banco";
import { iconeLIDoProduto } from "@/lib/canaisDeVenda/li/estado";
import { mudancasDosKits } from "@/lib/composicaoBanco";
import { localizacaoDoKit } from "@/lib/composicao";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Paginacao from "@/components/mercados/Paginacao";
import TabelaProdutos from "@/components/produtos/TabelaProdutos";
import BotaoImportarBling from "@/components/produtos/BotaoImportarBling";
import BotaoSincronizarEstoque from "@/components/produtos/BotaoSincronizarEstoque";

export const dynamic = "force-dynamic";

/// 25 por pagina (pedido do dono em 22/09/2026, mesmo padrao paginado de
/// Mercados): 1.316 produtos numa tabela so ficaram pesados de renderizar e de
/// interagir — cada clique (ordenar, marcar Conferido) esperava a lista
/// inteira redesenhar.
const POR_PAGINA = 25;

/// Coluna -> campo do Prisma. So as marcadas pelo dono em 22/09/2026 (Codigo,
/// Localizacao, Preco, Estoque); as demais (Imagem, Nome, Conferido, Canais)
/// nao tem ordenacao propria.
const CAMPO_DE_ORDENACAO = {
  codigo: "sku",
  localizacao: "localizacao",
  preco: "precoVenda",
  estoque: "estoque",
};

/// O que deu errado no Salvar de um produto novo (a tela do produto mostrava isso antes de o Salvar voltar para a lista).
const TEXTO_DO_AVISO = {
  fotos: "as fotos não foram gravadas (envie de novo no bloco de imagens)",
  documentos: "os documentos não foram gravados (envie de novo em Documentos técnicos)",
  fornecedores: "os fornecedores não foram gravados (adicione de novo na aba Fornecedores / Concorrentes)",
  concorrentes: "os concorrentes não foram gravados (adicione de novo na aba Fornecedores / Concorrentes)",
};

export default async function ProdutosPage({ searchParams }) {
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();
  const ordenar = CAMPO_DE_ORDENACAO[params?.ordenar] ? params.ordenar : "";
  const direcao = params?.direcao === "asc" ? "asc" : "desc";
  const pedida = Number.parseInt(params?.pagina ?? "1", 10);

  // BUSCA COM INDICE (pedido do dono em 09/10/2026: a lista vai crescer muito). Todas as palavras, em qualquer
  // ordem, no nome, codigo, marca, modelo e EAN; com a BUSCA AMPLA ligada, tambem na descricao, NCM, homologacao
  // e localizacao. O indice devolve os ids, e a pagina e a ordem continuam no Prisma (ver lib/buscaAmpla.js).
  const ampla = params?.ampla === "1";
  // Produto recem-criado (o Salvar do cadastro novo volta para ca, pedido do dono em 10/10/2026): a linha dele vem
  // destacada, e o que nao foi gravado (fotos, documentos, fornecedores, concorrentes) aparece aqui em cima.
  const novoId = typeof params?.novo === "string" ? params.novo : null;
  const avisosDoNovo = ["fotos", "documentos", "fornecedores", "concorrentes"].filter((chave) => params?.[chave] === "falhou");
  const palavras = palavrasDaBusca(busca);
  let where;
  try {
    const ids = await idsDaBuscaDeProdutos(busca, { ampla });
    where = ids === null ? undefined : { id: { in: ids } };
  } catch {
    // Sem o indice (banco sem a migration), a busca antiga, so por nome e codigo.
    where = busca
      ? { OR: [{ tituloBase: { contains: busca, mode: "insensitive" } }, { sku: { contains: busca, mode: "insensitive" } }] }
      : undefined;
  }

  // Ordenar no banco ANTES de paginar, e nao so na pagina carregada: senao
  // "ordenar por preco" so organizaria os 25 produtos que ja estavam na tela,
  // sem tocar nos outros 1.291 (pedido do dono em 22/09/2026 — o filtro/
  // ordenacao tem que valer para o acervo inteiro).
  const orderBy = ordenar
    ? { [CAMPO_DE_ORDENACAO[ordenar]]: direcao }
    : { atualizadoEm: "desc" };

  let produtos = null;
  let total = 0;
  let totalConferidos = 0;
  let pagina = 1;
  let totalPaginas = 1;
  let erro = null;

  try {
    total = await prisma.produto.count({ where });
    totalConferidos = await prisma.produto.count({ where: { ...where, conferido: true } });

    totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    // Pagina fora do intervalo (link velho, ou lista que encolheu com a busca)
    // cai na ultima valida, em vez de tabela vazia (mesma regra de Mercados).
    pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

    produtos = await prisma.produto.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        arquivos: {
          where: { tipo: "IMAGEM", papel: "FOTO" },
          orderBy: { ordem: "asc" },
          take: 1,
        },
        anuncios: {
          select: {
            canal: true,
            status: true,
            situacaoCanal: true,
            idExterno: true,
            // Para o icone da Loja Integrada: o rascunho e a assinatura do ultimo envio.
            produtoId: true,
            titulo: true,
            descricao: true,
            dados: true,
            hashConteudo: true,
            sincronizadoEm: true,
          },
        },
        // Para o icone do Bling: os fornecedores (entram na assinatura dos campos) e quantos
        // ajustes de estoque ainda nao foram ao Bling. So banco: a lista nao chama o Bling.
        ...INCLUDE_DO_ICONE_BLING,
      },
    });
  } catch (excecao) {
    erro = excecao;
  }

  // O "!" do kit (pedido do dono em 10/10/2026): quantas pecas mudaram desde o ultimo Salvar de cada kit da pagina.
  // Falha aqui nao derruba a lista: o kit fica sem o "!".
  let alteracoesDosKits = new Map();
  let novoProduto = null;
  // As pecas de cada kit da pagina, para a Localizacao dele (`localizacaoDoKit`) e o popup da celula (pedido do dono em
  // 10/10/2026). Falha aqui tambem nao derruba a lista: a celula mostra a localizacao gravada.
  const pecasDosKits = new Map();
  try {
    const kitsDaPagina = (produtos ?? []).filter((produto) => produto.tipo === "COMPOSICAO").map((produto) => produto.id);
    if (kitsDaPagina.length > 0) {
      alteracoesDosKits = await mudancasDosKits(kitsDaPagina);
      const linhasDasPecas = await prisma.produtoComponente.findMany({
        where: { kitId: { in: kitsDaPagina } },
        orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
        select: { kitId: true, quantidade: true, componente: { select: { id: true, sku: true, tituloBase: true, localizacao: true } } },
      });
      for (const linha of linhasDasPecas) {
        const lista = pecasDosKits.get(linha.kitId) ?? [];
        lista.push({ ...linha.componente, quantidade: linha.quantidade });
        pecasDosKits.set(linha.kitId, lista);
      }
    }
    if (novoId) novoProduto = await prisma.produto.findUnique({ where: { id: novoId }, select: { id: true, sku: true } });
  } catch (excecao) {
    console.error("[produtos] pecas alteradas dos kits", excecao);
  }

  // Icone da Loja Integrada: os documentos entram na assinatura so quando ha endereco publico (sem
  // ele, documentosDoProduto devolve [] sem consultar). Falha aqui nao derruba a lista: o icone fica
  // sem selo.
  const documentosLI = new Map();
  try {
    for (const produto of produtos ?? []) documentosLI.set(produto.id, await documentosDoProduto(produto));
  } catch (excecao) {
    console.error("[loja integrada] icone", excecao);
  }

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente: converta aqui.
  const linhas = (produtos ?? []).map((produto) => ({
    produto: {
      id: produto.id,
      sku: produto.sku,
      tituloBase: produto.tituloBase,
      // Kit: o texto que o cadastro mostra (a das pecas, ou `100101(F9) / 101010(H2)`), e nao o gravado, que so se
      // atualiza no proximo Salvar do kit ou quando uma peca muda de lugar.
      localizacao: produto.tipo === "COMPOSICAO"
        ? (localizacaoDoKit(pecasDosKits.get(produto.id) ?? []).valor ?? produto.localizacao)
        : produto.localizacao,
      precoVenda: produto.precoVenda ? Number(produto.precoVenda) : null,
      // So para a margem do popup de preco: o custo do cadastro e, na falta dele, o
      // do rascunho do Bling (e la que esta o custo da maioria dos produtos importados).
      custo: produto.custo
        ? Number(produto.custo)
        : Number(produto.fornecedorRascunho?.precoCusto) > 0
          ? Number(produto.fornecedorRascunho.precoCusto)
          : null,
      estoque: produto.estoque,
      // Kit: o estoque e calculado pelas pecas e a celula nao abre o ajuste.
      tipo: produto.tipo,
      // Kit: a celula da localizacao nao tem lapis e abre o popup com as pecas (pedido do dono em 10/10/2026).
      pecasDoKit: produto.tipo === "COMPOSICAO" ? (pecasDosKits.get(produto.id) ?? []) : [],
      pecasAlteradas: alteracoesDosKits.get(produto.id)?.length ?? 0,
      ativo: produto.ativo,
      conferido: produto.conferido,
      imagemUrl: produto.arquivos[0]
        ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo)
        : null,
    },
    // Busca ampla: "achado na descrição" quando a palavra nao estava no nome nem no codigo.
    achado: ampla && palavras.length > 0 ? textoDoSelo(ondeAchouNoProduto(produto, palavras)) : null,
    ...separarCanais(produto.anuncios),
    // O icone do ML mostra o anuncio (publicado e ativo, ou pendente), nao so o idExterno.
    iconeML: estadoDoIconeML(produto.anuncios),
    // Cor e selo do icone do Bling, calculados aqui (a assinatura usa node:crypto, so servidor).
    iconeBling: iconeBlingDoProduto(produto),
    // Cor e selo do icone da Loja Integrada (assinatura com node:crypto, so servidor).
    iconeLI: iconeLIDoProduto(produto, produto.anuncios.find((anuncio) => anuncio.canal === "LOJA_INTEGRADA") ?? null, {
      documentos: documentosLI.get(produto.id) ?? [],
    }),
  }));

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="O cadastro base da loja. Todo anúncio nos canais deriva de um produto daqui."
        acao={
          <div className="flex items-start gap-3">
            <BotaoImportarBling />
            <BotaoSincronizarEstoque />
            <Link
              href="/produtos/novo"
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={16} />
              Novo produto
            </Link>
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {novoProduto && avisosDoNovo.length > 0 && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>
            O produto <strong>{novoProduto.sku}</strong> foi salvo, mas{" "}
            {avisosDoNovo.map((chave) => TEXTO_DO_AVISO[chave]).join("; ")}.{" "}
            <Link href={`/produtos/${novoProduto.id}`} className="font-medium underline">
              Abrir o produto
            </Link>
          </p>
        </div>
      )}
      {/* O fundo verde da linha recem-criada some sozinho (so CSS: sem estado nem efeito). */}
      {novoProduto && (
        <style>{"@keyframes riseLinhaNova { 0%, 50% { background-color: #d1fae5; } 100% { background-color: transparent; } }"}</style>
      )}

      {!erro && (
        <>
          <TabelaProdutos
            linhas={linhas}
            destacarId={novoProduto?.id ?? null}
            busca={busca}
            ampla={ampla}
            ordenar={ordenar}
            direcao={direcao}
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            totalConferidos={totalConferidos}
          />

          {/* Repete embaixo (mesmo motivo de Mercados): quem rolou a pagina
              inteira nao devia ter que voltar ao topo so para "Proxima". */}
          {linhas.length > 0 && (
            <div className="border-t border-borda">
              <Paginacao
                pagina={pagina}
                totalPaginas={totalPaginas}
                primeiro={(pagina - 1) * POR_PAGINA + 1}
                ultimo={(pagina - 1) * POR_PAGINA + linhas.length}
                total={total}
              />
            </div>
          )}

          <p className="mt-3 text-xs text-suave">
            {total} produto(s) · Canais previstos:{" "}
            {CANAIS.map((canal) => canal.nome).join(", ")}
          </p>
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { canais, temAlteracoesNaoPublicadas } from "@/lib/anuncios/canais";
import { anuncioPorCanal } from "@/lib/canais";
import { validarAnuncio } from "@/lib/anuncios/validar";
import { camposEditaveis, montarPayload } from "@/lib/anuncios/transformar";
import PageHeader from "@/components/ui/PageHeader";
import EditorAnuncio from "@/components/anuncios/EditorAnuncio";

export const dynamic = "force-dynamic";

export default async function AnuncioPage({ params }) {
  const { id } = await params;

  const produto = await prisma.produto.findUnique({
    where: { id },
    include: {
      // `imagens` deixou de existir em 27/08/2026: virou `arquivos`, uma tabela
      // so para imagem, ficha e manual. Aqui interessa a imagem, na ordem em
      // que o operador as arrumou no cadastro.
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" } },
      anuncios: true,
    },
  });

  if (!produto) notFound();

  const porCanal = anuncioPorCanal(produto.anuncios);
  const blingPublicado = porCanal.get("BLING")?.status === "PUBLICADO";

  // Toda a validacao e a montagem de payload acontecem no servidor e viajam
  // prontas para a tela: os modulos de canal usam node:crypto e nao podem ir
  // para o bundle do cliente.
  const abas = canais.map((canal) => {
    const anuncio = porCanal.get(canal.id) ?? null;

    const validacao = anuncio
      ? validarAnuncio(produto, anuncio, { contexto: { blingPublicado } })
      : { problemas: [], bloqueantes: 0, alertas: 0, podePublicar: false };

    return {
      id: canal.id,
      nome: canal.nome,
      resumo: canal.resumo,
      disponivel: canal.disponivel,
      motivoIndisponivel: canal.motivoIndisponivel ?? null,
      viaBling: Boolean(canal.viaBling),
      obrigatorio: Boolean(canal.obrigatorio),
      anuncio: anuncio
        ? {
            status: anuncio.status,
            situacaoCanal: anuncio.situacaoCanal,
            titulo: anuncio.titulo,
            descricao: anuncio.descricao,
            // Valor efetivo: o canal usa o proprio conteudo quando existe e
            // herda da aba Base quando nao. Sem isso o campo mostraria "nao
            // informado" enquanto a validacao reclama do titulo herdado.
            tituloEfetivo: anuncio.titulo ?? produto.tituloBase,
            tituloHerdado: !anuncio.titulo,
            descricaoEfetiva: anuncio.descricao ?? produto.descricaoBase,
            descricaoHerdada: !anuncio.descricao,
            categoriaExternaId: anuncio.categoriaExternaId,
            atributos: anuncio.atributos,
            idExterno: anuncio.idExterno,
            urlExterna: anuncio.urlExterna,
            erro: anuncio.erro,
            temVendas: anuncio.temVendas,
            publicadoEm: anuncio.publicadoEm,
            sincronizadoEm: anuncio.sincronizadoEm,
            desatualizado: temAlteracoesNaoPublicadas(produto, anuncio),
          }
        : null,
      validacao,
      editaveis: anuncio ? camposEditaveis(anuncio) : {},
      payload: anuncio ? montarPayload(produto, anuncio) : null,
    };
  });

  const base = {
    id: produto.id,
    sku: produto.sku,
    ean: produto.ean,
    marca: produto.marca,
    modelo: produto.modelo,
    tituloBase: produto.tituloBase,
    descricaoBase: produto.descricaoBase,
    custo: produto.custo ? Number(produto.custo) : null,
    precoVenda: produto.precoVenda ? Number(produto.precoVenda) : null,
    estoque: produto.estoque,
    garantiaMeses: produto.garantiaMeses,
    ativo: produto.ativo,
    // O ENDERECO E CALCULADO, nunca lido de coluna: os arquivos moram em
    // dados/produtos/<SKU>/, e uma URL gravada ficaria velha na primeira vez que
    // o SKU mudasse. A mesma `urlDe` que o bloco de Produtos usa.
    imagens: produto.arquivos.map((arquivo) =>
      urlDe(produto.sku, arquivo.tipo, arquivo.arquivo),
    ),
  };

  return (
    <>
      <Link
        href="/anuncios"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para anúncios
      </Link>

      <PageHeader titulo={produto.tituloBase} descricao={`SKU ${produto.sku}`} />

      <EditorAnuncio base={base} abas={abas} />
    </>
  );
}

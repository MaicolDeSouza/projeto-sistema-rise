import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { canais, temAlteracoesNaoPublicadas } from "@/lib/anuncios/canais";
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
      imagens: { orderBy: { ordem: "asc" } },
      anuncios: true,
    },
  });

  if (!produto) notFound();

  const porCanal = new Map(
    produto.anuncios.map((anuncio) => [anuncio.canal, anuncio]),
  );
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
    imagens: produto.imagens.map((imagem) => imagem.url),
  };

  return (
    <>
      <Link
        href="/anuncios"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para anuncios
      </Link>

      <PageHeader titulo={produto.tituloBase} descricao={`SKU ${produto.sku}`} />

      <EditorAnuncio base={base} abas={abas} />
    </>
  );
}

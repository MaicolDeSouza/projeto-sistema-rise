import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import { config } from "@/lib/integracoes/config";
import { listarFornecedores } from "@/app/produtos/acoes";
import PageHeader from "@/components/ui/PageHeader";
import FormularioProduto from "@/components/produtos/FormularioProduto";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({ params, searchParams }) {
  const { id } = await params;
  // Resultado da copia de imagens no cadastro por "Buscar por codigo".
  const busca = await searchParams;
  const imagensCopiadas = busca?.imagens !== undefined ? Number(busca.imagens) || 0 : null;
  const imagensRecusadas = Number(busca?.recusadas) || 0;

  const registro = await prisma.produto.findUnique({
    where: { id },
    include: {
      arquivos: { orderBy: { ordem: "asc" } },
      fornecedores: {
        include: { fornecedor: { select: { nome: true } } },
        orderBy: { criadoEm: "asc" },
      },
      anuncios: {
        select: {
          canal: true,
          status: true,
          situacaoCanal: true,
          idExterno: true,
        },
      },
    },
  });

  if (!registro) notFound();

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente.
  const produto = {
    id: registro.id,
    sku: registro.sku,
    ean: registro.ean,
    marca: registro.marca,
    modelo: registro.modelo,
    tituloBase: registro.tituloBase,
    descricaoBase: registro.descricaoBase,
    localizacao: registro.localizacao,
    unidade: registro.unidade ?? "UN",
    ean: registro.ean,
    garantiaMeses: registro.garantiaMeses ?? "",
    urlLojaIntegrada: registro.urlLojaIntegrada,
    estoqueMinimo: registro.estoqueMinimo ?? "",
    estoqueMaximo: registro.estoqueMaximo ?? "",
    origem: registro.origem,
    ncm: registro.ncm,
    cest: registro.cest,
    spedTipoItem: registro.spedTipoItem,
    percentualTributos: registro.percentualTributos
      ? Number(registro.percentualTributos)
      : "",
    numeroHomologacao: registro.numeroHomologacao,
    videoUrl: registro.videoUrl,
    precoVenda: registro.precoVenda ? Number(registro.precoVenda) : "",
    pesoKg: registro.pesoKg ? Number(registro.pesoKg) : "",
    alturaCm: registro.alturaCm ? Number(registro.alturaCm) : "",
    larguraCm: registro.larguraCm ? Number(registro.larguraCm) : "",
    comprimentoCm: registro.comprimentoCm ? Number(registro.comprimentoCm) : "",
    ativo: registro.ativo,
  };

  // Agrupa por tipo e calcula o endereco a partir do SKU atual — o endereco nao
  // e gravado justamente para nao ficar velho quando o SKU muda.
  const arquivos = {};
  for (const item of registro.arquivos) {
    (arquivos[item.tipo] ??= []).push({
      id: item.id,
      arquivo: item.arquivo,
      nomeOriginal: item.nomeOriginal,
      principal: item.principal,
      url: urlDe(registro.sku, item.tipo, item.arquivo),
    });
  }

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente.
  const fornecedores = registro.fornecedores.map((vinculo) => ({
    id: vinculo.id,
    nome: vinculo.fornecedor.nome,
    descricao: vinculo.descricao,
    codigo: vinculo.codigo,
    precoCusto: vinculo.precoCusto ? Number(vinculo.precoCusto) : null,
    link: vinculo.link,
    padrao: vinculo.padrao,
  }));

  const catalogoFornecedores = await listarFornecedores();

  const { integrados } = separarCanais(registro.anuncios);

  return (
    <>
      <Link
        href="/produtos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para produtos
      </Link>

      <PageHeader
        titulo={registro.tituloBase}
        descricao={
          integrados.length
            ? `SKU ${registro.sku} · integrado com ${integrados.map((c) => c.nome).join(", ")}`
            : `SKU ${registro.sku}`
        }
      />

      {busca?.documentos === "falhou" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          O produto foi salvo, mas os documentos enviados antes de salvar nao foram gravados.
          Envie de novo em Documentos tecnicos e Certificado de homologacao.
        </p>
      )}

      {imagensCopiadas !== null && (
        <p
          className={`mb-4 rounded border p-3 text-sm ${
            imagensRecusadas > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {imagensCopiadas} imagem(ns) copiada(s) do produto de origem.
          {imagensRecusadas > 0 &&
            ` ${imagensRecusadas} ficaram de fora: fora de 500 a 1920 px, formato que o Mercado Livre nao aceita, ou o site nao respondeu.`}
        </p>
      )}

      <FormularioProduto
        produto={produto}
        arquivos={arquivos}
        fornecedores={fornecedores}
        catalogoFornecedores={catalogoFornecedores}
        dominioLojaIntegrada={config.lojaIntegrada.dominio}
      />
    </>
  );
}

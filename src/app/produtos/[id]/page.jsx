import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import { config } from "@/lib/integracoes/config";
import { lerPecasDoKit } from "@/lib/composicaoBanco";
import { listarFornecedores } from "@/app/produtos/acoes";
import PageHeader from "@/components/ui/PageHeader";
import FormularioProduto from "@/components/produtos/FormularioProduto";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({ params, searchParams }) {
  const { id } = await params;
  // Avisos do Salvar de um produto novo (documentos, fotos, fornecedores, concorrentes).
  const busca = await searchParams;

  const registro = await prisma.produto.findUnique({
    where: { id },
    include: {
      // A RESERVA de imagens nao e foto do produto: ela entra no painel pela lista `reserva`, escondida.
      arquivos: { where: { papel: "FOTO" }, orderBy: { ordem: "asc" } },
      fornecedores: {
        include: { fornecedor: { select: { nome: true } } },
        orderBy: { criadoEm: "asc" },
      },
      concorrentes: {
        include: {
          produtoColetado: {
            select: { nome: true, codigo: true, url: true, precoNormal: true, fonte: { select: { nome: true } } },
          },
        },
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

  // As pecas do kit, para a aba Composicao. So as colunas que a aba mostra: Decimal nao atravessa a
  // fronteira servidor/cliente.
  const pecas = registro.tipo === "COMPOSICAO" ? await lerPecasDoKit(registro.id) : [];
  const composicao = pecas.map((peca) => ({
    componenteId: peca.componenteId,
    sku: peca.componente.sku,
    tituloBase: peca.componente.tituloBase,
    estoque: peca.componente.estoque,
    quantidade: peca.quantidade,
  }));

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
    tipo: registro.tipo,
    composicao,
    ean: registro.ean,
    garantiaMeses: registro.garantiaMeses ?? "",
    urlLojaIntegrada: registro.urlLojaIntegrada,
    estoqueMinimo: registro.estoqueMinimo ?? "",
    estoqueMaximo: registro.estoqueMaximo ?? "",
    origem: registro.origem,
    tipoProducao: registro.tipoProducao,
    ncm: registro.ncm,
    cest: registro.cest,
    spedTipoItem: registro.spedTipoItem,
    percentualTributos: registro.percentualTributos
      ? Number(registro.percentualTributos)
      : "",
    numeroHomologacao: registro.numeroHomologacao,
    videoUrl: registro.videoUrl,
    // Fornecedor extraido do Bling na importacao — so RASCUNHO, ate o operador
    // salvar o produto (ver FormularioProduto e salvarProduto).
    fornecedorRascunho: registro.fornecedorRascunho ?? null,
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

  // Vindo da lupa (produtoColetado preenchido): sempre o preco de HOJE, lido
  // agora — pedido do dono em 18/09/2026, para acompanhar a proxima
  // varredura sem o operador ter que remover e adicionar de novo. Digitado a
  // mao: os campos *Manual, fixos.
  const concorrentes = registro.concorrentes.map((vinculo) =>
    vinculo.produtoColetado
      ? {
          id: vinculo.id,
          manual: false,
          produtoColetadoId: vinculo.produtoColetadoId,
          fonte: vinculo.produtoColetado.fonte.nome,
          nome: vinculo.produtoColetado.nome,
          codigo: vinculo.produtoColetado.codigo,
          preco: vinculo.produtoColetado.precoNormal
            ? Number(vinculo.produtoColetado.precoNormal)
            : null,
          url: vinculo.produtoColetado.url,
        }
      : {
          id: vinculo.id,
          manual: true,
          fonte: vinculo.fonteManual,
          nome: vinculo.nomeManual,
          codigo: vinculo.codigoManual,
          preco: vinculo.precoManual ? Number(vinculo.precoManual) : null,
          url: vinculo.linkManual,
        },
  );

  const { integrados } = separarCanais(registro.anuncios);

  return (
    <>
      {/* A seta ao lado do titulo, como no produto novo (o dono aprovou em 21/09/2026); a descricao fica
          porque traz o SKU e os canais integrados. */}
      <PageHeader
        titulo={registro.tituloBase}
        voltarPara="/produtos"
        voltarRotulo="Voltar para produtos"
        descricao={
          integrados.length
            ? `SKU ${registro.sku} · integrado com ${integrados.map((c) => c.nome).join(", ")}`
            : `SKU ${registro.sku}`
        }
      />

      {busca?.documentos === "falhou" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          O produto foi salvo, mas os documentos enviados antes de salvar não foram gravados.
          Envie de novo em Documentos técnicos e Certificado de homologação.
        </p>
      )}

      {busca?.fornecedores === "falhou" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          O produto foi salvo, mas os fornecedores adicionados antes de salvar não foram
          gravados. Adicione de novo na aba Fornecedores.
        </p>
      )}

      {busca?.concorrentes === "falhou" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          O produto foi salvo, mas os concorrentes adicionados antes de salvar não foram
          gravados. Adicione de novo na aba Fornecedores.
        </p>
      )}

      {busca?.fotos === "falhou" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          O produto foi salvo, mas as fotos enviadas antes de salvar não foram gravadas. Envie de
          novo no bloco de imagens.
        </p>
      )}

      <FormularioProduto
        produto={produto}
        arquivos={arquivos}
        fornecedores={fornecedores}
        concorrentes={concorrentes}
        catalogoFornecedores={catalogoFornecedores}
        dominioLojaIntegrada={config.lojaIntegrada.dominio}
      />
    </>
  );
}

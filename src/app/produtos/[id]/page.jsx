import { notFound } from "next/navigation";

import { separarCanais } from "@/lib/canais";
import { config } from "@/lib/integracoes/config";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { acessosDoCadastro } from "@/lib/acessos/produto";
import { carregarProdutoParaFormulario, projetarParaAcessos } from "@/lib/produtoParaFormulario";
import { listarFornecedores } from "@/app/produtos/acoes";
import PageHeader from "@/components/ui/PageHeader";
import { SetaParaListaDeProdutos } from "@/components/produtos/ListaDeProdutosNaAba";
import FormularioProduto from "@/components/produtos/FormularioProduto";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({ params, searchParams }) {
  const { id } = await params;
  // Avisos do Salvar de um produto novo (documentos, fotos, fornecedores, concorrentes).
  const busca = await searchParams;

  // Sem Produtos › cadastro em Ver, a pagina nao existe para a pessoa (404). Com Ver e sem Editar, abre so para leitura
  // (pedido do dono em 20/10/2026), e o que ela nao pode ver (custo, concorrentes) nem sai do servidor.
  const sessao = await exigirAcessoNaPagina("tela.produtos.cadastro", "ver");
  const acessos = acessosDoCadastro(sessao.pode);

  const dados = projetarParaAcessos(await carregarProdutoParaFormulario(id), acessos);
  if (!dados) notFound();
  const { registro, produto, arquivos, fornecedores, concorrentes } = dados;

  const catalogoFornecedores = await listarFornecedores();

  const { integrados } = separarCanais(registro.anuncios);

  return (
    <>
      {/* A seta ao lado do titulo, como no produto novo (o dono aprovou em 21/09/2026); a descricao fica
          porque traz o SKU e os canais integrados. */}
      <PageHeader
        titulo={registro.tituloBase}
        voltar={<SetaParaListaDeProdutos />}
        descricao={
          integrados.length
            ? `SKU ${registro.sku} · integrado com ${integrados.map((c) => c.nome).join(", ")}`
            : `SKU ${registro.sku}`
        }
        somenteLeitura={acessos.editar ? null : "Seu acesso ao cadastro de Produtos é de leitura"}
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
        acessos={acessos}
      />
    </>
  );
}

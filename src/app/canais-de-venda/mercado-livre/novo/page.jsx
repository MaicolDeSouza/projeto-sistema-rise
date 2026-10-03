import Link from "next/link";
import { Search } from "lucide-react";

import EditorNaPagina from "@/components/anuncios/ml/EditorNaPagina";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Card from "@/components/ui/Card";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { buscarProdutoParaAnuncio, novoRascunhoML } from "@/lib/canaisDeVenda/ml/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo anuncio | Mercado Livre | Sistema Rise" };

const textoDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();

/**
 * Novo anuncio simples do Mercado Livre. Sem `?produto=` pede o codigo do produto (formulario
 * GET, que volta a esta mesma pagina); com ele abre o editor. So produto Conferido vira
 * anuncio: a recusa aparece aqui, no lugar do editor. Nada e gravado ate o primeiro Salvar.
 */
export default async function NovoAnuncioMLPage({ searchParams }) {
  const params = await searchParams;
  const codigo = textoDe(params?.produto);

  let aberto = null;
  let recusa = null;
  let erro = null;
  if (codigo) {
    try {
      const achado = await buscarProdutoParaAnuncio(codigo);
      if (!achado.ok) recusa = achado.erro;
      else {
        const novo = await novoRascunhoML(achado.produto.id);
        if (novo.ok) aberto = novo;
        else recusa = novo.erro;
      }
    } catch (e) {
      erro = e;
    }
  }

  const sku = aberto ? aberto.contexto.produtos[aberto.rascunho.produtoId].sku : null;

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/mercado-livre" rotulo="Mercado Livre" />
      <PageHeader
        titulo="Novo anuncio"
        descricao={sku ? `Anuncio do produto ${sku}. Preencha as abas e clique em Salvar para guardar o rascunho.` : "Escolha o produto Conferido que vira anuncio."}
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && aberto && (
        <EditorNaPagina
          // Outro produto na URL monta um editor novo: o estado do editor nasce das props e nao as acompanha.
          key={aberto.rascunho.produtoId}
          anuncioId={null}
          rascunhoInicial={aberto.rascunho}
          contextoInicial={aberto.contexto}
          status={null}
        />
      )}

      {!erro && !aberto && (
        <Card className="max-w-xl">
          <form method="get" className="space-y-3">
            <label htmlFor="produto" className="block text-sm font-medium">
              Codigo do produto
            </label>
            <div className="flex gap-2">
              <input
                id="produto"
                name="produto"
                type="text"
                defaultValue={codigo}
                autoFocus
                autoComplete="off"
                placeholder="Ex.: 920302"
                className="min-w-0 flex-1 rounded border border-borda bg-superficie px-3 py-2 text-sm focus:border-acento focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Search size={15} />
                Abrir
              </button>
            </div>
            <p className="text-xs text-suave">O codigo e o SKU do cadastro de Produtos. So produto Conferido vira anuncio.</p>
            {recusa && (
              <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {recusa}
              </p>
            )}
          </form>
          <p className="mt-4 text-xs text-suave">
            Ainda nao conferiu o produto? Abra o cadastro em{" "}
            <Link href="/produtos" className="text-acento hover:underline">
              Produtos
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  );
}

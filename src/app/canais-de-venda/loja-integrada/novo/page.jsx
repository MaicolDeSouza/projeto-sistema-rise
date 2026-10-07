import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import EditorNaPagina from "@/components/anuncios/li/EditorNaPagina";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Card from "@/components/ui/Card";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { anuncioLIDoProduto, idDoProdutoPeloSku, novoRascunhoLI } from "@/lib/canaisDeVenda/li/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo anúncio | Loja Integrada | Sistema Rise" };

const textoDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();

/**
 * Novo anuncio da Loja Integrada. Sem `?produto=` pede o codigo (formulario GET, que volta a esta
 * pagina); com ele abre o editor. O anuncio da LI e um por produto: se o produto ja tem, a pagina
 * leva a ele. So produto Conferido vira anuncio. Nada e gravado ate o primeiro Salvar.
 */
export default async function NovoAnuncioLIPage({ searchParams }) {
  const params = await searchParams;
  const codigo = textoDe(params?.produto);

  let aberto = null;
  let recusa = null;
  let erro = null;
  let existente = null;
  if (codigo) {
    try {
      const produtoId = await idDoProdutoPeloSku(codigo);
      if (!produtoId) recusa = `Nenhum produto com o código ${codigo}.`;
      else {
        existente = await anuncioLIDoProduto(produtoId);
        if (!existente) {
          const novo = await novoRascunhoLI(produtoId);
          if (novo.ok) aberto = novo;
          else recusa = novo.erro;
        }
      }
    } catch (e) {
      erro = e;
    }
  }
  // Fora do try: o redirect do Next funciona lancando, e o catch o engoliria.
  if (existente) redirect(`/canais-de-venda/loja-integrada/${existente.id}`);

  const sku = aberto?.contexto.produto.sku ?? null;

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/loja-integrada" rotulo="Loja Integrada" />
      <PageHeader
        titulo="Novo anúncio"
        descricao={sku ? `Anúncio do produto ${sku}. Preencha as abas e clique em Salvar para guardar o rascunho.` : "Escolha o produto Conferido que vai para a Loja Integrada."}
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && aberto && (
        <EditorNaPagina
          // Outro produto na URL monta um editor novo: o estado do editor nasce das props.
          key={aberto.rascunho.produtoId}
          anuncioId={null}
          rascunhoInicial={aberto.rascunho}
          contextoInicial={aberto.contexto}
          status={null}
          vinculo={null}
        />
      )}

      {!erro && !aberto && (
        <Card className="max-w-xl">
          <form method="get" className="space-y-3">
            <label htmlFor="produto" className="block text-sm font-medium">
              Código do produto
            </label>
            <div className="flex gap-2">
              <input
                id="produto"
                name="produto"
                type="text"
                defaultValue={codigo}
                autoFocus
                autoComplete="off"
                placeholder="Ex.: 100404"
                className="min-w-0 flex-1 rounded border border-borda bg-superficie px-3 py-2 text-sm focus:border-acento focus:outline-none"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                <Search size={15} />
                Abrir
              </button>
            </div>
            <p className="text-xs text-suave">O código é o SKU do cadastro de Produtos. Só produto Conferido vira anúncio.</p>
            {recusa && (
              <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {recusa}
              </p>
            )}
          </form>
          <p className="mt-4 text-xs text-suave">
            Ainda não conferiu o produto? Abra o cadastro em{" "}
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

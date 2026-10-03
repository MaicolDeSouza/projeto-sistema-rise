import FrasesFixas from "@/components/anuncios/ml/FrasesFixas";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Card from "@/components/ui/Card";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { lerConfigML } from "@/lib/canaisDeVenda/configuracao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuracoes | Mercado Livre | Sistema Rise" };

/**
 * Configuracoes do canal Mercado Livre. Por enquanto so as frases fixas, que entram no fim da
 * descricao de todo anuncio. O editor do anuncio as mostra em leitura e abre esta tela em outra aba.
 */
export default async function ConfiguracoesMLPage() {
  let config = null;
  let erro = null;
  try {
    config = await lerConfigML();
  } catch (e) {
    erro = e;
  }

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/mercado-livre" rotulo="Mercado Livre" />
      <PageHeader titulo="Configuracoes do Mercado Livre" />

      {erro && <AvisoBanco erro={erro} />}

      {config && (
        <Card className="max-w-3xl">
          <FrasesFixas frasesIniciais={config.frases} />
        </Card>
      )}
    </>
  );
}

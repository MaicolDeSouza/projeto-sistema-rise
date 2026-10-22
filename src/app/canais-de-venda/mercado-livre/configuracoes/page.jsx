import FrasesFixas from "@/components/anuncios/ml/FrasesFixas";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Card from "@/components/ui/Card";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerConfigML } from "@/lib/canaisDeVenda/configuracao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações | Mercado Livre | Sistema Rise" };

/**
 * Configuracoes do canal Mercado Livre. Por enquanto so as frases fixas, que entram no fim da
 * descricao de todo anuncio. O editor do anuncio as mostra em leitura e abre esta tela em outra aba.
 */
export default async function ConfiguracoesMLPage() {
  // Acessos: as frases em ver; sem editar elas aparecem so para leitura.
  const { pode } = await exigirAcessoNaPagina("tela.canaisDeVenda.mercadoLivre.frases", "ver");
  const podeEditar = pode("tela.canaisDeVenda.mercadoLivre.frases", "editar");
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
      <PageHeader titulo="Configurações do Mercado Livre" somenteLeitura={podeEditar ? null : "Seu acesso às frases fixas é de leitura"} />

      {erro && <AvisoBanco erro={erro} />}

      {config && (
        <Card className="max-w-3xl">
          <FrasesFixas frasesIniciais={config.frases} somenteLeitura={!podeEditar} />
        </Card>
      )}
    </>
  );
}

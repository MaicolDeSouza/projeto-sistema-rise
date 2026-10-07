import FrasesFixas from "@/components/anuncios/ml/FrasesFixas";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Card from "@/components/ui/Card";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { salvarFrasesFixasLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { lerConfigCanal } from "@/lib/canaisDeVenda/configuracao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuracoes | Loja Integrada | Sistema Rise" };

/**
 * Configuracoes do canal Loja Integrada: as frases fixas, que entram no fim da descricao de todo
 * produto da loja (cada frase um paragrafo). Mudar uma frase acende o selo "!" dos produtos ja
 * sincronizados: a descricao deles mudou e precisa ir de novo.
 */
export default async function ConfiguracoesLIPage() {
  let config = null;
  let erro = null;
  try {
    config = await lerConfigCanal("LOJA_INTEGRADA");
  } catch (e) {
    erro = e;
  }

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/loja-integrada" rotulo="Loja Integrada" />
      <PageHeader titulo="Configuracoes da Loja Integrada" />

      {erro && <AvisoBanco erro={erro} />}

      {config && (
        <Card className="max-w-3xl">
          <FrasesFixas
            frasesIniciais={config.frases}
            salvar={salvarFrasesFixasLI}
            ajuda="Estas frases entram no fim da descricao de todo produto da Loja Integrada, cada uma num paragrafo. Mudar uma frase marca os produtos ja sincronizados para enviar de novo."
          />
        </Card>
      )}
    </>
  );
}

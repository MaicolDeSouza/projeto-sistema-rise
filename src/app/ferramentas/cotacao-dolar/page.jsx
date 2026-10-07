import { buscarCotacaoAcao } from "@/app/ferramentas/acoes";
import CotacaoDolar from "@/components/ferramentas/CotacaoDolar";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { PERIODO_PADRAO } from "@/lib/ferramentas/cotacao";

export const metadata = { title: "Cotação do dólar | Sistema Rise" };

// A cotacao muda o dia todo: nada de pagina pre-montada no build.
export const dynamic = "force-dynamic";

export default async function CotacaoDolarPage() {
  // A primeira carga vem pronta daqui, sem tela vazia e sem efeito no cliente.
  const inicial = await buscarCotacaoAcao(PERIODO_PADRAO);

  return (
    <>
      <LinkDeVolta href="/ferramentas" rotulo="Ferramentas" />

      <PageHeader
        titulo="Cotação do dólar"
        descricao="O dólar de agora e o oficial do Banco Central (PTAX), com gráfico por período. Nenhuma cotação é gravada: elas são consultadas na hora."
      />
      <CotacaoDolar inicial={inicial} periodoInicial={PERIODO_PADRAO} />
    </>
  );
}

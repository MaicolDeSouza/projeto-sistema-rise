import CotadorDeFrete from "@/components/frete/CotadorDeFrete";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarCaixas } from "@/lib/frete/caixas";

export const metadata = { title: "Cotar frete | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Ferramentas > Cotar frete: o cotador sem pedido nem proposta, para o atendimento por WhatsApp. Nao grava nada. */
export default async function CotarFretePage() {
  await exigirAcessoNaPagina("tela.ferramentas.frete", "ver");
  const caixas = await listarCaixas({ soAtivas: true });
  return (
    <>
      <PageHeader titulo="Cotar frete" voltarPara="/ferramentas" voltarRotulo="Voltar a Ferramentas" />
      <Card>
        <CotadorDeFrete caixas={caixas} />
      </Card>
    </>
  );
}

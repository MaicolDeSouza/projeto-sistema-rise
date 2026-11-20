import FormularioDeEnvioAvulso from "@/components/frete/FormularioDeEnvioAvulso";
import { SetaParaLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarCaixas } from "@/lib/frete/caixas";

export const metadata = { title: "Novo envio | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Envio avulso (modulo de frete, fase 2): quem cria envio e quem compra etiqueta (acao.envios.comprarEtiqueta). */
export default async function NovoEnvioPage() {
  await exigirAcessoNaPagina("acao.envios.comprarEtiqueta", "executar");
  const caixas = JSON.parse(JSON.stringify(await listarCaixas({ soAtivas: true })));
  return (
    <>
      <PageHeader voltar={<SetaParaLista caminho="/envios" rotulo="Voltar aos envios" />} titulo="Novo envio" descricao="Envio sem pedido: garantia, troca, amostra ou devolução." />
      <FormularioDeEnvioAvulso caixas={caixas} />
    </>
  );
}

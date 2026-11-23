import FormularioDeRecarga from "@/components/frete/FormularioDeRecarga";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerEGravarSaldo, situacaoDoSaldo, ultimasRecargas, VALOR_MAXIMO, VALOR_MINIMO, VALORES_RAPIDOS } from "@/lib/frete/saldo";

export const metadata = { title: "Adicionar saldo | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Adicionar saldo na carteira do Melhor Envio (pedido do dono em 23/11/2026; o botao do aviso no Telegram abre aqui).
 * Nesta tela o operador ve primeiro o saldo de agora; a acao e "Gerar pagamento" (Pix ou boleto pela API, com a senha da
 * recarga). Quem paga e o dono, no link que volta.
 */
export default async function SaldoDoFretePage() {
  const acesso = await exigirAcessoNaPagina("tela.envios", "ver");
  // O saldo de agora: abrir pela mensagem do Telegram depois de pagar ja mostra o valor novo.
  await lerEGravarSaldo();
  const [situacao, recargas] = await Promise.all([situacaoDoSaldo(), ultimasRecargas(10)]);
  const podeRecarregar = acesso.pode("acao.envios.comprarEtiqueta", "executar");
  return (
    <>
      <PageHeader
        titulo="Adicionar saldo"
        descricao="Carteira do Melhor Envio, que paga as etiquetas."
        voltarPara="/envios"
        voltarRotulo="Voltar a Envios"
        somenteLeitura={podeRecarregar ? null : "Só quem compra etiqueta adiciona saldo."}
      />
      <FormularioDeRecarga
        situacao={{ saldo: situacao.saldo, limite: situacao.limite, lidoEm: situacao.lidoEm ? situacao.lidoEm.toISOString() : null }}
        recargas={recargas}
        valoresRapidos={VALORES_RAPIDOS}
        minimo={VALOR_MINIMO}
        maximo={VALOR_MAXIMO}
        podeRecarregar={podeRecarregar}
      />
    </>
  );
}

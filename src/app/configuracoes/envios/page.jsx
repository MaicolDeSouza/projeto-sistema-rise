import FormularioDeEnvios from "@/components/frete/FormularioDeEnvios";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerConfigDeFrete } from "@/lib/frete/configuracao";

export const metadata = { title: "Envios | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Configuracoes > Envios (modulo de frete). Linha-guia: o operador ve os dois valores da cotacao; a acao e Salvar. */
export default async function EnviosPage() {
  const acesso = await exigirAcessoNaPagina("tela.configuracoes.envios", "ver");
  const config = await lerConfigDeFrete();
  const podeEditar = acesso.pode("tela.configuracoes.envios", "editar");
  return (
    <>
      <PageHeader
        titulo="Envios"
        descricao="O que a cotação de frete soma e o aviso de postagem ao cliente."
        voltarPara="/configuracoes"
        voltarRotulo="Voltar a Configurações"
        somenteLeitura={podeEditar ? null : "Sem permissão para editar."}
      />
      <FormularioDeEnvios
        inicial={{
          acrescimoDeEmbalagem: config.acrescimoDeEmbalagem,
          percentualDePesoExtra: config.percentualDePesoExtra,
          assuntoDoEmail: config.assuntoDoEmail,
          textoDoEmail: config.textoDoEmail,
          textoDoWhatsapp: config.textoDoWhatsapp,
          // O limite do aviso de saldo e se a senha da recarga ainda e a inicial (a gravada nunca vai a tela).
          limiteDeSaldo: Number(config.limiteDeSaldo),
          senhaInicial: !config.senhaDaRecarga,
        }}
        podeEditar={podeEditar}
      />
    </>
  );
}

import TabelaDeCaixas from "@/components/frete/TabelaDeCaixas";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarCaixas } from "@/lib/frete/caixas";

export const metadata = { title: "Caixas de envio | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Cadastros > Caixas de envio (modulo de frete). Linha-guia: o operador ve primeiro as caixas com as medidas; a acao
 * principal e "Nova caixa". Rota fixa: vence a `[tipo]` de Cadastros.
 */
export default async function CaixasDeEnvioPage() {
  const acesso = await exigirAcessoNaPagina("tela.cadastros.caixasDeEnvio", "ver");
  const caixas = await listarCaixas();
  return (
    <>
      <PageHeader
        titulo="Caixas de envio"
        descricao="As caixas em que a loja despacha."
        voltarPara="/cadastros"
        voltarRotulo="Voltar a Cadastros"
        somenteLeitura={acesso.pode("tela.cadastros.caixasDeEnvio", "editar") ? null : "Sem permissão para editar as caixas."}
      />
      <TabelaDeCaixas
        caixas={caixas}
        podeEditar={acesso.pode("tela.cadastros.caixasDeEnvio", "editar")}
        podeExcluir={acesso.pode("tela.cadastros.caixasDeEnvio", "excluir")}
      />
    </>
  );
}

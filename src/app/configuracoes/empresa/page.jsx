import FormularioEmpresa from "@/components/configuracoes/FormularioEmpresa";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerDadosDaEmpresa } from "@/lib/compras/empresa";

export const metadata = { title: "Dados da empresa | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Dados da empresa (cabecalho do pedido de compra). So o Administrador, como Usuarios e Saude. */
export default async function EmpresaPage() {
  const acesso = await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const dados = await lerDadosDaEmpresa();
  const podeEditar = acesso.pode("tela.configuracoes.usuarios", "editar");
  return (
    <>
      <PageHeader
        titulo="Dados da empresa"
        descricao="Vão no cabeçalho do pedido de compra."
        voltarPara="/configuracoes"
        voltarRotulo="Voltar a Configurações"
        somenteLeitura={podeEditar ? null : "Só o Administrador edita."}
      />
      <FormularioEmpresa inicial={JSON.parse(JSON.stringify(dados))} podeEditar={podeEditar} />
    </>
  );
}

import PainelDeSaude from "@/components/configuracoes/PainelDeSaude";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { coletarSaude } from "@/lib/saude/coletar";

export const metadata = { title: "Saúde do Rise | Sistema Rise" };
// O estado e vivo (sinal do worker, disco, conexoes): nada montado no build.
export const dynamic = "force-dynamic";

/**
 * Configuracoes › Saude do Rise (pedido do dono em 25/10/2026): os workers e as rotinas deles, o banco, o disco, o
 * backup, as integracoes, o orcamento da IA e as varreduras, num lugar so. So o Administrador (mostra as travas e o estado
 * das conexoes da conta inteira): usa o recurso nao delegavel de Usuarios e funcoes.
 */
export default async function SaudeDoRisePage() {
  const acesso = await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const saude = await coletarSaude();

  return (
    <>
      <PageHeader titulo="Saúde do Rise" descricao="Workers, banco, integrações e rotinas." voltarPara="/configuracoes" voltarRotulo="Configurações" />
      <PainelDeSaude saude={saude} podeTestar={acesso.pode("tela.configuracoes.usuarios", "editar")} />
    </>
  );
}

import FormularioUsuario from "@/components/acessos/FormularioUsuario";
import { funcaoParaTela, listarFuncoes } from "@/lib/acessos/banco";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Novo usuário | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Novo usuario (spec de Acessos, §5.5). So Administrador. O login e o do Tinyauth, criado por SSH. */
export default async function NovoUsuarioPage() {
  await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const funcoes = (await listarFuncoes()).map(funcaoParaTela);
  return (
    <FormularioUsuario
      usuario={{ id: null, login: "", nome: "", assinatura: "", ativo: true, funcoes: [], excecoes: [], peloEnv: false }}
      funcoes={funcoes}
    />
  );
}

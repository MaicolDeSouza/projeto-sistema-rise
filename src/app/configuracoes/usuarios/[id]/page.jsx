import { notFound } from "next/navigation";

import FormularioUsuario from "@/components/acessos/FormularioUsuario";
import { carregarUsuario, ehUltimoAdministradorAtivo, funcaoParaTela, listarFuncoes, usuarioParaTela } from "@/lib/acessos/banco";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Usuário | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Um usuario (spec de Acessos, §5.5). So Administrador; usuario que nao existe da 404. */
export default async function UsuarioPage({ params }) {
  await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const { id } = await params;
  const [usuario, funcoes, ultimoAdministrador] = await Promise.all([carregarUsuario(id), listarFuncoes(), ehUltimoAdministradorAtivo(id)]);
  if (!usuario) notFound();
  return <FormularioUsuario key={usuario.id} usuario={usuarioParaTela(usuario)} funcoes={funcoes.map(funcaoParaTela)} ultimoAdministrador={ultimoAdministrador} />;
}

import { notFound } from "next/navigation";

import FormularioUsuario from "@/components/acessos/FormularioUsuario";
import { carregarUsuario, ehUltimoAdministradorAtivo, funcaoParaTela, listarFuncoes, usuarioParaTela } from "@/lib/acessos/banco";
import { estadoDoLogin } from "@/lib/acessos/loginTinyauth";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { ambienteDoRise } from "@/lib/sessao";
import { temTokenDoTelegram } from "@/lib/telegram/estado";

export const metadata = { title: "Usuário | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Um usuario (spec de Acessos, §5.5). So Administrador; usuario que nao existe da 404. */
export default async function UsuarioPage({ params }) {
  await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const { id } = await params;
  const [usuario, funcoes, ultimoAdministrador] = await Promise.all([carregarUsuario(id), listarFuncoes(), ehUltimoAdministradorAtivo(id)]);
  if (!usuario) notFound();
  // Como a pessoa entra na tela de entrada (o .env da VPS, o arquivo que o Rise grava, ou ainda nao entra).
  const entrada = { ...(await estadoDoLogin(usuario.login)), naVps: ambienteDoRise(process.env) === "vps" };
  // So o fato de haver token do bot (Entrega C1): sem ele, "Gerar codigo" fica desabilitado e diz onde cadastrar.
  const telegram = { temToken: await temTokenDoTelegram() };
  return <FormularioUsuario key={usuario.id} usuario={usuarioParaTela(usuario)} funcoes={funcoes.map(funcaoParaTela)} ultimoAdministrador={ultimoAdministrador} entrada={entrada} telegram={telegram} />;
}

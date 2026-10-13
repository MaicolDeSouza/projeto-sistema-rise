import { notFound } from "next/navigation";

import FormularioFuncao from "@/components/acessos/FormularioFuncao";
import { carregarFuncao, funcaoParaTela } from "@/lib/acessos/banco";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Função | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Uma funcao e a matriz dela (spec de Acessos, §5.4). So Administrador; funcao que nao existe da 404. */
export default async function FuncaoPage({ params }) {
  await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const { id } = await params;
  const funcao = await carregarFuncao(id);
  if (!funcao) notFound();
  return <FormularioFuncao key={funcao.id} funcao={funcaoParaTela(funcao)} />;
}

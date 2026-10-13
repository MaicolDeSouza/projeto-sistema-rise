import FormularioFuncao from "@/components/acessos/FormularioFuncao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Nova função | Sistema Rise" };
export const dynamic = "force-dynamic";

/** Nova funcao (spec de Acessos, §5.4): a matriz vazia, tudo em `nenhum`. So Administrador. */
export default async function NovaFuncaoPage() {
  await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  return <FormularioFuncao funcao={{ id: null, nome: "", descricao: "", fixa: false, permissoes: {}, usuarios: [] }} />;
}

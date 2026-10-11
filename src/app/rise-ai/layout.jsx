import ListaDeConversas from "@/components/riseAi/ListaDeConversas";
import { conversaParaLista, listarConversas } from "@/lib/riseAi/conversas";
import { sessaoAtual } from "./sessao";

// As conversas mudam o dia todo (e dependem de quem está logado): nada de página montada no build.
export const dynamic = "force-dynamic";

/**
 * Duas colunas: a lista das conversas de quem está logado, à esquerda, e a tela (o chat, a revisão...) à direita. No
 * computador ocupa a altura da janela, para o chat rolar por dentro e a caixa de pergunta ficar sempre à vista.
 * (`4rem` é o respiro vertical do `<main>`.)
 */
export default async function RiseAiLayout({ children }) {
  const sessao = await sessaoAtual();
  const conversas = await listarConversas({ usuario: sessao.usuario, limite: 100 });

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row">
      <ListaDeConversas conversas={conversas.map(conversaParaLista)} administrador={sessao.administrador} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

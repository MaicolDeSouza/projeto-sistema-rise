import ListaDeConversas from "@/components/riseAi/ListaDeConversas";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { conversaParaLista, listarConversas } from "@/lib/riseAi/conversas";
import { sessaoDoRiseAi } from "./sessao";

// As conversas mudam o dia todo (e dependem de quem está logado): nada de página montada no build.
export const dynamic = "force-dynamic";

/** Os links do trilho, cada um com o recurso de Acessos que o libera (a página confere de novo). */
const LINKS = [
  { href: "/rise-ai/revisao", rotulo: "Revisão do dia", recurso: "riseAi.revisao" },
  { href: "/rise-ai/consumo", rotulo: "Consumo", recurso: "riseAi.consumo" },
  { href: "/rise-ai/configuracoes", rotulo: "Configurações", recurso: "riseAi.configuracoes" },
];

/**
 * Duas colunas: a lista das conversas de quem está logado, à esquerda, e a tela (o chat, a revisão...) à direita. No
 * computador ocupa a altura da janela, para o chat rolar por dentro e a caixa de pergunta ficar sempre à vista.
 * (`4rem` é o respiro vertical do `<main>`.)
 *
 * Sem a tela de entrada do Rise AI em Acessos, 404 (quem não vê não sabe que existe). As conversas só são lidas para
 * quem tem o chat.
 */
export default async function RiseAiLayout({ children }) {
  const acesso = await exigirAcessoNaPagina("tela.riseAi", "ver");
  const sessao = sessaoDoRiseAi(acesso);
  const conversas = acesso.pode("riseAi.chat", "ver") ? await listarConversas({ usuario: sessao.usuario, limite: 100 }) : [];
  const links = LINKS.filter((link) => acesso.pode(link.recurso, "ver")).map(({ href, rotulo }) => ({ href, rotulo }));

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row">
      <ListaDeConversas conversas={conversas.map(conversaParaLista)} links={links} podeConversar={acesso.pode("riseAi.chat", "editar")} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

import { notFound } from "next/navigation";

import Chat from "@/components/riseAi/Chat";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { carregarConversa, mensagemParaTela } from "@/lib/riseAi/conversas";
import { estadoDoChat } from "@/lib/riseAi/orcamento";
import { sessaoDoRiseAi } from "../sessao";

export const metadata = { title: "Rise AI | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Uma conversa. Aqui só o DONO a abre: o administrador lê a conversa dos outros na Revisão, não pelo chat. Conversa que
 * não existe e conversa de outra pessoa dão o mesmo 404.
 */
export default async function ConversaPage({ params }) {
  const { conversaId } = await params;
  const acesso = await exigirAcessoNaPagina("riseAi.chat", "ver");
  const sessao = sessaoDoRiseAi(acesso);
  const conversa = await carregarConversa(conversaId, { usuario: sessao.usuario });
  if (!conversa) notFound();
  const estado = await estadoDoChat();

  return (
    <Chat
      key={conversa.id}
      conversaId={conversa.id}
      titulo={conversa.titulo}
      criadaEm={conversa.criadoEm.toISOString()}
      mensagensIniciais={conversa.mensagens.map(mensagemParaTela)}
      padrao={estado.padrao}
      internet={estado.internet}
      orcamento={estado.orcamento}
      podeEnsinar={acesso.pode("riseAi.conhecimento", "editar")}
    />
  );
}

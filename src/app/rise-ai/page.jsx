import Chat from "@/components/riseAi/Chat";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";

export const metadata = { title: "Rise AI | Sistema Rise" };
export const dynamic = "force-dynamic";

/** O chat em branco: a conversa só é criada na primeira pergunta (e a URL troca para `/rise-ai/<id>`). */
export default async function RiseAiPage() {
  const acesso = await exigirAcessoNaPagina("riseAi.chat", "ver");
  const configuracao = await lerConfiguracao();
  return <Chat conversaId={null} mensagensIniciais={[]} padrao={configuracao.padrao} podeEnsinar={acesso.pode("riseAi.conhecimento", "editar")} />;
}

import Chat from "@/components/riseAi/Chat";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { sessaoAtual } from "./sessao";

export const metadata = { title: "Rise AI | Sistema Rise" };
export const dynamic = "force-dynamic";

/** O chat em branco: a conversa só é criada na primeira pergunta (e a URL troca para `/rise-ai/<id>`). */
export default async function RiseAiPage() {
  const sessao = await sessaoAtual();
  const configuracao = await lerConfiguracao();
  return <Chat conversaId={null} mensagensIniciais={[]} padrao={configuracao.padrao} administrador={sessao.administrador} />;
}

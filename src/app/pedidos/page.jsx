import BlocoEmConstrucao from "@/components/BlocoEmConstrucao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export default async function Page() {
  await exigirAcessoNaPagina("tela.pedidos", "ver");
  return <BlocoEmConstrucao href="/pedidos" />;
}

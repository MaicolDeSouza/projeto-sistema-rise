import BlocoEmConstrucao from "@/components/BlocoEmConstrucao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export default async function Page() {
  await exigirAcessoNaPagina("tela.estoque", "ver");
  return <BlocoEmConstrucao href="/estoque" />;
}

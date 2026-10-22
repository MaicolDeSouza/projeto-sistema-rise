import BlocoEmConstrucao from "@/components/BlocoEmConstrucao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export default async function Page() {
  await exigirAcessoNaPagina("tela.financeiro", "ver");
  return <BlocoEmConstrucao href="/financeiro" />;
}

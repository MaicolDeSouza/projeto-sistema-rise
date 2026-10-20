import AbasDoRiseAi from "@/components/riseAi/AbasDoRiseAi";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

// As telas dependem de quem está logado: nada de página montada no build.
export const dynamic = "force-dynamic";

/** As abas, cada uma com o recurso de Acessos que a libera (a página confere de novo). */
const ABAS = [
  { href: "/rise-ai", rotulo: "Conexões", recurso: "riseAi.chat" },
  { href: "/rise-ai/revisao", rotulo: "Revisão do dia", recurso: "riseAi.revisao" },
  { href: "/rise-ai/consumo", rotulo: "Consumo", recurso: "riseAi.consumo" },
  { href: "/rise-ai/configuracoes", rotulo: "Configurações", recurso: "riseAi.configuracoes" },
];

/**
 * As abas no alto e a tela embaixo. O chat interno saiu (decisão C1 do dono, 20/10/2026): a equipe consulta o Rise pelo
 * Claude ou pelo ChatGPT, pelo servidor MCP, e a aba Conexões é onde cada pessoa vê o endereço e as próprias conexões.
 * No computador ocupa a altura da janela, para a Revisão e o Consumo rolarem por dentro. (`4rem` é o respiro vertical do
 * `<main>`.)
 *
 * Sem a tela de entrada do Rise AI em Acessos, 404 (quem não vê não sabe que existe).
 */
export default async function RiseAiLayout({ children }) {
  const acesso = await exigirAcessoNaPagina("tela.riseAi", "ver");
  const abas = ABAS.filter((aba) => acesso.pode(aba.recurso, "ver")).map(({ href, rotulo }) => ({ href, rotulo }));

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-4rem)]">
      <AbasDoRiseAi abas={abas} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

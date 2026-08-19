import { Hammer } from "lucide-react";

import { blocos } from "@/lib/blocos";
import PageHeader from "./ui/PageHeader";
import EmptyState from "./ui/EmptyState";

/**
 * Placeholder dos blocos ainda nao implementados. Existe para que todo item do
 * menu leve a uma pagina real — navegar para um 404 nao valida o esqueleto.
 */
export default function BlocoEmConstrucao({ href }) {
  const bloco = blocos.find((item) => item.href === href);

  return (
    <>
      <PageHeader titulo={bloco?.rotulo ?? "Bloco"} descricao={bloco?.resumo} />
      <EmptyState
        icone={Hammer}
        titulo="Em construcao"
        descricao="Este bloco ainda nao foi implementado. A fundacao do sistema esta pronta e ele sera desenvolvido em uma etapa proxima."
      />
    </>
  );
}

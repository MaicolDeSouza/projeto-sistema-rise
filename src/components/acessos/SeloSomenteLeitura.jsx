import { Lock } from "lucide-react";

import Badge from "@/components/ui/Badge";

/**
 * O selo das telas em `ver` (spec de Acessos, §5.7): ao lado do titulo, e e o unico acrescimo da tela. O `titulo` (o
 * `title` do selo) diz de que tela e a leitura: "Seu acesso a Produtos é de leitura".
 */
export default function SeloSomenteLeitura({ titulo }) {
  return (
    <span title={titulo} className="inline-flex">
      <Badge>
        <Lock size={12} className="mr-1" aria-hidden="true" />
        Somente leitura
      </Badge>
    </span>
  );
}

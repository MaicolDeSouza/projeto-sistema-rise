import Badge from "@/components/ui/Badge";

/**
 * Situacao de um anuncio num canal, resolvida a partir dos DOIS estados:
 * o interno (status) e o do canal (situacaoCanal). Eles divergem de proposito —
 * um anuncio "PUBLICADO" pode estar "PAUSADA" no Mercado Livre.
 */
export function resumirSituacao(anuncio) {
  if (!anuncio) return { rotulo: "Sem anuncio", tom: "neutro" };

  if (anuncio.status === "ERRO") return { rotulo: "Erro", tom: "erro" };
  if (anuncio.status === "RASCUNHO") return { rotulo: "Rascunho", tom: "neutro" };
  if (anuncio.status === "VALIDADO") return { rotulo: "Pronto", tom: "info" };
  if (anuncio.status === "PUBLICANDO")
    return { rotulo: "Publicando", tom: "info" };

  // PUBLICADO: quem manda na cor e a situacao no canal.
  switch (anuncio.situacaoCanal) {
    case "ATIVA":
      return { rotulo: "Ativo", tom: "sucesso" };
    case "PAUSADA":
      return { rotulo: "Pausado", tom: "alerta" };
    case "ENCERRADA":
      return { rotulo: "Encerrado", tom: "neutro" };
    default:
      return { rotulo: "Publicado", tom: "sucesso" };
  }
}

export default function BadgeCanal({ anuncio }) {
  const { rotulo, tom } = resumirSituacao(anuncio);
  return <Badge tom={tom}>{rotulo}</Badge>;
}

import { Children, isValidElement } from "react";

import { sessaoDeAcessos } from "@/lib/acessos/servidor";
import { chaveDaSessao, lerOrdemDosCartoes } from "@/lib/ordemDosCartoes/banco";
import GradeArrastavel from "./GradeArrastavel";

/**
 * A grade de cartoes das paginas de bloco, com a ordem que a pessoa arrumou (pedido do dono em 07/11/2026; Opcao 1:
 * salva por usuario). Recebe os cartoes como filhos, do jeito que a pagina ja os montava; o id de cada um e o `href`
 * (ou a `key`). Le a ordem salva aqui no servidor e entrega a grade que arrasta (`GradeArrastavel`).
 */
export default async function GradeDeCartoes({ pagina, className = "", children }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  const ordemSalva = await lerOrdemDosCartoes(chaveDaSessao(sessao), pagina);
  const itens = Children.toArray(children)
    .filter(isValidElement)
    .map((filho) => ({ id: String(filho.props.href ?? filho.key), conteudo: filho }));
  return <GradeArrastavel pagina={pagina} itens={itens} ordemSalva={ordemSalva} className={className} />;
}

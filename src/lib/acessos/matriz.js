import { normalizar } from "@/lib/texto";
import { NIVEIS_POR_TIPO, recursoPorId, validarNivel } from "./recursos.js";

/**
 * As regras puras da matriz de permissoes (spec de Acessos, §5.4). O navegador as usa (a tela da funcao) e o teste as
 * confere. `permissoes` e sempre um objeto `{ recurso: nivel }`; `nenhum` e o mesmo que ausente.
 */

const nivelDe = (permissoes, id) => permissoes?.[id] ?? "nenhum";

/**
 * A busca da matriz atravessa os grupos (para "custo" achar `dado.custo` e as telas cuja dica fala dele), sem caixa e
 * sem acento. Cada achado leva `grupoRotulo`, o nome do grupo, que a tela mostra na frente.
 */
export function filtrarRecursos(grupos, busca) {
  const termo = normalizar(busca);
  if (!termo) return [];
  return grupos.flatMap((grupo) =>
    grupo.recursos
      .filter((recurso) => [recurso.rotulo, recurso.id, recurso.dica ?? ""].some((texto) => normalizar(texto).includes(termo)))
      .map((recurso) => ({ ...recurso, grupoRotulo: grupo.rotulo })),
  );
}

/** "Todos desta lista": o mesmo nivel em todos os recursos visiveis, so onde ele vale para o tipo (acao nao ganha "ver"). */
export function aplicarTodosDaLista(permissoes, recursos, nivel) {
  const proximas = { ...permissoes };
  for (const recurso of recursos) {
    if (nivel === "nenhum") delete proximas[recurso.id];
    else if (validarNivel(recurso.id, nivel)) proximas[recurso.id] = nivel;
  }
  return proximas;
}

/** Quantos recursos mudaram desde o que esta salvo (o rodape "N alterações não salvas"). */
export function contarAlteracoes(original, atual) {
  const ids = new Set([...Object.keys(original ?? {}), ...Object.keys(atual ?? {})]);
  return [...ids].filter((id) => nivelDe(original, id) !== nivelDe(atual, id)).length;
}

/** As teclas 0 a 3 marcam o nivel da coluna; `null` quando a coluna nao existe para o tipo (cartao com "2"). */
export function nivelPorTecla(recurso, tecla) {
  if (!recurso || !/^[0-3]$/.test(String(tecla))) return null;
  return NIVEIS_POR_TIPO[recurso.tipo]?.[Number(tecla)] ?? null;
}

/** O que vai para o servidor: so o que esta acima de `nenhum`, so recurso conhecido. */
export function permissoesParaEnvio(atual) {
  return Object.fromEntries(Object.entries(atual ?? {}).filter(([id, nivel]) => nivel !== "nenhum" && recursoPorId(id)));
}

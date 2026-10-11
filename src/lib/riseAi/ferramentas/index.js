import { z } from "zod";

import { ErroDeFerramenta } from "./erro";
import { FERRAMENTAS_DE_PRODUTO } from "./produtos";

/**
 * O catálogo de ferramentas do Rise AI e o único caminho do modelo até o banco (spec §5.5): ele pede pelo NOME, e o
 * Rise valida os argumentos (zod), confere o perfil e executa. Nunca SQL, nunca Prisma, nunca endpoint.
 *
 * Cada ferramenta: `{ nome, descricao, perfis, esquema, executar(args, contexto) }`, com `contexto = { perfil, usuario }`.
 * Ferramenta nova = uma entrada num dos módulos desta pasta.
 */
export const FERRAMENTAS = [...FERRAMENTAS_DE_PRODUTO];

/** O schema vai ao provedor sem o `$schema` que o zod acrescenta (alguns provedores o recusam). */
function parametrosDe(esquema) {
  const { $schema, ...resto } = z.toJSONSchema(esquema, { io: "input" });
  void $schema;
  return resto;
}

/** @returns {{ nome: string, descricao: string, parametros: object }[]}  só as ferramentas que o perfil pode usar */
export function definicoesParaProvedor(perfil) {
  return FERRAMENTAS.filter((ferramenta) => ferramenta.perfis.includes(perfil)).map((ferramenta) => ({
    nome: ferramenta.nome,
    descricao: ferramenta.descricao,
    parametros: parametrosDe(ferramenta.esquema),
  }));
}

/**
 * Nunca lança: o resultado (ou o erro) volta ao modelo, que se corrige ou avisa o usuário. Argumento inválido, ferramenta
 * inexistente ou fora do perfil, e código que não existe viram `{ ok: false, erro }`; falha interna (banco) vira um
 * aviso genérico — a mensagem de banco fica no log do servidor, não vai ao modelo.
 *
 * @param {string} nome
 * @param {unknown} argumentosBrutos
 * @param {{ perfil: "admin" | "publico", usuario?: string }} contexto
 * @returns {Promise<{ ok: true, resultado: any, duracaoMs: number } | { ok: false, erro: string, duracaoMs: number }>}
 */
export async function executarFerramenta(nome, argumentosBrutos, contexto = { perfil: "admin" }) {
  const inicio = Date.now();
  const falha = (erro) => ({ ok: false, erro, duracaoMs: Date.now() - inicio });

  const ferramenta = FERRAMENTAS.find((candidata) => candidata.nome === nome);
  if (!ferramenta) return falha(`Ferramenta desconhecida: ${nome}.`);
  if (!ferramenta.perfis.includes(contexto.perfil)) return falha("Esta ferramenta não está disponível para este perfil.");

  const validacao = ferramenta.esquema.safeParse(argumentosBrutos ?? {});
  if (!validacao.success) {
    const problemas = validacao.error.issues.map((problema) => `${problema.path.join(".") || "argumentos"}: ${problema.message}`);
    return falha(`Argumentos inválidos — ${problemas.join("; ")}`);
  }

  try {
    const resultado = await ferramenta.executar(validacao.data, contexto);
    return { ok: true, resultado, duracaoMs: Date.now() - inicio };
  } catch (erro) {
    if (erro instanceof ErroDeFerramenta) return falha(erro.message);
    console.error(`[rise-ai] falha na ferramenta ${nome}:`, erro);
    return falha("Não foi possível consultar agora. Tente de novo em instantes.");
  }
}

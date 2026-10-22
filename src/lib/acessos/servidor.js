import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { ErroDeAcesso } from "./erros.js";
import { executarComSessao } from "./involucro.js";
import { recursoPorId } from "./recursos.js";
import { loginDaRequisicao, montarSessao, precisaGravarAcesso, quebraVidro } from "./sessao.js";

/**
 * A sessao de Acessos desta requisicao, lida UMA vez (o `cache()` do React vale por requisicao: o layout e a pagina
 * dividem a mesma leitura, e nada sobrevive para a requisicao seguinte; spec §4, "nada em cache que sobreviva a uma
 * mudanca"). So servidor: usa `next/headers` e o banco.
 *
 * O PC de desenvolvimento sem simulacao nao le o banco: e administrador por ambiente, e assim o Rise do PC abre mesmo
 * com o Postgres fora do ar (Integracoes › Servidor VPS existe para trazer o banco da VPS).
 */
export const sessaoDeAcessos = cache(async () => {
  const env = process.env;
  // Fora de uma requisicao (script, teste, tarefa do servidor) nao ha cabecalhos: `headers()` lanca. No PC isso e a
  // maquina do dono (administrador por ambiente, como sempre); na VPS nao ha login e a falha e fechada.
  let cabecalhos = null;
  try {
    cabecalhos = await headers();
  } catch {
    cabecalhos = null;
  }
  const { ambiente, login, motivo } = loginDaRequisicao(cabecalhos, env);
  const peloEnv = quebraVidro(login, env);
  if (!login || (ambiente === "pc" && motivo !== "simulado")) {
    return montarSessao({ ambiente, login, motivo, usuario: null, quebraVidro: peloEnv });
  }

  let usuario;
  try {
    usuario = await prisma.usuarioRise.findUnique({
      where: { login },
      include: { funcoes: { include: { funcao: { include: { permissoes: true } } } }, excecoes: true },
    });
  } catch (erro) {
    console.error("[acessos] banco indisponível ao ler a sessão:", erro?.message ?? erro);
    return montarSessao({ ambiente, login, motivo, usuario: null, quebraVidro: peloEnv, erroBanco: true });
  }

  // No maximo a cada 10 minutos e sem segurar a resposta: o ultimo acesso e informacao, nao regra.
  if (usuario && precisaGravarAcesso(usuario.ultimoAcessoEm)) {
    prisma.usuarioRise
      .update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } })
      .catch((erro) => console.error("[acessos] último acesso não gravado:", erro?.message ?? erro));
  }
  return montarSessao({ ambiente, login, motivo, usuario, quebraVidro: peloEnv });
});

/** Lanca `ErroDeAcesso` se a pessoa nao tem `nivel` em `id`; devolve a sessao. Para codigo de servidor fora das acoes. */
export async function exigirAcesso(id, nivel) {
  const sessao = await sessaoDeAcessos();
  if (!sessao.pode(id, nivel)) throw new ErroDeAcesso(id, nivel);
  return sessao;
}

/** Para paginas e layouts: sem o nivel, 404 do Rise (spec §5.6: nunca "sem permissão" com link). Devolve a sessao. */
export async function exigirAcessoNaPagina(id, nivel) {
  const sessao = await sessaoDeAcessos();
  if (!sessao.pode(id, nivel)) notFound();
  return sessao;
}

/** Para rotas `/api/*`: 403 sem corpo (nada de mensagem que diga o que existe atras). */
export function recusarRota() {
  return new Response(null, { status: 403 });
}

/**
 * Para Server Actions que devolvem o PROPRIO formato e nao cabem no `executarComAcesso` (que embrulha tudo em `{ ok,
 * ... }`): `null` se a pessoa tem o nivel; senao a recusa no formato das acoes, `{ ok: false, erro }`. Uso, na primeira
 * linha da acao: `const negado = await negarSemAcesso("tela.produtos.cadastro", "editar"); if (negado) return negado;`.
 * Falha ao ler a sessao e falha fechada.
 */
export async function negarSemAcesso(id, nivel) {
  try {
    const sessao = await sessaoDeAcessos();
    if (sessao.pode(id, nivel)) return null;
  } catch (erro) {
    console.error("[acessos] falha ao conferir a permissão:", erro?.message ?? erro);
  }
  return { ok: false, erro: `Sem permissão para ${recursoPorId(id)?.rotulo ?? "isso"}.` };
}

/**
 * O mesmo `negarSemAcesso` para uma acao que pede mais de um recurso (a tela e o dado sensivel, ou a tela e a acao):
 * `negarSemAcessos(["tela.produtos", "editar"], ["dado.localizacao", "editar"])`. Devolve a primeira recusa, ou null.
 */
export async function negarSemAcessos(...pares) {
  for (const [id, nivel] of pares) {
    const negado = await negarSemAcesso(id, nivel);
    if (negado) return negado;
  }
  return null;
}

/** A pessoa tem `nivel` em `id` agora? Para acao que devolve lista (sem permissao devolve `valorSeNegado`) e para decidir o que ler. */
export async function podeAgora(id, nivel) {
  try {
    return (await sessaoDeAcessos()).pode(id, nivel);
  } catch (erro) {
    console.error("[acessos] falha ao conferir a permissão:", erro?.message ?? erro);
    return false;
  }
}

/** O involucro das Server Actions: confere o recurso antes de rodar o trabalho e devolve `{ ok, ... }`. */
export function executarComAcesso(id, nivel, trabalho) {
  return executarComSessao(sessaoDeAcessos, id, nivel, trabalho);
}

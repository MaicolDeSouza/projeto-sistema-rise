import { prisma } from "@/lib/db";
import { ErroDeUso } from "./erros";

/**
 * As conversas do Rise AI no banco: de quem é cada uma, listar, buscar, renomear, excluir e avaliar respostas.
 *
 * Conversa é de QUEM A CRIOU (`usuario`, o nome do login): a lista mostra só as próprias, e só o dono renomeia,
 * exclui e avalia. O administrador lê as de todos na Revisão (`carregarConversa` com `administrador`). Não achar e não
 * ser dono dão a mesma resposta, para não revelar que a conversa de outra pessoa existe.
 */

const NAO_ENCONTRADA = "Conversa não encontrada.";
const LIMITE_DO_TITULO = 120;

const ordemDasMensagens = [{ criadoEm: "asc" }, { id: "asc" }];

export async function criarConversa({ usuario, perfil = "ADMIN", titulo }) {
  return prisma.conversaIA.create({ data: { usuario, perfil: perfil === "PUBLICO" ? "PUBLICO" : "ADMIN", titulo } });
}

/**
 * @param {{ usuario: string, administrador?: boolean, todas?: boolean, busca?: string, limite?: number }} opcoes
 *   `todas` só vale para administrador; `busca` procura no título e no texto das mensagens.
 */
export async function listarConversas({ usuario, administrador = false, todas = false, busca = "", limite = 100 }) {
  const termo = String(busca ?? "").trim();
  return prisma.conversaIA.findMany({
    where: {
      ...(administrador && todas ? {} : { usuario }),
      ...(termo
        ? {
            OR: [
              { titulo: { contains: termo, mode: "insensitive" } },
              { mensagens: { some: { conteudo: { contains: termo, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { atualizadoEm: "desc" },
    take: limite,
    select: { id: true, titulo: true, usuario: true, perfil: true, criadoEm: true, atualizadoEm: true, revisadaEm: true },
  });
}

/** A conversa com as mensagens em ordem, ou `null` se não existe ou não é do usuário (administrador lê qualquer uma). */
export async function carregarConversa(id, { usuario, administrador = false }) {
  const conversa = await prisma.conversaIA.findUnique({ where: { id: String(id ?? "") }, include: { mensagens: { orderBy: ordemDasMensagens } } });
  if (!conversa) return null;
  if (conversa.usuario !== usuario && !administrador) return null;
  return conversa;
}

async function conversaDoUsuario(id, sessao) {
  const conversa = await prisma.conversaIA.findUnique({ where: { id: String(id ?? "") }, select: { id: true, usuario: true } });
  if (!conversa || conversa.usuario !== sessao.usuario) throw new ErroDeUso(NAO_ENCONTRADA);
  return conversa;
}

export async function renomearConversa(id, titulo, sessao) {
  const limpo = String(titulo ?? "").trim();
  if (limpo.length < 1 || limpo.length > LIMITE_DO_TITULO) throw new ErroDeUso(`O título precisa ter de 1 a ${LIMITE_DO_TITULO} caracteres.`);
  await conversaDoUsuario(id, sessao);
  return prisma.conversaIA.update({ where: { id }, data: { titulo: limpo } });
}

/**
 * Apaga a conversa e as mensagens dela. O conhecimento que nasceu de uma resposta dela FICA (a nota é do dono, não da
 * conversa): só perde a ligação com a mensagem de origem.
 */
export async function excluirConversa(id, sessao) {
  await conversaDoUsuario(id, sessao);
  await prisma.$transaction(async (tx) => {
    const mensagens = await tx.mensagemIA.findMany({ where: { conversaId: id }, select: { id: true } });
    await tx.conhecimentoIA.updateMany({ where: { origemMensagemId: { in: mensagens.map((mensagem) => mensagem.id) } }, data: { origemMensagemId: null } });
    await tx.conversaIA.delete({ where: { id } });
  });
}

export async function gravarMensagem(conversaId, dados) {
  return prisma.mensagemIA.create({ data: { conversaId, ...dados } });
}

/**
 * 👍 (1), 👎 (-1) ou tirar a avaliação (`null`), com o comentário de quem avaliou. Só resposta da IA, e só o dono da
 * conversa (ou administrador).
 */
export async function avaliarMensagem(id, { avaliacao, comentario = null, usuario, administrador = false }) {
  if (avaliacao !== 1 && avaliacao !== -1 && avaliacao !== null) throw new ErroDeUso("Avaliação inválida.");
  const mensagem = await prisma.mensagemIA.findUnique({ where: { id: String(id ?? "") }, include: { conversa: { select: { usuario: true } } } });
  if (!mensagem || mensagem.papel !== "ASSISTENTE" || (mensagem.conversa.usuario !== usuario && !administrador)) {
    throw new ErroDeUso("Mensagem não encontrada.");
  }
  const avaliando = avaliacao !== null;
  return prisma.mensagemIA.update({
    where: { id: mensagem.id },
    data: {
      avaliacao,
      comentario: avaliando ? String(comentario ?? "").trim() || null : null,
      avaliadoPor: avaliando ? usuario : null,
      avaliadoEm: avaliando ? new Date() : null,
    },
  });
}

/** Uma mensagem (sem a conversa), se o usuário é o dono ou administrador; senão `null` — como `carregarConversa`. */
export async function carregarMensagem(id, { usuario, administrador = false }) {
  const mensagem = await prisma.mensagemIA.findUnique({ where: { id: String(id ?? "") }, include: { conversa: { select: { usuario: true } } } });
  if (!mensagem) return null;
  if (mensagem.conversa.usuario !== usuario && !administrador) return null;
  const { conversa, ...resto } = mensagem;
  void conversa;
  return resto;
}

const comoNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * A mensagem como a tela a recebe. Só JSON simples: o `Decimal` do custo não atravessa uma Server Action nem um
 * componente de cliente, e a data vai como texto ISO. Custo ausente continua `null` (a tela diz "preço não cadastrado"),
 * nunca vira zero.
 */
export function mensagemParaTela(mensagem) {
  return {
    id: mensagem.id,
    papel: mensagem.papel,
    conteudo: mensagem.conteudo,
    estruturado: mensagem.estruturado ?? null,
    provedor: mensagem.provedor ?? null,
    modelo: mensagem.modelo ?? null,
    motivoDaReserva: mensagem.motivoDaReserva ?? null,
    tokensEntrada: mensagem.tokensEntrada ?? null,
    tokensSaida: mensagem.tokensSaida ?? null,
    custoUsd: comoNumero(mensagem.custoUsd),
    custoBrl: comoNumero(mensagem.custoBrl),
    duracaoMs: mensagem.duracaoMs ?? null,
    avaliacao: mensagem.avaliacao ?? null,
    comentario: mensagem.comentario ?? null,
    avaliadoPor: mensagem.avaliadoPor ?? null,
    avisos: mensagem.avisos ?? [],
    criadoEm: mensagem.criadoEm instanceof Date ? mensagem.criadoEm.toISOString() : String(mensagem.criadoEm),
  };
}

/** A conversa como a lista lateral a recebe: só o que ela mostra, com a data em texto (Date não atravessa a Server Action). */
export function conversaParaLista(conversa) {
  return { id: conversa.id, titulo: conversa.titulo, atualizadoEm: conversa.atualizadoEm.toISOString() };
}

import { z } from "zod";

import { prisma } from "@/lib/db";
import { criarConversa, gravarMensagem } from "@/lib/riseAi/conversas";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";
import { limitesDoDia } from "@/lib/riseAi/revisao";
import { chamadasRecentes } from "./registro.js";

/**
 * A ferramenta `anotarDuvida` (decisoes A1 e B1 do dono, 20/10/2026): o Claude/ChatGPT anota, ao fim de cada resposta, a
 * pergunta da pessoa, a resposta que deu e o TEXTO dos arquivos que ela mandou (os bytes nunca chegam ao Rise). Tudo cai
 * numa conversa do canal MCP, uma por login, por cliente e por dia de Sao Paulo, e aparece na Revisao do dia como as do
 * chat: o dono avalia, propoe correcao e ensina o Conhecimento, que volta ao modelo pelo `buscarConhecimento`.
 *
 * E a unica escrita que o /mcp faz, e so na propria duvida: nada de produto, preco ou estoque.
 */

const FUSO = "America/Sao_Paulo";

export const ESQUEMA_ANOTAR = z.object({
  pergunta: z.string().trim().min(1).max(4000).describe("A pergunta original da pessoa, como ela escreveu"),
  resposta: z.string().trim().min(1).max(20000).describe("A sua resposta final, como a pessoa a viu"),
  anexos: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(120).describe("Nome do arquivo"),
        tipo: z.string().trim().max(40).optional().describe("Tipo do arquivo (pdf, imagem, planilha...)"),
        texto: z.string().max(20000).describe("O texto que você extraiu do arquivo"),
      }),
    )
    .max(5)
    .optional()
    .describe("Os arquivos que a pessoa enviou nesta pergunta, como texto"),
});

const DESCRICAO =
  "Anota no Rise a dúvida que você acabou de responder: a pergunta original da pessoa, a sua resposta final e, se ela " +
  "enviou arquivo, o texto que você extraiu dele. Chame no FIM de CADA resposta em que você consultou o Rise. Serve para " +
  "a loja revisar e melhorar as respostas; não aparece para a pessoa e não altera nenhum produto.";

const textoMascarado = (texto) => mascararDadosPessoais(texto).texto;
const diaEmSaoPaulo = (agora) => new Date(agora).toLocaleDateString("sv-SE", { timeZone: FUSO });
const diaEMes = (agora) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(new Date(agora));

/** A conversa de hoje (dia de Sao Paulo) deste login e deste cliente no canal MCP; criada na primeira duvida do dia. */
export async function conversaDoDiaDoMcp(login, clienteNome, agora = Date.now()) {
  const { inicio, fim } = limitesDoDia(diaEmSaoPaulo(agora));
  const titulo = `Dúvidas pelo ${clienteNome} · ${diaEMes(agora)}`;
  const existente = await prisma.conversaIA.findFirst({
    where: { canal: "MCP", usuario: login, titulo, criadoEm: { gte: inicio, lt: fim } },
    orderBy: { criadoEm: "asc" },
    select: { id: true },
  });
  return existente ?? criarConversa({ usuario: login, perfil: "ADMIN", titulo, canal: "MCP" });
}

/**
 * Grava a pergunta (USUARIO) e a resposta (ASSISTENTE). Tudo mascarado (telefone, e-mail, CPF/CNPJ), como no chat. A
 * resposta fica com `provedor: "mcp"`, o nome do cliente como modelo e custo ZERO, nao nulo: quem pagou foi a conta da
 * pessoa, e nulo faria o Consumo e o orcamento acusarem "preco nao cadastrado".
 *
 * @returns {Promise<{ conversaId: string, mensagemId: string }>}
 */
export async function anotarDuvida({ login, clienteId = null, clienteNome, pergunta, resposta, anexos = [] }, { agora = Date.now() } = {}) {
  const validado = ESQUEMA_ANOTAR.safeParse({ pergunta, resposta, anexos });
  if (!validado.success) throw new ErroDeFerramenta(`Anotação inválida — ${validado.error.issues.map((problema) => problema.message).join("; ")}`);
  if (!login) throw new ErroDeFerramenta("Sem login para anotar a dúvida.");

  const ferramentas = await chamadasRecentes({ login, clienteId }, { agora });
  const conversa = await conversaDoDiaDoMcp(login, clienteNome, agora);
  const lista = validado.data.anexos ?? [];
  await gravarMensagem(conversa.id, {
    papel: "USUARIO",
    conteudo: textoMascarado(validado.data.pergunta),
    avisos: [],
    ...(lista.length
      ? { estruturado: { anexos: lista.map((anexo) => ({ nome: anexo.nome, tipo: anexo.tipo ?? null, caracteres: anexo.texto.length, texto: textoMascarado(anexo.texto) })) } }
      : {}),
  });
  const mensagem = await gravarMensagem(conversa.id, {
    papel: "ASSISTENTE",
    conteudo: textoMascarado(validado.data.resposta),
    provedor: "mcp",
    modelo: clienteNome,
    custoUsd: 0,
    custoBrl: 0,
    avisos: [],
    estruturado: { cliente: clienteNome, ferramentas },
  });
  // A lista de conversas e a Revisao ordenam por atualizacao: a conversa sobe quando ganha duvida nova.
  await prisma.conversaIA.update({ where: { id: conversa.id }, data: { atualizadoEm: new Date(agora) } });
  return { conversaId: conversa.id, mensagemId: mensagem.id };
}

/** No formato do catalogo de ferramentas; o `contexto.mcp` (cliente e relogio) vem do servidor MCP. */
export const FERRAMENTA_ANOTAR = {
  nome: "anotarDuvida",
  descricao: DESCRICAO,
  esquema: ESQUEMA_ANOTAR,
  async executar(argumentos, contexto) {
    await anotarDuvida(
      { login: contexto.usuario, clienteId: contexto.mcp?.clienteId ?? null, clienteNome: contexto.mcp?.clienteNome ?? "Cliente MCP", ...argumentos },
      contexto.mcp?.agora ? { agora: contexto.mcp.agora } : {},
    );
    return { anotado: true };
  },
};

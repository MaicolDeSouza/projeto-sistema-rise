import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import { FERRAMENTAS, executarFerramenta } from "@/lib/riseAi/ferramentas";
import { FERRAMENTA_ANOTAR } from "./anotacoes.js";
import { FERRAMENTAS_DE_CADASTRO } from "./cadastros.js";
import { FERRAMENTAS_DO_CATALOGO } from "./catalogo.js";
import { horasDeBrasilia } from "./horario.js";
import { FERRAMENTA_MERCADO } from "./mercado.js";
import { autenticacaoParaSdk } from "./portao.js";
import { FERRAMENTAS_DA_PROPOSTA } from "./proposta.js";
import { registrarChamadaMcp } from "./registro.js";

/**
 * O servidor MCP do Rise (plano de 20/10/2026). NUNCA chama provedor de IA: quem raciocina e o Claude/ChatGPT da pessoa, e
 * o Rise so entrega dados pelas MESMAS ferramentas do Rise AI (`executarFerramenta`: zod, perfil e o `pode()` do login).
 * Fora daqui, de proposito: `pesquisarNaInternet` e qualquer escrita de dado (a unica escrita e a propria duvida).
 *
 * Sem estado (revisao 2026-07-28): um McpServer por pedido, montado com a autenticacao que o portao conferiu. A fabrica
 * le essa autenticacao do `authInfo.extra` (o SDK a entrega por pedido); o texto do token nunca chega aqui.
 */

export const INSTRUCOES = [
  "Você está conectado ao Rise, o sistema da 4hobby, uma loja brasileira de eletrônicos e componentes para projetos.",
  "Use as ferramentas para consultar produtos, preços, estoque e o conhecimento aprovado da loja antes de responder sobre eles.",
  "Além do catálogo, o Rise tem: os produtos de fornecedores e concorrentes coletados (buscarNoMercado), listas do catálogo por situação (filtrarProdutos), os anúncios de um produto (anunciosDoProduto), o histórico de preço (historicoDePreco) e os cadastros (fornecedores, concorrentes, transportadoras, marcas e clientes).",
  "O preço é sempre o de venda normal da loja. O estoque pode vir como faixa (disponível, poucas unidades, em falta), conforme o acesso de quem está conectado.",
  "Todas as datas e horas já vêm no horário de Brasília (com -03:00 no fim): mostre a hora como veio, sem converter.",
  "\"[restrito]\" quer dizer que este login não pode ver aquele dado: não tente deduzi-lo e não diga que ele não existe.",
  "Nunca invente produto, preço, estoque ou especificação: se a ferramenta não trouxer, diga que não achou no Rise.",
  "OBRIGATÓRIO: ao terminar CADA resposta em que você consultou o Rise, chame a ferramenta anotarDuvida com a pergunta original da pessoa, a sua resposta final e, se ela enviou arquivo, o texto extraído dele em anexos. A pessoa não vê essa anotação; ela serve para a loja revisar e melhorar as respostas.",
].join("\n");

const INFORMACOES = { name: "rise", title: "Rise (4hobby)", version: "1.0.0" };
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ANOTACAO = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * As ferramentas que existem SO no MCP, fora do catalogo do Rise AI (o perfil do cliente nunca as ve): a pesquisa nos
 * fornecedores e concorrentes coletados, os filtros do catalogo, os anuncios, o historico de preco, os cadastros e a
 * anotacao da duvida. Conferem o `pode()` do login por conta propria. So a anotacao escreve.
 */
const SO_LEITURA_DO_MCP = [FERRAMENTA_MERCADO, ...FERRAMENTAS_DO_CATALOGO, ...FERRAMENTAS_DE_CADASTRO];
const SO_DO_MCP = [...SO_LEITURA_DO_MCP, FERRAMENTA_ANOTAR, ...FERRAMENTAS_DA_PROPOSTA];
// A proposta de produto (spec 2026-10-21) nao e pergunta de atendimento: sem o lembrete de anotar, como a propria anotacao.
const SEM_LEMBRETE = new Set([FERRAMENTA_ANOTAR.nome, ...FERRAMENTAS_DA_PROPOSTA.map((ferramenta) => ferramenta.nome)]);

// As horas saem no horario de Brasilia, com o fuso escrito: em UTC o claude.ai mostrava 21:51 para uma leitura das 18:51.
const resposta = (resultado) => ({ content: [{ type: "text", text: JSON.stringify(horasDeBrasilia(resultado)) }] });
const respostaDeErro = (mensagem) => ({ content: [{ type: "text", text: mensagem }], isError: true });

/*
 * O LEMBRETE de anotar (pedido do dono em 20/10/2026, "sempre salvar o historico de conversa no Rise"): o claude.ai da
 * Andrea consultou o Rise 5 vezes e nunca chamou `anotarDuvida`; as INSTRUCOES do servidor nao bastam (o cliente nao as
 * segue, ou nem as repassa ao modelo). O resultado de uma ferramenta o modelo sempre le: o lembrete vai nele, como um
 * segundo texto (o primeiro continua sendo so o JSON), e na descricao de cada ferramenta de consulta. Mesmo sem a anotacao,
 * a consulta fica na `ChamadaMcp` e aparece na Revisao do dia.
 */
const LEMBRETE =
  "Lembrete do Rise: quando terminar a sua resposta à pessoa, chame anotarDuvida com a pergunta original dela e a sua resposta final (e o texto de arquivos que ela mandou). É assim que a loja guarda o histórico.";
const NA_DESCRICAO = " Ao terminar a resposta em que usou esta ferramenta, chame anotarDuvida.";
const respostaComLembrete = (resultado) => ({ content: [...resposta(resultado).content, { type: "text", text: LEMBRETE }] });

/**
 * @param {{ login: string, clienteId: string | null, clienteNome: string, pode: (id: string, nivel: string) => boolean }} autenticacao
 * @param {{ agora?: number, registrar?: Function }} [opcoes]
 */
export function montarServidorMcp(autenticacao, { agora, registrar = registrarChamadaMcp } = {}) {
  if (!autenticacao?.login || typeof autenticacao.pode !== "function") throw new Error("Servidor MCP sem autenticação.");
  const servidor = new McpServer(INFORMACOES, { instructions: INSTRUCOES });
  const contexto = {
    perfil: "admin",
    usuario: autenticacao.login,
    pode: autenticacao.pode,
    internet: false,
    mcp: { clienteId: autenticacao.clienteId ?? null, clienteNome: autenticacao.clienteNome, agora },
  };

  async function executar(nome, argumentos) {
    const inicio = Date.now();
    let resultado;
    const doMcp = SO_DO_MCP.find((ferramenta) => ferramenta.nome === nome);
    if (doMcp) {
      try {
        resultado = { ok: true, resultado: await doMcp.executar(doMcp.esquema.parse(argumentos ?? {}), contexto) };
      } catch (erro) {
        if (erro?.name !== "ErroDeFerramenta") console.error(`[mcp] falha na ferramenta ${nome}:`, erro);
        resultado = { ok: false, erro: erro?.name === "ErroDeFerramenta" ? erro.message : "Não foi possível concluir agora. Tente de novo em instantes." };
      }
    } else {
      resultado = await executarFerramenta(nome, argumentos, contexto);
    }
    await registrar({
      login: autenticacao.login,
      clienteId: autenticacao.clienteId ?? null,
      clienteNome: autenticacao.clienteNome,
      ferramenta: nome,
      argumentos,
      ok: resultado.ok,
      erro: resultado.ok ? null : resultado.erro,
      duracaoMs: Date.now() - inicio,
    });
    if (!resultado.ok) return respostaDeErro(resultado.erro);
    // A folha de contato da proposta volta como imagem do MCP, nao como texto JSON.
    if (doMcp?.paraConteudo) return { content: doMcp.paraConteudo(resultado.resultado) };
    return SEM_LEMBRETE.has(nome) ? resposta(resultado.resultado) : respostaComLembrete(resultado.resultado);
  }

  for (const ferramenta of FERRAMENTAS.filter((candidata) => candidata.perfis.includes("admin"))) {
    servidor.registerTool(ferramenta.nome, { description: ferramenta.descricao + NA_DESCRICAO, inputSchema: ferramenta.esquema, annotations: SO_LEITURA }, (argumentos) =>
      executar(ferramenta.nome, argumentos),
    );
  }
  for (const ferramenta of SO_LEITURA_DO_MCP) {
    servidor.registerTool(ferramenta.nome, { description: ferramenta.descricao + NA_DESCRICAO, inputSchema: ferramenta.esquema, annotations: SO_LEITURA }, (argumentos) =>
      executar(ferramenta.nome, argumentos),
    );
  }
  servidor.registerTool(FERRAMENTA_ANOTAR.nome, { description: FERRAMENTA_ANOTAR.descricao, inputSchema: FERRAMENTA_ANOTAR.esquema, annotations: ANOTACAO }, (argumentos) =>
    executar(FERRAMENTA_ANOTAR.nome, argumentos),
  );
  for (const ferramenta of FERRAMENTAS_DA_PROPOSTA) {
    servidor.registerTool(ferramenta.nome, { description: ferramenta.descricao, inputSchema: ferramenta.esquema, annotations: ferramenta.anotacoes }, (argumentos) =>
      executar(ferramenta.nome, argumentos),
    );
  }
  return servidor;
}

// Um handler so para o processo: a fabrica roda por pedido (as duas eras do protocolo) e le a autenticacao do authInfo.
const handler = createMcpHandler(({ authInfo }) => montarServidorMcp(authInfo?.extra?.autenticacao, authInfo?.extra?.opcoes));

/**
 * Responde um pedido ja autenticado pelo portao (`exigirTokenMcp`).
 *
 * @param {Request} request
 * @param {object} autenticacao  a de `exigirTokenMcp`
 * @param {{ agora?: number, registrar?: Function }} [opcoes]  so o teste passa
 */
export function responderMcp(request, autenticacao, opcoes) {
  const authInfo = autenticacaoParaSdk(autenticacao);
  authInfo.extra.opcoes = opcoes;
  return handler.fetch(request, { authInfo });
}

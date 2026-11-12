import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import { FERRAMENTAS, executarFerramenta } from "@/lib/riseAi/ferramentas";
import { FERRAMENTAS_DA_ANALISE_DE_FORNECEDOR } from "./analiseFornecedor.js";
import { FERRAMENTA_ANOTAR } from "./anotacoes.js";
import { FERRAMENTAS_DE_CADASTRO } from "./cadastros.js";
import { FERRAMENTAS_DE_CANAIS } from "./canais.js";
import { FERRAMENTAS_DE_COMPRAS_ESCRITA, FERRAMENTAS_DE_COMPRAS_LEITURA } from "./compras.js";
import { FERRAMENTAS_DE_CORRECOES } from "./correcoes.js";
import { FERRAMENTAS_DE_ESTUDOS } from "./estudos.js";
import { FERRAMENTAS_DO_CATALOGO } from "./catalogo.js";
import { horasDeBrasilia } from "./horario.js";
import { FERRAMENTA_MERCADO } from "./mercado.js";
import { FERRAMENTAS_DE_PEDIDOS_DE_VENDA } from "./pedidosDeVenda.js";
import { autenticacaoParaSdk } from "./portao.js";
import { FERRAMENTAS_DA_PROPOSTA } from "./proposta.js";
import { FERRAMENTAS_DE_PROPOSTAS_PARA_CLIENTE } from "./propostasParaCliente.js";
import { FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO } from "./propostaDeAnuncio.js";
import { FERRAMENTAS_DE_REFERENCIAS } from "./referencias.js";
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
  "Para montar a proposta de cadastro de um produto, chame primeiro roteiroDaProposta e siga o roteiro (lerParaProposta, baixarCandidatas, folhaDeContato e gravarSecao, nessa ordem, e confira com lerProposta); a proposta nunca altera o produto (o dono aplica e confere na tela) e não precisa de anotarDuvida.",
  "Para escolher os fornecedores e concorrentes de um produto (antes da proposta), chame roteiroDaProposta com canal \"referencias\" e siga o roteiro; marcarReferencias deixa os escolhidos marcados para o dono conferir na lupa.",
  "Correções da descrição: quando o dono corrigir um detalhe do texto (\"escreva 5V, não 5 V\") e pedir para guardar, grave com gravarCorrecaoDaDescricao; nunca grave uma por conta própria. lerParaProposta devolve em \"correcoes\" as que valem para a proposta.",
  "Para a proposta de ANÚNCIO de um produto (Loja Integrada ou Mercado Livre), chame primeiro situacaoDoProduto, diga à pessoa o próximo passo e então roteiroDaProposta com canal \"li\" ou \"ml\", e siga o roteiro; a proposta só preenche o rascunho do anúncio no Rise (o dono revisa e envia).",
  "Sincronizar canais: sincronizarComBling e sincronizarComLojaIntegrada ESCREVEM no Bling e na Loja Integrada (o mesmo que os ícones B e LI da lista de Produtos). Chame só quando situacaoDoProduto indicar o passo E a pessoa pedir, e diga a ela o que vai fazer antes. Se uma delas devolver ok falso com aviso, não tente de novo: a pessoa confere no Bling ou na loja primeiro.",
  "Compras: produtosAbaixoDoMinimo, listarPedidosDeCompra e lerPedidoDeCompra leem; montarPedidoDeCompra cria ou completa o RASCUNHO do fornecedor com os dados que a pessoa passar (mostre o pedido devolvido); mudarSituacaoDoPedidoDeCompra (enviar, cancelar, finalizar) só quando a pessoa pedir com todas as letras. Lançar estoque recebido é só na tela do Rise.",
  "Estudo de viabilidade (vale a pena trabalhar com um produto mandado pelo Scraper? quanto comprar?): chame primeiro roteiroDoEstudoDeViabilidade e siga o roteiro; o relatório volta ao Rise com gravarEstudoDeViabilidade.",
  "Análise de lista de fornecedor (comparar os preços de um fornecedor, em R$ ou US$, com os concorrentes e os outros fornecedores, e montar a página padrão): chame primeiro roteiroDaAnaliseDeFornecedor e siga o roteiro; com parte \"modelo\" ela traz o HTML da página.",
  "Vendas: relatorioDeVendas (totais, canais, dias, mais vendidos e lucro de um período), listarPedidosDeVenda e lerPedidoDeVenda leem os pedidos do Mercado Livre, da Loja Integrada e do Bling (desde 01/11/2026). Datas como AAAA-MM-DD; sem período, os últimos 30 dias. Do cliente só vêm o nome e a cidade.",
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
const SO_LEITURA_DO_MCP = [FERRAMENTA_MERCADO, ...FERRAMENTAS_DO_CATALOGO, ...FERRAMENTAS_DE_CADASTRO, ...FERRAMENTAS_DE_COMPRAS_LEITURA, ...FERRAMENTAS_DE_PEDIDOS_DE_VENDA, ...FERRAMENTAS_DE_PROPOSTAS_PARA_CLIENTE];
// A proposta de anuncio (spec 2026-10-23) entra junto com a de produto: mesmo registro, sem o lembrete.
// A marcacao das referencias (25/10/2026) vai junto: etapa de antes da proposta, sem o lembrete.
// O pedido de compra montado pela conversa (26/10/2026) tambem: cada uma traz as proprias anotacoes de escrita.
// As Correcoes da descricao (07/11/2026) tambem: o dono dita, nao e duvida de atendimento.
// O roteiro da analise de lista de fornecedor (07/11/2026) tambem: e trabalho do dono, como o roteiro da proposta.
// O estudo de viabilidade (12/11/2026) tambem: o Claude Desktop estuda a fila do Scraper e so escreve no proprio estudo.
// Sincronizar com o Bling e com a Loja Integrada (10/11/2026): as duas UNICAS que escrevem em sistema de fora; cada uma
// confere a acao propria do login (acao.produtos.sincronizarBling e acao.lojaIntegrada.sincronizar) e as travas do Rise.
const PROPOSTAS = [...FERRAMENTAS_DA_PROPOSTA, ...FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO, ...FERRAMENTAS_DE_CANAIS, ...FERRAMENTAS_DE_REFERENCIAS, ...FERRAMENTAS_DE_COMPRAS_ESCRITA, ...FERRAMENTAS_DE_CORRECOES, ...FERRAMENTAS_DA_ANALISE_DE_FORNECEDOR, ...FERRAMENTAS_DE_ESTUDOS];
const SO_DO_MCP = [...SO_LEITURA_DO_MCP, FERRAMENTA_ANOTAR, ...PROPOSTAS];
// A proposta de produto (spec 2026-10-21) nao e pergunta de atendimento: sem o lembrete de anotar, como a propria anotacao.
const SEM_LEMBRETE = new Set([FERRAMENTA_ANOTAR.nome, ...PROPOSTAS.map((ferramenta) => ferramenta.nome)]);

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
  for (const ferramenta of PROPOSTAS) {
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

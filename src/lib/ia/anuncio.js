import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/db";
import { LIMITE_TITULO_ML } from "@/lib/limites";
import { linhaDeDimensoes, linhaDePeso, medidasDoProdutoColetado } from "@/lib/medidas";
import { casaPalavra, indiceDePalavras, normalizar, palavrasDoTermo } from "@/lib/texto";

import { limparSugestoesDeCategoria, montarPedidoDeCategorias } from "@/lib/canaisDeVenda/li/categorias";

import { PADRAO_TITULO } from "./padraoTitulo";
import { idDaCaracteristica, identificarDivergencias } from "./divergencias";
import { compactarUnidades, normalizarTerminologiaEletrica } from "./revisaoDescricao";

/**
 * Titulo e descricao de produto escritos pela IA a partir de produtos de
 * fornecedores e concorrentes marcados pelo operador.
 *
 * O cliente manda so os ids: o conteudo e lido aqui, do banco. Aceitar o texto
 * vindo do navegador deixaria qualquer coisa entrar no prompt.
 */

const MODELO = "claude-opus-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

/// Acima disso a marcacao deixa de ser referencia e vira o catalogo inteiro, e
/// o prompt cresce sem ganho.
export const MAXIMO_REFERENCIAS = 20;

const TIPO = { FORNECEDOR: "Fornecedor", CONCORRENTE: "Concorrente", OUTRO: "Outro" };

let cliente = null;

function obterCliente() {
  // O SDK tambem acha credencial em perfil de login, mas o servidor da loja
  // nao tem um: sem a variavel, a mensagem precisa dizer onde configurar.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "IA não configurada: coloque ANTHROPIC_API_KEY no arquivo .env e reinicie o servidor.",
    );
  }
  // Endereco FIXO: o SDK tambem le ANTHROPIC_BASE_URL do ambiente, e nesta
  // maquina essa variavel existe (vem de outras ferramentas). Sem fixar, a chave
  // da loja seguiria para o servidor que estiver nela.
  cliente ??= new Anthropic({ baseURL: "https://api.anthropic.com" });
  return cliente;
}

async function lerReferencias(ids) {
  const lista = [...new Set((ids ?? []).map(String))];
  if (lista.length === 0) throw new Error("Marque pelo menos um produto de referência.");
  if (lista.length > MAXIMO_REFERENCIAS) {
    throw new Error(`Marque no máximo ${MAXIMO_REFERENCIAS} produtos de referencia.`);
  }

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: lista } },
    select: {
      id: true,
      nome: true,
      marca: true,
      modelo: true,
      codigo: true,
      ncm: true,
      descricao: true,
      especificacoes: true,
      fonte: { select: { nome: true, tipo: true } },
    },
  });
  // O banco nao garante a ordem de um filtro IN. A primeira referencia e a
  // mais parecida escolhida na busca e deve continuar primeira no prompt.
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const ordenadas = lista.map((id) => porId.get(id)).filter(Boolean);
  if (ordenadas.length === 0) throw new Error("Os produtos marcados não existem mais no banco.");

  // O nome da loja NAO vai para o prompt: o texto e da Rise e nao pode citar
  // concorrente, e o que nao entra nao tem como vazar.
  // Peso e medidas de cada referencia, JA LIDOS pelo sistema (ficha e texto da
  // descricao). Vao para o prompt e para a escolha de reserva em gerarDescricao.
  const medidasPorReferencia = ordenadas.map((linha, indice) => {
    const achados = medidasDoProdutoColetado(linha);
    return {
      numero: indice + 1,
      nome: linha.nome ?? "",
      pesoKg: achados.peso[0]?.valor ?? null,
      comprimentoCm: achados.comprimento[0]?.valor ?? null,
      larguraCm: achados.largura[0]?.valor ?? null,
      alturaCm: achados.altura[0]?.valor ?? null,
    };
  });

  const texto = ordenadas
    .map((linha, indice) => {
      const partes = [`<referencia numero="${indice + 1}" tipo="${TIPO[linha.fonte.tipo] ?? "Outro"}">`];
      if (linha.nome) partes.push(`Nome: ${linha.nome}`);
      if (linha.marca) partes.push(`Marca: ${linha.marca}`);
      if (linha.modelo) partes.push(`Modelo: ${linha.modelo}`);
      if (linha.codigo && linha.codigo !== "N/A") partes.push(`Codigo: ${linha.codigo}`);
      if (Array.isArray(linha.especificacoes) && linha.especificacoes.length > 0) {
        partes.push("Especificacoes:");
        for (const item of linha.especificacoes) {
          partes.push(item.nome ? `- ${item.nome}: ${item.valor}` : `- ${item.valor}`);
        }
      }
      if (linha.descricao) partes.push(`Descricao:\n${linha.descricao}`);
      partes.push("</referencia>");
      return partes.join("\n");
    })
    .join("\n\n");

  return { texto, quantidade: ordenadas.length, medidasPorReferencia, referencias: ordenadas };
}

async function registrar({ tarefa, referencias, inicio, resposta, erro }) {
  try {
    await prisma.logIntegracao.create({
      data: {
        servico: "ANTHROPIC",
        metodo: "POST",
        endpoint: ENDPOINT,
        statusHttp: erro ? (erro.status ?? null) : 200,
        duracaoMs: Date.now() - inicio,
        requestResumo: JSON.stringify({ tarefa, modelo: MODELO, referencias }),
        responseResumo: resposta
          ? JSON.stringify({
              modelo: resposta.model,
              stopReason: resposta.stop_reason,
              usage: resposta.usage,
            }).slice(0, 1500)
          : null,
        erro: erro ? String(erro.message).slice(0, 400) : null,
      },
    });
  } catch (falha) {
    console.error("Falha ao gravar LogIntegracao:", falha.message);
  }
}

function mensagemDeErro(erro) {
  if (erro instanceof Anthropic.AuthenticationError) {
    return "A chave ANTHROPIC_API_KEY foi recusada. Confira o valor no .env.";
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return "Limite de uso da IA atingido. Tente de novo em alguns instantes.";
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return "Sem conexão com o serviço de IA. Confira a internet e tente de novo.";
  }
  if (erro instanceof Anthropic.APIError) {
    return `O serviço de IA devolveu erro ${erro.status ?? ""}: ${erro.message}`;
  }
  return erro.message;
}

async function chamar({ tarefa, quantidade, sistema, pedido, formato }) {
  const client = obterCliente();
  const inicio = Date.now();

  let resposta;
  try {
    resposta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Se o modelo recusar, outro responde na mesma chamada em vez de a tela
      // mostrar erro por um texto de produto eletronico.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: sistema,
      messages: [{ role: "user", content: pedido }],
      ...(formato ? { output_config: { format: formato } } : {}),
    });
  } catch (erro) {
    await registrar({ tarefa, referencias: quantidade, inicio, erro });
    throw new Error(mensagemDeErro(erro));
  }

  await registrar({ tarefa, referencias: quantidade, inicio, resposta });

  if (resposta.stop_reason === "refusal") {
    throw new Error("A IA recusou gerar este texto. Tente marcar outras referências.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new Error("A resposta da IA veio incompleta. Tente de novo com menos referencias.");
  }

  return resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("")
    .trim();
}

const SISTEMA =
  "Você escreve cadastros de produto para a Rise (4hobby), loja brasileira de componentes " +
  "eletrônicos que vende no Mercado Livre. Escreva em português do Brasil. Use as " +
  "referências (produtos de fornecedores e concorrentes) apenas como fonte de fatos sobre " +
  "o produto: não copie frases delas, não cite lojas, preços ou prazos, e não invente " +
  "especificações que nenhuma referência trouxe.";

/// Quantas opcoes de titulo a tela oferece para escolher.
export const OPCOES_DE_TITULO = 3;

const FORMATO_TITULOS = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { titulos: { type: "array", items: { type: "string" } } },
    required: ["titulos"],
    additionalProperties: false,
  },
};

function limparTitulo(texto) {
  return String(texto ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:-]+$/, "")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

/**
 * Opcoes de titulo para o operador escolher — pedido do dono em 16/09/2026: um
 * titulo so obrigava a clicar de novo ate aparecer um bom, pagando cada volta.
 *
 * Todas seguem o padrao; mudam no que ganha espaco nos 60 caracteres (o CI, a
 * tensao, o que acompanha). Opcao acima do limite ou repetida e descartada, e
 * uma segunda chamada pede so as que faltaram — cortar no meio de uma palavra
 * deixaria o titulo quebrado no anuncio.
 */
export async function gerarTitulos(ids, palavras) {
  const { texto: referencias, quantidade } = await lerReferencias(ids);

  const base =
    `${PADRAO_TITULO}\n\n` +
    (palavras?.trim() ? `Palavras-chave do operador: ${palavras.trim()}\n\n` : "") +
    `Referências:\n\n${referencias}\n\n`;

  const opcoes = [];
  const recusadas = [];

  for (let tentativa = 1; tentativa <= 2 && opcoes.length < OPCOES_DE_TITULO; tentativa++) {
    const faltam = OPCOES_DE_TITULO - opcoes.length;
    const pedido =
      base +
      `Escreva ${faltam} título(s) DIFERENTES entre si para o produto, todos seguindo o padrão. ` +
      "Varie o que ganha espaço (modelo/CI, especificação, compatibilidade, o que acompanha), " +
      "não só a ordem das palavras." +
      (opcoes.length > 0 ? `\n\nJá escolhidos (não repita): ${opcoes.join(" | ")}` : "") +
      (recusadas.length > 0
        ? `\n\nRecusados por passar de ${LIMITE_TITULO_ML} caracteres: ${recusadas.join(" | ")}`
        : "") +
      '\n\nResponda no formato {"titulos": ["...", "..."]}.';

    const texto = await chamar({
      tarefa: "titulos",
      quantidade,
      sistema: SISTEMA,
      pedido,
      formato: FORMATO_TITULOS,
    });

    let candidatos;
    try {
      candidatos = JSON.parse(texto).titulos;
      if (!Array.isArray(candidatos)) throw new Error();
    } catch {
      throw new Error("A IA devolveu os títulos em formato inesperado. Tente de novo.");
    }

    for (const candidato of candidatos) {
      const titulo = limparTitulo(candidato);
      if (!titulo || opcoes.includes(titulo)) continue;
      if (titulo.length > LIMITE_TITULO_ML) recusadas.push(titulo);
      else if (opcoes.length < OPCOES_DE_TITULO) opcoes.push(titulo);
    }
  }

  if (opcoes.length === 0) {
    throw new Error(
      `A IA não conseguiu títulos de até ${LIMITE_TITULO_ML} caracteres. Tente de novo.`,
    );
  }
  return opcoes;
}

/// Meta description da Loja Integrada (pedido do dono em 07/10/2026): o pedido a IA e de 140 a 160
/// caracteres; a faixa aceita comeca em 130 porque a IA conta mal, e uma opcao boa de 135 nao deve
/// custar outra chamada. Acima de 160 o Google corta no resultado.
export const FAIXA_DESCRIPTION_SEO = { minimo: 130, maximo: 160 };
export const OPCOES_DE_DESCRIPTION_SEO = 3;

const FORMATO_DESCRIPTIONS = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { descriptions: { type: "array", items: { type: "string" } } },
    required: ["descriptions"],
    additionalProperties: false,
  },
};

const comparavelSeo = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Separa as opcoes boas: numa linha, sem repetir, dentro da faixa e sem o titulo inteiro dentro
 * (description que repete o title desperdica o espaco do resultado de busca).
 */
export function limparDescriptionsSeo(lista, titulo = "") {
  const aceitas = [];
  const recusadas = [];
  const tituloComparavel = comparavelSeo(titulo);
  for (const bruta of lista ?? []) {
    const texto = String(bruta ?? "").replace(/\s+/g, " ").trim();
    if (!texto || aceitas.includes(texto) || recusadas.includes(texto)) continue;
    const foraDaFaixa = texto.length < FAIXA_DESCRIPTION_SEO.minimo || texto.length > FAIXA_DESCRIPTION_SEO.maximo;
    const repeteTitulo = tituloComparavel.length > 0 && comparavelSeo(texto).includes(tituloComparavel);
    if (foraDaFaixa || repeteTitulo) recusadas.push(texto);
    else aceitas.push(texto);
  }
  return { aceitas, recusadas };
}

/**
 * O pedido da meta description. Os concorrentes entram so com title e description (o nome da loja
 * nao entra: o que nao entra nao vaza para o texto da Rise), como referencia de termos de busca.
 */
export function montarPedidoSeo({ titulo = "", descricao = "", concorrentes = [] }) {
  const referencias = (concorrentes ?? [])
    .filter((item) => item?.title || item?.description)
    .map((item, indice) => `Concorrente ${indice + 1}\nTitle: ${item.title || "(sem)"}\nDescription: ${item.description || "(sem)"}`)
    .join("\n\n");
  return (
    "Escreva a meta description (o resumo que o Google mostra no resultado de busca) do produto abaixo, " +
    "para a loja virtual da Rise.\n\n" +
    "Regras:\n" +
    `- entre ${FAIXA_DESCRIPTION_SEO.minimo + 10} e ${FAIXA_DESCRIPTION_SEO.maximo} caracteres, contando espaços;\n` +
    "- comece pelo que a pessoa busca: o tipo do produto e o modelo ou chip;\n" +
    "- frases completas, sem cortar no meio, sem lista e sem emoji;\n" +
    "- sem CAIXA ALTA (só siglas e códigos de modelo, como USB ou ATmega328P);\n" +
    "- não repita o título inteiro: o título já aparece em cima no resultado;\n" +
    "- use só fatos do cadastro; os concorrentes servem só para ver os termos que eles disputam, não copie frases deles;\n" +
    "- não cite preço, frete, prazo, desconto nem nome de loja.\n\n" +
    `Título do produto: ${titulo}\n\nDescrição do cadastro:\n${descricao || "(vazia)"}\n\n` +
    (referencias ? `SEO dos concorrentes (referência de termos):\n\n${referencias}\n\n` : "") +
    `Escreva ${OPCOES_DE_DESCRIPTION_SEO} opções DIFERENTES entre si. Responda no formato {"descriptions": ["...", "..."]}.`
  );
}

/**
 * Opcoes de meta description para a aba SEO da Loja Integrada, no molde de `gerarTitulos`: as que
 * saem da faixa ou repetem o titulo voltam uma vez para a IA, mostrando as recusadas.
 */
export async function gerarDescriptionsSeo({ titulo = "", descricao = "", concorrentes = [] }) {
  const base = montarPedidoSeo({ titulo, descricao, concorrentes });
  const opcoes = [];
  const recusadas = [];
  for (let tentativa = 1; tentativa <= 2 && opcoes.length < OPCOES_DE_DESCRIPTION_SEO; tentativa++) {
    const pedido =
      base +
      (opcoes.length > 0 ? `\n\nJá aceitas (não repita): ${opcoes.join(" | ")}` : "") +
      (recusadas.length > 0
        ? `\n\nRecusadas (fora de ${FAIXA_DESCRIPTION_SEO.minimo + 10} a ${FAIXA_DESCRIPTION_SEO.maximo} caracteres ou repetindo o título): ${recusadas.map((texto) => `"${texto}" (${texto.length})`).join(" | ")}`
        : "");
    const texto = await chamar({ tarefa: "seo-li", quantidade: concorrentes.length, sistema: SISTEMA, pedido, formato: FORMATO_DESCRIPTIONS });
    let candidatas;
    try {
      candidatas = JSON.parse(texto).descriptions;
      if (!Array.isArray(candidatas)) throw new Error();
    } catch {
      throw new Error("A IA devolveu as descriptions em formato inesperado. Tente de novo.");
    }
    const { aceitas, recusadas: fora } = limparDescriptionsSeo(candidatas, titulo);
    for (const opcao of aceitas) if (!opcoes.includes(opcao) && opcoes.length < OPCOES_DE_DESCRIPTION_SEO) opcoes.push(opcao);
    recusadas.push(...fora.filter((opcao) => !recusadas.includes(opcao)));
  }
  if (opcoes.length === 0) {
    throw new Error(`A IA não conseguiu descriptions de ${FAIXA_DESCRIPTION_SEO.minimo} a ${FAIXA_DESCRIPTION_SEO.maximo} caracteres. Tente de novo.`);
  }
  return opcoes;
}

const FORMATO_CATEGORIAS = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      categorias: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, motivo: { type: "string" } }, required: ["id", "motivo"], additionalProperties: false },
      },
    },
    required: ["categorias"],
    additionalProperties: false,
  },
};

/**
 * Sugere a(s) categoria(s) da Loja Integrada para o produto (pedido do dono em 07/10/2026). A IA so
 * escolhe da arvore real da loja, pelo id; o que nao existe nela e descartado (`limparSugestoesDeCategoria`).
 */
export async function sugerirCategoriasIA({ titulo = "", marca = "", descricao = "", categorias = [] }) {
  if (!categorias.length) throw new Error("A lista de categorias da loja não foi lida. Recarregue as categorias e tente de novo.");
  const texto = await chamar({
    tarefa: "categoria-li",
    quantidade: 0,
    sistema: SISTEMA,
    pedido: montarPedidoDeCategorias({ titulo, marca, descricao, categorias }),
    formato: FORMATO_CATEGORIAS,
  });
  let bruto;
  try {
    bruto = JSON.parse(texto).categorias;
  } catch {
    throw new Error("A IA devolveu as categorias em formato inesperado. Tente de novo.");
  }
  const sugestoes = limparSugestoesDeCategoria(bruto, categorias);
  if (!sugestoes.length) throw new Error("A IA não achou uma categoria da loja para este produto. Escolha na árvore.");
  return sugestoes;
}

/// Texto fixo do fim da descricao, igual em todo anuncio da loja (modelo do dono).
export const GARANTIA_PADRAO = "Garantia Legal de 90 dias (contra defeitos de fabricação)";

const FORMATO_DESCRICAO = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      // DOIS grupos, na ordem [primeiro paragrafo, segundo paragrafo], cada um com as opcoes de
      // texto para o dono escolher (pedido do dono em 04/10/2026: 3 opcoes por paragrafo).
      paragrafos: { type: "array", items: { type: "array", items: { type: "string" } } },
      caracteristicas: {
        type: "array",
        items: {
          type: "object",
          properties: { nome: { type: "string" }, valor: { type: "string" } },
          required: ["nome", "valor"],
          additionalProperties: false,
        },
      },
      itensInclusos: {
        type: "array",
        items: {
          type: "object",
          properties: { quantidade: { type: "integer" }, descricao: { type: "string" } },
          required: ["quantidade", "descricao"],
          additionalProperties: false,
        },
      },
      // Numeros, e nao texto: a linha "Dimensoes (CxLxA)" e escrita pelo codigo,
      // no formato que depois e lido de volta para os campos.
      pesoGramas: { type: ["number", "null"] },
      dimensoesMm: {
        type: "object",
        properties: {
          comprimento: { type: ["number", "null"] },
          largura: { type: ["number", "null"] },
          altura: { type: ["number", "null"] },
        },
        required: ["comprimento", "largura", "altura"],
        additionalProperties: false,
      },
      decisoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            opcao: { type: ["integer", "null"] },
            motivo: { type: "string" },
          },
          required: ["id", "opcao", "motivo"],
          additionalProperties: false,
        },
      },
    },
    required: ["paragrafos", "caracteristicas", "itensInclusos", "pesoGramas", "dimensoesMm", "decisoes"],
    additionalProperties: false,
  },
};

/**
 * TEXTO PURO, pedido do dono em 16/09/2026: a descricao e exportada para varias
 * plataformas, e o Mercado Livre mostra "**" e "#" literalmente. Tira marcacao de
 * Markdown e emoji que escapem da instrucao, e espacos repetidos.
 */
function textoPuro(texto) {
  return normalizarTerminologiaEletrica(compactarUnidades(String(texto ?? "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]+/g, " ")
    // Emoji tirado antes do ponto deixava "otima ." com espaco sobrando.
    .replace(/ +([.,;:!?])/g, (_, sinal) => sinal)
    .trim()));
}

/// Tira o ";" ou "." que a IA ou a loja ja deixaram, para o item nao sair com dois.
const semPontuacaoFinal = (texto) => textoPuro(texto).replace(/[;.,\s]+$/, "");

/**
 * Monta o texto no padrao da loja, que o dono definiu em 16/09/2026:
 *
 *   TITULO EM MAIUSCULAS
 *
 *   Primeiro paragrafo.
 *   Segundo paragrafo.
 *
 *   Especificações técnicas:
 *   - Nome: valor;
 *
 *   Itens inclusos: (Cod:SKU)
 *   - 01 ITEM;
 *
 *   Garantia:
 *   - Garantia Legal de 90 dias (contra defeitos de fabricação);
 *
 * A ORDEM E A PONTUACAO SAO DO CODIGO, nao da IA: pedir o texto pronto dava
 * variacao a cada chamada (um ponto final aqui, um titulo com "#" ali). A IA so
 * escreve o conteudo de cada parte.
 *
 * SEM SECAO DE DOCUMENTOS TECNICOS, de proposito: chegou a existir em 16/09/2026
 * e o dono tirou no mesmo dia. Texto puro nao tem link clicavel, e os arquivos
 * ainda nao tem endereco publico; a lista vai para a Loja Integrada, com link,
 * numa etapa propria.
 */
/// Especificacao que vira a linha propria de Dimensoes/Peso. Se a IA mandar uma
/// dessas na lista, ela sai: senao a medida apareceria duas vezes, e a leitura de
/// volta poderia pegar a errada.
const ESPEC_DE_MEDIDA = /^(peso|dimens|tamanho|medidas|altura|largura|comprimento|profundidade|espessura)/i;

/**
 * @param medidas peso (kg) e dimensoes (cm) — as duas ULTIMAS linhas de
 *   "Especificações técnicas", no formato que o dono definiu em 16/09/2026:
 *   "- Dimensões(CxLxA): 68x53x10mm;" e "- Peso: 55g;". Sao escritas pelo
 *   codigo para `medidasDaDescricao` conseguir le-las de volta nos campos.
 */
export function montarDescricao({
  titulo,
  sku,
  paragrafos,
  caracteristicas,
  itensInclusos,
  medidas = {},
}) {
  const linhas = [];
  if (titulo?.trim()) linhas.push(textoPuro(titulo).toLocaleUpperCase("pt-BR"), "");

  // DOIS paragrafos, colados — sem linha em branco entre eles (padrao do dono,
  // revisto em 16/09/2026; antes eram dois ou tres, separados). A linha em
  // branco fica so antes das especificacoes.
  const texto = paragrafos.map(textoPuro).filter(Boolean).slice(0, 2);
  if (texto.length > 0) linhas.push(...texto, "");

  const especificacoes = caracteristicas.filter(
    (item) => item?.nome?.trim() && item?.valor?.trim() &&
      !ESPEC_DE_MEDIDA.test(String(item.nome).trim()),
  );
  const linhasDeMedida = [linhaDeDimensoes(medidas), linhaDePeso(medidas.pesoKg)].filter(Boolean);

  if (especificacoes.length > 0 || linhasDeMedida.length > 0) {
    linhas.push("Especificações técnicas:");
    for (const item of especificacoes) {
      linhas.push(`- ${semPontuacaoFinal(item.nome)}: ${semPontuacaoFinal(item.valor)};`);
    }
    for (const linha of linhasDeMedida) linhas.push(`- ${linha};`);
    linhas.push("");
  }

  if (itensInclusos.length > 0) {
    linhas.push(sku?.trim() ? `Itens inclusos: (Cod:${sku.trim()})` : "Itens inclusos:");
    for (const item of itensInclusos) {
      const quantidade = String(Math.max(1, Number(item.quantidade) || 1)).padStart(2, "0");
      linhas.push(`- ${quantidade} ${semPontuacaoFinal(item.descricao)};`);
    }
    linhas.push("");
  }

  linhas.push("Garantia:", `- ${GARANTIA_PADRAO};`);
  return linhas.join("\n");
}

/**
 * Descricao no modelo da loja a partir das referencias marcadas.
 *
 * @param {string[]} ids
 * @param {{titulo?: string, sku?: string, medidas?: object}} produto o Nome, o Codigo e
 *   o peso/dimensoes JA preenchidos no formulario. Medida do formulario vence a
 *   da IA: o texto nao pode dizer uma coisa e o campo outra.
 * @param {string} instrucoes o prompt de escrita (o salvo pelo dono, ou o editado so para esta geracao),
 *   ja conferido por `limparPromptDaDescricao`.
 */
export async function gerarDescricao(
  ids,
  { titulo = "", sku = "", medidas = {}, marca = "", modelo = "", descricao = "" } = {},
  instrucoes = PROMPT_DESCRICAO_PADRAO,
) {
  // Sem fornecedor nem concorrente, a geracao parte do proprio produto (pedido do dono em 10/10/2026).
  const semReferencias = (ids ?? []).length === 0;
  if (semReferencias && !String(titulo).trim()) throw new Error("Preencha o Nome do produto antes de gerar.");
  const { texto: referencias, quantidade, medidasPorReferencia, referencias: linhas } = semReferencias
    ? { texto: dadosDoProprioProduto({ titulo, marca, modelo, descricao }), quantidade: 0, medidasPorReferencia: [], referencias: [] }
    : await lerReferencias(ids);
  const divergencias = identificarDivergencias(linhas);

  // As medidas vao ja lidas, numa lista: soltas no meio do texto de cada loja a IA
  // as deixava passar e devolvia null (visto em 16/09/2026, com peso e dimensoes
  // escritos na descricao da Usinainfo).
  const listaDeMedidas = medidasPorReferencia
    .filter((ref) => ref.pesoKg || ref.comprimentoCm || ref.larguraCm || ref.alturaCm)
    .map((ref) => {
      const partes = [];
      if (ref.pesoKg) partes.push(`peso ${arredondarNumero(ref.pesoKg * 1000)} g`);
      const dims = [
        ["comprimento", ref.comprimentoCm],
        ["largura", ref.larguraCm],
        ["altura", ref.alturaCm],
      ].filter(([, valor]) => valor);
      if (dims.length > 0) {
        partes.push(dims.map(([nome, valor]) => `${nome} ${arredondarNumero(valor * 10)} mm`).join(", "));
      }
      return `- Referência ${ref.numero} (${ref.nome}): ${partes.join("; ")}`;
    });

  const pedido = montarPedidoDaDescricao({ titulo, referencias, listaDeMedidas, divergencias, instrucoes, semReferencias });

  // Opcao de paragrafo acima do limite volta para a IA encurtar, uma vez, dizendo quais passaram.
  // Cortar no codigo quebraria a frase no meio.
  let conteudo;
  let opcoesParagrafos = [];
  let longos = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const texto = await chamar({
      tarefa: "descricao",
      quantidade,
      sistema: SISTEMA,
      pedido:
        pedido +
        (longos.length > 0
          ? `\n\nNa tentativa anterior estas opções de parágrafo passaram de ${LIMITE_PARAGRAFO} ` +
            `caracteres; reescreva TODAS as opções, mais curtas, mantendo o que informa:\n${longos.join("\n")}`
          : ""),
      formato: FORMATO_DESCRICAO,
    });

    try {
      conteudo = JSON.parse(texto);
    } catch {
      throw new Error("A IA devolveu a descrição em formato inesperado. Tente de novo.");
    }
    ({ opcoes: opcoesParagrafos, longos } = opcoesDeParagrafos(conteudo?.paragrafos));
    if (!opcoesParagrafos.some((lista) => lista.length > 0)) {
      throw new Error("A IA devolveu uma descrição vazia. Tente de novo.");
    }
    if (longos.length === 0) break;
  }
  // Ainda longo na segunda vez: ficam as frases inteiras que cabem (e sem repetir o que o corte igualou).
  opcoesParagrafos = ajustarAoLimite(opcoesParagrafos);
  // A descricao nasce com a PRIMEIRA opcao de cada paragrafo; o dono troca na janela.
  const paragrafos = opcoesParagrafos.map((lista) => lista[0]).filter(Boolean);

  const idsDivergentes = new Set(divergencias.map((item) => item.id));
  const caracteristicasDaIA = Array.isArray(conteudo.caracteristicas) ? conteudo.caracteristicas : [];
  const posicoes = new Map();
  let caracteristicasComuns = 0;
  const comuns = [];
  for (const item of caracteristicasDaIA) {
    const id = idDaCaracteristica(item?.nome);
    if (idsDivergentes.has(id)) posicoes.set(id, caracteristicasComuns);
    else if (!ESPEC_DE_MEDIDA.test(String(item?.nome ?? "").trim()) && item?.nome && item?.valor) {
      comuns.push(item);
      caracteristicasComuns++;
    }
  }
  const prioridade = (nome) => {
    const chave = normalizar(String(nome ?? ""));
    if (/modelo|chip de interface|microcontrolador|micro.controlador|processador/.test(chave)) return 10;
    if (/usb|conversor/.test(chave)) return 20;
    if (/clock|frequencia|velocidade/.test(chave)) return 30;
    if (/tensao|voltagem|alimentacao/.test(chave)) return 40;
    if (/pinos|portas|entrada|saida|gpio/.test(chave)) return 50;
    if (/memoria|flash|sram|eeprom|rom|ram/.test(chave)) return 60;
    if (/corrente/.test(chave)) return 70;
    return 80;
  };
  const posicaoInferida = (campo) => {
    const indice = comuns.findIndex((item) => prioridade(item.nome) > prioridade(campo));
    return indice < 0 ? comuns.length : indice;
  };
  // Sem referencia, a medida que a IA devolver nao tem de onde ter saido: so contam as do formulario.
  const medidasFinais = juntarMedidas(medidas, semReferencias ? {} : conteudo, reservaDasReferencias(medidasPorReferencia, titulo));
  if (idsDivergentes.has("dimensoes")) {
    for (const campo of ["comprimentoCm", "larguraCm", "alturaCm"]) medidasFinais[campo] = null;
  }
  if (idsDivergentes.has("peso")) medidasFinais.pesoKg = null;
  const textoFinal = montarDescricao({
    titulo,
    sku,
    paragrafos,
    caracteristicas: caracteristicasDaIA
      .filter((item) => !idsDivergentes.has(idDaCaracteristica(item?.nome))),
    itensInclusos: Array.isArray(conteudo.itensInclusos) ? conteudo.itensInclusos : [],
    medidas: medidasFinais,
  });
  const decisoes = new Map((Array.isArray(conteudo.decisoes) ? conteudo.decisoes : [])
    .map((item) => [item.id, item]));
  return {
    texto: textoFinal,
    // As opcoes de cada um dos dois primeiros paragrafos: `[[p1a, p1b, p1c], [p2a, p2b, p2c]]`. O texto
    // acima usa a primeira de cada uma.
    opcoesParagrafos,
    divergencias: divergencias.map((item) => {
      const decisao = decisoes.get(item.id);
      let recomendada = Number.isInteger(decisao?.opcao) &&
        decisao.opcao >= 0 && decisao.opcao < item.opcoes.length ? decisao.opcao : null;
      let motivo = String(decisao?.motivo ?? "").slice(0, 300);
      if (/corrente/i.test(item.campo) && item.opcoes.some((opcao) =>
        /pico/i.test(opcao.valor) && /cont[ií]nu/i.test(opcao.valor)) &&
        recomendada !== null && !/cont[ií]nu/i.test(item.opcoes[recomendada].valor)) {
        recomendada = null;
        motivo = "As fontes misturam corrente de pico e corrente contínua. Confira o valor de operação antes de escolher.";
      }
      return {
        ...item,
        recomendada,
        motivo,
        posicao: item.id === "dimensoes" ? caracteristicasComuns :
          item.id === "peso" ? caracteristicasComuns + 1 :
            posicoes.get(item.id) ?? posicaoInferida(item.campo),
      };
    }),
  };
}

/**
 * Tamanho maximo de cada paragrafo: "no maximo quatro linhas" (pedido do dono em
 * 16/09/2026). Medido na caixa da janela "Criar descricao", onde cabem cerca de
 * 57 caracteres por linha.
 */
export const LIMITE_PARAGRAFO = 230;

/// Quantas opcoes de texto a IA escreve para CADA um dos dois primeiros paragrafos da descricao.
export const OPCOES_DE_PARAGRAFO = 3;

/**
 * O prompt de escrita da descricao: as instrucoes, sem os dados do produto (pedido do dono em 06/10/2026: ver e
 * editar na janela "Criar descricao" o que vai para a IA, e salvar, como o prompt do Nano Banana). O nome, as
 * referencias, as medidas e as divergencias entram sozinhos ANTES dele, em `montarPedidoDaDescricao`.
 *
 * Os nomes das partes (paragrafos, caracteristicas, itensInclusos, pesoGramas, dimensoesMm, decisoes) sao os
 * campos da resposta. Tirar um do texto nao quebra a leitura: o formato JSON obriga a resposta a traze-los.
 */
export const PROMPT_DESCRICAO_PADRAO =
  "Escreva o conteúdo da descrição, em três partes. Tudo em TEXTO PURO: sem negrito, sem " +
  "asteriscos, sem '#', sem emoji e sem links.\n" +
  "- paragrafos: exatamente DOIS grupos, na ordem [opções do primeiro parágrafo, opções do " +
  `segundo parágrafo]. Cada grupo traz exatamente ${OPCOES_DE_PARAGRAFO} opções DIFERENTES ` +
  "de texto para aquele parágrafo, e o dono escolhe UMA de cada grupo. Todas as opções " +
  `seguem o padrão abaixo, cada uma com NO MÁXIMO ${LIMITE_PARAGRAFO} caracteres contando ` +
  "espaços (cerca de quatro linhas). As opções de um grupo devem variar de verdade no que " +
  "ganha espaço e na ordem dos fatos (por exemplo, abrir pelo chip ou pela aplicação; " +
  "destacar a tensão ou a compatibilidade), e não só trocar uma palavra por sinônimo. " +
  "Padrão (\"técnico-comparativo\"), definido com o dono em 22/09/2026:\n" +
  "  Primeiro parágrafo — identidade técnica: comece pelo NOME do produto como sujeito da " +
  "frase (\"A Placa...\", \"A Célula de carga...\", \"O Sensor...\"), diga o que ele é e a " +
  "especificação central que decide a compra (chip/CI, processador, clock — o dado técnico " +
  "mais relevante), terminando com a tensão de operação/alimentação quando as referências " +
  "trouxerem esse dado.\n" +
  "  Segundo parágrafo — compatibilidade prática: o que o produto aceita ou exige junto " +
  "(shields, bibliotecas, IDE, módulo complementar como o HX711) e, quando fizer sentido, o " +
  "que acompanha.\n" +
  "  Escreva em frases completas, com verbo ligando os fatos (\"possui\", \"é compatível " +
  "com\", \"acompanha\"), NUNCA uma lista telegráfica separada só por vírgula. Tom acessível, " +
  "como se explicasse para alguém leigo no assunto, mas sem perder precisão técnica: nenhum " +
  "adjetivo de efeito (\"incrível\", \"ideal\", \"de alta qualidade\", \"a solução perfeita\"). " +
  "Não repita o título nem o que a lista de especificações já diz em detalhe.\n" +
  "- caracteristicas: as especificações técnicas que as referências confirmam, cada uma com " +
  "nome curto e valor (ex.: nome \"Voltagem de Operação\", valor \"5V\"). Da mais importante para " +
  "a menos importante. Não repita a mesma especificação com nomes diferentes. Para cada campo " +
  "divergente listado acima, inclua também UMA característica com o nome do campo e valor \"\" " +
  "na posição técnica correta entre as demais. Essa linha vazia serve somente para ordenar " +
  "as opções que o operador escolherá; não aparecerá na descrição final. Dimensões e peso " +
  "ficam por último, nessa ordem. Em TODAS as unidades de medida técnicas, escreva " +
  "o número colado à unidade, sem espaço: 5V, 50mA, 1KB, 16MHz, 2GHz, 68mm. " +
  "Aplique a regra também a miliampères, milímetros, kilobytes, megahertz, " +
  "gigahertz e outras unidades equivalentes. Use sempre o termo TENSÃO, nunca " +
  "voltagem; use CORRENTE, nunca amperagem. Vale para parágrafos e para nomes " +
  "das especificações.\n" +
  "- itensInclusos: o que vem na embalagem. O primeiro item é o próprio produto, com o nome " +
  "dele em MAIÚSCULAS e sem os acessórios; depois os acessórios, em escrita normal " +
  "(ex.: {quantidade: 1, descricao: \"PLACA COMPATIVEL ARDUINO UNO R3 CH340\"}, " +
  "{quantidade: 1, descricao: \"Cabo USB\"}). Acessório só se o título ou as referências " +
  "disserem que acompanha.\n" +
  "- pesoGramas e dimensoesMm: o peso (em gramas) e as dimensões do CORPO do produto (em " +
  "milímetros: comprimento, largura, altura). Use a lista \"Peso e medidas já encontrados\": " +
  "escolha a da referência que é o MESMO produto do título; se nenhuma for exatamente o mesmo, " +
  "use a mais parecida. Só fica null o que a lista não trouxer. Não use medida de cabo, fio ou " +
  "embalagem. NÃO coloque peso nem " +
  "dimensões em caracteristicas: essas linhas são escritas à parte.\n\n" +
  "- decisoes: para CADA divergência, indique id, índice da opção recomendada (ou null se não " +
  "houver evidência suficiente) e motivo breve. Prefira a variante do mesmo produto do título, " +
  "a medida do corpo em vez da embalagem e dados corroborados por fontes independentes. " +
  "Uma medida com ordem de eixos presumida é menos confiável que uma medida com eixos " +
  "declarados. Para corrente, diferencie limite de pico e operação contínua: não recomende o pico " +
  "como corrente contínua. Uma recomendação é uma hipótese para revisão, não uma certeza. " +
  "Não invente opções. " +
  "Não coloque valores divergentes nos parágrafos nem nas características; o operador " +
  "escolherá esses valores na tela.\n" +
  "Não escreva garantia, preço, prazo nem nome de loja: essas partes são da loja.";

/// Teto do prompt editado. O padrao tem cerca de 4.200 caracteres; o teto deixa espaco para acrescentar.
export const MAXIMO_PROMPT_DESCRICAO = 12000;

/**
 * Confere o prompt que veio da tela: texto, nao vazio e dentro do teto.
 * @returns {{ ok: true, texto: string } | { ok: false, erro: string }}
 */
export function limparPromptDaDescricao(texto) {
  const limpo = typeof texto === "string" ? texto.trim() : "";
  if (!limpo) return { ok: false, erro: "O prompt não pode ficar vazio." };
  if (limpo.length > MAXIMO_PROMPT_DESCRICAO) {
    return { ok: false, erro: `O prompt passa de ${MAXIMO_PROMPT_DESCRICAO} caracteres.` };
  }
  return { ok: true, texto: limpo };
}

/** O pedido inteiro: primeiro os dados do produto, que o codigo monta; depois o prompt de escrita. */
/**
 * Sem fornecedor nem concorrente (pedido do dono em 10/10/2026): o que a IA recebe sai do proprio produto, so o que
 * tem valor. Sem isto ela teria apenas o nome, e completaria a ficha de cabeca.
 */
export function dadosDoProprioProduto({ titulo = "", marca = "", modelo = "", descricao = "" } = {}) {
  const partes = [];
  if (String(titulo).trim()) partes.push(`Nome: ${String(titulo).trim()}`);
  if (String(marca).trim()) partes.push(`Marca: ${String(marca).trim()}`);
  if (String(modelo).trim()) partes.push(`Modelo: ${String(modelo).trim()}`);
  if (String(descricao).trim()) partes.push(`Descrição atual do produto:\n${String(descricao).trim()}`);
  return partes.join("\n");
}

/// A regra que vai junto quando nao ha referencia: a especificacao inventada e o risco de verdade (tensao, corrente,
/// medida ou chip errados num anuncio). Fica no pedido, e nao no prompt da biblioteca, para valer com qualquer prompt.
const REGRA_SEM_REFERENCIAS =
  "Não há referências de outras lojas para este produto. Use SOMENTE os dados do próprio produto abaixo. " +
  "Em caracteristicas, inclua apenas especificações que estejam escritas nesses dados, com o valor escrito ali; " +
  "NUNCA invente, deduza ou complete valores (tensão, corrente, medidas, peso, chip, pinos). Se não houver nenhuma, " +
  "devolva caracteristicas vazia, e pesoGramas e dimensoesMm nulos. Nos parágrafos, não afirme especificação que não " +
  "esteja nesses dados.";

export function montarPedidoDaDescricao({ titulo = "", referencias, listaDeMedidas = [], divergencias = [], instrucoes, semReferencias = false }) {
  return (
    (titulo.trim() ? `Produto que a loja vai anunciar: ${titulo.trim()}\n\n` : "") +
    (semReferencias
      ? `${REGRA_SEM_REFERENCIAS}\n\nDados do próprio produto:\n\n${referencias}\n\n`
      : `Referências:\n\n${referencias}\n\n`) +
    (listaDeMedidas.length > 0
      ? `Peso e medidas já encontrados nas referências:\n${listaDeMedidas.join("\n")}\n\n`
      : "") +
    (divergencias.length > 0
      ? `Divergências a revisar pelo operador (opcoes numeradas a partir de zero):\n${JSON.stringify(
          divergencias.map(({ id, campo, opcoes }) => ({
            id, campo, opcoes: opcoes.map(({ valor, fontes, aviso }) => ({
              valor, aviso, fontes: fontes.map(({ nome, produto }) => `${nome}: ${produto}`),
            })),
          })),
        )}\n\n`
      : "") +
    instrucoes
  );
}

// Os prompts SALVOS (a biblioteca com nome, desde 09/10/2026) moram em `promptsDescricao.js`.

/**
 * Limpa o que a IA devolveu para os dois primeiros paragrafos (pedido do dono em 04/10/2026: 3 opcoes
 * para escolher em cada um): texto puro, sem repetir e ate `OPCOES_DE_PARAGRAFO` por paragrafo, na ordem
 * em que vieram. Devolve tambem as opcoes `longos` (acima do limite) para a IA reescrever.
 *
 * Tolera a IA devolver um texto solto no lugar do grupo (o formato antigo, de um paragrafo so): vira um
 * grupo de uma opcao. Faltar opcao nao e erro (o dono escolhe entre as que vieram); so nao haver nenhuma
 * em todo o resultado e, e isso quem chama confere.
 *
 * @param {unknown} bruto o campo `paragrafos` da resposta
 * @returns {{ opcoes: string[][], longos: string[] }}
 */
export function opcoesDeParagrafos(bruto) {
  const grupos = Array.isArray(bruto) ? bruto.slice(0, 2) : [];
  const opcoes = [];
  const longos = [];
  for (const grupo of grupos) {
    const vistas = new Set();
    const lista = [];
    for (const candidata of Array.isArray(grupo) ? grupo : [grupo]) {
      const limpa = textoPuro(candidata);
      if (!limpa || vistas.has(limpa)) continue;
      vistas.add(limpa);
      lista.push(limpa);
    }
    const finais = lista.slice(0, OPCOES_DE_PARAGRAFO);
    longos.push(...finais.filter((opcao) => opcao.length > LIMITE_PARAGRAFO));
    opcoes.push(finais);
  }
  return { opcoes, longos };
}

/**
 * Ultimo recurso para a opcao que continua acima do limite depois da segunda tentativa: ficam as frases
 * inteiras que cabem. O corte pode igualar duas opcoes, e a repetida sai.
 */
export function ajustarAoLimite(opcoes) {
  return opcoes.map((lista) => [...new Set(lista.map((opcao) => frasesQueCabem(opcao)))]);
}

/** As frases inteiras do comeco que cabem no limite; uma so, se nem ela couber. */
export function frasesQueCabem(texto, limite = LIMITE_PARAGRAFO) {
  const limpo = String(texto ?? "").trim();
  if (limpo.length <= limite) return limpo;
  const frases = limpo.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [limpo];
  let resultado = "";
  for (const frase of frases) {
    if ((resultado + frase).trim().length > limite) break;
    resultado += frase;
  }
  return (resultado || frases[0]).trim();
}

const arredondarNumero =(valor) => Math.round(Number(valor) * 10) / 10;

/**
 * Medida de RESERVA, quando a IA devolve null com a referencia trazendo o dado:
 * de cada campo, a da referencia cujo nome mais se parece com o titulo. Assim a
 * linha "Dimensões"/"Peso" nao some da descricao por decisao da IA.
 */
function reservaDasReferencias(medidasPorReferencia, titulo) {
  const palavras = palavrasDoTermo(titulo);
  const parecenca = (nome) => {
    const formas = indiceDePalavras(normalizar(nome));
    return palavras.filter((palavra) => casaPalavra(formas, palavra)).length;
  };
  const ordenadas = [...medidasPorReferencia].sort((a, b) => parecenca(b.nome) - parecenca(a.nome));
  const primeira = (campo) => ordenadas.find((ref) => Number(ref[campo]) > 0)?.[campo] ?? null;
  return {
    pesoKg: primeira("pesoKg"),
    comprimentoCm: primeira("comprimentoCm"),
    larguraCm: primeira("larguraCm"),
    alturaCm: primeira("alturaCm"),
  };
}

/**
 * Cada medida: a do formulario, se preenchida; senao a que a IA escolheu; senao a
 * de reserva lida das referencias.
 */
function juntarMedidas(doFormulario, conteudo, reserva = {}) {
  const positivo = (valor) => (Number(valor) > 0 ? Number(valor) : null);
  const ia = conteudo?.dimensoesMm ?? {};
  const daIa = {
    pesoKg: positivo(conteudo?.pesoGramas) && Number(conteudo.pesoGramas) / 1000,
    comprimentoCm: positivo(ia.comprimento) && Number(ia.comprimento) / 10,
    larguraCm: positivo(ia.largura) && Number(ia.largura) / 10,
    alturaCm: positivo(ia.altura) && Number(ia.altura) / 10,
  };
  return Object.fromEntries(
    Object.keys(daIa).map((campo) => [
      campo,
      positivo(doFormulario?.[campo]) ?? (daIa[campo] || positivo(reserva[campo])),
    ]),
  );
}

// Para as IAs do canal Mercado Livre (`categoriaML.js`, `tituloML.js`, `fichaML.js`, `pesquisaML.js`):
// a mesma chamada, o mesmo modelo, o mesmo registro em LogIntegracao e as mesmas mensagens de erro.
export {
  chamar as chamarIA,
  limparTitulo,
  SISTEMA as SISTEMA_IA,
  obterCliente as obterClienteIA,
  registrar as registrarIA,
  MODELO as MODELO_IA,
  mensagemDeErro as mensagemDeErroIA,
};

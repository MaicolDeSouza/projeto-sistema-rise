import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/db";
import { LIMITE_TITULO_ML } from "@/lib/limites";
import { linhaDeDimensoes, linhaDePeso, medidasDoProdutoColetado } from "@/lib/medidas";
import { casaPalavra, indiceDePalavras, normalizar, palavrasDoTermo } from "@/lib/texto";

import { PADRAO_TITULO } from "./padraoTitulo";

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
      "IA nao configurada: coloque ANTHROPIC_API_KEY no arquivo .env e reinicie o servidor.",
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
  if (lista.length === 0) throw new Error("Marque pelo menos um produto de referencia.");
  if (lista.length > MAXIMO_REFERENCIAS) {
    throw new Error(`Marque no maximo ${MAXIMO_REFERENCIAS} produtos de referencia.`);
  }

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: lista } },
    select: {
      nome: true,
      marca: true,
      modelo: true,
      codigo: true,
      ncm: true,
      descricao: true,
      especificacoes: true,
      fonte: { select: { tipo: true } },
    },
  });
  if (linhas.length === 0) throw new Error("Os produtos marcados nao existem mais no banco.");

  // O nome da loja NAO vai para o prompt: o texto e da Rise e nao pode citar
  // concorrente, e o que nao entra nao tem como vazar.
  // Peso e medidas de cada referencia, JA LIDOS pelo sistema (ficha e texto da
  // descricao). Vao para o prompt e para a escolha de reserva em gerarDescricao.
  const medidasPorReferencia = linhas.map((linha, indice) => {
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

  const texto = linhas
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

  return { texto, quantidade: linhas.length, medidasPorReferencia };
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
    return "Sem conexao com o servico de IA. Confira a internet e tente de novo.";
  }
  if (erro instanceof Anthropic.APIError) {
    return `O servico de IA devolveu erro ${erro.status ?? ""}: ${erro.message}`;
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
    throw new Error("A IA recusou gerar este texto. Tente marcar outras referencias.");
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
      throw new Error("A IA devolveu os titulos em formato inesperado. Tente de novo.");
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
      `A IA nao conseguiu titulos de ate ${LIMITE_TITULO_ML} caracteres. Tente de novo.`,
    );
  }
  return opcoes;
}

/// Texto fixo do fim da descricao, igual em todo anuncio da loja (modelo do dono).
export const GARANTIA_PADRAO = "Garantia Legal de 90 dias (contra defeitos de fabricação)";

const FORMATO_DESCRICAO = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      paragrafos: { type: "array", items: { type: "string" } },
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
    },
    required: ["paragrafos", "caracteristicas", "itensInclusos", "pesoGramas", "dimensoesMm"],
    additionalProperties: false,
  },
};

/**
 * TEXTO PURO, pedido do dono em 16/09/2026: a descricao e exportada para varias
 * plataformas, e o Mercado Livre mostra "**" e "#" literalmente. Tira marcacao de
 * Markdown e emoji que escapem da instrucao, e espacos repetidos.
 */
function textoPuro(texto) {
  return String(texto ?? "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]+/g, " ")
    // Emoji tirado antes do ponto deixava "otima ." com espaco sobrando.
    .replace(/ +([.,;:!?])/g, (_, sinal) => sinal)
    .trim();
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
    (item) => !ESPEC_DE_MEDIDA.test(String(item?.nome ?? "").trim()),
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
 */
export async function gerarDescricao(ids, { titulo = "", sku = "", medidas = {} } = {}) {
  const { texto: referencias, quantidade, medidasPorReferencia } = await lerReferencias(ids);

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

  const pedido =
    (titulo.trim() ? `Produto que a loja vai anunciar: ${titulo.trim()}\n\n` : "") +
    `Referências:\n\n${referencias}\n\n` +
    (listaDeMedidas.length > 0
      ? `Peso e medidas já encontrados nas referências:\n${listaDeMedidas.join("\n")}\n\n`
      : "") +
    "Escreva o conteúdo da descrição, em três partes. Tudo em TEXTO PURO: sem negrito, sem " +
    "asteriscos, sem '#', sem emoji e sem links.\n" +
    `- paragrafos: exatamente DOIS parágrafos, cada um com NO MÁXIMO ${LIMITE_PARAGRAFO} ` +
    "caracteres contando espaços (cerca de quatro linhas), no padrão abaixo (\"técnico-" +
    "comparativo\"), definido com o dono em 22/09/2026.\n" +
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
    "a menos importante. Não repita a mesma especificação com nomes diferentes.\n" +
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
    "Não escreva garantia, preço, prazo nem nome de loja: essas partes são da loja.";

  // Paragrafo acima do limite volta para a IA encurtar, uma vez, dizendo quais
  // passaram. Cortar no codigo quebraria a frase no meio.
  let conteudo;
  let paragrafos = [];
  let longos = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const texto = await chamar({
      tarefa: "descricao",
      quantidade,
      sistema: SISTEMA,
      pedido:
        pedido +
        (longos.length > 0
          ? `\n\nNa tentativa anterior estes parágrafos passaram de ${LIMITE_PARAGRAFO} ` +
            `caracteres; reescreva mais curtos, mantendo o que informa:\n${longos.join("\n")}`
          : ""),
      formato: FORMATO_DESCRICAO,
    });

    try {
      conteudo = JSON.parse(texto);
    } catch {
      throw new Error("A IA devolveu a descricao em formato inesperado. Tente de novo.");
    }
    paragrafos = Array.isArray(conteudo?.paragrafos) ? conteudo.paragrafos : [];
    if (!paragrafos.some((paragrafo) => String(paragrafo).trim())) {
      throw new Error("A IA devolveu uma descricao vazia. Tente de novo.");
    }
    longos = paragrafos
      .slice(0, 2)
      .map((paragrafo) => textoPuro(paragrafo))
      .filter((paragrafo) => paragrafo.length > LIMITE_PARAGRAFO);
    if (longos.length === 0) break;
  }
  // Ainda longo na segunda vez: ficam as frases inteiras que cabem.
  paragrafos = paragrafos.map((paragrafo) => frasesQueCabem(textoPuro(paragrafo)));

  return montarDescricao({
    titulo,
    sku,
    paragrafos,
    caracteristicas: Array.isArray(conteudo.caracteristicas) ? conteudo.caracteristicas : [],
    itensInclusos: Array.isArray(conteudo.itensInclusos) ? conteudo.itensInclusos : [],
    medidas: juntarMedidas(medidas, conteudo, reservaDasReferencias(medidasPorReferencia, titulo)),
  });
}

/**
 * Tamanho maximo de cada paragrafo: "no maximo quatro linhas" (pedido do dono em
 * 16/09/2026). Medido na caixa da janela "Criar descricao", onde cabem cerca de
 * 57 caracteres por linha.
 */
export const LIMITE_PARAGRAFO = 230;

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

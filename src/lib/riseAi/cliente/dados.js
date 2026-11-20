import { juntar, semAcento } from "@/lib/buscaAmpla";
import { linhasDeEspecificacao } from "@/lib/medidas";
import { PALAVRAS_VAZIAS, indiceDePalavras, normalizar, notasDeRelevancia, palavrasDoTermo } from "@/lib/texto";

import { chatDaLojaPadrao, mesclarChatDaLoja, PADRAO_DO_CEREBRO } from "./configuracaoDoCanal";
import { decifrarSegredo } from "./segredos";

/**
 * TODA leitura do servico `ia` (o chat da loja) passa por aqui, e so pelas visoes `ia_*` (sqlDoPapel.js): este arquivo
 * nao conhece a tabela `Produto`, nem custo, nem quantidade em estoque. E a segunda tranca; a primeira e o usuario de
 * banco `rise_ia`, que nao alcanca nada alem disso.
 *
 * `consultar(sql, valores)` e injetado: no servico e o Prisma ligado como `rise_ia`; no teste de isolamento e uma
 * conexao que vestiu o papel. O SQL e montado so de constantes; todo valor de fora vai como parametro ($1, $2...).
 *
 * A busca repete os tres passos de `buscarProdutosNoCatalogo` (src/lib/riseAi/busca.js): codigo exato, palavras no nome e
 * nos codigos, e por ultimo tambem na descricao; a ordem e a mesma conta de relevancia.
 */

const COLUNAS = `"sku", "nome", "marca", "modelo", "preco", "faixa", "link", "liId", "foto", "tipo"`;
const SEM_ESTOQUE = "em falta";
/** A mesma regra da lupa: com ate duas palavras todas contam; com mais, metade do peso ja parece com o produto. */
const NOTA_MINIMA = 0.5;
const LIMITE_DA_DESCRICAO = 3000;
/// Quao parecida com a pergunta uma nota precisa ser (a mesma medida de `recuperarConhecimento`).
const LIMIAR_DE_SIMILARIDADE = 0.08;
const TEXTO_DA_NOTA = semAcento(juntar([`"assunto"`, `"conteudo"`]));

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
/** `%` e `_` da palavra buscada valem como letra, nao como curinga do LIKE. */
const comoLike = (palavra) => `%${palavra.replace(/[\\%_]/g, "\\$&")}%`;
const textoDoProduto = (produto) => normalizar([produto.nome, produto.marca, produto.modelo, produto.sku].filter(Boolean).join(" "));

function semPalavrasVazias(termos) {
  const uteis = normalizar(termos)
    .split(/\s+/)
    .filter((palavra) => palavra && !PALAVRAS_VAZIAS.has(palavra));
  return uteis.length ? uteis : normalizar(termos).split(/\s+/).filter(Boolean);
}

/** Mais relevante primeiro; no empate, quem tem estoque; depois o nome mais curto (mais especifico) e o codigo. */
function ordenar(produtos, termo) {
  const { notas } = notasDeRelevancia(palavrasDoTermo(termo), produtos.map((produto) => indiceDePalavras(textoDoProduto(produto))));
  return produtos
    .map((produto, indice) => ({ produto, nota: notas[indice] }))
    .sort(
      (a, b) =>
        b.nota - a.nota ||
        Number(b.produto.faixa !== SEM_ESTOQUE) - Number(a.produto.faixa !== SEM_ESTOQUE) ||
        a.produto.nome.length - b.produto.nome.length ||
        a.produto.sku.localeCompare(b.produto.sku),
    )
    .map(({ produto }) => produto);
}

/**
 * @param {{ consultar?: (sql: string, valores?: unknown[]) => Promise<object[]>, baseDasFotos?: string, chaveHex?: string }} opcoes
 *   `consultar` padrao: o Prisma do processo (no servico, ligado como `rise_ia`).
 */
export function criarDadosDoCliente({ consultar = null, baseDasFotos = "", chaveHex = null } = {}) {
  const rodar =
    consultar ??
    (async (sql, valores = []) => {
      const { prisma } = await import("@/lib/db");
      return prisma.$queryRawUnsafe(sql, ...valores);
    });

  const paraProduto = (linha) => ({
    sku: linha.sku,
    nome: linha.nome,
    marca: linha.marca ?? null,
    modelo: linha.modelo ?? null,
    preco: numero(linha.preco),
    faixa: linha.faixa,
    link: linha.link,
    liId: linha.liId ?? null,
    foto: linha.foto ? `${baseDasFotos.replace(/\/+$/, "")}/api/arquivos/${encodeURIComponent(linha.sku)}/imagens/${linha.foto}` : null,
    tipo: linha.tipo,
  });

  async function buscarProdutos(termos, { apenasComEstoque = false, precoMaximo = null, limite = 10 } = {}) {
    const texto = String(termos ?? "").trim();
    if (!texto) return [];
    const filtros = [];
    const fixos = [];
    if (apenasComEstoque) filtros.push(`"faixa" <> '${SEM_ESTOQUE}'`);
    if (precoMaximo !== null && precoMaximo !== undefined) {
      fixos.push(Number(precoMaximo));
      filtros.push(`"preco" <= $${fixos.length}`);
    }
    const e = (condicao) => [condicao, ...filtros].join(" AND ");

    // 1. Uma palavra so pode ser um codigo: SKU ou modelo, por igualdade (sem caixa).
    if (!/\s/.test(texto)) {
      const exatos = await rodar(`SELECT ${COLUNAS} FROM ia_produto_publico WHERE ${e(`(lower("sku") = lower($${fixos.length + 1}) OR lower("modelo") = lower($${fixos.length + 1}))`)} LIMIT 50`, [...fixos, texto]);
      if (exatos.length) return ordenar(exatos.map(paraProduto), texto).slice(0, limite);
    }

    // 2 e 3. Todas as palavras uteis no nome e nos codigos; depois, tambem na descricao.
    const palavras = semPalavrasVazias(texto);
    if (palavras.length === 0) return [];
    for (const coluna of ["busca", "buscaAmpla"]) {
      const condicao = palavras.map((_, indice) => `"${coluna}" LIKE $${fixos.length + indice + 1}`).join(" AND ");
      const achados = await rodar(`SELECT ${COLUNAS} FROM ia_produto_publico WHERE ${e(condicao)} LIMIT 200`, [...fixos, ...palavras.map(comoLike)]);
      if (achados.length) return ordenar(achados.map(paraProduto), palavras.join(" ")).slice(0, limite);
    }
    return [];
  }

  async function produtosPorSku(skus) {
    const pedidos = (skus ?? []).map((sku) => String(sku ?? "").trim()).filter(Boolean);
    if (pedidos.length === 0) return [];
    const linhas = await rodar(`SELECT ${COLUNAS} FROM ia_produto_publico WHERE lower("sku") = ANY($1::text[])`, [pedidos.map((sku) => sku.toLowerCase())]);
    const porSku = new Map(linhas.map((linha) => [linha.sku.toLowerCase(), paraProduto(linha)]));
    return pedidos.map((sku) => porSku.get(sku.toLowerCase()) ?? null);
  }

  async function fichaDoProduto(sku) {
    const [linha] = await rodar(`SELECT ${COLUNAS}, "descricao" FROM ia_produto_publico WHERE lower("sku") = lower($1) LIMIT 1`, [String(sku ?? "").trim()]);
    if (!linha) return null;
    const kit = await rodar(`SELECT "pecaSku", "pecaNome", "quantidade" FROM ia_kit_publico WHERE "kitSku" = $1 ORDER BY "ordem"`, [linha.sku]);
    return {
      ...paraProduto(linha),
      descricao: String(linha.descricao ?? "").slice(0, LIMITE_DA_DESCRICAO),
      ficha: linhasDeEspecificacao(linha.descricao ?? ""),
      kit: kit.map((peca) => ({ sku: peca.pecaSku, nome: peca.pecaNome, quantidade: Number(peca.quantidade) })),
    };
  }

  /** Parecidos com um produto (a busca de substituto): metade do peso das palavras do nome, sem o proprio. */
  async function similares(sku, { limite = 5 } = {}) {
    const [produto] = await produtosPorSku([sku]);
    if (!produto) return [];
    const palavras = palavrasDoTermo([produto.nome, produto.marca, produto.modelo].filter(Boolean).join(" "));
    if (palavras.length === 0) return [];
    const candidatos = (await rodar(`SELECT ${COLUNAS} FROM ia_produto_publico WHERE "sku" <> $1`, [produto.sku])).map(paraProduto);
    const { notas } = notasDeRelevancia(palavras, candidatos.map((candidato) => indiceDePalavras(textoDoProduto(candidato))));
    const minima = palavras.length <= 2 ? 1 : NOTA_MINIMA;
    return candidatos
      .map((candidato, indice) => ({ candidato, nota: notas[indice] }))
      .filter(({ nota }) => nota >= minima - 1e-9)
      .sort((a, b) => b.nota - a.nota || Number(b.candidato.faixa !== SEM_ESTOQUE) - Number(a.candidato.faixa !== SEM_ESTOQUE) || a.candidato.nome.length - b.candidato.nome.length)
      .slice(0, limite)
      .map(({ candidato }) => candidato);
  }

  /** As notas APROVADAS e PUBLICAS que tem a ver com a pergunta, ou ligadas aos produtos citados. */
  async function conhecimento(texto, { skus = [], limite = 5, maxCaracteres = 2500 } = {}) {
    const pergunta = normalizar(texto ?? "");
    const doProduto = [...new Set((skus ?? []).map((sku) => String(sku ?? "").trim().toUpperCase()).filter(Boolean))];
    const linhas = await rodar(
      `SELECT "assunto", "conteudo", similarity(${TEXTO_DA_NOTA}, $1) AS "nota"
       FROM ia_conhecimento_publico
       WHERE similarity(${TEXTO_DA_NOTA}, $1) > ${LIMIAR_DE_SIMILARIDADE} OR "produtos" && $2::text[]
       ORDER BY ("produtos" && $2::text[]) DESC, "nota" DESC
       LIMIT ${Math.max(1, Math.min(20, Number(limite) || 5))}`,
      [pergunta, doProduto],
    );
    const notas = [];
    let usados = 0;
    for (const linha of linhas) {
      usados += linha.assunto.length + linha.conteudo.length;
      if (usados > maxCaracteres) break;
      notas.push({ assunto: linha.assunto, conteudo: linha.conteudo });
    }
    return notas;
  }

  /** O que o dono salvou para o canal, com o padrao de fabrica por baixo (a visao devolve nulo no que nunca foi salvo). */
  async function configuracaoDoCanal() {
    const [linha] = await rodar(`SELECT "canal", "promptDoCliente", "tetoClientesBrl", "tempoLimite", "maxChamadasDeFerramenta", "maxTokensResposta", "contextoMaxTokens" FROM ia_configuracao`);
    const salvo = linha ?? {};
    return {
      canal: mesclarChatDaLoja(chatDaLojaPadrao(), salvo.canal ?? null),
      promptDoCliente: salvo.promptDoCliente ?? null,
      tetoClientesBrl: numero(salvo.tetoClientesBrl) ?? PADRAO_DO_CEREBRO.tetoClientesBrl,
      tempoLimite: { ...PADRAO_DO_CEREBRO.tempoLimite, ...(salvo.tempoLimite && typeof salvo.tempoLimite === "object" ? salvo.tempoLimite : {}) },
      maxChamadasDeFerramenta: numero(salvo.maxChamadasDeFerramenta) ?? PADRAO_DO_CEREBRO.maxChamadasDeFerramenta,
      maxTokensResposta: numero(salvo.maxTokensResposta) ?? PADRAO_DO_CEREBRO.maxTokensResposta,
      contextoMaxTokens: numero(salvo.contextoMaxTokens) ?? PADRAO_DO_CEREBRO.contextoMaxTokens,
    };
  }

  /** Os segredos do servico, decifrados. O que falta ou nao decifra volta `null` (o chat fica desligado, nunca cai). */
  async function segredos() {
    const resultado = { openai: null, anthropic: null, turnstile: null };
    const linhas = await rodar(`SELECT "nome", "cifrado" FROM "SegredoDoAssistente"`);
    for (const linha of linhas) {
      if (!(linha.nome in resultado)) continue;
      try {
        resultado[linha.nome] = decifrarSegredo(linha.cifrado, chaveHex);
      } catch {
        // Nunca o conteudo no log: so qual segredo nao abriu (IA_SEGREDO trocado, por exemplo).
        console.error(`[ia] o segredo "${linha.nome}" nao pode ser decifrado com o IA_SEGREDO deste servico.`);
      }
    }
    return resultado;
  }

  async function darSinal({ emAndamento = 0, versao = null, ultimoErro = null } = {}) {
    await rodar(
      `INSERT INTO "SinalDoAssistente" ("id", "sinalEm", "versao", "emAndamento", "ultimoErro") VALUES ('unico', (NOW() AT TIME ZONE 'UTC'), $1, $2, $3)
       ON CONFLICT ("id") DO UPDATE SET "sinalEm" = (NOW() AT TIME ZONE 'UTC'), "versao" = $1, "emAndamento" = $2, "ultimoErro" = $3`,
      [versao, Number(emAndamento) || 0, ultimoErro],
    );
  }

  return { buscarProdutos, produtosPorSku, fichaDoProduto, similares, conhecimento, configuracaoDoCanal, segredos, darSinal };
}

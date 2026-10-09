import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { normalizar } from "@/lib/texto";
import { EXPRESSAO_AMPLA_COLETADO, ondeAchou, palavrasDaBusca, textoDaFicha, todasAsPalavras } from "@/lib/buscaAmpla";

import { linhaDePreco, linhaDoProduto, mudouPreco, produtoDaLinha } from "./linha";

/// Decimal do Prisma vira numero: a tela compara e formata precos.
const numeroDoBanco = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * Gravacao e leitura da coleta no Postgres.
 *
 * Substituiu os dados/coleta/<dominio>/produtos.json em 15/09/2026. A regra que
 * sustenta a estrutura: SO ESCREVE O QUE MUDOU. O produto tem uma linha so,
 * atualizada no lugar; o preco tem serie propria, que ganha registro apenas
 * quando o valor muda.
 */

/// Linhas por insercao. O Postgres aceita 65.535 parametros por comando, e a
/// linha tem uns 35 campos: 500 fica longe do teto.
const LOTE = 500;

/// Campos Json da linha. O Prisma recusa `null` puro neles — exige dizer se e
/// NULL do banco ou o valor JSON null —, e o que se quer e NULL do banco.
const CAMPOS_JSON = [
  "impostos",
  "precosPorQuantidade",
  "imagens",
  "especificacoes",
  "documentos",
  "variantes",
  "seo",
  "plataforma",
  "origens",
];

function paraGravar(linha) {
  const dados = { ...linha };
  for (const campo of CAMPOS_JSON) {
    if (dados[campo] === null || dados[campo] === undefined) dados[campo] = Prisma.DbNull;
  }
  // Fora da assinatura quando ausente (ver linha.js), mas no banco a ausencia
  // precisa APAGAR o valor antigo: undefined num update deixaria o multiplo velho.
  if (dados.multiploVenda === undefined) dados.multiploVenda = null;
  return dados;
}

function emLotes(itens, tamanho = LOTE) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Grava uma coleta inteira de uma fonte.
 *
 * Produto que nao veio nesta coleta NAO e apagado nem alterado: na lista do
 * fornecedor quem marca ausente e a conciliacao, antes de chegar aqui; na
 * vitrine, ficar fora de uma amostra de 20 nao prova que o produto saiu do ar.
 *
 * @param {object} entrada
 * @param {{id: string}} entrada.fonte
 * @param {object[]} entrada.produtos   na forma de normalizar.js
 * @param {"site"|"arquivo"} entrada.origem
 * @param {string} [entrada.resumo]
 * @param {number} [entrada.duracaoMs]
 * @param {Date}   [entrada.coletadoEm] quando a coleta aconteceu (a carga dos
 *   JSON antigos passa a data deles, e nao a de hoje)
 * @param {boolean} [entrada.fecharColeta] false grava so os produtos, sem mexer
 *   na "ultima coleta" da fonte — e o lote gravado no meio da varredura
 * @param {Date}   [entrada.inicioDaColeta] data que vale como ultima coleta. A
 *   varredura gravada em lotes passa o INICIO: a lista da tela mostra quem tem
 *   `vistoEm` a partir dela, e com a data do fim os lotes anteriores sumiriam
 * @param {number} [entrada.totalDaColeta] produtos da varredura inteira, somados
 *   os lotes (sem ele, valeria so o ultimo lote)
 */
export async function gravarColeta({
  fonte,
  produtos,
  origem,
  resumo = null,
  duracaoMs = null,
  coletadoEm = new Date(),
  fecharColeta = true,
  inicioDaColeta = null,
  totalDaColeta = null,
}) {
  // Quem chega primeiro vence, a mesma regra de juntarListas: a pronta entrega
  // antes da reserva, o site antes da planilha.
  const porChave = new Map();
  let semChave = 0;

  for (const produto of produtos) {
    const linha = linhaDoProduto(produto, { origem });
    if (!linha.chave) {
      semChave++;
      continue;
    }
    if (!porChave.has(linha.chave)) porChave.set(linha.chave, linha);
  }

  /*
    SO AS CHAVES DESTE LOTE, e nao a fonte inteira (17/09/2026).

    Lia todos os produtos da fonte a cada gravacao, e a varredura grava de 10 em
    10: na Mamute, 17.153 linhas relidas a cada dez produtos, durante horas. O
    banco ficava ocupado com isso e as telas demoravam a responder enquanto
    qualquer loja era varrida. O resto da funcao so consulta `guardadaPorChave`
    para as chaves que vieram — o que estava fora do lote nunca era usado.
  */
  const guardadas = await prisma.produtoColetado.findMany({
    where: { fonteId: fonte.id, chave: { in: [...porChave.keys()] } },
    select: {
      id: true,
      chave: true,
      hashConteudo: true,
      precoNormal: true,
      precoPromocional: true,
      precoReserva: true,
      estoqueStatus: true,
      ausenteDesde: true,
      quantidade: true,
      vistoEm: true,
    },
  });
  const guardadaPorChave = new Map(guardadas.map((guardada) => [guardada.chave, guardada]));

  const novas = [];
  const alteradas = [];
  const inalteradas = [];

  for (const linha of porChave.values()) {
    const guardada = guardadaPorChave.get(linha.chave);

    if (!guardada) {
      novas.push(linha);
      continue;
    }

    /*
      AUSENTE DESDE A PRIMEIRA LISTA EM QUE FALTOU, nao desde a ultima.

      A conciliacao carimba a data da lista de agora em todo ausente. Sem guardar
      a primeira, um produto fora da lista ha dois meses apareceria como "ausente
      desde a semana passada" — e a data e o que diz se vale cobrar o fornecedor.
    */
    if (linha.ausenteDesde && guardada.ausenteDesde) {
      linha.ausenteDesde = guardada.ausenteDesde;
      linha.hashConteudo = linhaDoProduto(
        { ...produtoDaLinha(linha), ausente: { desde: guardada.ausenteDesde, motivo: linha.ausenteMotivo } },
        { origem },
      ).hashConteudo;
    }

    if (guardada.hashConteudo === linha.hashConteudo) inalteradas.push(guardada.id);
    else alteradas.push({ guardada, linha });
  }

  let precosMudaram = 0;

  await prisma.$transaction(
    async (tx) => {
      const serie = [];

      for (const lote of emLotes(novas)) {
        const criadas = await tx.produtoColetado.createManyAndReturn({
          data: lote.map((linha) => ({
            ...paraGravar(linha),
            fonteId: fonte.id,
            vistoEm: coletadoEm,
          })),
          select: { id: true, chave: true },
        });

        // A primeira linha da serie e a base: sem ela, a primeira mudanca de
        // preco nao teria com o que ser comparada.
        for (const criada of criadas) {
          serie.push({
            produtoId: criada.id,
            coletadoEm,
            ...linhaDePreco(porChave.get(criada.chave)),
          });
        }
      }

      for (const { guardada, linha } of alteradas) {
        const dados = { ...paraGravar(linha), vistoEm: coletadoEm };

        /*
          O SALDO ANTERIOR, com a data em que ele foi visto.

          E a base do historico de venda: sem a data, "de 20 para 10" nao diz se
          saiu em uma semana ou em seis meses. So se escreve quando o numero
          MUDOU e os dois lados existem — saldo nao informado (o produto que nao
          veio na lista do fornecedor) nao apaga o que ja estava guardado, pela
          mesma razao de sempre: "nao veio" nao e uma quantidade nova.
        */
        if (
          linha.quantidade !== null &&
          guardada.quantidade !== null &&
          linha.quantidade !== guardada.quantidade
        ) {
          dados.quantidadeAnterior = guardada.quantidade;
          dados.quantidadeAnteriorEm = guardada.vistoEm;
        }

        await tx.produtoColetado.update({ where: { id: guardada.id }, data: dados });

        if (mudouPreco(guardada, linha)) {
          precosMudaram++;
          serie.push({ produtoId: guardada.id, coletadoEm, ...linhaDePreco(linha) });
        }
      }

      for (const lote of emLotes(serie)) {
        await tx.precoHistorico.createMany({ data: lote });
      }

      // Sem mudanca, so a data de "visto" avanca — um comando por lote, e nao
      // uma escrita por produto.
      for (const lote of emLotes(inalteradas, 5000)) {
        await tx.produtoColetado.updateMany({
          where: { id: { in: lote } },
          data: { vistoEm: coletadoEm },
        });
      }

      if (fecharColeta) {
        await tx.fonteColeta.update({
          where: { id: fonte.id },
          data: {
            ultimaColetaEm: inicioDaColeta ?? coletadoEm,
            ultimaColetaOrigem: origem,
            ultimaColetaTotal: totalDaColeta ?? porChave.size,
            ultimaColetaDuracaoMs: duracaoMs,
            ultimaColetaResumo: resumo,
          },
        });
      }
    },
    // A lista da Fortek na primeira carga sao 1.911 insercoes com foto em
    // base64; o padrao de 5 s do Prisma derrubaria a transacao no meio.
    { maxWait: 30 * 1000, timeout: 10 * 60 * 1000 },
  );

  return {
    gravados: porChave.size,
    novos: novas.length,
    atualizados: alteradas.length,
    inalterados: inalteradas.length,
    precosMudaram,
    semChave,
  };
}

/**
 * Enderecos dos produtos desta fonte gravados a partir de uma data: o que uma
 * varredura interrompida ja tinha salvo nos lotes. E a base da retomada.
 */
export async function enderecosGravadosDesde(fonteId, desde) {
  const linhas = await prisma.produtoColetado.findMany({
    where: { fonteId, vistoEm: { gte: desde }, url: { not: null } },
    select: { url: true },
  });
  return linhas.map((linha) => linha.url);
}

/** Todos os produtos guardados de uma fonte, na forma de normalizar.js. */
export async function lerProdutosDaFonte(fonteId) {
  const linhas = await prisma.produtoColetado.findMany({
    where: { fonteId },
    orderBy: { criadoEm: "asc" },
  });
  return linhas.map(produtoDaLinha);
}

/**
 * A lista para a tela, SEM os campos pesados.
 *
 * Fica fora: galeria, descricao, ficha, documentos, SEO — e ate a miniatura,
 * que vem so para as cem linhas da pagina (`miniaturas`). Filtrar e ordenar
 * alguns milhares de linhas leves em memoria responde em milissegundos, e
 * mantem a busca por todas as palavras que a tela ja fazia.
 *
 * MOSTRA TODOS OS PRODUTOS DO BANCO (pedido do dono em 07/10/2026). De 15/09 a 07/10/2026 a lista mostrava so
 * a ultima coleta de cada fonte, para nao misturar preco de hoje com preco antigo. O efeito colateral foi
 * esconder sem aviso tudo o que uma varredura deixava de ver: o ESP32-S3-WROOM-1 da Usinainfo estava no banco e
 * sumiu da lista, junto de outros 106 produtos dela. Agora todos aparecem, e o que a ultima varredura da loja
 * nao viu vem com `naoVistoDesde` (quando foi visto pela ultima vez), para a tela marcar.
 *
 * Quem passava `{ incluirIds }` (os concorrentes ligados, que podiam estar fora da ultima coleta) continua
 * funcionando: agora todos ja vem, e o parametro e ignorado.
 */
export async function produtosParaLista() {
  const fontes = await prisma.fonteColeta.findMany({
    select: { id: true, ultimaColetaEm: true },
  });

  if (fontes.length === 0) return [];
  const ultimaColeta = new Map(fontes.map((fonte) => [fonte.id, fonte.ultimaColetaEm]));

  const linhas = await prisma.produtoColetado.findMany({
    select: {
      fonteId: true,
      id: true,
      origem: true,
      codigo: true,
      nome: true,
      marca: true,
      modelo: true,
      mpn: true,
      ean: true,
      url: true,
      precoNormal: true,
      precoPromocional: true,
      precoComImpostos: true,
      impostos: true,
      estoqueStatus: true,
      quantidade: true,
      aChegar: true,
      buscaTexto: true,
      vistoEm: true,
      fonte: { select: { nome: true, tipo: true, dominio: true } },
    },
  });

  return linhas.map((linha) => ({
    id: linha.id,
    origem: linha.origem,
    name: linha.nome,
    code: linha.codigo,
    brand: linha.marca,
    model: linha.modelo,
    mpn: linha.mpn,
    ean: linha.ean,
    url: linha.url,
    prices: {
      normal: linha.precoNormal === null ? null : Number(linha.precoNormal),
      promotional: linha.precoPromocional === null ? null : Number(linha.precoPromocional),
      comImpostos: linha.precoComImpostos === null ? null : Number(linha.precoComImpostos),
    },
    taxes: linha.impostos ?? [],
    stock: { status: linha.estoqueStatus, quantity: linha.quantidade, aChegar: linha.aChegar },
    buscaTexto: linha.buscaTexto ?? "",
    coletadoEm: linha.vistoEm.toISOString(),
    naoVistoDesde: naoVistoDesde(linha.vistoEm, ultimaColeta.get(linha.fonteId)),
    fonte: linha.fonte,
  }));
}

/**
 * Quando o produto foi visto pela ultima vez, SE a ultima varredura da loja nao o viu; senao `null`. A varredura
 * fecha com a data do INICIO (`ultimaColetaEm`), entao "visto antes dela" e "fora da ultima varredura". Loja que
 * nunca fechou varredura nao tem com que comparar: nada e marcado.
 */
function naoVistoDesde(vistoEm, ultimaColetaEm) {
  if (!vistoEm || !ultimaColetaEm) return null;
  const visto = new Date(vistoEm);
  return visto < new Date(ultimaColetaEm) ? visto.toISOString() : null;
}

/** A primeira foto de cada produto pedido, para as linhas da pagina atual. */
export async function miniaturas(ids) {
  if (ids.length === 0) return new Map();

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: ids } },
    select: { id: true, miniatura: true },
  });
  return new Map(linhas.map((linha) => [linha.id, linha.miniatura]));
}

/**
 * A plataforma de cada fonte (Loja Integrada, Tray, Shopify...), pela leitura
 * do produto coletado MAIS RECENTE dela que reconheceu uma.
 *
 * Nao ha campo de plataforma na FonteColeta: quem identifica e a coleta de
 * CADA produto (`identificarPlataforma`, no teste de fonte e na varredura), e
 * o resultado fica em `ProdutoColetado.plataforma`. Como todo produto de uma
 * mesma fonte vem do mesmo site, o mais recente que reconheceu algo vale para
 * a fonte inteira — sem duplicar a deteccao nem mexer no schema.
 *
 * `DISTINCT ON` escolhe uma linha por fonte; sem produto reconhecido (fonte
 * nova, ou plataforma nao catalogada), a fonte simplesmente nao entra no mapa.
 */
export async function plataformasPorFonte() {
  const linhas = await prisma.$queryRaw`
    SELECT DISTINCT ON ("fonteId") "fonteId", plataforma
    FROM "ProdutoColetado"
    WHERE plataforma IS NOT NULL
    ORDER BY "fonteId", "vistoEm" DESC`;

  return new Map(linhas.map((linha) => [linha.fonteId, linha.plataforma]));
}

/**
 * Um produto completo, com a fonte e o preco anterior.
 *
 * O PRECO ANTERIOR e o ultimo DIFERENTE do atual, e nao a penultima linha da
 * serie: a serie tambem ganha linha quando so o estoque muda, e a penultima
 * pode ter o mesmo preco — a seta diria "sem variacao" com o preco tendo caido
 * na semana anterior.
 */
export async function detalheDoProduto(id) {
  const linha = await prisma.produtoColetado.findUnique({
    where: { id },
    include: {
      fonte: { select: { nome: true, tipo: true, dominio: true } },
      precos: { orderBy: { coletadoEm: "desc" }, take: 50 },
    },
  });
  if (!linha) return null;

  const atual = linha.precoNormal === null ? null : Number(linha.precoNormal);
  const indice = linha.precos.findIndex(
    (preco) => (preco.precoNormal === null ? null : Number(preco.precoNormal)) !== atual,
  );

  return {
    id: linha.id,
    origem: linha.origem,
    fonte: linha.fonte,
    vistoEm: linha.vistoEm,
    produto: produtoDaLinha(linha),
    precoAnterior:
      indice > 0 && linha.precos[indice].precoNormal !== null
        ? Number(linha.precos[indice].precoNormal)
        : null,
    // A mudanca aconteceu na linha MAIS NOVA que ainda tinha o preco atual.
    mudouEm: indice > 0 ? linha.precos[indice - 1].coletadoEm : null,
  };
}

/**
 * Guarda quantos produtos cada categoria do portal declarou na ultima varredura.
 * A tela de Categorias mostra o numero ao lado do link. So escreve quando o
 * portal respondeu o total: `null` apagaria o numero bom da vez anterior.
 */
export async function atualizarTotaisDasCategorias(fonteId, porCategoria) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id: fonteId }, select: { categorias: true } });
  const atuais = Array.isArray(fonte?.categorias) ? fonte.categorias : [];
  const medidos = new Map((porCategoria ?? []).map((item) => [item.url, item]));

  const categorias = atuais.map((categoria) => {
    const medido = medidos.get(categoria.url);
    if (typeof medido?.total !== "number") return categoria;
    return { ...categoria, total: medido.total, lidos: medido.lidos, varridaEm: new Date().toISOString() };
  });

  await prisma.fonteColeta.update({ where: { id: fonteId }, data: { categorias } });
}

/**
 * A LISTA DA TELA, filtrada, ordenada, contada e paginada NO BANCO.
 *
 * Antes a tela lia a lista inteira e fazia tudo em memoria. Funcionava com dois
 * mil produtos; com 35.226 (a Mamute sozinha tem 17.153) eram 20 MB montados em
 * ~2,3 s A CADA clique — marcar uma fonte, trocar de aba, limpar filtro. Agora
 * o Postgres devolve as 100 linhas da pagina e as contagens.
 *
 * SQL cru porque a ordenacao nao cabe no Prisma: o preco que ordena e o
 * promocional OU o normal (COALESCE), com os sem preco sempre no fim, e a ordem
 * padrao poe o disponivel na frente.
 *
 * @param {object} opcoes
 * @param {""|"CONCORRENTE"|"FORNECEDOR"} [opcoes.tipo]
 * @param {string[]} [opcoes.fontes]   nomes marcados no filtro; vazio = todas
 * @param {string} [opcoes.busca]      todas as palavras sao exigidas
 * @param {""|"menor"|"maior"} [opcoes.ordem]
 * @param {number} [opcoes.pagina]
 * @param {number} [opcoes.porPagina]
 */
export async function listarProdutos({
  tipo = "",
  fontes = [],
  busca = "",
  ordem = "",
  pagina = 1,
  porPagina = 100,
  // BUSCA AMPLA (09/10/2026): procura tambem na descricao, ficha, categoria e SEO, e diz onde achou.
  ampla = false,
} = {}) {
  const todasAsFontes = await prisma.fonteColeta.findMany({
    select: { id: true, nome: true, tipo: true, ultimaColetaEm: true, dominio: true },
  });

  // A aba manda no conjunto: "OUTRO" fica com os concorrentes, como na tabela.
  const doTipo = todasAsFontes.filter((fonte) =>
    !tipo ? true : tipo === "FORNECEDOR" ? fonte.tipo === "FORNECEDOR" : fonte.tipo !== "FORNECEDOR",
  );

  if (doTipo.length === 0) {
    return { linhas: [], total: 0, contagemPorFonte: [], fontesValidas: [] };
  }

  /*
    MOSTRA TODOS OS PRODUTOS DAS FONTES (pedido do dono em 07/10/2026; de 15/09 a 07/10 era so a ultima coleta de
    cada fonte, e o que a varredura deixava de ver sumia sem aviso) — ver `produtosParaLista`. O que a ultima
    varredura da loja nao viu vai por ULTIMO em qualquer ordem, e a linha leva `naoVistoDesde` para a tela marcar.
  */
  const daColeta = Prisma.sql`"fonteId" IN (${Prisma.join(doTipo.map((fonte) => fonte.id))})`;
  const comColeta = doTipo.filter((fonte) => fonte.ultimaColetaEm);
  const foraDaUltima =
    comColeta.length === 0
      ? Prisma.sql`0`
      : Prisma.sql`CASE WHEN ${Prisma.join(
          comColeta.map((fonte) => Prisma.sql`("fonteId" = ${fonte.id} AND "vistoEm" < ${fonte.ultimaColetaEm})`),
          " OR ",
        )} THEN 1 ELSE 0 END`;

  // Todas as palavras sao exigidas, a mesma regra de `combina` — aqui contra o
  // `buscaTexto`, que ja foi normalizado na gravacao. Com a BUSCA AMPLA ligada (09/10/2026), contra a expressao
  // que junta tambem descricao, ficha, categoria e SEO, que tem indice proprio (ver lib/buscaAmpla.js).
  const palavras = palavrasDaBusca(busca);
  // `Prisma.join` de lista vazia da erro: sem palavras nao ha condicao.
  const peloNome =
    palavras.length === 0
      ? null
      : Prisma.join(
          palavras.map((palavra) => Prisma.sql`"buscaTexto" LIKE ${`%${palavra}%`}`),
          " AND ",
        );
  const filtroDaBusca =
    palavras.length === 0
      ? Prisma.empty
      : ampla
        ? Prisma.sql` AND ${todasAsPalavras(EXPRESSAO_AMPLA_COLETADO, palavras)}`
        : Prisma.sql` AND ${peloNome}`;
  // Na busca ampla, o achado pelo NOME vem antes do achado so no texto da loja, em qualquer ordem pedida.
  const primeiroPeloNome =
    ampla && palavras.length > 0 ? Prisma.sql`CASE WHEN ${peloNome} THEN 0 ELSE 1 END ASC, ` : Prisma.empty;

  // O filtro de fontes NAO entra na contagem: o seletor precisa mostrar quantos
  // cada fonte tem mesmo com outra marcada.
  const semFonte = Prisma.sql`(${daColeta})${filtroDaBusca}`;

  const escolhidas = doTipo.filter((fonte) => fontes.includes(fonte.nome));
  const filtroDeFonte =
    escolhidas.length === 0
      ? Prisma.empty
      : Prisma.sql` AND "fonteId" IN (${Prisma.join(escolhidas.map((fonte) => fonte.id))})`;
  const onde = Prisma.sql`${semFonte}${filtroDeFonte}`;

  // Ordena pelo preco NORMAL, e o promocional so na falta dele (regra do dono
  // em 19/09/2026): o desconto a vista e temporario, e a ordem por ele mudaria
  // a cada campanha da loja.
  const ordenacao =
    ordem === "menor"
      ? Prisma.sql`${primeiroPeloNome}${foraDaUltima} ASC, COALESCE("precoNormal", "precoPromocional") ASC NULLS LAST`
      : ordem === "maior"
        ? Prisma.sql`${primeiroPeloNome}${foraDaUltima} ASC, COALESCE("precoNormal", "precoPromocional") DESC NULLS LAST`
        : Prisma.sql`${primeiroPeloNome}${foraDaUltima} ASC, ("estoqueStatus" = 'AVAILABLE') DESC, "coletadoEm" DESC NULLS LAST`;

  // O acervo inteiro, sem filtro nenhum: e o segundo numero do "20 de 100" da
  // tela, que diz se o filtro escondeu muita coisa.
  const todosOsIds = Prisma.sql`"fonteId" IN (${Prisma.join(todasAsFontes.map((fonte) => fonte.id))})`;

  /*
    CADA CONTAGEM E UMA VARREDURA DA TABELA, entao so se conta o que nao da para
    somar. O total filtrado sai da contagem por fonte (que ja respeita aba e
    busca), e o acervo inteiro so precisa de consulta quando ha aba ou busca —
    sem elas, ele E o total.
  */
  const [contagens, geral, linhas] = await Promise.all([
    prisma.$queryRaw`
      SELECT "fonteId", COUNT(*)::int AS quantos
        FROM "ProdutoColetado" WHERE ${semFonte} GROUP BY "fonteId"`,
    tipo || palavras.length > 0
      ? prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM "ProdutoColetado" WHERE (${todosOsIds})`
      : Promise.resolve(null),
    prisma.$queryRaw`
      SELECT id, origem, codigo, nome, marca, mpn, url, "precoNormal", "precoPromocional",
             "precoReserva", "precoComImpostos", impostos, "precosPorQuantidade", "estoqueStatus",
             quantidade, "aChegar", "coletadoEm", "vistoEm", "fonteId", "buscaTexto"
        FROM "ProdutoColetado"
       WHERE ${onde}
       ORDER BY ${ordenacao}
       LIMIT ${porPagina} OFFSET ${Math.max(0, (pagina - 1) * porPagina)}`,
  ]);

  // ONDE a busca ampla achou cada linha DA PAGINA (o selo "achado na descrição"). Le o texto da loja so das
  // cem linhas mostradas, e nao do acervo: e o que pesa.
  const achadoEm = new Map();
  if (ampla && palavras.length > 0 && linhas.length > 0) {
    const textos = await prisma.produtoColetado.findMany({
      where: { id: { in: linhas.map((linha) => linha.id) } },
      select: { id: true, buscaTexto: true, descricao: true, especificacoes: true, seo: true, categoria: true },
    });
    for (const texto of textos) {
      achadoEm.set(
        texto.id,
        ondeAchou(
          texto.buscaTexto ?? "",
          [
            ["descrição", texto.descricao],
            ["ficha técnica", textoDaFicha(texto.especificacoes)],
            ["SEO", [texto.seo?.title, texto.seo?.description, texto.seo?.keywords].filter(Boolean).join(" ")],
            ["categoria", texto.categoria],
          ],
          palavras,
        ),
      );
    }
  }

  const porId = new Map(doTipo.map((fonte) => [fonte.id, fonte]));
  const quantosPorFonte = new Map(contagens.map((linha) => [linha.fonteId, linha.quantos]));

  const somar = (ids) =>
    [...quantosPorFonte].reduce(
      (soma, [id, quantos]) => soma + (ids === null || ids.has(id) ? quantos : 0),
      0,
    );
  const total = somar(escolhidas.length === 0 ? null : new Set(escolhidas.map((f) => f.id)));

  return {
    total,
    totalGeral: geral ? (geral[0]?.total ?? 0) : somar(null),
    // TODA fonte cadastrada da aba aparece no filtro, com 0 quando ainda nao tem
    // produto (pedido do dono em 09/10/2026: a Oceantech, recem-cadastrada, sumia
    // da lista e parecia nao existir). Ate ali so entrava fonte com produto.
    contagemPorFonte: doTipo
      .map((fonte) => ({ nome: fonte.nome, quantidade: quantosPorFonte.get(fonte.id) ?? 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    linhas: linhas.map((linha) => ({
      id: linha.id,
      origem: linha.origem,
      name: linha.nome,
      code: linha.codigo,
      brand: linha.marca,
      mpn: linha.mpn,
      url: linha.url,
      prices: {
        normal: numeroDoBanco(linha.precoNormal),
        promotional: numeroDoBanco(linha.precoPromocional),
        reserva: numeroDoBanco(linha.precoReserva),
        comImpostos: numeroDoBanco(linha.precoComImpostos),
      },
      taxes: linha.impostos ?? [],
      precosPorQuantidade: linha.precosPorQuantidade ?? [],
      stock: {
        status: linha.estoqueStatus,
        quantity: linha.quantidade,
        aChegar: linha.aChegar,
      },
      coletadoEm: linha.coletadoEm,
      naoVistoDesde: naoVistoDesde(linha.vistoEm, porId.get(linha.fonteId)?.ultimaColetaEm),
      // Busca ampla: onde a palavra estava, quando nao estava no nome ([] = achado pelo nome, ou busca normal).
      achadoEm: achadoEm.get(linha.id) ?? [],
      fonte: {
        nome: porId.get(linha.fonteId)?.nome ?? "?",
        tipo: porId.get(linha.fonteId)?.tipo ?? "OUTRO",
        // So para o link de fallback, quando o produto nao tem URL propria
        // (a Fortek/Benser e portal fechado: nenhum produto tem pagina publica).
        dominio: porId.get(linha.fonteId)?.dominio ?? null,
      },
    })),
  };
}

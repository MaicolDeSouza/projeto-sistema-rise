import { prisma } from "@/lib/db";

/**
 * Foto mensal de preco e estoque (pedido do dono em 30/09/2026: guardar 12 meses).
 *
 * Todo dia 14 o worker copia, para FotoMensalColeta e FotoMensalProduto, o que esta
 * no banco. O dia 14 e o dia ANTES da varredura do dia 15: uma varredura leva mais
 * de um dia (o Eletrogate sozinho passa de 20 h), e no meio dela o banco mistura
 * lojas novas com antigas. No dia 14 todas as fontes ja fecharam o ciclo anterior.
 *
 * Por isso a foto do dia 14 traz dados do ciclo anterior — `lidoEm` guarda quando
 * cada numero foi de fato lido, e e ele que diz o quanto o dado esta velho.
 *
 * Uma foto por mes, e por tabela. Idempotente: rodar de novo no mesmo mes nao
 * duplica (chave unica produto + mes), e e assim que o worker se recupera de ter
 * ficado desligado no dia 14 — a foto sai na primeira volta depois de ligar.
 */

/// A partir deste dia do mes a foto e devida.
export const DIA_DA_FOTO = 14;

/// Sem foto anterior, concorrente so entra se foi visto nesta janela: a tabela guarda
/// produtos de amostras antigas (a Usinainfo traz 19 diferentes a cada varredura), e
/// fotografar tudo trataria preco de meses atras como se fosse do mes.
const JANELA_SEM_FOTO_ANTERIOR_MS = 45 * 24 * 3600 * 1000;

/**
 * Ano, mes e dia em Sao Paulo. Perto da meia-noite o UTC ja e o dia seguinte, e a
 * foto do dia 14 sairia no 13 (ou o mes viraria antes da hora).
 */
export function dataEmSaoPaulo(agora = new Date()) {
  const texto = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [ano, mes, dia] = texto.split("-").map(Number);
  return { ano, mes, dia };
}

/**
 * O mes da foto, "2026-09-01". Texto, e nao Date: um Date vira timestamp com fuso
 * ao ir para o banco, e a meia-noite UTC do dia 1 cairia no fim do mes anterior no
 * fuso do Postgres desta maquina (America/Sao_Paulo).
 */
export function mesDaFoto(agora = new Date()) {
  const { ano, mes } = dataEmSaoPaulo(agora);
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export function fotoDevida(agora = new Date()) {
  return dataEmSaoPaulo(agora).dia >= DIA_DA_FOTO;
}

/** Meio-dia UTC do dia 1: o Prisma converte para DATE sem cair no dia vizinho. */
const comoDia = (mes) => new Date(`${mes}T12:00:00Z`);

/**
 * Fornecedor e concorrente. Copia a fonte e o produto para a foto (sem chave
 * estrangeira: apagar a fonte nao leva o historico).
 *
 * PRECO: fornecedor guarda o COM IMPOSTOS (o que se paga), e so na falta dele o
 * normal; concorrente guarda o NORMAL. O promocional so entra quando a loja nao
 * publicou o normal — a regra do sistema, e `tipoPreco` diz qual dos tres foi.
 *
 * QUEM ENTRA: todo produto de fornecedor (a lista dele e regravada inteira, ausentes
 * incluidos) e o de concorrente visto desde a foto anterior.
 */
async function fotografarColeta(mes, agora) {
  const anterior = await prisma.fotoMensalColeta.aggregate({
    _max: { tiradaEm: true },
    where: { mes: { lt: comoDia(mes) } },
  });
  const desde = anterior._max.tiradaEm ?? new Date(agora.getTime() - JANELA_SEM_FOTO_ANTERIOR_MS);

  return prisma.$executeRaw`
    INSERT INTO "FotoMensalColeta" (
      "id", "produtoId", "mes", "fonteId", "fonteNome", "tipoFonte", "codigo", "nome",
      "preco", "tipoPreco", "quantidade", "aChegar", "estoqueStatus", "ausente",
      "lidoEm", "tiradaEm"
    )
    SELECT
      gen_random_uuid()::text, p."id", ${mes}::date, f."id", f."nome", f."tipo", p."codigo", p."nome",
      CASE WHEN f."tipo" = 'FORNECEDOR'
           THEN COALESCE(p."precoComImpostos", p."precoNormal", p."precoPromocional")
           ELSE COALESCE(p."precoNormal", p."precoPromocional") END,
      CASE WHEN f."tipo" = 'FORNECEDOR' AND p."precoComImpostos" IS NOT NULL THEN 'COM_IMPOSTOS'
           WHEN p."precoNormal" IS NOT NULL THEN 'NORMAL'
           WHEN p."precoPromocional" IS NOT NULL THEN 'PROMOCIONAL'
           END::"TipoPrecoFoto",
      p."quantidade", p."aChegar", p."estoqueStatus", (p."ausenteDesde" IS NOT NULL),
      p."coletadoEm", (NOW() AT TIME ZONE 'UTC')
    FROM "ProdutoColetado" p
    JOIN "FonteColeta" f ON f."id" = p."fonteId"
    WHERE f."tipo" IN ('FORNECEDOR', 'CONCORRENTE')
      AND (f."tipo" = 'FORNECEDOR' OR p."vistoEm" >= ${desde.toISOString()}::timestamp)
    ON CONFLICT ("produtoId", "mes") DO NOTHING`;
}

/**
 * Produtos da loja, como estao no banco (o estoque e o da importacao do Bling; ver
 * FotoMensalProduto).
 *
 * CUSTO, na ordem: fornecedor padrao confirmado, rascunho do Bling, cadastro.
 * `jsonb_typeof` antes do cast: o rascunho e JSON, e um valor que nao fosse numero
 * derrubaria a foto inteira.
 */
async function fotografarProdutos(mes) {
  return prisma.$executeRaw`
    INSERT INTO "FotoMensalProduto" (
      "id", "produtoId", "mes", "sku", "titulo", "ativo", "precoVenda", "custo",
      "custoOrigem", "estoque", "canais", "produtoAtualizadoEm", "tiradaEm"
    )
    SELECT
      gen_random_uuid()::text, p."id", ${mes}::date, p."sku", p."tituloBase", p."ativo", p."precoVenda",
      COALESCE(
        pf."precoCusto",
        CASE WHEN jsonb_typeof(p."fornecedorRascunho"->'precoCusto') = 'number'
             THEN (p."fornecedorRascunho"->>'precoCusto')::numeric END,
        p."custo"
      ),
      CASE WHEN pf."precoCusto" IS NOT NULL THEN 'fornecedor padrao'
           WHEN jsonb_typeof(p."fornecedorRascunho"->'precoCusto') = 'number' THEN 'rascunho do Bling'
           WHEN p."custo" IS NOT NULL THEN 'cadastro'
           END,
      p."estoque",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'canal', a."canal"::text,
                 'status', a."status"::text,
                 'situacaoCanal', a."situacaoCanal"::text,
                 'idExterno', a."idExterno"
               ) ORDER BY a."canal"::text)
          FROM "Anuncio" a WHERE a."produtoId" = p."id"
      ), '[]'::jsonb),
      p."atualizadoEm", (NOW() AT TIME ZONE 'UTC')
    FROM "Produto" p
    LEFT JOIN "ProdutoFornecedor" pf ON pf."produtoId" = p."id" AND pf."padrao"
    ON CONFLICT ("produtoId", "mes") DO NOTHING`;
}

/**
 * Tira a foto do mes, se for devida e ainda nao existir.
 *
 * Cada tabela e conferida sozinha: uma queda entre as duas deixa uma pronta, e a
 * proxima volta faz so a que falta. Depois de tirada, o mes nao e fotografado de
 * novo — produto que aparece depois entra na foto do mes seguinte.
 *
 * @param {object} [opcoes]
 * @param {Date} [opcoes.agora] o teste simula a data
 * @param {boolean} [opcoes.forcar] ignora o dia 14 (uso manual)
 * @returns {Promise<{tirou: boolean, mes: string, coleta: number, produtos: number, motivo?: string}>}
 */
export async function tirarFotoMensal({ agora = new Date(), forcar = false } = {}) {
  const mes = mesDaFoto(agora);
  if (!forcar && !fotoDevida(agora)) {
    return { tirou: false, mes, coleta: 0, produtos: 0, motivo: `antes do dia ${DIA_DA_FOTO}` };
  }

  const [temColeta, temProdutos] = await Promise.all([
    prisma.fotoMensalColeta.findFirst({ where: { mes: comoDia(mes) }, select: { id: true } }),
    prisma.fotoMensalProduto.findFirst({ where: { mes: comoDia(mes) }, select: { id: true } }),
  ]);

  const coleta = temColeta ? 0 : await fotografarColeta(mes, agora);
  const produtos = temProdutos ? 0 : await fotografarProdutos(mes);

  const tirou = coleta > 0 || produtos > 0;
  return { tirou, mes, coleta, produtos, ...(tirou ? {} : { motivo: "a foto deste mês já existe" }) };
}

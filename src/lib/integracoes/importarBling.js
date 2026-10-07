import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { skuValido } from "@/lib/arquivos";
import { anexarImagens } from "@/lib/imagensImportadas";
import { gravarComposicao } from "@/lib/composicaoBanco";
import { UNIDADES } from "@/lib/unidades";
import { htmlParaTexto } from "@/lib/integracoes/normalizacao";

import { blingGet } from "./bling";

/**
 * Importacao de UM produto do Bling para o cadastro base, pelo codigo (SKU) que o operador digita.
 *
 * Ate 07/10/2026 o botao lia o catalogo inteiro e importava em lotes tudo o que faltava; o dono pediu
 * para importar so o codigo informado (o catalogo ja foi trazido, e a carga inteira traria de volta
 * o que ele apagou de proposito).
 *
 * So LE o Bling (GET): nao passa pela trava BLING_ESCRITA e nao altera nada la.
 */

export { htmlParaTexto };

/**
 * A lista de unidades daqui e fechada. O Bling usa "PÇ", "Un", "pc" para a
 * mesma coisa; o que nao casar vira UN em vez de barrar a importacao.
 */
export function unidadeDe(valor) {
  const unidade = (valor ?? "").trim().toUpperCase();
  if (UNIDADES.includes(unidade)) return unidade;
  if (["M", "METRO", "METROS"].includes(unidade)) return "MT";
  return "UN";
}

/// dimensoes.unidadeMedida do Bling: 0 = metros, 1 = centimetros, 2 = milimetros.
export function emCm(valor, unidadeMedida) {
  const numero = Number(valor);
  if (!numero || numero <= 0) return null;
  const fator = { 0: 100, 1: 1, 2: 0.1 }[unidadeMedida] ?? 1;
  return Math.round(numero * fator * 100) / 100;
}

const positivoOuNull = (valor) => (Number(valor) > 0 ? Number(valor) : null);
const textoOuNull = (valor) => (valor && String(valor).trim()) || null;

function mapearProduto(bling) {
  const tributacao = bling.tributacao ?? {};
  const dimensoes = bling.dimensoes ?? {};
  const estoque = bling.estoque ?? {};

  return {
    sku: bling.codigo.trim(),
    tituloBase: bling.nome.trim(),
    descricaoBase: htmlParaTexto(bling.descricaoCurta),
    // Maiusculas, como o cadastro manual (pedido do dono em 16/09/2026).
    marca: textoOuNull(bling.marca)?.toLocaleUpperCase("pt-BR") ?? null,
    ean: textoOuNull(bling.gtin),
    precoVenda: positivoOuNull(bling.preco),
    estoque: Math.max(0, Math.trunc(Number(estoque.saldoVirtualTotal) || 0)),
    localizacao: textoOuNull(estoque.localizacao),
    estoqueMinimo: positivoOuNull(estoque.minimo),
    estoqueMaximo: positivoOuNull(estoque.maximo),
    unidade: unidadeDe(bling.unidade),
    pesoKg: positivoOuNull(bling.pesoBruto) ?? positivoOuNull(bling.pesoLiquido),
    alturaCm: emCm(dimensoes.altura, dimensoes.unidadeMedida),
    larguraCm: emCm(dimensoes.largura, dimensoes.unidadeMedida),
    comprimentoCm: emCm(dimensoes.profundidade, dimensoes.unidadeMedida),
    videoUrl: textoOuNull(bling.midia?.video?.url),
    origem: Number.isInteger(tributacao.origem) ? tributacao.origem : null,
    ncm: textoOuNull(tributacao.ncm),
    cest: textoOuNull(tributacao.cest),
    spedTipoItem: textoOuNull(tributacao.spedTipoItem),
    percentualTributos: positivoOuNull(tributacao.percentualTributos),
    ativo: bling.situacao === "A",
    blingId: String(bling.id),
  };
}

/**
 * Imagens do Bling, copiadas para dados/produtos/<SKU>/imagens.
 *
 * Os links do Bling sao do S3 e EXPIRAM (validade de uma semana): guardar a URL
 * deixaria o produto sem foto dias depois. Por isso o arquivo e copiado.
 */
function importarImagens(produtoId, sku, bling) {
  const imagens = bling.midia?.imagens ?? {};
  const enderecos = [
    ...(imagens.internas ?? []).map((imagem) => imagem.link),
    ...(imagens.externas ?? []).map((imagem) => imagem.link),
  ].filter(Boolean);

  return anexarImagens(
    produtoId,
    sku,
    enderecos.map((endereco) => ({ tipo: "endereco", endereco })),
  );
}

/**
 * Fornecedor do Bling para o rascunho do produto: so RASCUNHO, nunca cria
 * Fornecedor nem ProdutoFornecedor aqui (pedido do dono em 22/09/2026). Fica em
 * Produto.fornecedorRascunho; a aba Fornecedores/Concorrentes mostra como linha
 * editavel, e so vira vinculo de verdade quando o operador salvar o produto.
 *
 * DUAS chamadas, porque o Bling espalha o fornecedor em dois lugares (medido em
 * 22/09/2026):
 *  - `GET /produtos/{id}` traz o NOME, em fornecedor.contato.nome — nao em
 *    fornecedor.nome, que nao existe.
 *  - `GET /produtos/fornecedores?idProduto=` traz a DESCRICAO (na tela do Bling
 *    "Descricao no fornecedor" — na pratica o link do produto no site do
 *    fornecedor, ex. AliExpress), o codigo e o preco de custo. O `fornecedor` do
 *    primeiro endpoint NAO tem esses campos (varias linhas de producao ja
 *    confirmaram: sem telefone, email, link nem descricao ali).
 * Falha na segunda chamada nao derruba a importacao do produto: o rascunho sai
 * so com o que o primeiro endpoint ja deu (nome, e o codigo/preco resumidos).
 */
async function lerFornecedorBling(bling) {
  const nome = textoOuNull(bling.fornecedor?.contato?.nome);
  if (!nome) return null;

  let linha = null;
  try {
    const { ok, dados } = await blingGet("/produtos/fornecedores", { idProduto: bling.id });
    const linhas = ok ? (dados?.data ?? []) : [];
    // O produto pode ter mais de um fornecedor cadastrado no Bling; o padrao e
    // o mesmo que aparece resumido em bling.fornecedor.
    linha = linhas.find((item) => item.padrao) ?? linhas[0] ?? null;
  } catch {
    // Sem sorte na segunda chamada: segue so com o resumo do primeiro endpoint.
  }

  return {
    nome,
    descricao: textoOuNull(linha?.descricao),
    codigo: textoOuNull(linha?.codigo ?? bling.fornecedor.codigo),
    precoCusto: positivoOuNull(
      linha?.precoCusto ?? linha?.precoCompra ?? bling.fornecedor.precoCusto ?? bling.fornecedor.precoCompra,
    ),
  };
}

const motivoDoBling = (status, dados) => dados?.error?.description ?? dados?.error?.message ?? `HTTP ${status}`;

/**
 * As pecas de um kit do Bling resolvidas para produtos do Rise (pedido do dono em 07/10/2026: kit
 * so entra com todas as pecas ja cadastradas aqui). A estrutura do Bling so traz o id de cada peca:
 * primeiro procura pelo `blingId` guardado; sem ele, le a peca no Bling para saber o codigo e procura
 * pelo SKU (sem caixa). Devolve as pecas achadas (`{componenteId, quantidade}`, na ordem do Bling) e
 * as que faltam (o codigo, ou o id se nem o Bling disser o codigo), ou `erro` se a leitura de uma peca
 * falhar (na duvida, nao importa) ou se o kit vier sem pecas.
 *
 * Exportada porque o script `composicao-do-bling.js` grava as pecas de um kit importado antes desta
 * regra existir (o 990204), pelo mesmo caminho.
 *
 * @param {object} bling o produto como `GET /produtos/{id}` o devolve.
 * @returns {Promise<{erro: string} | {pecas: {componenteId: string, quantidade: number}[], faltam: string[]}>}
 */
export async function resolverPecasDoKit(bling) {
  const componentes = Array.isArray(bling.estrutura?.componentes) ? bling.estrutura.componentes : [];
  if (componentes.length === 0) return { erro: "O kit não tem itens na composição do Bling. Nada foi importado." };

  const pecas = [];
  const faltam = [];
  for (const componente of componentes) {
    const idPeca = componente?.produto?.id;
    // O Bling mostra "1,00"; aqui a quantidade e inteira (peca fracionada nao faz sentido num kit).
    const quantidade = Math.max(1, Math.round(Number(componente?.quantidade) || 1));

    const peloBlingId = await prisma.produto.findFirst({ where: { blingId: String(idPeca) }, select: { id: true } });
    if (peloBlingId) {
      pecas.push({ componenteId: peloBlingId.id, quantidade });
      continue;
    }

    const leitura = await blingGet(`/produtos/${idPeca}`);
    if (!leitura.ok || !leitura.dados?.data) {
      return { erro: `Não foi possível ler um item do kit no Bling (id ${idPeca}): ${motivoDoBling(leitura.status, leitura.dados)}. Nada foi importado.` };
    }
    const codigoPeca = String(leitura.dados.data.codigo ?? "").trim();
    const noRise = codigoPeca
      ? await prisma.produto.findFirst({ where: { sku: { equals: codigoPeca, mode: "insensitive" } }, select: { id: true } })
      : null;
    if (noRise) pecas.push({ componenteId: noRise.id, quantidade });
    else faltam.push(codigoPeca || `id ${idPeca} no Bling`);
  }
  return { pecas, faltam };
}

/**
 * Importa o produto do Bling com o codigo informado. Devolve `{ok: true, produtoId, sku, nome,
 * fornecedorBling, salvas, ampliadas, recusadas}` ou `{ok: false, erro, produtoId?}` (o `produtoId`
 * quando o produto ja existe aqui, para a tela levar ate ele).
 *
 * Recusa sem gravar nada: codigo vazio ou que nao serve de nome de pasta (o SKU vira pasta em
 * `dados/produtos`); produto que ja existe aqui pelo SKU (sem diferenciar caixa) ou pelo id do Bling;
 * codigo que nao esta entre os ATIVOS do Bling (a busca por `codigos[]` so ve ativos, como a carga
 * inteira, que usava `criterio=2`); codigo achado mais de uma vez (o Rise nao escolhe sozinho); e
 * VARIACAO (formato "V"). Produto simples ("S") e COMPOSICAO ("E", o kit) sao importados: o kit vira
 * um produto comum aqui, sem a lista de pecas (pedido do dono em 07/10/2026; antes kit so existia no
 * anuncio do Mercado Livre). O estoque dele e o saldo que o Bling calcula pelas pecas.
 */
export async function importarPorCodigoDoBling(codigoInformado) {
  const codigo = String(codigoInformado ?? "").trim();
  if (!codigo) return { ok: false, erro: "Informe o código do produto no Bling." };
  if (!skuValido(codigo)) {
    return { ok: false, erro: `O código "${codigo}" não pode ser usado como SKU aqui (só letras, números, ponto, hífen e sublinhado, até 64 caracteres).` };
  }

  const jaAqui = await prisma.produto.findFirst({ where: { sku: { equals: codigo, mode: "insensitive" } }, select: { id: true, sku: true } });
  if (jaAqui) return { ok: false, erro: `O produto ${jaAqui.sku} já existe no Rise. Nada foi importado.`, produtoId: jaAqui.id };

  const busca = await blingGet("/produtos", { "codigos[]": [codigo] });
  if (!busca.ok) return { ok: false, erro: `O Bling recusou a busca pelo código: ${motivoDoBling(busca.status, busca.dados)}` };
  if (!Array.isArray(busca.dados?.data)) return { ok: false, erro: "O Bling respondeu a busca sem a lista de produtos. Tente de novo." };

  const chave = codigo.toLowerCase();
  const achados = busca.dados.data.filter((item) => String(item?.codigo ?? "").trim().toLowerCase() === chave);
  if (achados.length === 0) return { ok: false, erro: `Nenhum produto ATIVO com o código ${codigo} no Bling.` };
  if (achados.length > 1) {
    return { ok: false, erro: `Há ${achados.length} produtos com o código ${codigo} no Bling. Deixe só um com esse código e tente de novo.` };
  }
  const achado = achados[0];
  if (achado.formato !== "S" && achado.formato !== "E") {
    return { ok: false, erro: `O código ${codigo} é um produto com variações no Bling; variação ainda não é importada.` };
  }

  const peloId = await prisma.produto.findFirst({ where: { blingId: String(achado.id) }, select: { id: true, sku: true } });
  if (peloId) {
    return { ok: false, erro: `Este produto do Bling já está ligado ao produto ${peloId.sku} do Rise. Nada foi importado.`, produtoId: peloId.id };
  }

  const detalhe = await blingGet(`/produtos/${achado.id}`);
  if (!detalhe.ok || !detalhe.dados?.data) {
    return { ok: false, erro: `Não foi possível ler o produto no Bling: ${motivoDoBling(detalhe.status, detalhe.dados)}` };
  }
  const bling = detalhe.dados.data;

  // Kit: todas as pecas tem que existir no Rise, senao nada e gravado e o recado diz quais faltam.
  let pecasDoKit = null;
  if (bling.formato === "E") {
    const resolvido = await resolverPecasDoKit(bling);
    if (resolvido.erro) return { ok: false, erro: resolvido.erro };
    if (resolvido.faltam.length) {
      const lista = resolvido.faltam.join(", ");
      const uma = resolvido.faltam.length === 1;
      return {
        ok: false,
        erro: `Não importado: ${uma ? "o item" : "os itens"} ${lista} do kit ${codigo} ${uma ? "não está cadastrado" : "não estão cadastrados"} no Rise. Importe ${uma ? "esse item" : "esses itens"} primeiro.`,
      };
    }
    pecasDoKit = resolvido.pecas;
  }

  const fornecedorBling = await lerFornecedorBling(bling);

  const produto = await prisma.produto.create({
    data: {
      ...mapearProduto(bling),
      tipo: pecasDoKit ? "COMPOSICAO" : "SIMPLES",
      // Json nulo no Prisma e Prisma.DbNull, nao null puro (ver CLAUDE.md).
      fornecedorRascunho: fornecedorBling ?? Prisma.DbNull,
      // Sem o Anuncio BLING com idExterno, o Rise ofereceria "Cadastrar no Bling" e duplicaria o item.
      anuncios: {
        create: {
          canal: "BLING",
          status: "RASCUNHO",
          situacaoCanal: bling.situacao === "A" ? "ATIVA" : "PAUSADA",
          idExterno: String(bling.id),
          sincronizadoEm: new Date(),
        },
      },
    },
  });

  // As pecas do kit: grava a lista e o estoque ja CALCULADO pelas pecas (o `saldoVirtualTotal` que
  // `mapearProduto` trouxe e o do Bling; no Rise o estoque do kit e sempre o das pecas daqui).
  if (pecasDoKit) await gravarComposicao(produto.id, pecasDoKit);

  const imagens = await importarImagens(produto.id, produto.sku, bling);
  return { ok: true, produtoId: produto.id, sku: produto.sku, nome: produto.tituloBase, fornecedorBling, pecas: pecasDoKit?.length ?? 0, ...imagens };
}

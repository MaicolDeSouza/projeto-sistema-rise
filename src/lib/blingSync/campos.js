import { createHash } from "node:crypto";

import { validarCnpj } from "@/lib/documentos";
import { emCm, htmlParaTexto, unidadeDe } from "@/lib/integracoes/importarBling";

/**
 * Regras puras da sincronizacao Rise <-> Bling: o que se envia, como o Rise e o Bling
 * sao lidos para serem comparados, a assinatura do que o Rise guarda e a lista de
 * diferencas. Sem banco, sem rede e sem Next: a tela, as acoes e o teste leem daqui.
 *
 * O Bling e lido com as mesmas funcoes da importacao (`htmlParaTexto`, `unidadeDe`,
 * `emCm`), e o Rise passa por regras equivalentes: so assim "igual" quer dizer igual, e
 * um produto recem sincronizado nao volta a aparecer como divergente.
 */

/**
 * Os campos que o Rise envia ao Bling, na ordem em que a tela os mostra e em que a
 * assinatura os le. NUNCA entram: codigo (SKU), saldo de estoque, situacao ativo/inativo,
 * imagens, categorias, variacoes, composicao e campos personalizados.
 *
 * O video fica de fora por ora (Emenda 2): enviar `midia.video` obriga a mandar tambem
 * `midia.imagens`, e ainda nao se sabe se isso apagaria as fotos do Bling. A Tarefa 12
 * testa isso no produto de teste.
 */
export const CAMPOS_DE_ENVIO = [
  { id: "nome", rotulo: "Nome" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "preco", rotulo: "Preco" },
  { id: "marca", rotulo: "Marca" },
  { id: "ean", rotulo: "EAN" },
  { id: "unidade", rotulo: "Unidade" },
  { id: "peso", rotulo: "Peso" },
  { id: "altura", rotulo: "Altura" },
  { id: "largura", rotulo: "Largura" },
  { id: "comprimento", rotulo: "Comprimento" },
  { id: "estoqueMinimo", rotulo: "Estoque minimo" },
  { id: "estoqueMaximo", rotulo: "Estoque maximo" },
  { id: "localizacao", rotulo: "Localizacao" },
  { id: "origem", rotulo: "Origem" },
  { id: "ncm", rotulo: "NCM" },
  { id: "cest", rotulo: "CEST" },
  { id: "spedTipoItem", rotulo: "Tipo SPED" },
  { id: "percentualTributos", rotulo: "% de tributos" },
];

// ---------------------------------------------------------------------------
// Leitura de um valor solto
// ---------------------------------------------------------------------------

/// Texto aparado; vazio e so espaco viram null.
function texto(valor) {
  if (valor === null || valor === undefined) return null;
  return String(valor).trim() || null;
}

/// Marca em maiusculas dos dois lados, como o cadastro e a importacao (16/09/2026).
const maiusculas = (valor) => texto(valor)?.toLocaleUpperCase("pt-BR") ?? null;

/// So os digitos: NCM e CEST aparecem com e sem pontuacao ("8501.10.19" e "85011019").
function soDigitosOuNull(valor) {
  return String(valor ?? "").replace(/\D/g, "") || null;
}

/**
 * Numero de um valor qualquer. A coluna Decimal do Prisma volta como objeto (Decimal), e
 * `Number()` o converte; vazio nao pode virar 0, por isso a conferencia antes.
 */
function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

const arredondar = (numero, casas) => Math.round(numero * 10 ** casas) / 10 ** casas;

/// Numero com `casas` decimais; zero e negativo viram null (o mesmo `positivoOuNull` da importacao).
function positivoOuNull(valor, casas) {
  const numero = numeroOuNull(valor);
  if (numero === null) return null;
  const arredondado = arredondar(numero, casas);
  return arredondado > 0 ? arredondado : null;
}

/// A origem e inteiro e o 0 ("nacional") e valor, nao vazio.
function origemOuNull(valor) {
  const numero = numeroOuNull(valor);
  return Number.isInteger(numero) ? numero : null;
}

/**
 * Descricao do Rise: texto puro. Recebe o mesmo acabamento que `htmlParaTexto` da ao texto
 * do Bling (espacos repetidos, espaco em volta da quebra, 3 ou mais quebras, \r), senao
 * "Linha 1  com espaco" no Rise e "Linha 1 com espaco" do Bling divergiriam para sempre,
 * mesmo depois de sincronizar.
 */
function descricaoDoRise(valor) {
  if (valor === null || valor === undefined) return null;
  return (
    String(valor)
      .replace(/\r/g, "")
      .replace(/[ \t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  );
}

// ---------------------------------------------------------------------------
// Normalizacao: o Rise e o Bling no mesmo formato
// ---------------------------------------------------------------------------

/**
 * O produto do Rise (a linha do Prisma) no formato comparavel: uma chave por campo de
 * `CAMPOS_DE_ENVIO`, vazio como null. Preco em 2 casas, peso em 3, medidas em 2.
 */
export function normalizarDoRise(produto) {
  const p = produto ?? {};
  return {
    nome: texto(p.tituloBase),
    descricao: descricaoDoRise(p.descricaoBase),
    preco: positivoOuNull(p.precoVenda, 2),
    marca: maiusculas(p.marca),
    ean: texto(p.ean),
    // Unidade vazia fica vazia (nao vira "UN" por conta): quem decide e o cadastro.
    unidade: texto(p.unidade) === null ? null : unidadeDe(p.unidade),
    peso: positivoOuNull(p.pesoKg, 3),
    altura: positivoOuNull(p.alturaCm, 2),
    largura: positivoOuNull(p.larguraCm, 2),
    comprimento: positivoOuNull(p.comprimentoCm, 2),
    estoqueMinimo: positivoOuNull(p.estoqueMinimo, 3),
    estoqueMaximo: positivoOuNull(p.estoqueMaximo, 3),
    localizacao: texto(p.localizacao),
    origem: origemOuNull(p.origem),
    ncm: soDigitosOuNull(p.ncm),
    cest: soDigitosOuNull(p.cest),
    spedTipoItem: texto(p.spedTipoItem),
    percentualTributos: positivoOuNull(p.percentualTributos, 2),
  };
}

/**
 * O produto do Bling (`GET /produtos/{id}`) no MESMO formato de `normalizarDoRise`, lido
 * como a importacao o le (`mapearProduto`): descricao do HTML de `descricaoCurta`, peso
 * bruto e, na falta dele, o liquido, medidas convertidas para cm, unidade na lista fechada
 * do Rise e minimo/maximo de estoque zero como vazio.
 */
export function normalizarDoBling(bling) {
  const b = bling ?? {};
  const tributacao = b.tributacao ?? {};
  const dimensoes = b.dimensoes ?? {};
  const estoque = b.estoque ?? {};
  return {
    nome: texto(b.nome),
    descricao: htmlParaTexto(b.descricaoCurta),
    preco: positivoOuNull(b.preco, 2),
    marca: maiusculas(b.marca),
    ean: texto(b.gtin),
    unidade: unidadeDe(b.unidade),
    peso: positivoOuNull(b.pesoBruto, 3) ?? positivoOuNull(b.pesoLiquido, 3),
    altura: emCm(dimensoes.altura, dimensoes.unidadeMedida),
    largura: emCm(dimensoes.largura, dimensoes.unidadeMedida),
    comprimento: emCm(dimensoes.profundidade, dimensoes.unidadeMedida),
    estoqueMinimo: positivoOuNull(estoque.minimo, 3),
    estoqueMaximo: positivoOuNull(estoque.maximo, 3),
    localizacao: texto(estoque.localizacao),
    origem: origemOuNull(tributacao.origem),
    ncm: soDigitosOuNull(tributacao.ncm),
    cest: soDigitosOuNull(tributacao.cest),
    spedTipoItem: texto(tributacao.spedTipoItem),
    percentualTributos: positivoOuNull(tributacao.percentualTributos, 2),
  };
}

// ---------------------------------------------------------------------------
// Fornecedores: ligados ao contato do Bling pelo CNPJ
// ---------------------------------------------------------------------------

/**
 * Os 14 digitos do CNPJ do fornecedor do vinculo, ou null (ausente, incompleto, estrangeiro
 * ou invalido). Confere os digitos verificadores e recusa sequencia repetida
 * (`00000000000000`): CNPJ invalido contaria como enviavel, entraria na assinatura e o Bling
 * o recusaria so no `POST /contatos`, no meio do envio, em vez de cair no aviso "sem CNPJ".
 */
function cnpjDoVinculo(vinculo) {
  const digitos = String(vinculo?.fornecedor?.cnpj ?? "").replace(/\D/g, "");
  return validarCnpj(digitos) ? digitos : null;
}

/// Custo do vinculo: 2 casas; ausente e null. Zero fica zero (e um custo informado).
function custoOuNull(valor) {
  const numero = numeroOuNull(valor);
  return numero === null || numero < 0 ? null : arredondar(numero, 2);
}

/**
 * Os fornecedores do produto prontos para enviar. Entrada: as linhas de `ProdutoFornecedor`
 * com `fornecedor: { cnpj, nome }`. So fica quem tem CNPJ valido, de 14 digitos (o Bling liga o
 * fornecedor pelo CNPJ; sem ele nao ha o que enviar), um por CNPJ (repetido: fica o
 * primeiro, o Bling nao quer o mesmo contato duas vezes no produto) e em ordem de CNPJ,
 * para a mesma lista dar sempre a mesma assinatura.
 */
export function normalizarFornecedoresDoRise(vinculos) {
  const porCnpj = new Map();
  for (const vinculo of vinculos ?? []) {
    const cnpj = cnpjDoVinculo(vinculo);
    if (!cnpj || porCnpj.has(cnpj)) continue;
    porCnpj.set(cnpj, {
      cnpj,
      nome: texto(vinculo.fornecedor?.nome) ?? "",
      codigo: texto(vinculo.codigo),
      descricao: texto(vinculo.descricao),
      precoCusto: custoOuNull(vinculo.precoCusto),
      padrao: Boolean(vinculo.padrao),
    });
  }
  return [...porCnpj.values()].sort((a, b) => (a.cnpj < b.cnpj ? -1 : a.cnpj > b.cnpj ? 1 : 0));
}

/**
 * Nomes dos fornecedores que `normalizarFornecedoresDoRise` descarta por falta de CNPJ, na
 * ordem de chegada, para o pop-up avisar que nao foram enviados. Repetido (mesmo CNPJ em dois
 * vinculos) NAO e "sem CNPJ": o outro vinculo ja o leva.
 */
export function fornecedoresSemCnpj(vinculos) {
  return (vinculos ?? [])
    .filter((vinculo) => !cnpjDoVinculo(vinculo))
    .map((vinculo) => texto(vinculo?.fornecedor?.nome) ?? "(sem nome)");
}

// ---------------------------------------------------------------------------
// Assinatura e diferencas
// ---------------------------------------------------------------------------

/**
 * Impressao digital (SHA-256, hexadecimal) do que o Rise envia: os campos na ordem de
 * `CAMPOS_DE_ENVIO` e depois os fornecedores. Gravada no produto ao sincronizar; se mudar
 * depois, o Rise tem o que enviar.
 *
 * Nunca inclui sku, estoque nem ativo, que o Rise nao envia: um ajuste de estoque ou
 * desativar o produto nao pode acender o aviso de "mudou". Chave estranha em `campos` e
 * ignorada, e a ordem das chaves de entrada nao importa (a ordem e a do contrato).
 *
 * `fornecedores` e o resultado de `normalizarFornecedoresDoRise`, e so entra o que vai no
 * vinculo (CNPJ, codigo, descricao, custo e padrao). O nome fica fora: serve para achar o
 * contato no Bling, e renomear o fornecedor nao muda o que se envia.
 */
export function assinaturaDoRise(campos, fornecedores) {
  const conteudo = {};
  for (const { id } of CAMPOS_DE_ENVIO) conteudo[id] = campos?.[id] ?? null;
  conteudo.fornecedores = (fornecedores ?? []).map((fornecedor) => ({
    cnpj: fornecedor.cnpj,
    codigo: fornecedor.codigo ?? null,
    descricao: fornecedor.descricao ?? null,
    precoCusto: fornecedor.precoCusto ?? null,
    padrao: Boolean(fornecedor.padrao),
  }));
  return createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
}

/**
 * Os campos em que o Rise e o Bling (ja normalizados) diferem, na ordem de
 * `CAMPOS_DE_ENVIO`. Igual nao aparece. `vazioNoRise`: o Rise nao tem o valor e o Bling
 * tem; campo vazio no Rise nunca apaga o do Bling, entao isso nao e divergencia. `diferente`:
 * o Rise tem o valor e ele e outro (ou o Bling esta vazio): e o que a sincronizacao envia.
 */
export function diferencas(rise, bling) {
  const lista = [];
  for (const { id, rotulo } of CAMPOS_DE_ENVIO) {
    const noRise = rise?.[id] ?? null;
    const noBling = bling?.[id] ?? null;
    if (noRise === noBling) continue;
    lista.push({
      campo: id,
      rotulo,
      rise: noRise,
      bling: noBling,
      tipo: noRise === null ? "vazioNoRise" : "diferente",
    });
  }
  return lista;
}

/// Quantas diferencas sao divergencia de verdade (`diferente`); `vazioNoRise` nao conta.
export function contarDivergencias(lista) {
  return (lista ?? []).filter((item) => item.tipo === "diferente").length;
}

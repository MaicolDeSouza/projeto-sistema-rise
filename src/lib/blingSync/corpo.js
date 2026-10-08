import { emCm } from "@/lib/integracoes/importarBling";

/**
 * Regras puras do CORPO que o Rise envia ao Bling: o `PATCH /produtos/{id}` de um produto que
 * ja existe e o `POST /produtos` de um produto novo. Sem banco, sem rede e sem Next.
 *
 * `rise` e sempre a SAIDA de `normalizarDoRise` (uma chave por campo de `CAMPOS_DE_ENVIO`,
 * vazio como null), nunca a linha do Prisma: e o mesmo objeto que a tela compara com o Bling,
 * entao o que se envia e o que se comparou.
 *
 * Nunca entram no corpo: codigo (so o POST o leva, como identificador), situacao, imagens e
 * video (`midia`), `fornecedor` (so se grava por /produtos/fornecedores), `actionEstoque` (o
 * valor `Z` zera os saldos), categoria, variacoes e campos personalizados.
 *
 * A `estrutura` (composicao do kit) so entra para KIT e com os ids das pecas que o ENVIO acabou de
 * achar no Bling pelo codigo (`pecasNoBling`, Emenda 11): nunca um `blingId` guardado no Rise.
 */

/// O tipo de estoque de um kit criado pelo Rise: "V" (virtual), o Bling calcula o saldo pelas pecas, a
/// mesma conta do Rise (`estoqueDoKit`). Com "F" o kit teria estoque proprio, que ninguem lanca.
const ESTOQUE_DO_KIT = "V";

/// A `estrutura` do Bling a partir das pecas ja achadas la: `[{ produto: { id }, quantidade }]`.
function estruturaDoKit(pecasNoBling, tipoEstoque) {
  return {
    tipoEstoque,
    componentes: pecasNoBling.map((peca) => ({ produto: { id: peca.id }, quantidade: peca.quantidade })),
  };
}

/**
 * Descricao do Rise (texto puro) em HTML para o `descricaoCurta` do Bling. Escapa tudo o que o
 * HTML trata como marcacao, para o texto digitado nunca virar tag (`<script>`) nem entidade
 * (`&lt;` digitado como texto deve voltar `&lt;`, e nao `<`). O `&` e escapado primeiro, senao
 * o que as outras trocas acrescentam seria escapado de novo.
 *
 * Cada quebra de linha vira `<br>`; `\r\n` e `\r` valem uma quebra so (sem isso o Windows
 * mandaria duas). O Bling devolve esse HTML, e `htmlParaTexto` o le de volta como o mesmo texto
 * (a ida e volta esta no teste): e o que impede a segunda sincronizacao de achar diferenca onde
 * nao ha.
 */
export function textoParaHtml(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // &#39; e nao &apos;: a entidade nomeada nao existe no HTML 4. `decodificar` entende as duas.
    .replace(/'/g, "&#39;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}

const temValor = (valor) => valor !== null && valor !== undefined;

/**
 * Campos soltos da raiz do produto: id do campo do Rise -> chave(s) do Bling. O peso do Rise
 * e um so, e o Bling tem o liquido e o bruto; os dois levam o mesmo valor (e `normalizarDoBling`
 * le o bruto, ou o liquido na falta dele, entao o que se grava volta igual).
 */
const CAMPOS_DA_RAIZ = [
  { id: "nome", destinos: ["nome"] },
  { id: "descricao", destinos: ["descricaoCurta"], converter: textoParaHtml },
  { id: "preco", destinos: ["preco"] },
  { id: "marca", destinos: ["marca"] },
  { id: "ean", destinos: ["gtin"] },
  { id: "unidade", destinos: ["unidade"] },
  { id: "peso", destinos: ["pesoLiquido", "pesoBruto"] },
];

/// Campos que o Bling guarda dentro de um grupo: grupo -> { id do Rise: chave dentro do grupo }.
const GRUPOS = {
  // `profundidade` e o comprimento.
  dimensoes: { altura: "altura", largura: "largura", comprimento: "profundidade" },
  estoque: { estoqueMinimo: "minimo", estoqueMaximo: "maximo", localizacao: "localizacao" },
  tributacao: {
    origem: "origem",
    ncm: "ncm",
    cest: "cest",
    spedTipoItem: "spedTipoItem",
    percentualTributos: "percentualTributos",
  },
};

/// Os valores do Rise ficam sempre em centimetros: o grupo `dimensoes` e enviado com este codigo.
const CENTIMETROS = 1;

/**
 * Corpo do `PATCH /produtos/{id}`: so o que mudou. `camposAlterados` sao os `id` de
 * `CAMPOS_DE_ENVIO` com `tipo: "diferente"` (a lista de `diferencas`).
 *
 * - Campo solto da raiz (nome, descricaoCurta, preco, marca, gtin, unidade, pesoLiquido,
 *   pesoBruto) vai so se mudou.
 * - Grupo (`dimensoes`, `estoque`, `tributacao`) tocado vai POR INTEIRO: a documentacao do
 *   `PATCH` nao diz se os subcampos nao enviados de um grupo sao preservados, entao o grupo
 *   vai como veio do `GET` (`blingAtual`), com o valor do Rise por cima so nos campos que
 *   mudaram. Grupo que ninguem tocou nao vai.
 * - Campo vazio (null) no Rise nunca entra, mesmo em `camposAlterados`: campo vazio no Rise
 *   nunca apaga nada no Bling. Grupo cujos campos alterados estao todos vazios nao vai.
 * - Id que nao e campo de envio e ignorado.
 * - Composicao alterada: a `estrutura` vai INTEIRA (lista nova de pecas, com o `tipoEstoque` que o
 *   Bling ja tinha, ou "V"), e so com `pecasNoBling` (os ids achados pelo codigo neste envio). Sem
 *   eles a composicao nao vai: quem chama tem que resolver antes.
 *
 * Devolve `{}` quando nao ha nada a enviar. Nao muda `blingAtual`.
 */
export function montarCorpoParcial(blingAtual, rise, camposAlterados, { pecasNoBling } = {}) {
  const alterados = new Set(camposAlterados ?? []);
  const entra = (id) => alterados.has(id) && temValor(rise?.[id]);
  const corpo = {};

  if (entra("composicao") && Array.isArray(pecasNoBling) && pecasNoBling.length > 0) {
    corpo.estrutura = estruturaDoKit(pecasNoBling, blingAtual?.estrutura?.tipoEstoque || ESTOQUE_DO_KIT);
  }

  for (const { id, destinos, converter } of CAMPOS_DA_RAIZ) {
    if (!entra(id)) continue;
    const valor = converter ? converter(rise[id]) : rise[id];
    for (const destino of destinos) corpo[destino] = valor;
  }

  for (const [grupo, campos] of Object.entries(GRUPOS)) {
    const tocados = Object.keys(campos).filter(entra);
    if (tocados.length === 0) continue;

    // Copia profunda: o grupo do Bling e o ponto de partida, e o que se tira dele (o saldo)
    // ou se troca nao pode mexer no objeto que o chamador ainda usa.
    const original = blingAtual?.[grupo] ?? {};
    const copia = structuredClone(original);

    if (grupo === "dimensoes") {
      montarDimensoes(copia, original, rise);
    } else {
      for (const id of tocados) copia[campos[id]] = rise[id];
    }
    // Somente-leitura: o Bling o calcula (considera reservas) e nao aceita no corpo.
    if (grupo === "estoque") delete copia.saldoVirtualTotal;

    corpo[grupo] = copia;
  }

  return corpo;
}

/**
 * Preenche o grupo `dimensoes` (`copia`, ja uma copia do original). Basta UMA medida mudar para
 * as tres irem juntas, todas em cm: o Rise guarda em cm e o grupo leva um `unidadeMedida` so,
 * entao uma medida do Bling que estava em mm ou metros nao pode seguir no grupo sem ser
 * convertida (45 mm viraria 45 cm). Cada medida vem do Rise quando ele tem valor; senao fica a
 * do Bling, convertida. O valor do Bling so e refeito quando a unidade dele nao e cm: em cm ele
 * segue como esta, sem arredondar.
 */
function montarDimensoes(copia, original, rise) {
  const unidade = original.unidadeMedida;
  const emOutraUnidade = temValor(unidade) && [0, 2].includes(Number(unidade));

  for (const [id, chave] of Object.entries(GRUPOS.dimensoes)) {
    if (temValor(rise?.[id])) {
      copia[chave] = rise[id];
    } else if (emOutraUnidade && temValor(original[chave])) {
      // `emCm` devolve null para zero: medida zero continua zero (em qualquer unidade).
      copia[chave] = emCm(original[chave], unidade) ?? original[chave];
    }
  }
  copia.unidadeMedida = CENTIMETROS;
}

/**
 * Corpo do `POST /produtos` de um produto novo no Bling. O codigo e o SKU, e `tipo`, `formato`
 * e `situacao` sao os minimos que o Bling exige (produto simples, ativo). Leva os campos de
 * envio que o Rise tem, com o mesmo mapeamento do `PATCH`, e nada mais:
 * - sem chave vazia (null ou undefined), nem grupo que ficaria vazio;
 * - sem saldo de estoque (o saldo entra depois, por lancamento em /estoques);
 * - sem `midia` (a foto fica para a VPS e o video para o teste da Tarefa 12).
 * O `nome` e obrigatorio no Bling: quem chama confere antes que o Rise o tem.
 *
 * Kit (o Rise tem composicao e `pecasNoBling` veio): `formato: "E"` e a `estrutura` com as pecas,
 * estoque virtual. Sem `pecasNoBling` o corpo e de produto simples: quem chama recusa o kit antes.
 */
export function montarCorpoDeCadastro(sku, rise, { pecasNoBling } = {}) {
  const kit = temValor(rise?.composicao) && Array.isArray(pecasNoBling) && pecasNoBling.length > 0;
  const corpo = { codigo: sku, tipo: "P", formato: kit ? "E" : "S", situacao: "A" };
  if (kit) corpo.estrutura = estruturaDoKit(pecasNoBling, ESTOQUE_DO_KIT);

  for (const { id, destinos, converter } of CAMPOS_DA_RAIZ) {
    if (!temValor(rise?.[id])) continue;
    const valor = converter ? converter(rise[id]) : rise[id];
    for (const destino of destinos) corpo[destino] = valor;
  }

  for (const [grupo, campos] of Object.entries(GRUPOS)) {
    const conteudo = {};
    for (const [id, chave] of Object.entries(campos)) {
      if (temValor(rise?.[id])) conteudo[chave] = rise[id];
    }
    if (Object.keys(conteudo).length === 0) continue;
    // A unidade de medida so faz sentido com medida.
    if (grupo === "dimensoes") conteudo.unidadeMedida = CENTIMETROS;
    corpo[grupo] = conteudo;
  }

  return corpo;
}

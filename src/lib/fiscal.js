/**
 * Listas fiscais usadas na aba Tributacao.
 *
 * So os campos que IDENTIFICAM o produto: quem emite a nota e o Bling, que tem
 * as regras tributarias. Valores calculados de imposto ficam la.
 */

/** Origem da mercadoria — tabela da NF-e. */
export const ORIGENS = [
  { valor: 0, rotulo: "0 - Nacional, exceto as indicadas nos codigos 3, 4, 5 e 8" },
  { valor: 1, rotulo: "1 - Estrangeira - Importacao direta" },
  { valor: 2, rotulo: "2 - Estrangeira - Adquirida no mercado interno" },
  { valor: 3, rotulo: "3 - Nacional, conteudo de importacao entre 40% e 70%" },
  { valor: 4, rotulo: "4 - Nacional, producao conforme processos produtivos basicos" },
  { valor: 5, rotulo: "5 - Nacional, conteudo de importacao ate 40%" },
  { valor: 6, rotulo: "6 - Estrangeira - Importacao direta, sem similar nacional" },
  { valor: 7, rotulo: "7 - Estrangeira - Mercado interno, sem similar nacional" },
  { valor: 8, rotulo: "8 - Nacional, conteudo de importacao acima de 70%" },
];

/** Tipo do item — tabela 4.3.1 do SPED PIS/COFINS. */
export const TIPOS_ITEM = [
  { valor: "00", rotulo: "00 - Mercadoria para revenda" },
  { valor: "01", rotulo: "01 - Materia-prima" },
  { valor: "02", rotulo: "02 - Embalagem" },
  { valor: "03", rotulo: "03 - Produto em processo" },
  { valor: "04", rotulo: "04 - Produto acabado" },
  { valor: "05", rotulo: "05 - Subproduto" },
  { valor: "06", rotulo: "06 - Produto intermediario" },
  { valor: "07", rotulo: "07 - Material de uso e consumo" },
  { valor: "08", rotulo: "08 - Ativo imobilizado" },
  { valor: "09", rotulo: "09 - Servicos" },
  { valor: "10", rotulo: "10 - Outros insumos" },
  { valor: "99", rotulo: "99 - Outras" },
];

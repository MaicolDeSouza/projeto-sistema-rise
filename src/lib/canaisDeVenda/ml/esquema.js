import { z } from "zod";

/**
 * Forma do rascunho de um anuncio do Mercado Livre (ver `rascunho.js`) quando ele chega da
 * tela para ser salvo. Confere o FORMATO e converte numeros; regra de negocio (titulo longo,
 * categoria fora do padrao, preco em branco) fica em `validacao.js`, porque rascunho
 * incompleto pode ser salvo.
 *
 * Chave que o rascunho nao conhece e descartada: o que a tela mandar a mais nao chega ao banco.
 */

// Numero chega da tela como numero, texto ("12,5") ou vazio. Vazio e `null`. Texto que nao e
// numero recusa o rascunho todo: gravar zero no lugar apagaria o que o dono digitou.
const numeroOuNulo = z.preprocess((valor) => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") return valor;
  const texto = valor.trim().replace(",", ".");
  return texto === "" ? null : Number(texto);
}, z.number().nullable());

// A quantidade e o produto do item ficam sem conferir aqui: `errosDaComposicao` e quem diz o
// que ha de errado com cada item, e uma recusa de formato esconderia a frase certa.
const ItemDaComposicao = z.object({
  produtoId: z.string().nullish(),
  quantidade: z.unknown(),
});

const Versiculo = z.object({
  livro: z.string(),
  capitulo: z.number(),
  inicio: z.number(),
  fim: z.number().nullish(),
  texto: z.string(),
});

export const RascunhoMLSchema = z.object({
  produtoId: z.string().min(1),
  titulo: z.string(),
  familyName: z.string(),
  tipoAnuncio: z.enum(["gold_special", "gold_pro"]),
  condicao: z.enum(["new", "used"]),
  categoriaId: z.string().nullable(),
  preco: numeroOuNulo,
  estoque: numeroOuNulo,
  imagens: z.array(z.string()),
  descricao: z.string(),
  versiculo: Versiculo.nullable(),
  atributos: z.record(z.string(), z.string()),
  envio: z.object({
    pesoKg: numeroOuNulo,
    alturaCm: numeroOuNulo,
    larguraCm: numeroOuNulo,
    comprimentoCm: numeroOuNulo,
    modo: z.string(),
    freteGratis: z.boolean(),
    retirada: z.boolean(),
  }),
  composicao: z
    .object({
      itens: z.array(ItemDaComposicao),
      codigo: z.string(),
      blingProdutoId: z.string().nullable(),
    })
    .nullable(),
});

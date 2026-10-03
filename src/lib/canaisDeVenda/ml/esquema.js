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

// Tetos de tamanho: a Server Action recebe o que o navegador mandar, e sem eles um rascunho
// de megabytes iria inteiro para o banco. Folgados para o uso real (o titulo do ML tem 60).
export const LIMITES_ML = {
  titulo: 200,
  familyName: 120,
  descricao: 50000,
  codigoDoKit: 64,
  atributos: 40,
  chaveDeAtributo: 60,
  valorDeAtributo: 200,
  imagens: 50,
  idDeImagem: 64,
  modoDeEnvio: 20,
  itensDaComposicao: 50,
};

export const RascunhoMLSchema = z.object({
  produtoId: z.string().min(1),
  titulo: z.string().max(LIMITES_ML.titulo),
  familyName: z.string().max(LIMITES_ML.familyName),
  tipoAnuncio: z.enum(["gold_special", "gold_pro"]),
  condicao: z.enum(["new", "used"]),
  categoriaId: z.string().nullable(),
  preco: numeroOuNulo,
  estoque: numeroOuNulo,
  imagens: z.array(z.string().max(LIMITES_ML.idDeImagem)).max(LIMITES_ML.imagens),
  descricao: z.string().max(LIMITES_ML.descricao),
  atributos: z
    .record(z.string().max(LIMITES_ML.chaveDeAtributo), z.string().max(LIMITES_ML.valorDeAtributo))
    .refine((atributos) => Object.keys(atributos).length <= LIMITES_ML.atributos),
  envio: z.object({
    pesoKg: numeroOuNulo,
    alturaCm: numeroOuNulo,
    larguraCm: numeroOuNulo,
    comprimentoCm: numeroOuNulo,
    modo: z.string().max(LIMITES_ML.modoDeEnvio),
    freteGratis: z.boolean(),
    retirada: z.boolean(),
  }),
  composicao: z
    .object({
      itens: z.array(ItemDaComposicao).max(LIMITES_ML.itensDaComposicao),
      codigo: z.string().max(LIMITES_ML.codigoDoKit),
      // So a forma: o servidor decide o valor (ver `salvarRascunhoML`), o que a tela mandar e ignorado.
      blingProdutoId: z.string().nullable(),
    })
    .nullable(),
});

/**
 * As etapas do Publicar do Mercado Livre (fase 3), na ordem em que rodam. Cada etapa concluida e
 * gravada em `Anuncio.dados.publicacao.feitas`, e "Retomar publicacao" continua da primeira que falta,
 * sem refazer as anteriores (o item nunca e criado duas vezes). Sem imports: a tela, a publicacao e o
 * teste leem o mesmo arquivo.
 *
 * A ordem segue a documentacao do ML lida em 08/10/2026: as fotos sobem ANTES (o item nasce com elas,
 * por id), o validador confere o corpo inteiro sem criar nada, o item nasce pausado e com o preco, e so
 * e ativado depois do vinculo no Bling.
 */

export const ETAPAS = ["fotos", "validar", "criar", "pausar", "descricao", "kit_bling", "vinculo", "registrar_bling", "ativar", "gravar"];

export const ROTULO_DA_ETAPA = {
  fotos: "Enviar as fotos",
  validar: "Validar no Mercado Livre",
  criar: "Criar o anúncio pausado",
  pausar: "Conferir que ficou pausado",
  descricao: "Enviar a descrição",
  kit_bling: "Garantir o kit no Bling",
  vinculo: "Vincular o produto à loja no Bling",
  registrar_bling: "Registrar o anúncio no Bling",
  ativar: "Ativar o anúncio",
  gravar: "Gravar no Rise",
};

/** As etapas de um anuncio: `kit_bling` so existe no anuncio de composicao. */
export function etapasDoAnuncio({ kit }) {
  return kit ? [...ETAPAS] : ETAPAS.filter((etapa) => etapa !== "kit_bling");
}

/** A primeira etapa que ainda nao foi feita (`null` quando todas foram). */
export function proximaEtapa(publicacao, etapas = ETAPAS) {
  const feitas = new Set(Array.isArray(publicacao?.feitas) ? publicacao.feitas : []);
  return etapas.find((etapa) => !feitas.has(etapa)) ?? null;
}

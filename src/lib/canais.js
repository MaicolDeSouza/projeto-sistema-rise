/**
 * Identidade dos canais: o que a interface precisa saber para exibi-los.
 *
 * Separado das REGRAS de anuncio (src/lib/anuncios/canais/) de proposito: as
 * regras usam node:crypto e so rodam no servidor, enquanto estes dados sao
 * usados por componentes de cliente. Manter uma lista so evita que as duas
 * partes do sistema discordem sobre quais canais existem.
 *
 * A ordem desta lista e a ordem em que os canais aparecem na tela.
 */

export const CANAIS = [
  {
    id: "BLING",
    nome: "Bling",
    logo: "/marcas/bling.svg",
    resumo: "ERP — mestre do cadastro e do estoque",
    obrigatorio: true,
    disponivel: true,
  },
  {
    id: "LOJA_INTEGRADA",
    nome: "Loja Integrada",
    logo: "/marcas/loja-integrada.svg",
    resumo: "Loja propria — conteudo pelo Rise, estoque e preco pelo Bling",
    viaBling: true,
    disponivel: true,
  },
  {
    id: "MERCADO_LIVRE",
    nome: "Mercado Livre",
    logo: "/marcas/mercado-livre.svg",
    resumo: "Marketplace — publicacao direta por API",
    disponivel: true,
  },
  {
    id: "SHOPEE",
    nome: "Shopee",
    logo: "/marcas/shopee.svg",
    resumo: "Marketplace — aguardando credenciais de parceiro",
    disponivel: false,
    motivoIndisponivel:
      "Exige credenciais do Shopee Open Platform, que ainda nao foram obtidas.",
  },
];

export function canalPorId(id) {
  return CANAIS.find((canal) => canal.id === id) ?? null;
}

/**
 * Um anuncio por canal, num Map (canal -> anuncio). Desde a fase 1 o Mercado Livre tem VARIOS
 * anuncios por produto (Classico e Premium, kits). Com um Map montado direto da lista, o ultimo
 * anuncio do canal vencia, e um rascunho listado depois escondia o que ja esta publicado. O que
 * existe no canal (idExterno) tem prioridade; entre iguais continua valendo o ultimo, como antes.
 */
export function anuncioPorCanal(anuncios = []) {
  const porCanal = new Map();
  for (const anuncio of anuncios) {
    const atual = porCanal.get(anuncio.canal);
    if (atual?.idExterno && !anuncio.idExterno) continue;
    porCanal.set(anuncio.canal, anuncio);
  }
  return porCanal;
}

/**
 * Divide os canais entre integrados e pendentes.
 *
 * O criterio de "integrado" e ter `idExterno` — ou seja, o anuncio existe DE
 * FATO no canal. Nao basta haver um registro de Anuncio: um rascunho, ou uma
 * publicacao que falhou antes de criar o item, significam que nada foi para o
 * canal. Mostrar o logotipo nesses casos afirmaria uma integracao inexistente,
 * e ainda esconderia a acao de cadastrar justamente onde ela e necessaria.
 *
 * Os dois grupos sao complementares: o canal integrado aparece como logotipo na
 * coluna Canais, e o pendente aparece no menu de acoes. Nunca nos dois — e isso
 * que impede clicar em "Cadastrar" num produto ja publicado e duplicar anuncio.
 */
export function separarCanais(anuncios = []) {
  const porCanal = anuncioPorCanal(anuncios);
  const blingPublicado = Boolean(porCanal.get("BLING")?.idExterno);

  const integrados = [];
  const pendentes = [];

  for (const canal of CANAIS) {
    const anuncio = porCanal.get(canal.id);

    // Existe no canal de verdade?
    if (anuncio?.idExterno) {
      integrados.push({
        ...canal,
        status: anuncio.status,
        situacaoCanal: anuncio.situacaoCanal,
        idExterno: anuncio.idExterno,
      });
      continue;
    }

    // Sem produto no Bling os demais canais nao tem onde gravar o codigo de
    // retorno que liga os dois lados.
    const precisaDoBling = !canal.obrigatorio && !blingPublicado;

    pendentes.push({
      ...canal,
      // Uma tentativa que falhou vira "Tentar de novo", nao "Cadastrar":
      // o rotulo precisa dizer a verdade sobre o que ja aconteceu.
      tentouEFalhou: anuncio?.status === "ERRO",
      bloqueado: !canal.disponivel || precisaDoBling,
      motivo: !canal.disponivel
        ? canal.motivoIndisponivel
        : precisaDoBling
          ? "Cadastre primeiro no Bling"
          : anuncio?.status === "ERRO"
            ? "A tentativa anterior falhou"
            : null,
    });
  }

  return { integrados, pendentes };
}

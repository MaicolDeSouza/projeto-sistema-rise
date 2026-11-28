/**
 * A imagem "Compre em kit e economize" nas fotos do anuncio do ML (pedido do dono em 27/11/2026). Ela entra como a 3a foto
 * do anuncio de 1 unidade e dos kits MENORES, os que tem o bloco "Compre em kit e economize" na descricao (`kitsParaOBloco`
 * devolve algum kit). O maior kit do produto, sem bloco, nao a recebe. Funcoes puras: o editor, a abertura do anuncio e o
 * Publicar leem o mesmo arquivo.
 *
 * A imagem mora UMA vez no Rise (`public/anuncios-ml/`), e nao como foto de cada produto: no rascunho ela e o id fixo
 * `ID_BANNER_KIT` no meio dos ids das fotos, e o Publicar e o Enviar mudancas leem o arquivo por aqui.
 *
 * Escolha do dono por anuncio (`rascunho.bannerKit`):
 * - `null` (nunca mexeu): automatico, entra quando ha bloco e sai quando o bloco some;
 * - `false`: ele tirou; nao volta sozinha;
 * - `true`: ele incluiu de volta; fica mesmo sem bloco.
 * So vale para o anuncio AINDA NAO PUBLICADO (decisao do dono: os publicados ficam para uma mudanca futura em todos).
 */

export const ID_BANNER_KIT = "banner-compre-em-kit";
/** O nome do arquivo: e o que a impressao das fotos guarda (`conteudoAtualDoAnuncio` compara fotos pelo nome). */
export const ARQUIVO_BANNER_KIT = "compre-em-kit.jpg";
export const URL_BANNER_KIT = `/anuncios-ml/${ARQUIVO_BANNER_KIT}`;
/** Onde ela entra: a 3a foto (indice 2). Com menos de 2 fotos, no fim. */
export const POSICAO_BANNER_KIT = 2;

export const ehBannerDoKit = (id) => id === ID_BANNER_KIT;

/** A foto como o editor a mostra (o mesmo formato das fotos do produto no contexto). */
export const FOTO_BANNER_KIT = { id: ID_BANNER_KIT, arquivo: ARQUIVO_BANNER_KIT, url: URL_BANNER_KIT, sku: "Kit", titulo: "Compre em kit e economize", banner: true };

function semBanner(imagens) {
  return (Array.isArray(imagens) ? imagens : []).filter((id) => !ehBannerDoKit(id));
}

function comBannerNaPosicao(imagens, posicao = POSICAO_BANNER_KIT) {
  const lista = semBanner(imagens);
  const onde = Math.min(Math.max(0, posicao), lista.length);
  return [...lista.slice(0, onde), ID_BANNER_KIT, ...lista.slice(onde)];
}

/**
 * Se o anuncio leva a imagem agora: a escolha do dono vence; sem escolha, so com o bloco dos kits na descricao.
 * @param {{ temBloco: boolean, escolha?: boolean | null }} entrada
 */
export function deveTerBannerDoKit({ temBloco, escolha }) {
  if (escolha === true) return true;
  if (escolha === false) return false;
  return Boolean(temBloco);
}

/**
 * As fotos do anuncio com a imagem do kit posta ou tirada pela regra. Ja tendo a imagem e devendo ter, a POSICAO fica a que
 * esta (o dono pode te-la mudado com as setas); entrando agora, vai para a 3a foto. Devolve a MESMA lista quando nada muda,
 * para quem chama saber se precisa gravar.
 */
export function aplicarBannerDoKit(imagens, { temBloco, escolha }) {
  const lista = Array.isArray(imagens) ? imagens : [];
  const tem = lista.includes(ID_BANNER_KIT);
  const deve = deveTerBannerDoKit({ temBloco, escolha });
  if (tem === deve) return lista;
  // Sem nenhuma foto do produto a imagem seria a capa, e a capa do ML e a foto do produto com fundo branco, sem texto.
  if (deve && lista.length === 0) return lista;
  return deve ? comBannerNaPosicao(lista) : semBanner(lista);
}

/** Tirar a imagem pela tela: sai da lista e fica a escolha do dono (nao volta sozinha). */
export function tirarBannerDoKit(rascunho) {
  return { imagens: semBanner(rascunho?.imagens), bannerKit: false };
}

/** Incluir de volta pela tela: entra na 3a foto e fica, com ou sem bloco. */
export function incluirBannerDoKit(rascunho) {
  return { imagens: comBannerNaPosicao(rascunho?.imagens), bannerKit: true };
}

/**
 * Devolve a imagem a posicao que ela tinha numa lista refeita a partir do produto (`fotosDoRise` monta a lista so com as
 * fotos do produto: sem isto a imagem sumiria a cada abertura e a cada Salvar).
 */
export function manterBannerNaPosicao(anteriores, refeita) {
  const lista = Array.isArray(refeita) ? refeita : [];
  const posicao = (Array.isArray(anteriores) ? anteriores : []).indexOf(ID_BANNER_KIT);
  if (posicao < 0) return lista;
  return comBannerNaPosicao(lista, posicao);
}

/**
 * Fotos do anuncio na Loja Integrada (pedido do dono em 21/10/2026: "as fotos nao foram enviadas"; ele escolheu
 * TROCAR as da loja pelas do Rise). Regras puras, sem imports: o envio (`envio.js`), o pop-up (`leitura.js`) e o
 * teste as usam.
 *
 * Medido na LI real em 21/10/2026, no produto de teste ZZ-TESTE-BLING (404349127), com OK do dono:
 * - `POST /produto_imagem` com `imagem_url` publica grava NA HORA (~1,2 s cada), com a `posicao` e o `principal`
 *   enviados, e o arquivo guardado leva o NOME do endereco (nao o do produto);
 * - `PUT /produto_imagem/{id}` da 405: uma foto enviada nao muda de capa nem de posicao;
 * - `DELETE /produto_imagem/{id}` da 204; apagar a capa deixa o produto SEM capa.
 * Por isso mudar a ordem ou a capa e "apagar as da loja e mandar as do Rise na ordem".
 *
 * A LI redimensiona e renomeia a foto (cdn.awsli.com.br): nao da para comparar os bytes da loja com os do
 * Rise. O Rise guarda o que ELE mandou (`dados.fotosLI`: arquivo do Rise + id da imagem na LI) e compara
 * isso com a loja (pelos ids) e com o anuncio (pelos arquivos).
 */

/** As fotos da loja na ordem em que ela as mostra: `posicao` (texto na LI) e, sem ela, a ordem da lista. */
export function fotosDaLoja(produtoLI) {
  const lista = Array.isArray(produtoLI?.imagens) ? produtoLI.imagens : [];
  return lista
    .map((imagem, indice) => ({ id: String(imagem?.id ?? ""), principal: Boolean(imagem?.principal), posicao: imagem?.posicao, indice }))
    .filter((imagem) => imagem.id)
    .sort((a, b) => ordemDe(a) - ordemDe(b) || a.indice - b.indice)
    .map(({ id, principal }) => ({ id, principal }));
}

const ordemDe = (imagem) => {
  const numero = Number(imagem.posicao);
  return imagem.posicao === null || imagem.posicao === undefined || imagem.posicao === "" || !Number.isFinite(numero) ? Number.MAX_SAFE_INTEGER : numero;
};

/**
 * As fotos que o anuncio quer na loja, na ordem marcada na aba Imagens (`rascunho.imagens`, ids de ProdutoArquivo),
 * so as que ainda sao fotos validadas do produto. `fotos` = [{ id, arquivo }].
 */
export function fotosDoAnuncio(imagensDoRascunho, fotos) {
  const porId = new Map((fotos ?? []).map((foto) => [foto.id, foto]));
  const vistas = new Set();
  const lista = [];
  for (const id of Array.isArray(imagensDoRascunho) ? imagensDoRascunho : []) {
    const foto = porId.get(id);
    if (!foto?.arquivo || vistas.has(id)) continue;
    vistas.add(id);
    lista.push({ id: foto.id, arquivo: foto.arquivo });
  }
  return lista;
}

/** O que o Rise registrou como enviado; formato ruim vira lista vazia (nada foi enviado pelo Rise). */
export function fotosEnviadas(dados) {
  const lista = Array.isArray(dados?.fotosLI) ? dados.fotosLI : [];
  return lista.filter((item) => item && typeof item.arquivo === "string" && item.liId).map((item) => ({ arquivo: item.arquivo, liId: String(item.liId) }));
}

const iguais = (a, b) => a.length === b.length && a.every((valor, indice) => valor === b[indice]);
const comecaCom = (lista, inicio) => inicio.length <= lista.length && inicio.every((valor, indice) => valor === lista[indice]);

/**
 * O plano do Sincronizar para as fotos:
 * - `nada`: o anuncio nao tem foto (Rise sem foto nunca apaga as da loja) ou a loja ja tem exatamente o que o Rise mandou;
 * - `acrescentar`: a loja tem so as primeiras do anuncio, mandadas pelo Rise, na ordem: manda as que faltam;
 * - `trocar`: qualquer outro caso (foto que o Rise nao mandou, outra ordem, outra capa): apaga as da loja e manda todas.
 */
export function planoDasFotosLI({ desejadas, naLoja, enviadas }) {
  if (!desejadas.length) return { acao: "nada", motivo: "rise_sem_foto", apagar: [], enviar: [] };
  const idsDaLoja = naLoja.map((imagem) => imagem.id);
  const lojaEhDoRise = iguais(idsDaLoja, enviadas.map((item) => item.liId));
  const arquivosDesejados = desejadas.map((foto) => foto.arquivo);
  const arquivosEnviados = enviadas.map((item) => item.arquivo);
  if (lojaEhDoRise && iguais(arquivosDesejados, arquivosEnviados)) return { acao: "nada", motivo: "iguais", apagar: [], enviar: [] };
  if (lojaEhDoRise && enviadas.length && comecaCom(arquivosDesejados, arquivosEnviados)) {
    return { acao: "acrescentar", motivo: "faltam", apagar: [], enviar: desejadas.slice(enviadas.length), posicaoInicial: enviadas.length };
  }
  return { acao: "trocar", motivo: naLoja.length ? "diferentes" : "faltam", apagar: idsDaLoja, enviar: desejadas, posicaoInicial: 0 };
}

/** O resumo para a tela (aba Divergencias): o que muda nas fotos da loja num Sincronizar. */
export function resumoDasFotosLI(plano, { naLoja, desejadas }) {
  if (plano.acao === "nada") {
    return plano.motivo === "rise_sem_foto"
      ? { estado: "rise_sem_foto", texto: `O anúncio não tem foto marcada: as ${naLoja.length} da loja ficam como estão.` }
      : { estado: "iguais", texto: `As ${desejadas.length} fotos da loja são as do Rise.` };
  }
  if (plano.acao === "acrescentar") return { estado: "faltam", texto: `Faltam ${plano.enviar.length} de ${desejadas.length} fotos na loja: o Sincronizar as acrescenta.` };
  return naLoja.length
    ? { estado: "diferentes", texto: `A loja tem ${naLoja.length} foto(s) que não são as do anúncio: o Sincronizar as apaga e envia as ${desejadas.length} do Rise, na ordem (a primeira é a capa).` }
    : { estado: "faltam", texto: `A loja não tem foto: o Sincronizar envia as ${desejadas.length} do Rise, na ordem (a primeira é a capa).` };
}

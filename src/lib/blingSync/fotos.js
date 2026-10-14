import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import { caminhoDe, urlDe } from "@/lib/arquivos";
import { bytesDe } from "@/lib/imagensImportadas";

/**
 * As FOTOS na sincronizacao Rise <-> Bling (pedido do dono em 14/10/2026: "ao sincronizar o anuncio do Rise
 * com o Bling nao esta sincronizando a foto"). As regras puras ficam aqui; a leitura do Bling e a escrita
 * moram em `leitura.js` e `envio.js`.
 *
 * Ate 14/10/2026 as fotos nao iam ao Bling porque ele so aceita imagem por LINK publico
 * (`midia.imagens.imagensURL[].link`) e as fotos moravam so no PC. Na VPS a rota
 * `/api/arquivos/<SKU>/imagens/<arquivo>` e publica (so GET/HEAD, so a pasta `imagens`, nome de 32
 * hexadecimais) e `APP_URL_PUBLICA` tem o endereco: e esse link que o Bling busca.
 *
 * COMO O BLING TRATA FOTO (medido em 14/10/2026 no produto de teste ZZ-TESTE-BLING, ver CLAUDE.md):
 * - o PATCH responde 200 na hora e o Bling baixa a foto EM SEGUNDO PLANO (alguns segundos): a leitura logo
 *   depois ainda mostra a lista antiga;
 * - uma lista com links ACRESCENTA as fotos que ele ainda nao tem; a mesma foto de novo nao duplica;
 * - uma lista VAZIA apaga TODAS as fotos (e a unica forma de tirar uma);
 * - um PATCH sem `midia` nao mexe nas fotos;
 * - o arquivo guardado no S3 e IDENTICO ao enviado (o md5 do conteudo bate), entao da para saber exatamente
 *   quais fotos o Bling ja tem comparando o md5 do conteudo, e nao so a quantidade.
 *
 * Fotos nao entram em `CAMPOS_DE_ENVIO` nem na assinatura do icone: quase todo produto tem foto, e entrar la
 * acenderia o "!" em todo produto ja sincronizado. Elas aparecem na janela como um item a parte.
 */

/// So endereco http/https vira imagem na tela: o link vem do Bling (texto de terceiro).
function enderecoSeguro(valor) {
  const texto = String(valor ?? "").trim();
  return /^https?:\/\//i.test(texto) ? texto : null;
}

/**
 * As fotos VALIDADAS do produto no Rise (`papel: FOTO`, sem a reserva), na ordem do cadastro: a principal
 * primeiro. `caminho` e o endereco relativo (a tela do Rise o abre), `url` o publico (o que o Bling busca), ou
 * null quando o Rise ainda nao tem `APP_URL_PUBLICA`, e `arquivo` o nome no disco.
 *
 * @param {{sku: string, arquivos?: {arquivo: string}[]}} produto linha do Prisma com as fotos ja ordenadas.
 * @param {string} [urlPublica] `APP_URL_PUBLICA`.
 * @returns {{arquivo: string, caminho: string, url: string|null}[]}
 */
export function fotosDoRise(produto, urlPublica = "") {
  const base = String(urlPublica ?? "").trim().replace(/\/+$/, "");
  return (produto?.arquivos ?? [])
    .filter((foto) => foto?.arquivo)
    .map((foto) => {
      const caminho = urlDe(produto.sku, "IMAGEM", foto.arquivo);
      return { arquivo: foto.arquivo, caminho, url: base ? `${base}${caminho}` : null };
    });
}

/**
 * As fotos do produto lido no Bling (`midia.imagens`): as `internas` (as que o Bling guarda, link do S3 que
 * expira em uma semana, e a miniatura) e as `externas`. Sem repetir o mesmo link, na ordem em que o Bling as
 * devolve (a primeira e a principal).
 *
 * @returns {{link: string, miniatura: string|null}[]}
 */
export function fotosDoBling(bling) {
  const imagens = bling?.midia?.imagens ?? {};
  const vistos = new Set();
  const fotos = [];
  for (const imagem of [...(imagens.internas ?? []), ...(imagens.externas ?? [])]) {
    const link = enderecoSeguro(imagem?.link);
    if (!link || vistos.has(link)) continue;
    vistos.add(link);
    fotos.push({ link, miniatura: enderecoSeguro(imagem?.linkMiniatura) ?? link });
  }
  return fotos;
}

// ---------------------------------------------------------------------------
// Identidade pelo conteudo (md5)
// ---------------------------------------------------------------------------

const md5De = (bytes) => createHash("md5").update(bytes).digest("hex");

/// Memoria do processo: o nome de um arquivo do Rise nunca e reutilizado (e gerado, 32 hexadecimais), e o
/// caminho de uma foto no S3 do Bling tambem e um objeto so. Sem isto cada abertura da janela baixaria de novo
/// todas as fotos. Tem teto, para nao crescer sem fim num servidor que fica meses no ar.
const LIMITE_DA_MEMORIA = 2000;
const memoriaDoRise = new Map();
const memoriaDoBling = new Map();

function guardar(memoria, chave, valor) {
  if (memoria.size >= LIMITE_DA_MEMORIA) memoria.delete(memoria.keys().next().value);
  memoria.set(chave, valor);
}

/// Quantas fotos se baixam ao mesmo tempo: o S3 aguenta, mas o servidor do Rise e pequeno.
const SIMULTANEAS = 4;

/// Roda `trabalho` em cada item, `SIMULTANEAS` por vez, e devolve o resultado na mesma ordem.
async function emLotes(itens, trabalho) {
  const saida = new Array(itens.length);
  for (let inicio = 0; inicio < itens.length; inicio += SIMULTANEAS) {
    const lote = itens.slice(inicio, inicio + SIMULTANEAS);
    const feitos = await Promise.all(lote.map((item) => trabalho(item)));
    feitos.forEach((feito, posicao) => {
      saida[inicio + posicao] = feito;
    });
  }
  return saida;
}

/** Os bytes de uma foto do Rise, do disco (`dados/produtos/<SKU>/imagens`). */
export function bytesDaFotoDoRise(sku, arquivo) {
  return bytesDe({ tipo: "arquivo", sku, nome: arquivo });
}

/// Os bytes de uma foto do Bling, pelo link do S3. O endereco vem da resposta do Bling (terceiro), entao passa
/// pelo filtro de rede publica de `bytesDe`, como toda imagem que o servidor baixa de fora.
export function bytesDaFotoDoBling(link) {
  return bytesDe({ tipo: "endereco", endereco: link });
}

/**
 * O md5 do conteudo de cada foto do Rise, na ordem. Foto que nao abre (sumiu do disco) volta `null`: quem
 * envia confere isso antes de escrever, e a janela cai na comparacao pela quantidade.
 *
 * @param {{sku: string}} produto
 * @param {{arquivo: string}[]} fotos
 * @param {{bytesDoRise?: (sku: string, arquivo: string) => Promise<Buffer>}} [dependencias] o teste troca a leitura.
 */
export async function md5DasFotosDoRise(produto, fotos, { bytesDoRise = bytesDaFotoDoRise } = {}) {
  // A memoria so vale para a leitura de verdade: o teste troca a leitura e nao pode herdar o que outro caso guardou.
  const usaMemoria = bytesDoRise === bytesDaFotoDoRise;
  return emLotes(fotos, async (foto) => {
    const chave = `${produto.sku}/${foto.arquivo}`;
    // A memoria poupa o CALCULO do hash, nunca a conferencia de que o arquivo existe: uma foto que sumiu do
    // disco depois de lida nao pode ser tratada como enviavel (o Bling apagaria as dele e nao conseguiria baixar
    // a nova).
    if (usaMemoria && memoriaDoRise.has(chave)) {
      if (await arquivoDoRiseExiste(produto.sku, foto.arquivo)) return memoriaDoRise.get(chave);
      memoriaDoRise.delete(chave);
      return null;
    }
    try {
      const md5 = md5De(await bytesDoRise(produto.sku, foto.arquivo));
      if (usaMemoria) guardar(memoriaDoRise, chave, md5);
      return md5;
    } catch {
      return null;
    }
  });
}

/// O arquivo da foto ainda esta no disco do Rise?
async function arquivoDoRiseExiste(sku, arquivo) {
  const caminho = caminhoDe(sku, "IMAGEM", arquivo);
  if (!caminho) return false;
  try {
    return (await stat(caminho)).isFile();
  } catch {
    return false;
  }
}

/// O caminho do objeto no S3, sem a assinatura (que muda a cada leitura): e a chave da memoria.
function caminhoDoLink(link) {
  try {
    return new URL(link).pathname;
  } catch {
    return link;
  }
}

/**
 * O md5 do conteudo de cada foto do Bling, na ordem, baixando o arquivo do S3. Link que nao abre (vencido,
 * fora do ar) volta `null`, e a comparacao cai na quantidade.
 *
 * @param {{link: string}[]} fotos o que `fotosDoBling` devolveu.
 * @param {{bytesDoBling?: (link: string) => Promise<Buffer>}} [dependencias] o teste troca o download.
 */
export async function md5DasFotosDoBling(fotos, { bytesDoBling = bytesDaFotoDoBling } = {}) {
  const usaMemoria = bytesDoBling === bytesDaFotoDoBling;
  return emLotes(fotos, async (foto) => {
    const chave = caminhoDoLink(foto.link);
    if (usaMemoria && memoriaDoBling.has(chave)) return memoriaDoBling.get(chave);
    try {
      const md5 = md5De(await bytesDoBling(foto.link));
      if (usaMemoria) guardar(memoriaDoBling, chave, md5);
      return md5;
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// O que fazer
// ---------------------------------------------------------------------------

/**
 * Compara as fotos dos dois lados (md5 do conteudo, na ordem) e diz o que o Sincronizar faz:
 *
 * - `nenhuma`: ja estao iguais, ou o Rise nao tem foto (foto vazia no Rise nunca apaga a do Bling, a mesma
 *   regra dos campos);
 * - `acrescentar`: o Bling nao tem foto, ou tem so as primeiras do Rise na mesma ordem: manda so as que
 *   faltam (`enviar`, indices em `fotosDoRise`). Nunca se confia na desduplicacao do Bling: so vai o que falta;
 * - `substituir`: o Bling tem foto que o Rise nao tem, ou a ordem difere (a primeira e a principal): como o
 *   Bling so tira foto com lista vazia, apaga todas e manda as do Rise inteiras.
 *
 * Duas fotos do Rise com o mesmo conteudo contam como uma (o Bling a guardaria uma vez so). Sem conseguir
 * abrir alguma foto (`null`) nao ha como comparar o conteudo: `porContagem` e a quantidade decide (igual =
 * nenhuma, diferente = substituir).
 *
 * @param {(string|null)[]} md5Rise
 * @param {(string|null)[]} md5Bling
 * @returns {{acao: "nenhuma"|"acrescentar"|"substituir", enviar: number[], porContagem: boolean}}
 */
export function planoDasFotos(md5Rise, md5Bling) {
  // Os indices do Rise sem repetir o conteudo (o primeiro de cada vale).
  const indices = [];
  const vistos = new Set();
  md5Rise.forEach((md5, indice) => {
    if (md5 !== null && vistos.has(md5)) return;
    if (md5 !== null) vistos.add(md5);
    indices.push(indice);
  });
  const alvo = indices.map((indice) => md5Rise[indice]);

  if (alvo.length === 0) return { acao: "nenhuma", enviar: [], porContagem: false };

  const semConteudo = alvo.includes(null) || md5Bling.includes(null);
  if (semConteudo) {
    return alvo.length === md5Bling.length
      ? { acao: "nenhuma", enviar: [], porContagem: true }
      : { acao: "substituir", enviar: indices, porContagem: true };
  }

  const prefixo = md5Bling.length <= alvo.length && md5Bling.every((md5, posicao) => md5 === alvo[posicao]);
  if (prefixo && md5Bling.length === alvo.length) return { acao: "nenhuma", enviar: [], porContagem: false };
  if (prefixo) return { acao: "acrescentar", enviar: indices.slice(md5Bling.length), porContagem: false };
  return { acao: "substituir", enviar: indices, porContagem: false };
}

/**
 * O que a janela mostra das fotos: as dos dois lados, o que o Sincronizar vai fazer e se da para enviar.
 *
 * `podeEnviar`: o Rise tem foto E tem endereco publico. Sem foto no Rise nada se envia; sem endereco publico
 * (o Rise do PC) o Bling nao alcanca as fotos, e o `motivo` diz isso.
 *
 * @param {{caminho: string, url: string|null}[]} doRise
 * @param {{link: string, miniatura: string|null}[]} doBling
 * @param {{acao: string, enviar: number[], porContagem: boolean}} plano
 */
export function resumoDasFotos(doRise, doBling, plano) {
  const semEndereco = doRise.length > 0 && doRise.some((foto) => !foto.url);
  return {
    rise: { total: doRise.length, itens: doRise.map((foto) => ({ caminho: foto.caminho })) },
    bling: { total: doBling.length, itens: doBling.map((foto) => ({ miniatura: foto.miniatura })) },
    acao: plano.acao,
    quantasEnviar: plano.enviar.length,
    porContagem: plano.porContagem,
    diferente: plano.acao !== "nenhuma",
    podeEnviar: doRise.length > 0 && !semEndereco,
    motivo: semEndereco
      ? "Este Rise não tem endereço público (APP_URL_PUBLICA), e o Bling só busca foto por link público: as fotos não serão enviadas daqui. Use o Rise da VPS."
      : null,
  };
}

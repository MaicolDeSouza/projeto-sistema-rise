import sharp from "sharp";

import { caminhoDaProposta, caminhoDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { fotosNaPasta, lerIndiceDeCandidatas } from "./banco";

/**
 * A folha de contato da proposta (spec 2026-10-21, `folhaDeContato` do MCP): as fotos atuais do produto e as candidatas
 * baixadas numa imagem so, numeradas, para a conversa OLHAR e escolher (a 1a ilustra o titulo, angulos, mesmo tom, sem
 * desfoque nem marca d'agua). A legenda (numero -> id, arquivo, loja) vai em texto ao lado da imagem.
 *
 * O numero e DESENHADO em tracos (estilo display de 7 segmentos), sem texto no SVG: o contêiner da VPS nao tem fonte
 * instalada (medido em 21/10/2026: sem /usr/share/fonts nem /etc/fonts), e texto sairia em branco la. A foto atual
 * ganha borda verde. So le: nada e gravado.
 */

export const POR_PAGINA = 24;
const COLUNAS = 6;
const TAMANHOS = [160, 256];
const ESPACO = 8;

// Os segmentos acesos de cada algarismo: a (topo), b, c (direita), d (base), e, f (esquerda), g (meio).
const SEGMENTOS = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd",
};

function algarismo(digito, x, y, largura, altura, traco) {
  const meio = altura / 2;
  const retangulos = {
    a: [x, y, largura, traco],
    b: [x + largura - traco, y, traco, meio],
    c: [x + largura - traco, y + meio, traco, meio],
    d: [x, y + altura - traco, largura, traco],
    e: [x, y + meio, traco, meio],
    f: [x, y, traco, meio],
    g: [x, y + meio - traco / 2, largura, traco],
  };
  return [...SEGMENTOS[digito]].map((segmento) => {
    const [rx, ry, rl, ra] = retangulos[segmento];
    return `<rect x="${rx}" y="${ry}" width="${rl}" height="${ra}" fill="#fff"/>`;
  }).join("");
}

/** O selo preto com o numero, no canto de cima a esquerda da celula. */
function selo(numero, x, y, tamanho) {
  const altura = tamanho >= 256 ? 28 : 20;
  const largura = tamanho >= 256 ? 16 : 11;
  const traco = tamanho >= 256 ? 4 : 3;
  const folga = 6;
  const digitos = String(numero);
  const caixa = digitos.length * (largura + folga) + folga;
  const corpo = [...digitos].map((digito, i) => algarismo(digito, x + folga + i * (largura + folga), y + folga, largura, altura, traco)).join("");
  return `<rect x="${x}" y="${y}" width="${caixa}" height="${altura + 2 * folga}" rx="4" fill="#000" fill-opacity="0.8"/>${corpo}`;
}

/** Todas as fotos que a folha mostra, na ordem: as atuais do produto, as candidatas do indice, as outras da pasta. */
async function fotosDaFolha(sku, produtoId) {
  const atuais = await prisma.produtoArquivo.findMany({
    where: { produtoId, tipo: "IMAGEM", papel: "FOTO" },
    orderBy: { ordem: "asc" },
    select: { arquivo: true },
  });
  const proposta = await prisma.propostaDeProduto.findUnique({ where: { produtoId }, select: { secoes: true } });
  // A candidata gravada pelo caminho do SSH (bytes no plano) nao esta no indice: o id e a loja vem da secao fotos.
  const daSecao = new Map((proposta?.secoes?.fotos?.candidatas ?? []).filter((c) => c.arquivo).map((c) => [c.arquivo, c]));
  const indice = await lerIndiceDeCandidatas(sku);
  const naPasta = new Set(await fotosNaPasta(sku));
  const lista = atuais.map((foto) => ({ id: null, arquivo: foto.arquivo, loja: null, atual: true, caminho: caminhoDe(sku, "IMAGEM", foto.arquivo) }));
  for (const [id, item] of Object.entries(indice)) {
    if (!naPasta.has(item?.arquivo)) continue;
    naPasta.delete(item.arquivo);
    lista.push({ id, arquivo: item.arquivo, loja: item.loja ?? null, atual: false, caminho: caminhoDaProposta(sku, item.arquivo) });
  }
  for (const arquivo of [...naPasta].sort()) {
    const citada = daSecao.get(arquivo);
    lista.push({ id: citada?.id ?? null, arquivo, loja: citada?.origem?.loja ?? null, atual: false, caminho: caminhoDaProposta(sku, arquivo) });
  }
  return lista;
}

/**
 * @param {string} sku
 * @param {{ pagina?: number, tamanho?: number }} [opcoes]
 * @returns {Promise<{ jpeg: Buffer, legenda: { numero: number, id: string|null, arquivo: string, loja: string|null, atual: boolean }[], pagina: number, paginas: number, aviso: string|null }>}
 */
export async function folhaDeContato(sku, { pagina = 1, tamanho = 256 } = {}) {
  const produto = await prisma.produto.findUnique({ where: { sku: String(sku ?? "") }, select: { id: true, conferido: true } });
  if (!produto) throw new ErroDeFerramenta(`O produto ${sku} não existe no Rise.`);
  if (produto.conferido) throw new ErroDeFerramenta(`O produto ${sku} já foi Conferido (já aprovado: nada a propor).`);
  const lado = TAMANHOS.includes(Number(tamanho)) ? Number(tamanho) : 256;

  const todas = await fotosDaFolha(sku, produto.id);
  if (todas.length === 0) throw new ErroDeFerramenta(`O produto ${sku} não tem foto atual nem candidata: baixe as candidatas com baixarCandidatas antes.`);
  const paginas = Math.ceil(todas.length / POR_PAGINA);
  const pedida = Number.isInteger(Number(pagina)) && Number(pagina) >= 1 ? Number(pagina) : 1;
  const atual = Math.min(pedida, paginas);
  const avisos = pedida > paginas ? [`A página ${pedida} não existe; esta é a última (${paginas}).`] : [];
  const daPagina = todas.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA).map((foto, i) => ({ ...foto, numero: (atual - 1) * POR_PAGINA + i + 1 }));

  const colunas = Math.min(COLUNAS, daPagina.length);
  const linhas = Math.ceil(daPagina.length / colunas);
  const largura = colunas * lado + (colunas + 1) * ESPACO;
  const altura = linhas * lado + (linhas + 1) * ESPACO;
  const camadas = [];
  const desenho = [];
  let naoAbriram = 0;
  for (const [i, foto] of daPagina.entries()) {
    const x = ESPACO + (i % colunas) * (lado + ESPACO);
    const y = ESPACO + Math.floor(i / colunas) * (lado + ESPACO);
    let miniatura;
    try {
      miniatura = await sharp(foto.caminho).rotate().resize(lado, lado, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer();
    } catch {
      naoAbriram++;
      miniatura = await sharp({ create: { width: lado, height: lado, channels: 3, background: "#bbbbbb" } }).png().toBuffer();
    }
    camadas.push({ input: miniatura, left: x, top: y });
    if (foto.atual) desenho.push(`<rect x="${x + 3}" y="${y + 3}" width="${lado - 6}" height="${lado - 6}" fill="none" stroke="#16a34a" stroke-width="6"/>`);
    desenho.push(selo(foto.numero, x + 4, y + 4, lado));
  }
  if (naoAbriram) avisos.push(`${naoAbriram} foto(s) não abriram e aparecem em cinza.`);
  camadas.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">${desenho.join("")}</svg>`), left: 0, top: 0 });

  const jpeg = await sharp({ create: { width: largura, height: altura, channels: 3, background: "#e5e5e5" } }).composite(camadas).jpeg({ quality: 82 }).toBuffer();
  return {
    jpeg,
    legenda: daPagina.map(({ numero, id, arquivo, loja, atual: ehAtual }) => ({ numero, id, arquivo, loja, atual: ehAtual })),
    pagina: atual,
    paginas,
    aviso: avisos.length ? avisos.join(" ") : null,
  };
}

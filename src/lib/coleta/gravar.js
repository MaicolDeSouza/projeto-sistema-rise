import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { prisma } from "@/lib/db";
import { normalizar } from "@/lib/texto";

/**
 * Gravacao do resultado da coleta.
 *
 * Aqui mora a regra que sustenta a estrutura inteira: SO ESCREVE O QUE MUDOU.
 * A pagina tem uma linha so, atualizada no lugar; o preco tem serie propria,
 * que ganha registro apenas quando o valor muda. Gravar um retrato completo a
 * cada varredura guardaria trezentas e sessenta e cinco copias da mesma
 * descricao por ano so porque o preco variou um real.
 */

/// Onde ficam os JSON-LD originais. Fora de public/ pela mesma razao de
/// dados/produtos/: arquivo gravado em public/ durante a execucao nao entra no
/// build e some num deploy com Docker. dados/ vira volume no VPS.
const RAIZ_SNAPSHOTS = path.join(process.cwd(), "dados", "coleta");

/**
 * Assinatura do CONTEUDO da pagina.
 *
 * O preco fica de fora de proposito. Ele tem deteccao propria, e incluí-lo aqui
 * faria toda mudanca de centavo parecer mudanca de conteudo — a pagina seria
 * reescrita e o snapshot regravado todo dia, sem nada de novo.
 */
function assinatura(dados) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        titulo: dados.titulo ?? null,
        descricao: dados.descricao ?? null,
        marca: dados.marca ?? null,
        modelo: dados.modelo ?? null,
        mpn: dados.mpn ?? null,
        skuFonte: dados.skuFonte ?? null,
        ean: dados.ean ?? null,
        imagens: dados.imagens ?? [],
        atributos: dados.atributos ?? null,
      }),
    )
    .digest("hex");
}

/**
 * Texto que a busca varre, ja normalizado.
 *
 * Normalizar na ESCRITA e o que permite consultar com ILIKE simples e ainda
 * assim "fone" achar "Fone": normalizar na leitura obrigaria a passar cada
 * linha por uma funcao, e nenhum indice ajudaria.
 *
 * A descricao fica de fora: casaria com quase tudo, e procurar "preto"
 * devolveria o catalogo inteiro.
 */
export function montarBuscaTexto(dados, nomeFonte) {
  return normalizar(
    [
      dados.titulo,
      dados.marca,
      dados.modelo,
      dados.mpn,
      dados.skuFonte,
      dados.ean,
      nomeFonte,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Nome estavel por URL: a versao nova sobrescreve a antiga, sem acumular. */
function caminhoSnapshot(dominio, url) {
  const nome = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return path.join(RAIZ_SNAPSHOTS, dominio, `${nome}.json.gz`);
}

async function salvarSnapshot(dominio, url, bruto) {
  if (!bruto) return;

  try {
    const destino = caminhoSnapshot(dominio, url);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, gzipSync(Buffer.from(JSON.stringify(bruto))));
  } catch (erro) {
    // Snapshot e conveniencia para reprocessar depois sem revisitar o site.
    // Falhar em grava-lo nao pode custar a coleta que ja deu certo.
    console.error(`Falha ao gravar snapshot de ${url}:`, erro.message);
  }
}

/**
 * Aplica o resultado de uma visita.
 *
 * @param {object} entrada
 * @param {{id: string, nome: string, dominio: string}} entrada.fonte
 * @param {string} entrada.url
 * @param {object} entrada.resposta  o que buscarPagina devolveu
 * @param {object} [entrada.extraido] o que extrairProduto devolveu
 * @returns {Promise<{acao: string, precoMudou: boolean, paginaId: string|null}>}
 */
export async function gravarPagina({ fonte, url, resposta, extraido }) {
  const existente = await prisma.paginaColetada.findUnique({ where: { url } });
  const agora = new Date();

  // 304: o servidor confirmou que nada mudou. Nem corpo veio — so registrar
  // que a pagina foi vista.
  if (resposta.naoModificado) {
    if (existente) {
      await prisma.paginaColetada.update({
        where: { id: existente.id },
        data: { vistoEm: agora, erro: null, statusHttp: 304 },
      });
    }
    return { acao: "inalterada", precoMudou: false, paginaId: existente?.id ?? null };
  }

  // Falha na visita. So 404/410 provam que o produto saiu do ar; um tempo
  // esgotado e problema de rede, e marcar indisponivel por causa dele
  // apagaria da tela um produto que continua a venda.
  if (!resposta.ok || !extraido?.encontrado) {
    const sumiu = resposta.status === 404 || resposta.status === 410;
    const motivo = resposta.erro ?? "pagina sem dados estruturados de produto";

    if (!existente) {
      return { acao: "ignorada", precoMudou: false, paginaId: null };
    }

    await prisma.paginaColetada.update({
      where: { id: existente.id },
      data: {
        vistoEm: agora,
        statusHttp: resposta.status ?? null,
        erro: motivo,
        ...(sumiu ? { disponivel: false, precoAtual: null } : {}),
      },
    });

    if (sumiu && existente.disponivel) {
      await prisma.precoHistorico.create({
        data: { paginaId: existente.id, preco: null, disponivel: false },
      });
    }

    return {
      acao: sumiu ? "indisponivel" : "erro",
      precoMudou: sumiu,
      paginaId: existente.id,
    };
  }

  const hash = assinatura(extraido);
  const buscaTexto = montarBuscaTexto(extraido, fonte.nome);
  const preco = extraido.preco ?? null;

  const campos = {
    titulo: extraido.titulo,
    descricao: extraido.descricao,
    marca: extraido.marca,
    modelo: extraido.modelo,
    mpn: extraido.mpn,
    skuFonte: extraido.skuFonte,
    ean: extraido.ean,
    imagens: extraido.imagens?.length ? extraido.imagens : null,
    atributos: extraido.atributos ?? null,
    precoAtual: preco,
    disponivel: extraido.disponivel !== false,
    buscaTexto,
    hashConteudo: hash,
    etag: resposta.etag ?? null,
    statusHttp: resposta.status ?? null,
    erro: null,
    vistoEm: agora,
  };

  if (!existente) {
    const criada = await prisma.paginaColetada.create({
      data: { fonteId: fonte.id, url, ...campos },
    });

    // A primeira linha do historico e a linha de base: sem ela, a primeira
    // mudanca de preco nao teria com o que ser comparada na tela.
    await prisma.precoHistorico.create({
      data: {
        paginaId: criada.id,
        preco,
        disponivel: campos.disponivel,
      },
    });

    await salvarSnapshot(fonte.dominio, url, extraido.bruto);
    return { acao: "criada", precoMudou: true, paginaId: criada.id };
  }

  const precoAnterior =
    existente.precoAtual === null ? null : Number(existente.precoAtual);
  const precoMudou =
    precoAnterior !== preco || existente.disponivel !== campos.disponivel;
  const conteudoMudou = existente.hashConteudo !== hash;

  if (!precoMudou && !conteudoMudou) {
    await prisma.paginaColetada.update({
      where: { id: existente.id },
      data: { vistoEm: agora, etag: campos.etag, statusHttp: campos.statusHttp, erro: null },
    });
    return { acao: "inalterada", precoMudou: false, paginaId: existente.id };
  }

  await prisma.paginaColetada.update({ where: { id: existente.id }, data: campos });

  if (precoMudou) {
    await prisma.precoHistorico.create({
      data: { paginaId: existente.id, preco, disponivel: campos.disponivel },
    });
  }

  if (conteudoMudou) {
    await salvarSnapshot(fonte.dominio, url, extraido.bruto);
  }

  return { acao: "atualizada", precoMudou, paginaId: existente.id };
}

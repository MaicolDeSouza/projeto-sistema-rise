"use server";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";

import { MAXIMO_FOTOS_NO_PAINEL } from "@/lib/limites";
import { bytesDe, fotosDasReferencias, imagensDaOrigem } from "@/lib/imagensImportadas";
import {
  adicionarImagem,
  apagarImagem,
  apagarPrevia,
  baseValida,
  descartarLote,
  gravarPrevia,
  VERSOES,
  definirOriginal,
  escolherVersao,
  garantirOriginalGuardado,
  guardarVersao,
  impressoesDoLote,
  lerDoLote,
  lerOpcoesDaPrevia,
  originalDoLote,
  substituirImagem,
} from "@/lib/imagens/lote";
import { imagemParaTela, versoesParaTela } from "@/lib/imagens/paraTela";
import { lerDaReserva } from "@/lib/imagens/reserva";
import { padronizarImagem } from "@/lib/imagens/padronizar";
import { caminhoDe, loteValido, urlDaReserva } from "@/lib/arquivos";
import { cotacaoDoDolar, emReais } from "@/lib/cotacaoDolar";
import {
  CUSTO_COMPRA_USD,
  avaliarConfiguracao,
  editarImagem,
  opcoesCanonicas,
} from "@/lib/integracoes/photoroom";
import { registrarChamada, usoDoPhotoroom } from "@/lib/integracoes/photoroomLog";

/**
 * Fotos do produto NOVO, antes de ele ser salvo (painel de imagens do cadastro).
 *
 * Toda foto que entra aqui e padronizada na hora (1024x1024, fundo branco, JPEG) e fica no
 * lote temporario ate o Salvar. O Photoroom e OPCIONAL, foto por foto: a previa e gratis
 * (sandbox, com marca d'agua) e so depois de ve-la o dono compra a versao limpa.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma constante
 * exportada faz o Next recusar o modulo inteiro.
 */

// A foto como a tela a mostra (`imagemParaTela`, `versoesParaTela`) mora em src/lib/imagens/paraTela.js.

const DOWNLOADS_SIMULTANEOS = 4;

function conferir(lote, base) {
  if (!loteValido(lote)) return "Lote de envio inválido.";
  if (base !== undefined && !baseValida(base)) return "Foto inválida.";
  return null;
}

// ---------------------------------------------------------------------------
// Entrada e saida de fotos
// ---------------------------------------------------------------------------

/** Uma foto enviada pelo dono. */
export async function enviarImagemAoLote(lote, formData) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };

  const arquivo = formData.get("arquivo");
  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) {
    return { ok: false, erro: "Nenhum arquivo enviado." };
  }

  try {
    const resultado = await adicionarImagem(lote, Buffer.from(await arquivo.arrayBuffer()));
    if (!resultado.ok) return resultado;
    return {
      ok: true,
      imagem: imagemParaTela(lote, resultado.base, {
        ampliada: resultado.ampliada,
        origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
      }),
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * As fotos do produto escolhido em "Clonar a partir de um codigo" (ou do Bling): baixadas,
 * padronizadas e postas no lote AGORA, e nao so no Salvar, para o dono ver a foto final.
 *
 * O navegador manda so a REFERENCIA (`rise:<id>` ou `coletado:<id>`) e os enderecos sao
 * lidos de novo aqui, do banco: aceitar endereco vindo dele faria o servidor baixar o que
 * alguem mandasse.
 */
export async function importarImagensDaOrigem(lote, origem) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };

  const imagens = [];
  let recusadas = 0;
  try {
    const { fontes } = await imagensDaOrigem(String(origem ?? ""), MAXIMO_FOTOS_NO_PAINEL);
    for (const fonte of fontes.slice(0, MAXIMO_FOTOS_NO_PAINEL)) {
      try {
        const resultado = await adicionarImagem(lote, await bytesDe(fonte));
        if (!resultado.ok) {
          recusadas++;
          continue;
        }
        imagens.push(
          imagemParaTela(lote, resultado.base, {
            ampliada: resultado.ampliada,
            origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
          }),
        );
      } catch {
        // Site que nao respondeu, endereco invalido: a foto so nao entra.
        recusadas++;
      }
    }
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
  return { ok: true, imagens, recusadas };
}

/**
 * As fotos dos produtos MARCADOS NA LUPA do Nome (fornecedores e concorrentes), trazidas para o
 * painel quando a janela da lupa fecha (pedido do dono em 21/09/2026: todas as fotos dos
 * produtos escolhidos, para ele ficar so com as melhores).
 *
 * Como em `importarImagensDaOrigem`, o navegador manda so os ids e os enderecos saem do banco.
 * O mesmo endereco em dois produtos (loja e catalogo publicam o mesmo arquivo) e a mesma foto
 * por dois enderecos entram uma vez so. `vagas` e quanto ainda cabe no painel; o que passar
 * disso volta em `foraDoLimite`. `referencias` diz quais ids foram olhados, tenham dado foto ou
 * nao, para o formulario nao tentar de novo a cada fechar da janela.
 */
export async function importarFotosDasReferencias(lote, ids, vagas) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 20) {
    return { ok: true, imagens: [], recusadas: 0, foraDoLimite: 0, referencias: [] };
  }

  const espaco = Math.max(0, Math.min(Math.trunc(Number(vagas)) || 0, MAXIMO_FOTOS_NO_PAINEL));

  try {
    const referencias = await fotosDasReferencias(ids.map(String), MAXIMO_FOTOS_NO_PAINEL);

    const vistos = new Set();
    const pendentes = [];
    for (const referencia of referencias) {
      for (const fonte of referencia.fontes) {
        if (vistos.has(fonte.endereco)) continue;
        vistos.add(fonte.endereco);
        pendentes.push({ referencia, fonte });
      }
    }
    const escolhidas = pendentes.slice(0, espaco);

    // Ja parte do que o lote tem: a chamada de outro produto pode ter trazido a mesma foto.
    const impressoes = await impressoesDoLote(lote);
    const imagens = [];
    let recusadas = 0;

    // Baixa de poucas em poucas (as lojas sao lentas e cada foto pode levar segundos), mas
    // padroniza e grava uma a uma: o disco e o sharp nao ganham nada com pressa.
    for (let inicio = 0; inicio < escolhidas.length; inicio += DOWNLOADS_SIMULTANEOS) {
      const grupo = escolhidas.slice(inicio, inicio + DOWNLOADS_SIMULTANEOS);
      const baixadas = await Promise.all(
        grupo.map(async ({ referencia, fonte }) => {
          try {
            return { referencia, bytes: await bytesDe(fonte) };
          } catch {
            // Site que nao respondeu, endereco invalido: a foto so nao entra.
            return { referencia, bytes: null };
          }
        }),
      );

      for (const { referencia, bytes } of baixadas) {
        if (!bytes) {
          recusadas++;
          continue;
        }
        const impressao = createHash("sha1").update(bytes).digest("hex");
        if (impressoes.has(impressao)) continue;
        impressoes.add(impressao);

        const resultado = await adicionarImagem(lote, bytes);
        if (!resultado.ok) {
          recusadas++;
          continue;
        }
        imagens.push(
          imagemParaTela(lote, resultado.base, {
            ampliada: resultado.ampliada,
            origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
            ref: referencia.ref,
            fonte: referencia.fonte,
            produto: referencia.produto,
          }),
        );
      }
    }

    return {
      ok: true,
      imagens,
      recusadas,
      foraDoLimite: pendentes.length - escolhidas.length,
      referencias: referencias.map((referencia) => referencia.ref),
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * As fotos de um produto que JA EXISTE entram no painel (pedido do dono em 21/09/2026: editar usa o mesmo
 * painel do cadastro novo). Cada uma e copiada para o lote, padronizada, e volta com o `arquivoId` da linha
 * de origem, que o Salvar usa para saber o que e do produto e o que e novo.
 *
 * Cada uma volta com a marca `finalizada` (o check verde) ligada: so foto validada e salva.
 *
 * Vem NA ORDEM em que o produto as mostra: a principal primeiro, e depois a ordem gravada. As que nao
 * puderam entrar (arquivo sumido ou ilegivel) voltam em `naoCarregadas`: o formulario as manda de volta
 * como "preservar", senao o Salvar acharia que foram excluidas e as apagaria.
 *
 * RESERVA (Nano Banana): cada foto volta com a `versao` e o `grupo` da linha, e as RESERVA do mesmo grupo
 * entram no lote como as versoes guardadas da foto (`versoes/`). Se ha uma RESERVA `original`, ela vira o
 * original do lote: e dela, e nao da foto atual (que pode ser a do Nano Banana), que a proxima geracao
 * parte. Reabrir e salvar sem mexer nao duplica nada: o Salvar compara os bytes dentro do grupo. A lista
 * `reserva` vai para o botao "Reserva (N)", escondida.
 */
export async function prepararFotosDoProduto(lote, produtoId) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };

  try {
    const produto = await prisma.produto.findUnique({
      where: { id: String(produtoId ?? "") },
      select: {
        sku: true,
        arquivos: {
          where: { tipo: "IMAGEM", papel: "FOTO" },
          orderBy: [{ principal: "desc" }, { ordem: "asc" }],
          select: { id: true, arquivo: true, versao: true, grupo: true },
        },
      },
    });
    if (!produto) return { ok: false, erro: "Produto não encontrado." };

    // Uma consulta so para a reserva inteira, agrupada.
    const linhasDaReserva = await prisma.produtoArquivo.findMany({
      where: { produtoId: String(produtoId), tipo: "IMAGEM", papel: "RESERVA" },
      orderBy: { criadoEm: "asc" },
      select: { id: true, arquivo: true, versao: true, grupo: true },
    });
    const reservaPorGrupo = new Map();
    for (const linha of linhasDaReserva) {
      const grupo = linha.grupo ?? linha.id;
      if (!reservaPorGrupo.has(grupo)) reservaPorGrupo.set(grupo, []);
      reservaPorGrupo.get(grupo).push(linha);
    }

    const imagens = [];
    const naoCarregadas = [];
    for (const linha of produto.arquivos) {
      try {
        const caminho = caminhoDe(produto.sku, "IMAGEM", linha.arquivo);
        if (!caminho) throw new Error("caminho inválido");
        const resultado = await adicionarImagem(lote, await readFile(caminho));
        if (!resultado.ok) {
          naoCarregadas.push(linha.id);
          continue;
        }
        const grupo = linha.grupo ?? linha.id;
        const versao = VERSOES.includes(linha.versao) ? linha.versao : "original";
        await carregarVersoesDaReserva(lote, resultado.base, produto.sku, versao, reservaPorGrupo.get(grupo) ?? []);
        imagens.push(
          imagemParaTela(lote, resultado.base, {
            ampliada: resultado.ampliada,
            origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
            arquivoId: linha.id,
            versao,
            grupo,
            // SALVA = VALIDADA: so as fotos validadas sao salvas (04/10/2026), entao toda foto que
            // ja estava no produto volta com o check verde. Nao ha o que ler no banco, e assim as fotos
            // antigas (de antes da regra, e as importadas do Bling) tambem voltam validadas e nao sao
            // apagadas no proximo Salvar.
            finalizada: true,
            ...(await versoesParaTela(lote, resultado.base)),
          }),
        );
      } catch {
        naoCarregadas.push(linha.id);
      }
    }
    const reserva = linhasDaReserva.map((linha) => ({
      id: linha.id,
      grupo: linha.grupo ?? linha.id,
      versao: linha.versao,
      url: urlDaReserva(produto.sku, linha.arquivo),
    }));
    return { ok: true, imagens, naoCarregadas, reserva };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * As RESERVA do grupo de uma foto entram no lote como as versoes guardadas dela (sem chamar ninguem, sem
 * custo), e a RESERVA `original`, se houver, vira o original do lote. A propria foto entra como a versao
 * dela, para a janela poder voltar a ela depois de escolher outra. Arquivo de reserva que sumiu do disco so
 * nao entra: a foto abre do mesmo jeito.
 */
async function carregarVersoesDaReserva(lote, base, sku, versaoDaFoto, reservasDoGrupo) {
  let algumaGerada = versaoDaFoto !== "original";
  for (const linha of reservasDoGrupo) {
    // A mesma versao da foto ja esta na foto; duas com o mesmo nome no lote nao cabem.
    if (!VERSOES.includes(linha.versao) || linha.versao === versaoDaFoto) continue;
    const bytes = await lerDaReserva(sku, linha.arquivo);
    if (!bytes) continue;
    await guardarVersao(lote, base, linha.versao, bytes);
    if (linha.versao === "original") await definirOriginal(lote, base, bytes);
    else algumaGerada = true;
  }

  if (versaoDaFoto !== "original") {
    const atual = await lerDoLote(lote, "imagens", `${base}.jpg`);
    if (atual) await guardarVersao(lote, base, versaoDaFoto, atual);
  } else if (algumaGerada) {
    // Foto original com versao gerada na reserva: a original do lote e a propria foto.
    await garantirOriginalGuardado(lote, base);
  }
}

/**
 * "Escolher essa" de uma imagem da RESERVA: ela entra no lote como foto, ja VALIDADA (o dono a escolheu), e o
 * painel a poe no lugar da foto do mesmo grupo. Quem troca de verdade e o Salvar: a foto que estava la desce
 * para a reserva e a RESERVA de origem some (regras do `reconciliarImagensDoProduto`).
 *
 * O navegador manda so o id; o arquivo e lido da reserva do produto dono dessa linha. So vale RESERVA de
 * imagem: o id de uma FOTO nao entra por aqui.
 */
export async function trazerDaReserva(lote, reservaId) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };

  try {
    const linha = await prisma.produtoArquivo.findUnique({
      where: { id: String(reservaId ?? "") },
      select: { id: true, tipo: true, papel: true, arquivo: true, versao: true, grupo: true, produto: { select: { sku: true } } },
    });
    if (!linha || linha.tipo !== "IMAGEM" || linha.papel !== "RESERVA") return { ok: false, erro: "Imagem da reserva não encontrada." };

    const bytes = await lerDaReserva(linha.produto.sku, linha.arquivo);
    if (!bytes) return { ok: false, erro: "O arquivo desta imagem da reserva não está mais no disco." };

    const resultado = await adicionarImagem(lote, bytes);
    if (!resultado.ok) return resultado;
    return {
      ok: true,
      imagem: imagemParaTela(lote, resultado.base, {
        ampliada: resultado.ampliada,
        origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
        finalizada: true,
        versao: VERSOES.includes(linha.versao) ? linha.versao : "original",
        grupo: linha.grupo ?? linha.id,
        reservaId: linha.id,
      }),
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Varias fotos de uma vez (o produto foi desmarcado na lupa). */
export async function removerImagensDoLote(lote, bases) {
  const invalido = conferir(lote);
  if (invalido) return { ok: false, erro: invalido };
  try {
    for (const base of Array.isArray(bases) ? bases : []) {
      if (baseValida(base)) await apagarImagem(lote, base);
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

export async function removerImagemDoLote(lote, base) {
  const invalido = conferir(lote, base);
  if (invalido) return { ok: false, erro: invalido };
  try {
    await apagarImagem(lote, base);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * Poe a versao escolhida ("original", "photoroom" ou "nanobanana") como a foto do produto, SEM custo e
 * sem chamar ninguem. As versoes geradas ficam guardadas, e por isso o dono alterna entre elas quantas
 * vezes quiser sem pagar de novo.
 */
export async function escolherVersaoNoLote(lote, base, versao) {
  const invalido = conferir(lote, base);
  if (invalido) return { ok: false, erro: invalido };
  try {
    const resultado = await escolherVersao(lote, base, versao);
    if (!resultado.ok) return resultado;
    return {
      ok: true,
      imagem: imagemParaTela(lote, base, {
        versao,
        ampliada: Boolean(resultado.ampliada),
        ...(await versoesParaTela(lote, base)),
      }),
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Cadastro abandonado ou recomecado: apaga o lote inteiro (fotos, originais, previas e documentos). */
export async function descartarLoteDeArquivos(lote) {
  if (!loteValido(lote)) return { ok: true };
  try {
    await descartarLote(lote);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

// ---------------------------------------------------------------------------
// Photoroom: previa (gratis) e compra (cobra)
// ---------------------------------------------------------------------------

/** O que o painel precisa para desenhar os botoes: chaves, trava e quanto ja foi usado. */
export async function estadoDoPhotoroom() {
  const configuracao = avaliarConfiguracao();
  let uso = null;
  try {
    uso = await usoDoPhotoroom();
  } catch {
    // Sem contagem a tela ainda funciona: so nao mostra o uso.
  }
  // O Photoroom cobra em dolar; a tela mostra em reais pela cotacao de `cotacaoDolar.js` (fixa por ora).
  const cotacao = cotacaoDoDolar();
  return {
    previa: configuracao.previa,
    compra: configuracao.compra,
    custoUsd: CUSTO_COMPRA_USD,
    custoBrl: emReais(CUSTO_COMPRA_USD, cotacao),
    gastoMesBrl: uso ? emReais(uso.gastoMesUsd, cotacao) : null,
    cotacao,
    uso,
  };
}

/**
 * A PREVIA: sandbox, gratis, com marca d'agua. A foto do produto NAO e alterada; a previa
 * fica ao lado, para o dono decidir se compra.
 */
export async function gerarPreviaPhotoroom(lote, base, opcoesPedidas) {
  const invalido = conferir(lote, base);
  if (invalido) return { ok: false, erro: invalido };

  const opcoes = opcoesCanonicas(opcoesPedidas);
  const configuracao = avaliarConfiguracao();
  if (!configuracao.previa.ok) return { ok: false, erro: configuracao.previa.motivo };

  const uso = await usoDoPhotoroom().catch(() => null);
  if (uso && uso.previasHoje >= uso.limiteDia) {
    return { ok: false, erro: `O limite de ${uso.limiteDia} prévias grátis de hoje acabou. Volta amanhã.` };
  }

  try {
    const original = await originalDoLote(lote, base);
    if (!original) return { ok: false, erro: "O original desta foto não está mais disponível." };

    const resposta = await editarImagem({ modo: "previa", bytes: original.bytes, extensao: original.extensao, opcoes });
    if (resposta.enviada) {
      await registrarChamada({
        modo: "previa",
        status: resposta.status,
        duracaoMs: resposta.duracaoMs,
        opcoes,
        erro: resposta.ok ? null : resposta.erro,
      });
    }
    if (!resposta.ok) return { ok: false, erro: resposta.erro };

    // A previa passa pelo MESMO padronizador da compra: o que o dono compara e o que vai
    // ficar (1024x1024, fundo branco), so que com marca d'agua.
    const padrao = await padronizarImagem(resposta.bytes);
    if (!padrao.ok) return padrao;
    await gravarPrevia(lote, base, padrao.bytes, opcoes);

    return {
      ok: true,
      previaUrl: `/api/temporarios/${lote}/previas/${base}.jpg?v=${Date.now()}`,
      opcoes,
      duracaoMs: resposta.duracaoMs,
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * A COMPRA: producao, cobra por imagem. So acontece se
 *  - PHOTOROOM_COMPRA=true e a chave de producao esta no .env (senao, a mensagem diz qual falta);
 *  - existe uma previa desta foto, gerada COM ESTAS MESMAS opcoes: o dono so compra o que viu.
 */
export async function comprarPhotoroom(lote, base, opcoesPedidas) {
  const invalido = conferir(lote, base);
  if (invalido) return { ok: false, erro: invalido };

  const opcoes = opcoesCanonicas(opcoesPedidas);
  const configuracao = avaliarConfiguracao();
  if (!configuracao.compra.ok) return { ok: false, erro: configuracao.compra.motivo };

  try {
    const vista = await lerOpcoesDaPrevia(lote, base);
    if (!vista || JSON.stringify(opcoesCanonicas(vista)) !== JSON.stringify(opcoes)) {
      return { ok: false, erro: "Gere a prévia com estas opções e confira o resultado antes de comprar." };
    }

    const original = await originalDoLote(lote, base);
    if (!original) return { ok: false, erro: "O original desta foto não está mais disponível." };

    const resposta = await editarImagem({ modo: "producao", bytes: original.bytes, extensao: original.extensao, opcoes });
    if (resposta.enviada) {
      await registrarChamada({
        modo: "producao",
        status: resposta.status,
        duracaoMs: resposta.duracaoMs,
        opcoes,
        erro: resposta.ok ? null : resposta.erro,
      });
    }
    if (!resposta.ok) return { ok: false, erro: resposta.erro };

    const resultado = await substituirImagem(lote, base, resposta.bytes);
    if (!resultado.ok) {
      return {
        ok: false,
        erro: `A compra foi feita, mas a foto recebida não pode ser tratada: ${resultado.erro}`,
      };
    }
    await apagarPrevia(lote, base);

    // A original e a comprada ficam guardadas: a compra nao pode apagar a original, senao escolher a
    // original depois jogaria fora a versao que ele pagou.
    const guardouOriginal = await garantirOriginalGuardado(lote, base);
    const guardada = guardouOriginal.ok ? await guardarVersao(lote, base, "photoroom", resultado.bytes) : guardouOriginal;
    if (!guardada.ok) {
      return {
        ok: false,
        erro: `A compra foi feita, mas as versões não puderam ser guardadas: ${guardada.erro}`,
      };
    }

    return {
      ok: true,
      imagem: imagemParaTela(lote, base, {
        versao: "photoroom",
        ampliada: resultado.ampliada,
        ...(await versoesParaTela(lote, base)),
      }),
      custoUsd: CUSTO_COMPRA_USD,
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

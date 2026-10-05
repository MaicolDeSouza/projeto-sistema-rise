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
  escolherVersao,
  guardarVersoes,
  impressoesDoLote,
  lerOpcoesDaPrevia,
  originalDoLote,
  substituirImagem,
  temMelhorada,
} from "@/lib/imagens/lote";
import { padronizarImagem } from "@/lib/imagens/padronizar";
import { caminhoDe, loteValido } from "@/lib/arquivos";
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

/** A foto como o painel a mostra. A `versao` no endereco evita o cache do navegador. */
function imagemParaTela(lote, base, extra = {}) {
  return {
    base,
    url: `/api/temporarios/${lote}/imagens/${base}.jpg?v=${Date.now()}`,
    // Toda foto que entra no painel nasce NAO validada, e o dono a valida (check verde) ou ela nao e salva.
    // Tem que ser `false` explicito, e nao ausente: so o `false` faz o servidor deixar a foto de fora.
    finalizada: false,
    ampliada: false,
    // `melhorada`: a versao que vai para o produto AGORA e a melhorada. `temMelhorada`: ela foi
    // comprada e esta guardada, mesmo que a escolhida seja a original (o dono alterna entre as duas).
    melhorada: false,
    temMelhorada: false,
    originalUrl: null,
    melhoradaUrl: null,
    ...extra,
  };
}

/** Os enderecos das duas versoes de uma foto ja comprada. */
function versoesParaTela(lote, base) {
  const v = Date.now();
  return {
    temMelhorada: true,
    originalUrl: `/api/temporarios/${lote}/versoes/${base}.original.jpg?v=${v}`,
    melhoradaUrl: `/api/temporarios/${lote}/versoes/${base}.melhorada.jpg?v=${v}`,
  };
}

const DOWNLOADS_SIMULTANEOS = 4;

function conferir(lote, base) {
  if (!loteValido(lote)) return "Lote de envio invalido.";
  if (base !== undefined && !baseValida(base)) return "Foto invalida.";
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
          where: { tipo: "IMAGEM" },
          orderBy: [{ principal: "desc" }, { ordem: "asc" }],
          select: { id: true, arquivo: true },
        },
      },
    });
    if (!produto) return { ok: false, erro: "Produto nao encontrado." };

    const imagens = [];
    const naoCarregadas = [];
    for (const linha of produto.arquivos) {
      try {
        const caminho = caminhoDe(produto.sku, "IMAGEM", linha.arquivo);
        if (!caminho) throw new Error("caminho invalido");
        const resultado = await adicionarImagem(lote, await readFile(caminho));
        if (!resultado.ok) {
          naoCarregadas.push(linha.id);
          continue;
        }
        imagens.push(
          imagemParaTela(lote, resultado.base, {
            ampliada: resultado.ampliada,
            origem: { largura: resultado.origem.largura, altura: resultado.origem.altura },
            arquivoId: linha.id,
            // SALVA = VALIDADA: so as fotos validadas sao salvas (04/10/2026), entao toda foto que
            // ja estava no produto volta com o check verde. Nao ha o que ler no banco, e assim as fotos
            // antigas (de antes da regra, e as importadas do Bling) tambem voltam validadas e nao sao
            // apagadas no proximo Salvar.
            finalizada: true,
          }),
        );
      } catch {
        naoCarregadas.push(linha.id);
      }
    }
    return { ok: true, imagens, naoCarregadas };
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
 * Poe a versao escolhida ("original" ou "melhorada") como a foto do produto, SEM custo e sem chamar
 * o Photoroom. A melhorada e a original ficam guardadas depois da compra, e por isso o dono alterna
 * entre as duas quantas vezes quiser sem pagar de novo.
 */
export async function escolherVersaoNoLote(lote, base, versao) {
  const invalido = conferir(lote, base);
  if (invalido) return { ok: false, erro: invalido };
  try {
    const resultado = await escolherVersao(lote, base, versao);
    if (!resultado.ok) return resultado;
    const comprada = await temMelhorada(lote, base);
    return {
      ok: true,
      imagem: imagemParaTela(lote, base, {
        melhorada: versao === "melhorada",
        ampliada: Boolean(resultado.ampliada),
        ...(comprada ? versoesParaTela(lote, base) : {}),
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
    return { ok: false, erro: `O limite de ${uso.limiteDia} previas gratis de hoje acabou. Volta amanha.` };
  }

  try {
    const original = await originalDoLote(lote, base);
    if (!original) return { ok: false, erro: "O original desta foto nao esta mais disponivel." };

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
      return { ok: false, erro: "Gere a previa com estas opcoes e confira o resultado antes de comprar." };
    }

    const original = await originalDoLote(lote, base);
    if (!original) return { ok: false, erro: "O original desta foto nao esta mais disponivel." };

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
        erro: `A compra foi feita, mas a foto recebida nao pode ser tratada: ${resultado.erro}`,
      };
    }
    await apagarPrevia(lote, base);

    // As duas versoes ficam guardadas: a compra nao pode apagar a original, senao escolher a
    // original depois jogaria fora a melhorada que ele pagou.
    const guardadas = await guardarVersoes(lote, base, { originalCru: original.bytes, melhorada: resultado.bytes });
    if (!guardadas.ok) {
      return {
        ok: false,
        erro: `A compra foi feita, mas as versoes nao puderam ser guardadas: ${guardadas.erro}`,
      };
    }

    return {
      ok: true,
      imagem: imagemParaTela(lote, base, {
        melhorada: true,
        ampliada: resultado.ampliada,
        ...versoesParaTela(lote, base),
      }),
      custoUsd: CUSTO_COMPRA_USD,
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

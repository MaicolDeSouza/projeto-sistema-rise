import { lerArquivosOriginais } from "./arquivo";
import { juntarListas, lerArquivo } from "./arquivos";
import { enderecosGravadosDesde, gravarColeta, lerProdutosDaFonte } from "./banco";
import { colherProdutos, enderecoComparavel } from "./colher";
import { conciliar, quedaSuspeita } from "./conciliar";
import { regrasDoFornecedor } from "./fornecedores";

/**
 * Orquestracao da coleta: colher ou reprocessar, conciliar, gravar no banco.
 *
 * Um caminho so para o botao "Atualizar dados", o worker e a linha de comando —
 * nao existe "modo manual" com codigo proprio para divergir do automatico.
 */

/// NINGUEM TEM COTA — o dono decidiu em 15/09/2026 que de toda fonte, fornecedor
/// ou concorrente, se pega o catalogo inteiro. Antes eram 20 por concorrente.
///
/// O numero existe so para a colheita ter onde parar: loja que publique dezenas
/// de milhares de itens nao pode prender o worker para sempre. Nao e politica, e
/// freio — quem o encostar aparece na tela com "produtos no site" maior que o
/// coletado.
const TETO_POR_FONTE = 20000;

/// Teto de paginas abertas numa varredura. Nem toda pagina aberta vira produto:
/// categoria, busca e paginacao entram na conta. A 1 requisicao a cada 2 s sao
/// umas onze horas no pior caso, e a loja que pede 10 s entre visitas (Eletrogate,
/// Impacto CNC) chega ao teto muito antes disso — a varredura seguinte recomeca e
/// o site vai sendo coberto aos poucos.
const ORCAMENTO_PAGINAS = 20000;

/// Produtos por gravacao durante a varredura — 10, escolha do dono em 16/09/2026.
/// Numa loja que pede 10 s entre visitas, uns 2 minutos de trabalho: o que se
/// perde, no maximo, se o worker cair.
const LOTE_GRAVACAO = 10;

/**
 * Endereco inicial da fonte. O dominio e guardado sem protocolo e a loja e
 * visitada por https; dominio gravado COM protocolo vale como esta — e o que deixa
 * o teste do worker varrer uma loja falsa em http://127.0.0.1.
 */
function enderecoDaFonte(fonte) {
  if (/^https?:\/\//i.test(fonte.dominio)) return `${fonte.dominio.replace(/\/+$/, "")}/`;
  return `https://${fonte.dominio}/`;
}

/** Quantos produtos colher desta fonte. O mesmo para todas, desde 15/09/2026. */
export function limiteDaFonte() {
  return TETO_POR_FONTE;
}

/**
 * Aplica a lista de um fornecedor sobre o que ja esta no banco.
 *
 * Separado da leitura dos arquivos para ser testavel sem eles: e aqui que moram
 * as duas regras que custaram caro — a trava de queda e o ausente que fica.
 */
export async function aplicarListaDoFornecedor({
  fonte,
  produtos,
  listaEnviadaEm,
  comecou = Date.now(),
  arquivos = 0,
}) {
  const anteriores = await lerProdutosDaFonte(fonte.id);

  // TRAVA: lista muito menor que a anterior nao e aplicada. So compara lista com
  // lista — `ultimaColetaOrigem` diz de onde veio a coleta guardada.
  const queda = quedaSuspeita({
    anteriores,
    novos: produtos,
    origemAnterior: fonte.ultimaColetaOrigem,
  });

  if (queda) {
    return {
      total: arquivos,
      feitas: 0,
      produtos: 0,
      erro:
        `a lista nova tem ${queda.agora} produto(s) contra ${queda.antes} da anterior — ` +
        `${queda.percentual}% sumiriam. Confira se o conjunto esta completo ` +
        `(a Fortek manda duas listas) e envie de novo.`,
    };
  }

  const { produtos: conciliados, resumo: contagem } = conciliar({
    anteriores,
    novos: produtos,
    dataDaLista: listaEnviadaEm ? new Date(listaEnviadaEm).toISOString() : undefined,
  });

  const resumo =
    `${conciliados.length} produto(s) · ${contagem.novos} novo(s), ` +
    `${contagem.atualizados} atualizado(s), ${contagem.ausentes} ausente(s) da lista · ` +
    `lista de ${new Date(listaEnviadaEm ?? Date.now()).toLocaleDateString("pt-BR")}`;

  const gravacao = await gravarColeta({
    fonte,
    produtos: conciliados,
    origem: "arquivo",
    resumo,
    duracaoMs: Date.now() - comecou,
  });

  return {
    total: arquivos,
    feitas: arquivos,
    produtos: gravacao.gravados,
    visitas: 0,
    resumo,
    contagem,
    gravacao,
    /*
      Para fornecedor que manda lista, O CATALOGO E A LISTA. Nao ha vitrine
      para contar: o total do fornecedor e o que a lista declara, ja conciliado
      com o que estava guardado — inclusive os ausentes, que continuam sendo
      produtos dele, so sem saldo confirmado nesta remessa.
    */
    produtosNoSite: gravacao.gravados,
    produtosNoSiteParcial: false,
    erro: null,
  };
}

/**
 * Reprocessa a ultima lista que o fornecedor mandou.
 *
 * ARQUIVO NAO SE ATUALIZA SOZINHO — ele e uma foto do dia em que o fornecedor
 * mandou. O que a varredura faz e ler de novo o que esta guardado, com os
 * leitores de hoje. Por isso o resumo diz a data da LISTA, e nao so a do
 * reprocessamento.
 */
async function reprocessarArquivos(fonte, aoProgredir, sinal) {
  const comecou = Date.now();
  const regras = regrasDoFornecedor({ nome: fonte.nome, url: `https://${fonte.dominio}` });
  const guardados = await lerArquivosOriginais(fonte.dominio, fonte.listaArquivos);

  if (guardados.length === 0) {
    return {
      total: fonte.listaArquivos?.length ?? 0,
      feitas: 0,
      produtos: 0,
      erro: "os arquivos da lista nao estao mais em disco — envie a lista de novo",
    };
  }

  const lidos = [];

  for (const arquivo of guardados) {
    sinal?.throwIfAborted();
    const leitura = await lerArquivo({
      nome: arquivo.nome,
      bytes: arquivo.bytes,
      fonte: { name: fonte.nome, type: fonte.tipo },
    });
    lidos.push(leitura);

    if (aoProgredir) await aoProgredir({ total: guardados.length, feitas: lidos.length });
  }

  // A pronta entrega vem primeiro: em juntarListas quem chega antes vence, e o
  // preco a manter e o dela — medido na Fortek, onde o 65-276 custa 79,90 na
  // reserva e 82,90 na pronta entrega.
  const ordenados = [...lidos].sort(
    (a, b) => (a.modalidade === "RESERVA" ? 1 : 0) - (b.modalidade === "RESERVA" ? 1 : 0),
  );

  const listas = ordenados.map((leitura) => leitura.produtos);
  let produtos =
    listas.length > 1
      ? juntarListas(listas, { sufixoDeCarga: regras.sufixoDeCarga })
      : (listas[0] ?? []);

  if (produtos.length === 0) {
    return {
      total: guardados.length,
      feitas: 0,
      produtos: 0,
      erro: "nenhum produto reconhecido nos arquivos guardados",
    };
  }

  // Site + arquivo, quando a regra do fornecedor diz que sao o mesmo catalogo
  // pela metade: a Nightech publica foto, texto e endereco no site e preco e
  // saldo na planilha. Mesmo codigo = um produto.
  if (regras.mesclarSiteComArquivo && fonte.robotsPermite) {
    sinal?.throwIfAborted();
    const doSite = await colherProdutos({
      url: enderecoDaFonte(fonte),
      secao: fonte.prefixoUrl ?? undefined,
      nome: fonte.nome,
      tipo: fonte.tipo,
      limite: limiteDaFonte(),
      orcamento: ORCAMENTO_PAGINAS,
      sinal,
      // Sinal de vida durante a navegacao do site, que leva de minutos a horas:
      // sem ele o job ficava sem noticia e a tela dava o worker por morto. O
      // `feitas` continua sendo o de arquivos; so `visitadas` anda. Aqui NAO se
      // grava em lotes: a trava de queda precisa da lista inteira, mesclada.
      aoProgredir: aoProgredir
        ? ({ visitadas }) =>
            aoProgredir({ total: guardados.length, feitas: lidos.length, visitadas })
        : undefined,
    });

    // Site ANTES do arquivo: quem chega primeiro vence, e a foto e a descricao
    // de venda sao do site.
    if (doSite.produtos.length > 0) {
      produtos = juntarListas([doSite.produtos, produtos]);
    }
  }

  // Cancelada depois de ler tudo, a lista NAO e aplicada pela metade.
  sinal?.throwIfAborted();

  return aplicarListaDoFornecedor({
    fonte,
    produtos,
    listaEnviadaEm: fonte.listaEnviadaEm,
    comecou,
    arquivos: guardados.length,
  });
}

/**
 * Varredura de uma fonte, gravando no banco.
 *
 * USA O MESMO CAMINHO DO "TESTAR FONTE" — colherProdutos —, mudando so o
 * limite. Houve um periodo com duas trilhas: a tela mostrava o que o
 * normalizador completo extraia e a gravacao guardava o que um extrator antigo
 * entendia, entao o que o operador aprovava no cadastro nao era o que ficava
 * guardado. Com uma funcao so, a divergencia deixa de ser possivel.
 */
/**
 * @param {object} fonte
 * @param {Function} [aoProgredir]
 * @param {object} [opcoes]
 * @param {AbortSignal} [opcoes.sinal]
 * @param {Date} [opcoes.inicioDaVarredura] quando ESTA varredura comecou, guardado
 *   no job. Numa retomada e a data da primeira tentativa: o que foi gravado desde
 *   entao nao e aberto de novo, e a coleta fecha com essa data.
 */
export async function varrerFonte(fonte, aoProgredir, { sinal = null, inicioDaVarredura = null } = {}) {
  const comecou = Date.now();

  // FORNECEDOR COM LISTA NAO SE VARRE: reprocessa.
  //
  // A Fortek e um portal atras de login — varrer devolve zero. E onde ha lista
  // enviada, ela e a fonte melhor de qualquer jeito: traz preco e saldo, que a
  // vitrine de atacado nao publica.
  if (fonte.tipo === "FORNECEDOR" && fonte.ativa && fonte.listaArquivos?.length > 0) {
    return reprocessarArquivos(fonte, aoProgredir, sinal);
  }

  const limite = limiteDaFonte();

  // Pausada e bloqueada nao se varre. "Pausar mantem tudo que ja foi coletado"
  // e uma promessa da tela: varrer assim mesmo a quebraria.
  if (!fonte.robotsPermite || !fonte.ativa) {
    return {
      total: limite,
      feitas: 0,
      produtos: 0,
      erro: fonte.robotsPermite ? "fonte pausada" : "robots.txt do site nos barra",
    };
  }

  // A barra anda contra o tamanho conhecido do catalogo: contra o teto de 20.000,
  // uma loja de 400 itens terminaria parecendo parada em 2%.
  const esperado = fonte.produtosNoSite ?? limite;

  /*
    GRAVA EM LOTES, DURANTE A VARREDURA — pedido do dono em 16/09/2026.

    Gravar so no fim custou varreduras inteiras: a Casa da Robotica tinha aberto
    1.157 paginas quando o Node derrubou o worker, e nada foi salvo; o Eletrogate
    passou de 2.000 produtos em memoria com dias de navegacao ainda pela frente.
    Agora a queda perde no maximo o lote aberto.

    Os lotes sao gravados EM FILA (`gravacoes`), um depois do outro: produto e
    achado dentro de chamada que ninguem aguarda, e duas transacoes da mesma fonte
    ao mesmo tempo tentariam criar a mesma chave. O lote sai do buffer ANTES de
    gravar, entao nenhum produto entra em dois.
  */
  const inicio = inicioDaVarredura ?? new Date();
  // RETOMADA (16/09/2026): o que os lotes ja salvaram desde o inicio desta
  // varredura. Com lote de 10, a queda custa no maximo 9 produtos, e nao a loja.
  const jaColetadas = inicioDaVarredura
    ? new Set((await enderecosGravadosDesde(fonte.id, inicioDaVarredura)).map(enderecoComparavel))
    : null;
  let buffer = [];
  let gravacoes = Promise.resolve();
  const acumulado = { novos: 0, atualizados: 0, inalterados: 0, precosMudaram: 0, semChave: 0 };
  let gravadosEmLote = 0;

  const gravarLote = (lote) => {
    gravacoes = gravacoes.then(async () => {
      try {
        const parcial = await gravarColeta({
          fonte,
          produtos: lote,
          origem: "site",
          fecharColeta: false,
        });
        gravadosEmLote += parcial.gravados;
        for (const campo of Object.keys(acumulado)) acumulado[campo] += parcial[campo] ?? 0;
      } catch (erro) {
        // Lote que falhou volta para a gravacao final, em vez de sumir.
        console.error(`lote de ${lote.length} produto(s) nao gravado: ${erro.message}`);
        buffer = lote.concat(buffer);
      }
    });
  };

  let colheita;
  try {
    colheita = await colherProdutos({
      url: enderecoDaFonte(fonte),
      secao: fonte.prefixoUrl ?? undefined,
      nome: fonte.nome,
      tipo: fonte.tipo,
      limite,
      orcamento: ORCAMENTO_PAGINAS,
      sinal,
      jaColetadas,
      // O andamento e contado em PRODUTOS, nao em paginas abertas: e o numero que
      // o operador pediu ("20 de cada"), e paginas abertas sobem sem parar em
      // loja que exige muita navegacao ate achar produto.
      // `visitadas` vai junto: e o sinal de vida do worker no trecho em que ele
      // abre pagina atras de pagina sem achar produto novo (ver worker.js).
      aoProgredir: aoProgredir
        ? ({ produtos, visitadas, retomados }) =>
            aoProgredir({ total: esperado, feitas: produtos, visitadas, retomados: retomados ?? 0 })
        : undefined,
      aoGuardar: (produto) => {
        buffer.push(produto);
        if (buffer.length >= LOTE_GRAVACAO) {
          const lote = buffer;
          buffer = [];
          gravarLote(lote);
        }
      },
    });
  } catch (erro) {
    /*
      CANCELADA OU QUEBRADA NO MEIO: o que ja foi achado e gravado antes de sair.

      Sem isto, o lote aberto (ate 9 produtos) sumia, e os lotes em voo terminavam
      depois de o worker ja ter dado o job por encerrado — escrevendo no banco com
      outra varredura da mesma fonte talvez ja em andamento. A coleta NAO e fechada
      (`fecharColeta: false`): a lista da tela continua mostrando a anterior.
    */
    await gravacoes;
    if (buffer.length > 0) {
      await gravarColeta({ fonte, produtos: buffer, origem: "site", fecharColeta: false }).catch(
        (falha) => console.error(`lote final de ${buffer.length} nao gravado: ${falha.message}`),
      );
    }
    throw erro;
  }

  // Os lotes em voo terminam antes da gravacao final.
  await gravacoes;

  const retomados = colheita.retomados ?? 0;

  if (colheita.produtos.length === 0 && retomados === 0) {
    return {
      total: esperado,
      feitas: 0,
      produtos: 0,
      visitas: colheita.visitas,
      erro: colheita.motivo ?? "nenhum produto valido",
    };
  }

  const resumo =
    `${colheita.produtos.length} produto(s) em ${colheita.visitas} pagina(s) · ` +
    `formatos: ${colheita.formatos.join(", ")}` +
    (colheita.ritmoMs ? ` · site pede ${colheita.ritmoMs / 1000}s entre visitas` : "") +
    (retomados > 0 ? ` · ${retomados} retomado(s) de antes de uma interrupcao` : "");

  // A gravacao final leva so o que sobrou no buffer, e FECHA a coleta com a data
  // do inicio e o total da varredura inteira.
  const final = await gravarColeta({
    fonte,
    produtos: buffer,
    origem: "site",
    resumo,
    duracaoMs: Date.now() - comecou,
    inicioDaColeta: inicio,
    totalDaColeta: gravadosEmLote + buffer.length + retomados,
  });

  const gravacao = {
    gravados: gravadosEmLote + final.gravados,
    novos: acumulado.novos + final.novos,
    atualizados: acumulado.atualizados + final.atualizados,
    inalterados: acumulado.inalterados + final.inalterados,
    precosMudaram: acumulado.precosMudaram + final.precosMudaram,
    semChave: acumulado.semChave + final.semChave,
  };

  return {
    total: esperado,
    feitas: colheita.produtos.length + retomados,
    produtos: gravacao.gravados + retomados,
    retomados,
    visitas: colheita.visitas,
    resumo,
    gravacao,
    /*
      O TAMANHO DO CATALOGO, que a colheita ja mede a cada varredura.

      Vem `null` quando a varredura nao provou o total (ver `produtosNoSite` em
      colher.js: endereco no sitemap nao e produto). Quem grava decide o que
      fazer com o null — aqui nao se inventa numero.
    */
    produtosNoSite: colheita.produtosNoSite ?? null,
    produtosNoSiteParcial: colheita.produtosNoSiteParcial ?? false,
    // Colheita que ficou abaixo do pedido nao e erro: a loja pode nao ter 20
    // produtos legiveis. Dizer quantos vieram e mais util que falhar.
    erro: null,
  };
}

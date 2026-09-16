import { lerArquivosOriginais } from "./arquivo";
import { juntarListas, lerArquivo } from "./arquivos";
import { gravarColeta, lerProdutosDaFonte } from "./banco";
import { colherProdutos } from "./colher";
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
async function reprocessarArquivos(fonte, aoProgredir) {
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
    const doSite = await colherProdutos({
      url: `https://${fonte.dominio}/`,
      secao: fonte.prefixoUrl ?? undefined,
      nome: fonte.nome,
      tipo: fonte.tipo,
      limite: limiteDaFonte(),
      orcamento: ORCAMENTO_PAGINAS,
    });

    // Site ANTES do arquivo: quem chega primeiro vence, e a foto e a descricao
    // de venda sao do site.
    if (doSite.produtos.length > 0) {
      produtos = juntarListas([doSite.produtos, produtos]);
    }
  }

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
export async function varrerFonte(fonte, aoProgredir) {
  const comecou = Date.now();

  // FORNECEDOR COM LISTA NAO SE VARRE: reprocessa.
  //
  // A Fortek e um portal atras de login — varrer devolve zero. E onde ha lista
  // enviada, ela e a fonte melhor de qualquer jeito: traz preco e saldo, que a
  // vitrine de atacado nao publica.
  if (fonte.tipo === "FORNECEDOR" && fonte.ativa && fonte.listaArquivos?.length > 0) {
    return reprocessarArquivos(fonte, aoProgredir);
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

  const colheita = await colherProdutos({
    url: `https://${fonte.dominio}/`,
    secao: fonte.prefixoUrl ?? undefined,
    nome: fonte.nome,
    tipo: fonte.tipo,
    limite,
    orcamento: ORCAMENTO_PAGINAS,
    // O andamento e contado em PRODUTOS, nao em paginas abertas: e o numero que
    // o operador pediu ("20 de cada"), e paginas abertas sobem sem parar em
    // loja que exige muita navegacao ate achar produto.
    aoProgredir: aoProgredir
      ? ({ produtos }) => aoProgredir({ total: esperado, feitas: produtos })
      : undefined,
  });

  if (colheita.produtos.length === 0) {
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
    (colheita.ritmoMs ? ` · site pede ${colheita.ritmoMs / 1000}s entre visitas` : "");

  const gravacao = await gravarColeta({
    fonte,
    produtos: colheita.produtos,
    origem: "site",
    resumo,
    duracaoMs: Date.now() - comecou,
  });

  return {
    total: esperado,
    feitas: colheita.produtos.length,
    produtos: gravacao.gravados,
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

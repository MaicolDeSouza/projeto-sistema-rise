import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { lerPecasDoKit, mudancasDosKits, pecaParaTela } from "@/lib/composicaoBanco";
import { propostaParaFormulario } from "@/lib/proposta/banco";
import { custosDosProdutos } from "@/lib/custoAdicional";
import { custoTotal, normalizarAdicionais, somaDosAdicionais } from "@/lib/custoAdicionalRegras";

/**
 * O produto como o FormularioProduto o recebe, lido do banco. Mora aqui (e nao na pagina de edicao) porque
 * a edicao e o "Clonar" da lista (pedido do dono em 09/10/2026) abrem o mesmo formulario com o mesmo
 * produto: duas copias deste mapeamento divergiriam no primeiro campo novo.
 */
export async function carregarProdutoParaFormulario(id) {
  const registro = await prisma.produto.findUnique({
    where: { id: String(id ?? "") },
    include: {
      // A RESERVA de imagens nao e foto do produto: ela entra no painel pela lista `reserva`, escondida.
      arquivos: { where: { papel: "FOTO" }, orderBy: { ordem: "asc" } },
      fornecedores: {
        include: { fornecedor: { select: { nome: true, fonteId: true } } },
        orderBy: { criadoEm: "asc" },
      },
      concorrentes: {
        include: {
          produtoColetado: {
            select: { nome: true, codigo: true, url: true, precoNormal: true, fonte: { select: { nome: true } } },
          },
        },
        orderBy: { criadoEm: "asc" },
      },
      anuncios: {
        select: {
          canal: true,
          status: true,
          situacaoCanal: true,
          idExterno: true,
        },
      },
    },
  });

  if (!registro) return null;

  // As pecas do kit, para a aba Composicao e as abas do kit (fornecedores, peso e medidas, NCM), ja
  // em numeros simples: Decimal nao atravessa a fronteira servidor/cliente.
  const pecas = registro.tipo === "COMPOSICAO" ? await lerPecasDoKit(registro.id) : [];
  const composicao = pecas.map((peca) => pecaParaTela(peca.componente, peca.quantidade));
  // O que mudou nas pecas desde o ultimo Salvar do kit (pedido do dono em 10/10/2026): o quadro do kit.
  const mudancasDasPecas = registro.tipo === "COMPOSICAO" ? ((await mudancasDosKits([registro.id])).get(registro.id) ?? []) : [];

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente.
  const produto = {
    id: registro.id,
    sku: registro.sku,
    ean: registro.ean,
    marca: registro.marca,
    modelo: registro.modelo,
    tituloBase: registro.tituloBase,
    descricaoBase: registro.descricaoBase,
    localizacao: registro.localizacao,
    unidade: registro.unidade ?? "UN",
    tipo: registro.tipo,
    composicao,
    mudancasDasPecas,
    garantiaMeses: registro.garantiaMeses ?? "",
    urlLojaIntegrada: registro.urlLojaIntegrada,
    estoqueMinimo: registro.estoqueMinimo ?? "",
    estoqueMaximo: registro.estoqueMaximo ?? "",
    origem: registro.origem,
    tipoProducao: registro.tipoProducao,
    ncm: registro.ncm,
    cest: registro.cest,
    spedTipoItem: registro.spedTipoItem,
    percentualTributos: registro.percentualTributos
      ? Number(registro.percentualTributos)
      : "",
    numeroHomologacao: registro.numeroHomologacao,
    videoUrl: registro.videoUrl,
    // Fornecedor extraido do Bling na importacao — so RASCUNHO, ate o operador
    // salvar o produto (ver FormularioProduto e salvarProduto).
    fornecedorRascunho: registro.fornecedorRascunho ?? null,
    // Total ja gasto com IA neste produto, somado a cada Salvar (pedido do dono em 12/10/2026). So leitura na tela.
    gastoIA: registro.gastoIA ?? null,
    // Quando o produto foi salvo pela ultima vez: o rascunho automatico guarda isto para avisar, ao voltar, que
    // alguem mexeu no produto nesse meio tempo (`lib/rascunhoDoCadastro.js`).
    atualizadoEm: registro.atualizadoEm?.toISOString() ?? null,
    precoVenda: registro.precoVenda ? Number(registro.precoVenda) : "",
    pesoKg: registro.pesoKg ? Number(registro.pesoKg) : "",
    alturaCm: registro.alturaCm ? Number(registro.alturaCm) : "",
    larguraCm: registro.larguraCm ? Number(registro.larguraCm) : "",
    comprimentoCm: registro.comprimentoCm ? Number(registro.comprimentoCm) : "",
    ativo: registro.ativo,
    // A proposta automatica da sessao do Claude (spec 2026-10-16), ate o Conferido. So leitura na tela: o quadro
    // "Proposta" so preenche o formulario, e o Salvar marca as secoes aplicadas.
    proposta: await propostaParaFormulario(registro.id),
  };

  // Agrupa por tipo e calcula o endereco a partir do SKU atual — o endereco nao
  // e gravado justamente para nao ficar velho quando o SKU muda.
  const arquivos = {};
  for (const item of registro.arquivos) {
    (arquivos[item.tipo] ??= []).push({
      id: item.id,
      arquivo: item.arquivo,
      nomeOriginal: item.nomeOriginal,
      principal: item.principal,
      url: urlDe(registro.sku, item.tipo, item.arquivo),
    });
  }

  // O CUSTO JA ABRE COM IMPOSTO (pedido do dono em 23/10/2026: "independente de salvar ou nao"): para o vinculo cujo
  // codigo esta na lista do fornecedor, a tela mostra o custo da ultima varredura com impostos, e nao o numero gravado
  // (que podia ser antigo, sem IPI). O Salvar grava o mesmo (atualizarCustosDoProduto). So leitura aqui.
  const custoDaVarredura = new Map();
  const comFonte = registro.fornecedores.filter((vinculo) => vinculo.fornecedor.fonteId && vinculo.codigo);
  if (comFonte.length > 0) {
    const coletados = await prisma.produtoColetado.findMany({
      where: {
        OR: comFonte.map((vinculo) => ({
          fonteId: vinculo.fornecedor.fonteId,
          codigo: { equals: vinculo.codigo, mode: "insensitive" },
        })),
      },
      select: { fonteId: true, codigo: true, precoComImpostos: true, precoNormal: true, precoPromocional: true },
      orderBy: { vistoEm: "desc" },
    });
    for (const vinculo of comFonte) {
      const achado = coletados.find(
        (item) => item.fonteId === vinculo.fornecedor.fonteId && item.codigo?.toLowerCase() === vinculo.codigo.toLowerCase(),
      );
      const custo = achado?.precoComImpostos ?? achado?.precoNormal ?? achado?.precoPromocional ?? null;
      if (custo !== null) custoDaVarredura.set(vinculo.id, Number(custo));
    }
  }

  // CUSTO ADICIONAL (pedido do dono em 24/10/2026): a linha mostra o preco do fornecedor (o da varredura, senao o
  // gravado) mais os adicionais com o custo DE HOJE dos produtos vinculados, e o total vai em `precoCusto` (o que a
  // margem e a ordem da tabela leem). Os produtos vinculados vem com codigo e nome para a janela do adicional.
  const vinculadosIds = registro.fornecedores.flatMap((vinculo) =>
    normalizarAdicionais(vinculo.adicionais).filter((item) => item.produtoId).map((item) => item.produtoId));
  const vinculados = await custosDosProdutos(vinculadosIds);
  const fornecedores = registro.fornecedores.map((vinculo) => {
    const gravado = vinculo.precoFornecedor ?? vinculo.precoCusto;
    const precoFornecedor = custoDaVarredura.get(vinculo.id) ?? (gravado !== null && gravado !== undefined ? Number(gravado) : null);
    const adicionais = normalizarAdicionais(vinculo.adicionais, registro.id).map((item) => (item.produtoId
      ? { ...item, sku: vinculados.get(item.produtoId)?.sku ?? null, nome: vinculados.get(item.produtoId)?.nome ?? null, custo: vinculados.get(item.produtoId)?.custo ?? null }
      : item));
    const soma = somaDosAdicionais(adicionais, (id) => vinculados.get(id)?.custo ?? null).total;
    return {
      id: vinculo.id,
      nome: vinculo.fornecedor.nome,
      descricao: vinculo.descricao,
      observacao: vinculo.observacao ?? null,
      codigo: vinculo.codigo,
      precoFornecedor,
      adicionais,
      precoCusto: custoTotal(precoFornecedor, soma),
      link: vinculo.link,
      padrao: vinculo.padrao,
    };
  });

  // Vindo da lupa (produtoColetado preenchido): sempre o preco de HOJE, lido
  // agora — pedido do dono em 18/09/2026, para acompanhar a proxima
  // varredura sem o operador ter que remover e adicionar de novo. Digitado a
  // mao: os campos *Manual, fixos.
  const concorrentes = registro.concorrentes.map((vinculo) =>
    vinculo.produtoColetado
      ? {
          id: vinculo.id,
          manual: false,
          produtoColetadoId: vinculo.produtoColetadoId,
          fonte: vinculo.produtoColetado.fonte.nome,
          nome: vinculo.produtoColetado.nome,
          codigo: vinculo.produtoColetado.codigo,
          preco: vinculo.produtoColetado.precoNormal
            ? Number(vinculo.produtoColetado.precoNormal)
            : null,
          url: vinculo.produtoColetado.url,
        }
      : {
          id: vinculo.id,
          manual: true,
          fonte: vinculo.fonteManual,
          nome: vinculo.nomeManual,
          codigo: vinculo.codigoManual,
          preco: vinculo.precoManual ? Number(vinculo.precoManual) : null,
          url: vinculo.linkManual,
        },
  );

  return { registro, produto, arquivos, fornecedores, concorrentes };
}

/**
 * Tira do que vai para a TELA o que a pessoa nao pode ver (pedido do dono em 20/10/2026): sem Custo, nem fornecedores,
 * nem o custo e o fornecedor das pecas do kit, nem o rascunho do fornecedor do Bling; sem Concorrentes, nem os
 * concorrentes. Esconder so na tela nao basta (o dado iria no HTML): a projecao e aqui, no servidor. `acessos` nulo
 * (sem restricao) devolve os dados como estao. Nao muda o objeto recebido.
 *
 * O Salvar nao apaga o que a pessoa nao via: o formulario nao manda as listas escondidas e o servidor so reconcilia
 * a lista da qual a pessoa tem o dado (`salvarProduto`).
 *
 * @param {{ produto: object, fornecedores: object[], concorrentes: object[] } & object} dados o retorno de `carregarProdutoParaFormulario`
 * @param {{ custo: boolean, concorrentes: boolean } | null} acessos `acessosDoCadastro`
 */
export function projetarParaAcessos(dados, acessos) {
  if (!dados || !acessos) return dados;
  const semCusto = !acessos.custo;
  const semConcorrentes = !acessos.concorrentes;
  if (!semCusto && !semConcorrentes) return dados;
  const produto = { ...dados.produto };
  if (semCusto) {
    produto.fornecedorRascunho = null;
    produto.composicao = (produto.composicao ?? []).map((peca) => ({ ...peca, custo: null, fornecedor: null }));
  }
  return {
    ...dados,
    produto,
    fornecedores: semCusto ? [] : dados.fornecedores,
    concorrentes: semConcorrentes ? [] : dados.concorrentes,
  };
}

/**
 * O "Clonar" da lista (pedido do dono em 09/10/2026): o produto novo nasce com os campos, as pecas do kit,
 * os fornecedores e os concorrentes do original. Nada e gravado ate o Salvar, que trata tudo como produto
 * novo. Fotos e documentos sao copiados pela tela para o lote temporario (`acoes-imagens`, `acoes`).
 *
 * - **Codigo (SKU) vazio**, decisao do dono: ele digita ou usa a varinha.
 * - **EAN copiado**, decisao do dono; o Salvar recusa EAN de outro produto, entao ele troca antes.
 * - Ficam de fora a localizacao e o link da Loja Integrada, que sao daquela peca (a mesma regra do
 *   "Clonar a partir de um codigo"). Estoque, Conferido, vinculos com o Bling e anuncios nem estao no
 *   formulario: o clone nasce sem eles.
 * - **Ids novos** nas linhas de fornecedor e concorrente: o id do vinculo do original nao pode chegar ao
 *   Salvar do clone (o concorrente digitado a mao e reconhecido pelo id).
 */
export function dadosParaClone({ produto, fornecedores, concorrentes }) {
  const {
    id,
    composicao,
    // O quadro do "!" e do kit original, nao do clone.
    mudancasDasPecas: _mudancas,
    fornecedorRascunho,
    tipo,
    // O gasto com IA e do original: o clone comeca do zero.
    gastoIA: _gasto,
    // A data de salvamento tambem e do original.
    atualizadoEm: _atualizadoEm,
    // A proposta automatica e do original (e apagada no Conferido dele): o clone nasce sem.
    proposta: _proposta,
    ...campos
  } = produto;

  // Sem vinculo de verdade, o fornecedor que veio do Bling (rascunho) e o que o original mostra na aba.
  const listaDeFornecedores =
    fornecedores.length > 0
      ? fornecedores
      : fornecedorRascunho?.nome
        ? [
            {
              nome: fornecedorRascunho.nome,
              descricao: fornecedorRascunho.descricao ?? null,
              codigo: fornecedorRascunho.codigo ?? null,
              precoCusto: fornecedorRascunho.precoCusto ?? null,
              link: null,
              padrao: true,
            },
          ]
        : [];

  return {
    origem: { id, sku: produto.sku, titulo: produto.tituloBase },
    campos: { ...campos, sku: "", localizacao: "", urlLojaIntegrada: "" },
    tipo,
    composicao,
    fornecedores: listaDeFornecedores.map((item, posicao) => ({ ...item, id: `clone-fornecedor-${posicao}` })),
    concorrentes: concorrentes.map((item, posicao) => ({ ...item, id: `clone-concorrente-${posicao}` })),
  };
}

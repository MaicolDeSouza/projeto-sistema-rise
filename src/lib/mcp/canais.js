import { z } from "zod";

import { skuValido } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { proximoCodigoLivre } from "@/lib/proposta/codigo";
import { UNIDADES } from "@/lib/unidades";
import { clienteBling } from "@/lib/blingSync/cliente";
import { cadastrarNoBling, enviarAjustesDeEstoque, sincronizarProduto } from "@/lib/blingSync/envio";
import { lerParaPopup } from "@/lib/blingSync/leitura";
import { vinculoBlingNaLI } from "@/lib/canaisDeVenda/li/blingLoja";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { cadastrarNaLI, completarCadastroLI, sincronizarProdutoLI } from "@/lib/canaisDeVenda/li/envio";
import { faltaNoCadastroLI, ofereceCompletar } from "@/lib/canaisDeVenda/li/etapasCadastro";
import { lerParaPopupLI } from "@/lib/canaisDeVenda/li/leitura";
import { exigirProdutoPronto, lerSituacaoDoProduto, proximoPasso } from "@/lib/propostaDeAnuncio/situacao";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * Sincronizar com o Bling e com a Loja Integrada pelo MCP (pedido do dono em 10/11/2026: o Claude da Andrea nao tinha como
 * fazer o que os icones B e LI da lista de Produtos fazem). As MESMAS bibliotecas da tela: a regra, as travas de escrita
 * (BLING_ESCRITA e LI_ESCRITA, com a lista de codigos liberados) e a conferencia de acesso do login (`pode()`) sao as de la.
 * A ferramenta so faz a escolha que o operador faz com o olho: produto fora do canal = cadastrar; cadastro que parou numa
 * etapa = completar; o resto = sincronizar.
 *
 * Estas duas ESCREVEM em sistema de fora (ERP e loja), ao contrario das outras ferramentas do MCP, que so leem ou gravam
 * rascunho no Rise. Por isso: exigem a acao propria do catalogo de acessos, so valem para produto Conferido, recusam antes de
 * escrever o que a tela tambem recusaria, e quando a escrita falha no meio NUNCA mandam repetir as cegas: o canal pode ter
 * gravado e a resposta se perdido, entao o aviso diz para conferir la antes.
 *
 * Testes: `teste:bling-sync` e `teste:li-sync` (com o Bling e a Loja Integrada falsos, via `contexto.mcp`).
 */

const SKU = z.string().trim().min(1).max(60).describe("O código (SKU) do produto no Rise, ex.: '100103'");
const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const CONFERIR_NO_BLING = "O Bling pode ter recebido parte do envio: confira o produto no Bling antes de pedir de novo.";
const CONFERIR_NA_LI = "A Loja Integrada (ou o Bling) pode ter recebido parte do envio: confira o produto na loja antes de pedir de novo.";

const clienteDoBling = (contexto) => contexto?.mcp?.clienteBling ?? clienteBling();
const clienteDaLI = (contexto) => contexto?.mcp?.clienteLI ?? clienteLI();

function exigirAcao(contexto, recurso, recusa) {
  const pode = contexto?.pode;
  if (typeof pode !== "function" || !pode(recurso, "executar")) throw new ErroDeFerramenta(recusa);
}

/** O que o produto e agora e o proximo passo, no mesmo formato de `situacaoDoProduto`. */
async function situacaoAtual(sku) {
  const situacao = await lerSituacaoDoProduto(sku);
  if (!situacao) return {};
  const { passo, motivo } = proximoPasso(situacao);
  return { situacao, proximoPasso: passo, motivo };
}

/** Falha inesperada da biblioteca de envio: o erro fica no log, e quem chamou recebe o aviso de conferir no canal. */
async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[mcp] sincronizacao:", erro);
    return { ok: false, erro: "Não foi possível concluir a sincronização." };
  }
}

const camposDe = (resultado) => (resultado?.alterados ?? []).map((alterado) => alterado?.campo ?? alterado);

// ---------------------------------------------------------------------------
// Bling
// ---------------------------------------------------------------------------

/**
 * Os ajustes de estoque pendentes vao junto: sem eles o icone do Bling continua com o "!" e o produto nao fica verde. Com
 * mais de um deposito e nenhum padrao a escolha e da pessoa, na tela (o Claude nao escolhe deposito): o cadastro vale, e
 * o estoque fica pendente com o aviso.
 */
async function enviarEstoque(produtoId, bling) {
  try {
    const resultado = await enviarAjustesDeEstoque(produtoId, bling);
    const saida = { enviados: resultado.enviados ?? 0, restantes: resultado.restantes ?? 0 };
    if (resultado.precisaDeposito) {
      saida.escolherDepositoNaTela = resultado.precisaDeposito.map((deposito) => deposito.descricao);
      saida.aviso = "O Bling tem mais de um depósito e nenhum padrão: a pessoa escolhe o depósito no ícone B da lista de Produtos.";
    } else if (!resultado.ok) {
      saida.erro = resultado.erro;
      saida.aviso = "Parte dos ajustes pode ter ido ao Bling: confira o saldo lá antes de pedir de novo.";
    } else if (resultado.aviso) {
      saida.aviso = resultado.aviso;
    }
    return saida;
  } catch (erro) {
    console.error("[mcp] estoque no Bling:", erro);
    return { enviados: 0, restantes: null, erro: "Não foi possível enviar o estoque.", aviso: "Parte dos ajustes pode ter ido ao Bling: confira o saldo lá antes de pedir de novo." };
  }
}

const SINCRONIZAR_COM_BLING = {
  nome: "sincronizarComBling",
  descricao: [
    "ESCREVE no Bling: faz o que o ícone B da lista de Produtos faz. Produto que ainda não existe no Bling é CADASTRADO; o que já existe é SINCRONIZADO (só vai o que mudou no Rise).",
    "Os ajustes de estoque pendentes do Rise vão junto, para o produto ficar com o Bling verde.",
    "Só para produto Conferido no Rise. Use quando situacaoDoProduto disser \"sincronizar-bling\" E a pessoa pedir; diga a ela, no chat, o que vai fazer antes de chamar.",
    "Recusa (sem escrever) código repetido no Bling e escrita bloqueada pelas travas do Rise.",
    "Se devolver ok falso com aviso, NÃO tente de novo: o Bling pode ter recebido parte do envio, e a pessoa confere lá primeiro.",
    "Devolve a situação nova do produto e o próximo passo (a Loja Integrada, em geral).",
  ].join(" "),
  esquema: z.object({ sku: SKU }),
  anotacoes: ESCRITA,
  async executar({ sku }, contexto) {
    exigirAcao(contexto, "acao.produtos.sincronizarBling", "Este login não pode sincronizar com o Bling (precisa da ação Sincronizar com o Bling).");
    const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, sku: true, conferido: true } });
    if (!produto) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
    if (!produto.conferido) throw new ErroDeFerramenta(`O produto ${sku} ainda não está Conferido no Rise: confira no Rise antes de sincronizar com o Bling.`);

    const bling = clienteDoBling(contexto);
    // Le o Bling antes de escrever: codigo repetido ou falha de leitura recusam sem tocar em nada.
    const leitura = await lerParaPopup(produto.id, bling);
    if (!leitura.ok) throw new ErroDeFerramenta(leitura.erro ?? "Não foi possível ler o Bling.");

    const cadastrar = leitura.situacao === "nao_existe";
    const acao = cadastrar ? "cadastrou" : "sincronizou";
    const resultado = await protegendo(() => (cadastrar ? cadastrarNoBling(produto.id, bling) : sincronizarProduto(produto.id, bling)));
    if (!resultado.ok) {
      return { ok: false, acao, erro: resultado.erro, blingId: resultado.blingId ?? null, aviso: CONFERIR_NO_BLING, ...(await situacaoAtual(sku)) };
    }

    const estoque = await enviarEstoque(produto.id, bling);
    return {
      ok: true,
      acao,
      blingId: resultado.blingId ?? leitura.blingId ?? null,
      camposEnviados: camposDe(resultado),
      fornecedores: resultado.fornecedores ?? null,
      fotos: resultado.fotos ?? null,
      aviso: resultado.aviso ?? null,
      estoque,
      ...(await situacaoAtual(sku)),
    };
  },
};

// ---------------------------------------------------------------------------
// Loja Integrada
// ---------------------------------------------------------------------------

const SINCRONIZAR_COM_LOJA_INTEGRADA = {
  nome: "sincronizarComLojaIntegrada",
  descricao: [
    "ESCREVE na Loja Integrada (e liga no Bling): faz o que o ícone LI da lista de Produtos faz.",
    "Produto fora da loja é CADASTRADO (cria pausado, liga no Bling, grava o estoque e ativa); cadastro que parou numa etapa é COMPLETADO; o que já está na loja é SINCRONIZADO (só vai o que mudou).",
    "Só para produto Conferido no Rise e com o Bling verde: se não estiver, recusa e diz que o Bling vem antes (sincronizarComBling).",
    "Use quando situacaoDoProduto disser \"cadastrar-li\" E a pessoa pedir; diga a ela, no chat, o que vai fazer antes de chamar.",
    "Se devolver ok falso com aviso, NÃO tente de novo: a loja pode ter recebido parte do envio, e a pessoa confere lá primeiro (a chamada seguinte, depois de conferir, completa o que faltou).",
    "Devolve a situação nova do produto e o próximo passo (o Mercado Livre, em geral).",
  ].join(" "),
  esquema: z.object({ sku: SKU }),
  anotacoes: ESCRITA,
  async executar({ sku }, contexto) {
    exigirAcao(contexto, "acao.lojaIntegrada.sincronizar", "Este login não pode sincronizar com a Loja Integrada (precisa da ação Cadastrar e sincronizar na Loja Integrada).");
    // Conferido e Bling verde: a mesma exigencia da proposta de anuncio (o Bling vem antes da loja).
    const produto = await exigirProdutoPronto(sku);

    const li = clienteDaLI(contexto);
    const bling = clienteDoBling(contexto);
    const leitura = await lerParaPopupLI(produto.id, li);
    if (!leitura.ok) throw new ErroDeFerramenta(leitura.erro ?? "Não foi possível ler a Loja Integrada.");

    let acao;
    let resultado;
    if (leitura.situacao === "nao_existe") {
      acao = "cadastrou";
      resultado = await protegendo(() => cadastrarNaLI(produto.id, li, bling));
    } else {
      // O que o editor da loja faz para oferecer "Completar o cadastro": o que a loja mostra e o vinculo no Bling.
      const noBling = await vinculoBlingNaLI(bling, produto.sku, leitura.idExterno);
      const falta = faltaNoCadastroLI({
        idExterno: leitura.idExterno,
        ativo: leitura.ativoNaLI,
        estoqueGerenciado: leitura.estoqueGerenciado,
        situacaoNoBling: noBling?.situacao ?? null,
      });
      if (ofereceCompletar({ falta, falhou: Boolean(leitura.cadastroFalhou) })) {
        acao = "completou";
        resultado = await protegendo(() => completarCadastroLI(produto.id, li, bling));
      } else {
        acao = "sincronizou";
        resultado = await protegendo(() => sincronizarProdutoLI(produto.id, li, bling));
      }
    }

    if (!resultado.ok) {
      return { ok: false, acao, etapa: resultado.etapa ?? null, erro: resultado.erro, aviso: CONFERIR_NA_LI, ...(await situacaoAtual(sku)) };
    }
    return {
      ok: true,
      acao,
      etapas: resultado.etapas ?? null,
      ativo: resultado.ativo ?? null,
      camposEnviados: camposDe(resultado),
      fotos: resultado.fotos ?? null,
      aviso: resultado.aviso ?? null,
      ...(await situacaoAtual(sku)),
    };
  },
};

// ---------------------------------------------------------------------------
// Criar produto no Rise (pedido do dono em 10/11/2026)
// ---------------------------------------------------------------------------



const CRIAR_PRODUTO = {
  nome: "criarProduto",
  descricao: [
    "CRIA um produto SIMPLES novo no Rise, só com o básico: nome, e se a pessoa informar, código, marca, modelo e unidade.",
    "Nasce NÃO Conferido, sem preço, sem fotos e sem fornecedor: o resto vem pela proposta de cadastro (roteiroDaProposta) e pelo dono, no Rise.",
    "Sem sku, o Rise usa o próximo código livre da faixa automática 25xxxx. Com sku, ele precisa ser novo (nunca reaproveite o de outro produto).",
    "ANTES de criar, procure se o produto já existe (buscarProdutos ou consultarProduto) e só chame quando a pessoa pedir; mostre a ela o código que ficou.",
    "Não cria kit (composição) nem escreve no Bling ou nas lojas.",
  ].join(" "),
  esquema: z.object({
    nome: z.string().trim().min(3).max(200).describe("O nome do produto, como a loja o vende"),
    sku: z.string().trim().min(1).max(64).optional().describe("O código. Sem ele, o Rise usa o próximo livre (25xxxx)"),
    marca: z.string().trim().max(60).optional(),
    modelo: z.string().trim().max(60).optional(),
    unidade: z.enum(UNIDADES).optional().describe("Padrão UN"),
  }),
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async executar({ nome, sku, marca, modelo, unidade }, contexto) {
    if (typeof contexto?.pode !== "function" || !contexto.pode("tela.produtos.cadastro", "editar")) {
      throw new ErroDeFerramenta("Este login não pode criar produto (precisa editar o cadastro de Produtos).");
    }
    let codigo = sku;
    if (codigo === undefined) {
      codigo = await proximoCodigoLivre();
      if (!codigo) throw new ErroDeFerramenta("A faixa automática 25xxxx acabou.");
    } else if (!skuValido(codigo)) {
      throw new ErroDeFerramenta("Código inválido: use apenas letras, números, ponto, hífen e sublinhado.");
    }
    // O SKU e unico sem diferenciar caixa: o Bling e o resto do Rise o tratam assim.
    const igual = await prisma.produto.findFirst({ where: { sku: { equals: codigo, mode: "insensitive" } }, select: { sku: true, tituloBase: true } });
    if (igual) throw new ErroDeFerramenta(`Já existe o produto ${igual.sku} (${igual.tituloBase}): não foi criado nada.`);
    try {
      // Marca e modelo sempre em maiusculas (regra do Rise); o resto nasce com os padroes do banco.
      const criado = await prisma.produto.create({
        data: {
          sku: codigo,
          tituloBase: nome,
          marca: marca ? marca.toLocaleUpperCase("pt-BR") : null,
          modelo: modelo ? modelo.toLocaleUpperCase("pt-BR") : null,
          unidade: unidade ?? "UN",
        },
      });
      return { ok: true, sku: criado.sku, nome: criado.tituloBase, conferido: false, proximoPasso: "proposta-do-produto", ...(await situacaoAtual(criado.sku)) };
    } catch (erro) {
      if (erro?.code === "P2002") throw new ErroDeFerramenta(`O código ${codigo} acabou de ser usado por outro produto: tente de novo.`);
      throw erro;
    }
  },
};

export const FERRAMENTAS_DE_CANAIS = [SINCRONIZAR_COM_BLING, SINCRONIZAR_COM_LOJA_INTEGRADA, CRIAR_PRODUTO];

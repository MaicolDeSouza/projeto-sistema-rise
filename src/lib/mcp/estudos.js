import { z } from "zod";

import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { calcularEstudo, filaDeEstudos, gravarEstudo, lerParaEstudo } from "@/lib/estudos/banco";
import { CONFIANCAS, VEREDITOS } from "@/lib/estudos/regras";
import { ESQUEMA_ESTUDO, ROTEIRO_ESTUDO, VERSAO_ROTEIRO_ESTUDO } from "@/lib/estudos/roteiro";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As ferramentas do estudo de viabilidade pelo MCP (spec 2026-11-12-estudo-de-viabilidade-design.md): o Claude Desktop
 * le a fila que o botao do Scraper encheu, estuda no Mercado Livre pelo Claude no Chrome e devolve o relatorio ao Rise.
 * Trabalho do dono (como a proposta): sem o lembrete de `anotarDuvida`. So escrevem no proprio estudo.
 *
 * Acesso: Compras › Estudos de viabilidade (ver para ler, editar para calcular e gravar) e, porque o estudo mostra custo e
 * preco de concorrente, `dado.custo` e `dado.concorrentes`.
 */

const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const ID = z.string().trim().min(1).max(40).describe("O id do estudo (de listarEstudosDeViabilidade)");

function exigir(contexto, nivel) {
  const pode = contexto?.pode;
  if (typeof pode !== "function" || !pode("tela.compras.estudos", nivel)) {
    throw new ErroDeFerramenta(`Este login não pode ${nivel === "ver" ? "ver" : "fazer"} estudos de viabilidade (Compras › Estudos de viabilidade).`);
  }
  if (!pode("dado.custo", "ver") || !pode("dado.concorrentes", "ver")) {
    throw new ErroDeFerramenta("Este login não pode fazer estudos de viabilidade (precisa ver custo e concorrentes).");
  }
}

// O erro do banco do estudo e recado para o Claude (estudo concluido, sem contas...): vira ErroDeFerramenta.
async function semErroDoEstudo(fazer) {
  try {
    return await fazer();
  } catch (erro) {
    if (erro?.name === "ErroDoEstudo") throw new ErroDeFerramenta(erro.message);
    if (typeof erro?.status === "number") throw new ErroDeFerramenta(`O Mercado Livre recusou a leitura das taxas: ${erro.message}`);
    throw erro;
  }
}

const ROTEIRO = {
  nome: "roteiroDoEstudoDeViabilidade",
  descricao:
    "Primeira chamada do estudo de viabilidade de um produto (vale a pena trabalhar com ele? quanto comprar?): devolve o roteiro (passos, regras e critérios do veredito) e o formato dos dados. Siga exatamente; é o mesmo para qualquer assistente.",
  esquema: z.object({}),
  anotacoes: SO_LEITURA,
  async executar(_argumentos, contexto) {
    exigir(contexto, "ver");
    return { versao: VERSAO_ROTEIRO_ESTUDO, roteiro: ROTEIRO_ESTUDO, formato: ESQUEMA_ESTUDO };
  },
};

const LISTAR = {
  nome: "listarEstudosDeViabilidade",
  descricao: "Os estudos de viabilidade que o dono mandou pelo Scraper. Padrão: os que estão na fila, do mais antigo para o mais novo.",
  esquema: z.object({
    situacao: z.enum(["NA_FILA", "CONCLUIDO", "TODOS"]).optional().describe("Padrão NA_FILA"),
    limite: z.number().int().min(1).max(50).optional(),
  }),
  anotacoes: SO_LEITURA,
  async executar({ situacao = "NA_FILA", limite = 20 }, contexto) {
    exigir(contexto, "ver");
    return { estudos: await filaDeEstudos({ situacao, limite }) };
  },
};

const LER = {
  nome: "lerParaEstudoDeViabilidade",
  descricao: "O produto de um estudo, como o Scraper o coletou (nome, código, marca, modelo, ficha, preço, custo e estoque quando é fornecedor), e os estudos anteriores do mesmo produto.",
  esquema: z.object({ id: ID }),
  anotacoes: SO_LEITURA,
  async executar({ id }, contexto) {
    exigir(contexto, "ver");
    return semErroDoEstudo(() => lerParaEstudo(id));
  },
};

const ANUNCIO = z.object({
  titulo: z.string().trim().min(1).max(300),
  url: z.string().trim().max(500).optional(),
  preco: z.number().positive().describe("O preço NORMAL do anúncio, em R$"),
  unidades: z.number().int().min(1).max(10000).optional().describe("Quantas peças o anúncio vende (pacote com 10 = 10); padrão 1"),
  mesmoProduto: z.boolean(),
  motivo: z.string().trim().max(300).optional().describe("Por que não é o mesmo produto"),
  vendidos: z.union([z.string().trim().max(60), z.number().int().min(0)]).optional().describe("Como a página escreve ('+500 vendidos') ou número"),
  vendedor: z.string().trim().max(120).optional(),
  reputacao: z.string().trim().max(120).optional(),
  full: z.boolean().optional(),
  freteGratis: z.boolean().optional(),
  patrocinado: z.boolean().optional(),
  catalogo: z.boolean().optional(),
});

const CALCULAR = {
  nome: "calcularEstudoDeViabilidade",
  descricao: [
    "Grava o que você leu no Mercado Livre e apontou (anúncios, fornecedores coletados pelo produtoColetadoId, produtos parecidos da 4hobby pelo SKU) e faz as contas do Rise: preço de referência (mediana por unidade dos anúncios do mesmo produto), taxas e frete reais do ML no Clássico, lucro, markup, preço mínimo para 30%, demanda, quantidade inicial e o veredito pelas regras com os motivos.",
    "Pode chamar de novo para corrigir: refaz tudo. Não fecha o estudo (isso é gravarEstudoDeViabilidade).",
  ].join(" "),
  esquema: z.object({
    id: ID,
    termos: z.array(z.string().trim().min(1).max(120)).max(5).optional().describe("Os termos buscados no ML"),
    anuncios: z.array(ANUNCIO).max(40).describe("Todos os anúncios lidos, com mesmoProduto"),
    fornecedores: z.array(z.string().trim().min(1).max(40)).max(20).optional().describe("produtoColetadoId dos fornecedores que vendem o MESMO produto"),
    parecidos: z.array(z.string().trim().min(1).max(60)).max(5).optional().describe("SKUs de produtos da 4hobby parecidos, para a quantidade inicial"),
    categoriaId: z.string().trim().regex(/^MLB\d+$/, "Código de categoria do ML (MLB...).").optional(),
    medidas: z
      .object({ alturaCm: z.number().positive(), larguraCm: z.number().positive(), comprimentoCm: z.number().positive(), pesoKg: z.number().positive() })
      .optional()
      .describe("Medidas do pacote, só quando a página disser"),
  }),
  anotacoes: ESCRITA,
  async executar({ id, ...entrada }, contexto) {
    exigir(contexto, "editar");
    const cliente = contexto?.mcp?.clienteML ?? clienteML();
    return semErroDoEstudo(() => calcularEstudo(id, entrada, { cliente }));
  },
};

const GRAVAR = {
  nome: "gravarEstudoDeViabilidade",
  descricao:
    "Fecha o estudo com a conclusão (até 6 linhas: por que vale ou não, o risco principal, o que conferir antes de comprar). Sem veredito vale o das regras; outro veredito só com motivoDaDiferenca. Depois de gravado, o relatório fica em Compras › Estudos de viabilidade.",
  esquema: z.object({
    id: ID,
    conclusao: z.string().trim().min(1).max(2000),
    veredito: z.enum(VEREDITOS).optional(),
    confianca: z.enum(CONFIANCAS).optional(),
    motivoDaDiferenca: z.string().trim().max(500).optional(),
  }),
  anotacoes: { ...ESCRITA, openWorldHint: false },
  async executar({ id, ...dados }, contexto) {
    exigir(contexto, "editar");
    return semErroDoEstudo(() => gravarEstudo(id, { ...dados, versaoDoRoteiro: VERSAO_ROTEIRO_ESTUDO }));
  },
};

export const FERRAMENTAS_DE_ESTUDOS = [ROTEIRO, LISTAR, LER, CALCULAR, GRAVAR];

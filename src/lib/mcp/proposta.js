import { z } from "zod";

import { prisma } from "@/lib/db";
import { gravarProposta, propostaParaFormulario } from "@/lib/proposta/banco";
import { baixarCandidatas, MAXIMO_POR_CHAMADA } from "@/lib/proposta/candidatas";
import { folhaDeContato, POR_PAGINA } from "@/lib/proposta/folha";
import { lerParaProposta } from "@/lib/proposta/leitura";
import { SECOES } from "@/lib/proposta/plano";
import { ROTEIRO, VERSAO_DO_ROTEIRO } from "@/lib/proposta/roteiro";
import { ROTEIRO_LI, ROTEIRO_ML, VERSAO_ROTEIRO_LI, VERSAO_ROTEIRO_ML } from "@/lib/propostaDeAnuncio/roteiros";
import { exigirPropostaDeAnuncio } from "./propostaDeAnuncio.js";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As ferramentas da proposta automatica de produto pelo MCP (spec 2026-10-21): a conversa le o que a proposta precisa e
 * grava a proposta; NUNCA mexe no produto (o dono aplica, salva e marca Conferido na tela). So aqui no MCP, e sem o
 * lembrete de `anotarDuvida`: proposta nao e pergunta de atendimento (a `ChamadaMcp` registra do mesmo jeito).
 *
 * Acesso: a acao `acao.produtos.proporCadastro` e, porque a leitura mostra custo e preco de concorrente, tambem
 * `dado.custo` e `dado.concorrentes`. Conferido antes de ler o banco. Produto Conferido = ja aprovado: toda ferramenta recusa.
 */

const SKU = z.string().trim().min(1).max(60).describe("O código (SKU) do produto no Rise, ex.: '100103'");
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export function exigirProposta(contexto) {
  const pode = contexto?.pode;
  if (typeof pode !== "function" || !pode("acao.produtos.proporCadastro", "executar")) {
    throw new ErroDeFerramenta("Este login não pode montar proposta de cadastro (precisa da ação Propor cadastro).");
  }
  if (!pode("dado.custo", "ver")) throw new ErroDeFerramenta("Este login não pode montar proposta de cadastro (precisa do acesso a custo e fornecedores).");
  if (!pode("dado.concorrentes", "ver")) throw new ErroDeFerramenta("Este login não pode montar proposta de cadastro (precisa do acesso a concorrentes e seus preços).");
}

const recusarConferido = (sku) => {
  throw new ErroDeFerramenta(`O produto ${sku} já foi Conferido (já aprovado: nada a propor).`);
};

const LER_PARA_PROPOSTA = {
  nome: "lerParaProposta",
  descricao: [
    "Primeiro passo da proposta de cadastro de um produto: traz o produto (título com as palavras-chave do dono, campos já preenchidos, fotos atuais), os fornecedores vinculados (custo, código, NCM da lista), os concorrentes vinculados (preço normal, estoque, EAN, NCM, marca, modelo, ficha, descrição, documentos e as fotos, cada uma com um id), o agregado por campo, os prompts da descrição e, com `prompt`, o texto dele.",
    "As fotos só se baixam pelo id daqui. A proposta nunca altera o produto.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    prompt: z.string().trim().min(1).max(60).optional().describe("Nome do prompt da descrição (ex.: 'Padrão do sistema'); sem ele, só a lista de prompts"),
  }),
  anotacoes: SO_LEITURA,
  async executar({ sku, prompt }, contexto) {
    exigirProposta(contexto);
    const lido = await lerParaProposta(sku, { prompt: prompt ?? null });
    if (lido.produto.conferido) recusarConferido(sku);
    return lido;
  },
};

const LER_PROPOSTA = {
  nome: "lerProposta",
  descricao: "Mostra a proposta de cadastro já gravada de um produto: as seções, o conteúdo de cada uma e quais ainda não foram aplicadas pelo dono. Use para conferir o que foi gravado.",
  esquema: z.object({ sku: SKU }),
  anotacoes: SO_LEITURA,
  async executar({ sku }, contexto) {
    exigirProposta(contexto);
    const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, conferido: true } });
    if (!produto) throw new ErroDeFerramenta(`O produto ${sku} não existe no Rise.`);
    if (produto.conferido) recusarConferido(sku);
    const proposta = await propostaParaFormulario(produto.id);
    return {
      sku,
      proposta: proposta
        ? { secoes: proposta.secoes, naoAplicadas: proposta.naoAplicadas, versaoDoRoteiro: proposta.versaoDoRoteiro, atualizadaEm: proposta.atualizadaEm }
        : null,
    };
  },
};

const BAIXAR_CANDIDATAS = {
  nome: "baixarCandidatas",
  descricao: [
    `O Rise baixa as fotos candidatas da proposta (até ${MAXIMO_POR_CHAMADA} por vez), pelos ids de foto que lerParaProposta deu; nunca por endereço.`,
    "Cada uma é padronizada em 1024x1024 e guardada até a seção fotos ser gravada (gravarSecao cita o arquivo; as não citadas saem). Pedir o mesmo id de novo devolve o mesmo arquivo.",
    "Devolve baixadas (id, arquivo, loja) e falharam (id, motivo).",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    ids: z.array(z.string().trim().min(1).max(80)).min(1).max(MAXIMO_POR_CHAMADA).describe("Ids das fotos, como vieram em lerParaProposta (concorrentes[].fotos[].id)"),
  }),
  // Escreve so na pasta da proposta e baixa da internet; o mesmo id de novo nao muda nada.
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async executar({ sku, ids }, contexto) {
    exigirProposta(contexto);
    return baixarCandidatas(sku, ids);
  },
};

const FOLHA_DE_CONTATO = {
  nome: "folhaDeContato",
  descricao: [
    `Mostra numa imagem só, numeradas, as fotos atuais do produto (borda verde) e as candidatas baixadas, até ${POR_PAGINA} por página, para você olhar e escolher as da seção fotos.`,
    "A legenda em texto diz o número, o id, o arquivo e a loja de cada uma. Mais fotos: peça a próxima página.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    pagina: z.number().int().min(1).max(50).optional().describe("Página da folha (1 em diante; padrão 1)"),
    tamanho: z.union([z.literal(160), z.literal(256)]).optional().describe("Tamanho de cada foto na folha: 160 ou 256 (padrão)"),
  }),
  anotacoes: SO_LEITURA,
  async executar({ sku, pagina, tamanho }, contexto) {
    exigirProposta(contexto);
    return folhaDeContato(sku, { pagina, tamanho });
  },
  // A folha volta como IMAGEM do MCP (o modelo a ve) e a legenda como texto; o JPEG nunca vai dentro do JSON.
  paraConteudo: ({ jpeg, ...legenda }) => [
    { type: "image", mimeType: "image/jpeg", data: jpeg.toString("base64") },
    { type: "text", text: JSON.stringify(legenda) },
  ],
};

const GRAVAR_SECAO = {
  nome: "gravarSecao",
  descricao: [
    "Grava UMA seção da proposta de cadastro (descricao, titulos, fotos, campos, preco, ean, documentos ou relatorio), no formato do roteiro da proposta. Gravar a mesma seção de novo a substitui.",
    "Fotos: cada candidata cita o arquivo devolvido por baixarCandidatas, ou fotoAtual; as baixadas que a seção não citar são apagadas. Documentos: só os links.",
    "A seção é validada no Rise: se voltar erro, corrija o conteúdo e grave de novo. A proposta nunca altera o produto; o dono aplica na tela.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    secao: z.enum(SECOES).describe("A seção da proposta"),
    conteudo: z.record(z.string(), z.any()).describe("O conteúdo da seção, no formato do roteiro"),
  }),
  // Escreve so na proposta; gravar de novo substitui a secao (mesmo resultado).
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async executar({ sku, secao, conteudo }, contexto) {
    exigirProposta(contexto);
    const produto = await prisma.produto.findUnique({ where: { sku }, select: { conferido: true } });
    if (!produto) throw new ErroDeFerramenta(`O produto ${sku} não existe no Rise.`);
    if (produto.conferido) recusarConferido(sku);
    const gravado = await gravarProposta(sku, { secao, conteudo });
    // A mensagem da validacao volta como esta: e com ela que a conversa corrige a secao.
    if (!gravado.ok) throw new ErroDeFerramenta(`A seção ${secao} não foi gravada: ${gravado.erro}`);
    return { secoes: gravado.secoes, aviso: gravado.aviso ?? null };
  },
};

const ROTEIRO_DA_PROPOSTA = {
  nome: "roteiroDaProposta",
  descricao:
    "Primeira chamada de toda proposta: devolve o roteiro (as regras, o formato e a ordem das ferramentas) e a versão dele. Siga exatamente; é o mesmo para qualquer assistente. canal: 'produto' (padrão) para o cadastro do produto, 'li' para o anúncio da Loja Integrada, 'ml' para o do Mercado Livre.",
  esquema: z.object({
    canal: z.enum(["produto", "li", "ml"]).optional().describe("De qual proposta: 'produto' (padrão, o cadastro), 'li' (anúncio da Loja Integrada) ou 'ml' (anúncio do Mercado Livre)"),
  }),
  anotacoes: SO_LEITURA,
  async executar({ canal = "produto" }, contexto) {
    if (canal === "li") {
      exigirPropostaDeAnuncio(contexto, "li");
      return { canal, versao: VERSAO_ROTEIRO_LI, roteiro: ROTEIRO_LI };
    }
    if (canal === "ml") {
      exigirPropostaDeAnuncio(contexto, "ml");
      return { canal, versao: VERSAO_ROTEIRO_ML, roteiro: ROTEIRO_ML };
    }
    exigirProposta(contexto);
    return { versao: VERSAO_DO_ROTEIRO, roteiro: ROTEIRO };
  },
};

export const FERRAMENTAS_DA_PROPOSTA = [ROTEIRO_DA_PROPOSTA, LER_PARA_PROPOSTA, LER_PROPOSTA, BAIXAR_CANDIDATAS, FOLHA_DE_CONTATO, GRAVAR_SECAO];

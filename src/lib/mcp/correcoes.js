import { z } from "zod";

import { alternarCorrecao, criarCorrecao, ensaioDaCorrecao, listarCorrecoes } from "@/lib/ia/correcoesBanco";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As Correcoes da descricao pelo chat (spec 2026-11-07, pedido do dono: "eu alimentar esse RAG com os detalhes que tem
 * que ajustar"). O Claude grava o que o dono DITA ("escreva 5V, nunca 5 V"); nunca por conta propria. Quem pode editar o
 * cadastro de Produtos grava e desliga; quem pode ver lista. Nada aqui chama IA.
 */

function exigir(contexto, nivel) {
  if (!contexto.pode("tela.produtos.cadastro", nivel)) {
    throw new ErroDeFerramenta(
      nivel === "editar"
        ? "Este login não pode gravar correções da descrição (precisa editar o cadastro de Produtos)."
        : "Este login não pode ver as correções da descrição (precisa ver o cadastro de Produtos).",
    );
  }
}

const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const GRAVAR = {
  nome: "gravarCorrecaoDaDescricao",
  descricao: [
    "Grava uma Correção da descrição que o dono DITOU nesta conversa (nunca por iniciativa sua): TROCA (errado → certo; o Rise aplica no texto de toda descrição) ou REGRA (instrução de estilo, só vai para a IA).",
    "Ponha em explicacao as palavras do dono. prompt = o nome do prompt da descrição quando a correção vale só para ele; sem prompt vale para todas.",
    "Devolve a correção e, numa TROCA, um ensaio do que ela mudaria em até 3 descrições recentes. Antes de gravar, confira com listarCorrecoesDaDescricao se já existe.",
  ].join(" "),
  esquema: z.object({
    tipo: z.enum(["TROCA", "REGRA"]).describe("TROCA: troca o texto errado pelo certo. REGRA: instrução de estilo para a IA"),
    errado: z.string().trim().max(120).optional().describe("Na TROCA: o texto como a IA escreve hoje, ex.: '5 V'"),
    certo: z.string().trim().min(1).max(120).describe("Na TROCA: o texto certo, ex.: '5V'. Na REGRA: a instrução, ex.: 'Garantia sempre em meses'"),
    explicacao: z.string().trim().max(500).optional().describe("As palavras do dono, para lembrar o porquê"),
    prompt: z.string().trim().max(120).optional().describe("O nome do prompt da descrição, quando vale só para ele"),
    sku: z.string().trim().max(60).optional().describe("O produto em que o dono viu o erro, se houver"),
  }),
  anotacoes: ESCRITA,
  async executar({ tipo, errado, certo, explicacao, prompt, sku }, contexto) {
    exigir(contexto, "editar");
    const resultado = await criarCorrecao({ tipo, errado, certo, explicacao, promptNome: prompt }, { quem: contexto.usuario, origem: "CHAT", produtoSku: sku });
    if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro ?? Object.values(resultado.erros).join(" "));
    return { correcao: resultado.correcao, ensaio: await ensaioDaCorrecao(resultado.correcao) };
  },
};

const LISTAR = {
  nome: "listarCorrecoesDaDescricao",
  descricao: "Lista as Correções da descrição do dono (as TROCAs que o Rise aplica e as REGRAs que vão para a IA), a mais nova primeiro. Com prompt, só as que valem para ele (as de todas as descrições e as dele). ativas: true (o padrão) só as ligadas; false só as desligadas.",
  esquema: z.object({
    prompt: z.string().trim().max(120).optional().describe("O nome do prompt da descrição"),
    ativas: z.boolean().optional().describe("true (padrão): só as ligadas; false: só as desligadas"),
  }),
  anotacoes: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async executar({ prompt, ativas }, contexto) {
    exigir(contexto, "ver");
    return { correcoes: await listarCorrecoes({ promptNome: prompt, ativas: ativas ?? true }) };
  },
};

const DESLIGAR = {
  nome: "desligarCorrecaoDaDescricao",
  descricao: "Desliga uma Correção da descrição (não apaga: o dono religa na tela Configurações → Correções da descrição). Só quando o dono pedir. Use o id que listarCorrecoesDaDescricao devolve.",
  esquema: z.object({ id: z.string().trim().min(1).max(60).describe("O id da correção") }),
  anotacoes: { ...ESCRITA, idempotentHint: true },
  async executar({ id }, contexto) {
    exigir(contexto, "editar");
    const resultado = await alternarCorrecao(id, false);
    if (!resultado.ok) throw new ErroDeFerramenta("Correção não encontrada.");
    return { correcao: resultado.correcao };
  },
};

export const FERRAMENTAS_DE_CORRECOES = [GRAVAR, LISTAR, DESLIGAR];

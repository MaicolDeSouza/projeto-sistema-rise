"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { PARCEIROS } from "@/lib/cadastros";
import {
  cnpjOpcional,
  decimal,
  ehUrlSegura,
  errosPorCampo,
  lerCampos,
  opcional,
} from "@/lib/validacao";

/**
 * Acoes da secao Cadastros (fornecedores, concorrentes, transportadoras e
 * marcas). Clientes tem as suas em `acoes-clientes.js`.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma
 * constante exportada faz o Next recusar o modulo inteiro.
 *
 * Tudo aqui grava so no banco local — nenhuma chamada a marketplace ou ERP.
 */

const site = opcional(z.string().refine(ehUrlSegura, "Informe um endereco http ou https."));

const BaseSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  site,
  telefone: opcional(z.string()),
  email: opcional(z.string().email("Informe um e-mail valido.")),
  observacoes: opcional(z.string()),
});

const prazoEntregaDias = opcional(
  z.coerce
    .number({ message: "Informe um numero valido." })
    .int("Use um numero inteiro.")
    .min(0, "Nao pode ser negativo."),
);

const FornecedorSchema = BaseSchema.extend({
  fonteId: opcional(z.string()),
  cnpj: cnpjOpcional(),
  contato: opcional(z.string()),
  prazoEntregaDias,
  condicoesPagamento: opcional(z.string()),
  pedidoMinimo: decimal(),
});

// Concorrente nao tem os campos de negociacao: nao se compra dele. O zod
// descarta o que nao esta no schema, entao um POST com "cnpj" nao grava nada.
const ConcorrenteSchema = BaseSchema.extend({ fonteId: opcional(z.string()) });

// A transportadora NAO esta aqui: ganhou formulario em abas e a acao propria em
// `acoes-transportadoras.js`.
const ESQUEMAS = {
  fornecedores: FornecedorSchema,
  concorrentes: ConcorrenteSchema,
};

/**
 * Cadastro simples de nome + observacao (marca). Marca e sempre em MAIUSCULAS,
 * como o campo Marca do produto (pedido do dono em 16/09/2026). O parametro
 * `maiusculas` sobrou de quando a condicao de pagamento (que mantinha o que foi
 * escrito) usava o mesmo esquema.
 */
const cadastroSimples = (mensagem, maiusculas) =>
  z.object({
    nome: z
      .string()
      .trim()
      .min(1, mensagem)
      .transform((valor) => (maiusculas ? valor.toLocaleUpperCase("pt-BR") : valor)),
    observacoes: opcional(z.string().trim()),
  });

const MarcaSchema = cadastroSimples("Informe o nome da marca.", true);

/**
 * Cada secao e uma rota (`/cadastros/fornecedores`, `/marcas`...). Revalidar so
 * "/cadastros" atingiria so a raiz (a pagina dos cartoes); o tipo "layout" cobre
 * tudo o que vive embaixo dela.
 */
function revalidarCadastros() {
  revalidatePath("/cadastros", "layout");
}

/** Opcoes da mesma lista "Fonte de coleta" do cadastro completo. */
export async function fontesParaCadastroRapidoFornecedor() {
  return prisma.fonteColeta.findMany({
    where: { tipo: "FORNECEDOR" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, dominio: true },
  });
}

export async function fontesParaCadastroRapidoConcorrente() {
  return prisma.fonteColeta.findMany({
    where: { tipo: { in: ["CONCORRENTE", "OUTRO"] } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, dominio: true },
  });
}

// ---------------------------------------------------------------------------
// Fornecedores, concorrentes e transportadoras
// ---------------------------------------------------------------------------

/**
 * Cria (`id` nulo) ou atualiza um fornecedor, concorrente ou transportadora.
 * `slug` e o trecho da URL.
 */
export async function salvarParceiro(slug, id, _anterior, formData) {
  const config = PARCEIROS[slug];
  if (!config || !ESQUEMAS[slug]) return { ok: false, erro: "Cadastro desconhecido." };

  const analise = ESQUEMAS[slug].safeParse(lerCampos(formData));
  if (!analise.success) return { ok: false, erros: errosPorCampo(analise) };

  const dados = { ...analise.data, ativo: formData.get("ativo") === "on" };

  // A tela so oferece fontes do mesmo tipo, mas o valor vem do navegador.
  if (dados.fonteId) {
    const fonte = await prisma.fonteColeta.findUnique({
      where: { id: dados.fonteId },
      select: { tipo: true },
    });
    if (!fonte || !config.tiposDeFonte.includes(fonte.tipo)) {
      return { ok: false, erros: { fonteId: `Escolha uma fonte de ${config.singular}.` } };
    }
  }

  const modelo = prisma[config.modelo];

  try {
    if ((slug === "fornecedores" || slug === "concorrentes") && !id) {
      const existente = await modelo.findFirst({
        where: { nome: { equals: dados.nome, mode: "insensitive" } },
        select: { id: true },
      });
      if (existente) return { ok: false, erros: { nome: `Este ${config.singular} ja esta cadastrado. Selecione-o na lista.` } };
    }
    const salvo = id
      ? await modelo.update({ where: { id }, data: dados })
      : await modelo.create({ data: dados });

    revalidarCadastros();
    return { ok: true, id: salvo.id };
  } catch (erro) {
    if (erro?.code === "P2002") {
      return {
        ok: false,
        erros: { nome: `Ja existe ${config.artigo} ${config.singular} com este nome.` },
      };
    }
    if (erro?.code === "P2025") {
      return { ok: false, erro: "Este cadastro nao existe mais. Volte para a lista." };
    }
    return { ok: false, erro: erro?.message ?? "Nao foi possivel salvar." };
  }
}

/**
 * O que ainda usa o cadastro e impede a exclusao, ou `null` se nada usa.
 *
 * Fornecedor que abastece produto e transportadora preferida por cliente NAO sao
 * apagados: os dois vinculos sao `Restrict` de proposito (apagar levaria o
 * historico de custo, ou esconderia a preferencia do cliente sem ninguem ver). Em
 * vez de deixar o banco estourar um erro de chave, a contagem vira o recado.
 */
async function recadoDeUso(slug, id) {
  if (slug === "fornecedores") {
    const usos = await prisma.produtoFornecedor.count({ where: { fornecedorId: id } });
    if (usos > 0) {
      return `Este fornecedor abastece ${usos} produto(s) do catalogo. Remova o vinculo em cada produto antes de excluir.`;
    }
  }

  if (slug === "transportadoras") {
    const usos = await prisma.cliente.count({ where: { transportadoraId: id } });
    if (usos > 0) {
      return `Esta transportadora e a preferida de ${usos} cliente(s). Troque a transportadora deles antes de excluir.`;
    }
  }

  return null;
}

/** Exclui um fornecedor, concorrente ou transportadora. A fonte ligada nao e tocada. */
export async function excluirParceiro(slug, id) {
  const config = PARCEIROS[slug];
  if (!config) return { ok: false, erro: "Cadastro desconhecido." };

  const recado = await recadoDeUso(slug, id);
  if (recado) return { ok: false, erro: recado };

  try {
    await prisma[config.modelo].delete({ where: { id } });
  } catch (erro) {
    // Ja excluido por outra aba: o resultado que o operador queria.
    if (erro?.code !== "P2025") {
      return { ok: false, erro: erro?.message ?? "Nao foi possivel excluir." };
    }
  }

  revalidarCadastros();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Marcas (nome + observacao, edicao na linha)
// ---------------------------------------------------------------------------

async function salvarSimples({ modelo, esquema, id, dados, jaExiste, naoExiste }) {
  const analise = esquema.safeParse({
    nome: String(dados?.nome ?? ""),
    observacoes: String(dados?.observacoes ?? ""),
  });
  if (!analise.success) return { ok: false, erros: errosPorCampo(analise) };

  try {
    if (id) await modelo.update({ where: { id }, data: analise.data });
    else await modelo.create({ data: analise.data });

    revalidarCadastros();
    return { ok: true };
  } catch (erro) {
    if (erro?.code === "P2002") return { ok: false, erros: { nome: jaExiste } };
    if (erro?.code === "P2025") return { ok: false, erro: naoExiste };
    return { ok: false, erro: erro?.message ?? "Nao foi possivel salvar." };
  }
}

async function excluirSimples(modelo, id) {
  try {
    await modelo.delete({ where: { id } });
  } catch (erro) {
    if (erro?.code !== "P2025") {
      return { ok: false, erro: erro?.message ?? "Nao foi possivel excluir." };
    }
  }

  revalidarCadastros();
  return { ok: true };
}

/** Cria (`id` nulo) ou atualiza uma marca. Chamada pela edicao na linha. */
export async function salvarMarca(id, dados) {
  return salvarSimples({
    modelo: prisma.marca,
    esquema: MarcaSchema,
    id,
    dados,
    jaExiste: "Esta marca ja esta cadastrada.",
    naoExiste: "Esta marca nao existe mais. Atualize a pagina.",
  });
}

export async function excluirMarca(id) {
  return excluirSimples(prisma.marca, id);
}

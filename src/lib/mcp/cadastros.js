import { z } from "zod";

import { prisma } from "@/lib/db";
import { RESTRITO } from "@/lib/riseAi/busca";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { formatarTelefone } from "@/lib/telefone";

/**
 * Os cadastros pelo MCP (pedido do dono em 20/10/2026: "adicione todas as opções que estão em Cadastros"): fornecedores,
 * concorrentes, transportadoras, marcas e clientes. Produtos ja tem as ferramentas do catalogo. So leitura.
 *
 * Acessos: fornecedores so com `dado.custo` (o cadastro deles e a negociacao: prazo, condicoes, pedido minimo) e
 * concorrentes so com `dado.concorrentes`. Clientes: o nome, o tipo, a cidade e a transportadora para todos; documento,
 * telefones, e-mails, endereco, contatos e observacoes so com `dado.pessoalDoCliente` (sem ele, "[restrito]", e a busca
 * nao procura no documento nem no contato, para nao confirmar que um CPF existe). O dono escolheu dar os clientes ao MCP
 * sabendo que esses dados vao para a nuvem do Claude ou do ChatGPT de quem pergunta.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const emTexto = (data) => (data instanceof Date ? data.toISOString() : null);
const telefones = (principal, outros = []) => [principal, ...(outros ?? [])].filter(Boolean).map(formatarTelefone);
const contem = (palavra) => ({ contains: palavra, mode: "insensitive" });
const palavrasDe = (termos) => String(termos ?? "").trim().split(/\s+/).filter(Boolean);

const ESQUEMA_LISTA = z.object({
  termos: z.string().trim().max(120).optional().describe("Palavras do nome (todas exigidas); vazio = todos"),
  incluirInativos: z.boolean().optional().describe("Trazer também os inativos"),
  limite: z.number().int().min(1).max(100).optional().describe("Quantos devolver (1 a 100; padrão 50). O total vem junto"),
});

/** `where` de uma lista: cada palavra em algum dos campos (todas exigidas) e, sem `incluirInativos`, so os ativos. */
function ondeDaLista({ termos, incluirInativos }, campos, { comAtivo = true } = {}) {
  const condicoes = palavrasDe(termos).map((palavra) => ({ OR: campos.map((campo) => ({ [campo]: contem(palavra) })) }));
  if (comAtivo && !incluirInativos) condicoes.push({ ativo: true });
  return { AND: condicoes };
}

const SELECAO_DA_FONTE = { select: { nome: true, dominio: true, ultimaColetaEm: true, _count: { select: { produtos: true } } } };
const fonteParaTela = (fonte) => (fonte ? { nome: fonte.nome, dominio: fonte.dominio, ultimaColetaEm: emTexto(fonte.ultimaColetaEm), produtosColetados: fonte._count.produtos } : null);

// ---------------------------------------------------------------------------

export async function listarFornecedores({ termos, incluirInativos = false, limite = 50 }, { pode }) {
  if (!pode("dado.custo", "ver")) throw new ErroDeFerramenta("Este login não pode ver os fornecedores (precisa do acesso a custo e fornecedores).");
  const where = ondeDaLista({ termos, incluirInativos }, ["nome", "cnpj", "site"]);
  const [total, linhas] = await Promise.all([
    prisma.fornecedor.count({ where }),
    prisma.fornecedor.findMany({ where, orderBy: { nome: "asc" }, take: limite, include: { fonte: SELECAO_DA_FONTE, _count: { select: { produtos: true } } } }),
  ]);
  return {
    total,
    fornecedores: linhas.map((linha) => ({
      nome: linha.nome,
      cnpj: linha.cnpj ?? null,
      estrangeiro: linha.estrangeiro,
      site: linha.site ?? null,
      contato: linha.contato ?? null,
      telefone: linha.telefone ? formatarTelefone(linha.telefone) : null,
      email: linha.email ?? null,
      prazoEntregaDias: linha.prazoEntregaDias ?? null,
      condicoesPagamento: linha.condicoesPagamento ?? null,
      pedidoMinimo: numero(linha.pedidoMinimo),
      observacoes: linha.observacoes ?? null,
      ativo: linha.ativo,
      fonte: fonteParaTela(linha.fonte),
      // Produtos do Rise com este fornecedor vinculado (aba Fornecedores do cadastro).
      produtosVinculados: linha._count.produtos,
    })),
  };
}

export async function listarConcorrentes({ termos, incluirInativos = false, limite = 50 }, { pode }) {
  if (!pode("dado.concorrentes", "ver")) throw new ErroDeFerramenta("Este login não pode ver os concorrentes.");
  const where = ondeDaLista({ termos, incluirInativos }, ["nome", "site"]);
  const [total, linhas] = await Promise.all([
    prisma.concorrente.count({ where }),
    prisma.concorrente.findMany({ where, orderBy: { nome: "asc" }, take: limite, include: { fonte: SELECAO_DA_FONTE } }),
  ]);
  // Produtos do Rise ligados a algum produto coletado desta loja (aba Concorrentes do cadastro): uma contagem por fonte.
  const fontes = linhas.map((linha) => linha.fonteId).filter(Boolean);
  const ligados = fontes.length
    ? await prisma.$queryRaw`
        SELECT c."fonteId", COUNT(DISTINCT pc."produtoId")::int AS quantos
          FROM "ProdutoConcorrente" pc JOIN "ProdutoColetado" c ON c.id = pc."produtoColetadoId"
         WHERE c."fonteId" = ANY(${fontes}) GROUP BY c."fonteId"`
    : [];
  const ligadosDe = new Map(ligados.map((linha) => [linha.fonteId, linha.quantos]));
  return {
    total,
    concorrentes: linhas.map((linha) => ({
      nome: linha.nome,
      site: linha.site ?? null,
      telefone: linha.telefone ? formatarTelefone(linha.telefone) : null,
      email: linha.email ?? null,
      observacoes: linha.observacoes ?? null,
      ativo: linha.ativo,
      fonte: fonteParaTela(linha.fonte),
      produtosVinculados: linha.fonteId ? (ligadosDe.get(linha.fonteId) ?? 0) : 0,
    })),
  };
}

// Os rotulos do formulario de Transportadoras (`FormularioTransportadora.jsx`, que e de cliente e nao se importa daqui).
const MODALIDADES = { CORREIOS: "Correios", RODOVIARIA: "Transportadora rodoviária", ENTREGA_LOCAL: "Entrega local (motoboy)", OUTRA: "Outra" };

export async function listarTransportadoras({ termos, incluirInativos = false, limite = 50 }) {
  const where = ondeDaLista({ termos, incluirInativos }, ["nome", "nomeFantasia", "cidade"]);
  const [total, linhas] = await Promise.all([
    prisma.transportadora.count({ where }),
    prisma.transportadora.findMany({ where, orderBy: { nome: "asc" }, take: limite, include: { _count: { select: { clientes: true } } } }),
  ]);
  return {
    total,
    transportadoras: linhas.map((linha) => ({
      nome: linha.nome,
      nomeFantasia: linha.nomeFantasia ?? null,
      cnpj: linha.cnpj ?? null,
      modalidade: linha.modalidade ? MODALIDADES[linha.modalidade] : null,
      urlRastreamento: linha.urlRastreamento ?? null,
      site: linha.site ?? null,
      cidade: linha.cidade ?? null,
      uf: linha.uf ?? null,
      telefone: telefones(linha.telefone)[0] ?? null,
      outrosTelefones: telefones(null, linha.telefonesAdicionais),
      email: linha.email ?? null,
      outrosEmails: linha.emailsAdicionais ?? [],
      contato: linha.contato ?? null,
      prazoEntregaDias: linha.prazoEntregaDias ?? null,
      observacoes: linha.observacoes ?? null,
      ativo: linha.ativo,
      // Clientes que a tem como preferida.
      clientes: linha._count.clientes,
    })),
  };
}

export async function listarMarcas({ termos, limite = 50 }) {
  const where = ondeDaLista({ termos }, ["nome"], { comAtivo: false });
  const [total, linhas] = await Promise.all([prisma.marca.count({ where }), prisma.marca.findMany({ where, orderBy: { nome: "asc" }, take: limite })]);
  // A marca do produto e texto (em MAIUSCULAS, como o cadastro de Marcas): conta-se pelo nome.
  const contagens = linhas.length
    ? await prisma.produto.groupBy({ by: ["marca"], where: { marca: { in: linhas.map((linha) => linha.nome) } }, _count: { _all: true } })
    : [];
  const produtosDe = new Map(contagens.map((linha) => [linha.marca, linha._count._all]));
  return { total, marcas: linhas.map((linha) => ({ nome: linha.nome, observacoes: linha.observacoes ?? null, produtos: produtosDe.get(linha.nome) ?? 0 })) };
}

const TIPOS_DE_PESSOA = { FISICA: "Pessoa Física", JURIDICA: "Pessoa Jurídica" };
const enderecoParaTela = (endereco) =>
  endereco
    ? { cep: endereco.cep ?? null, uf: endereco.uf ?? null, cidade: endereco.cidade ?? null, bairro: endereco.bairro ?? null, logradouro: endereco.logradouro ?? null, numero: endereco.numero ?? null, complemento: endereco.complemento ?? null }
    : null;

export async function listarClientes({ termos, incluirInativos = false, limite = 50 }, { pode }) {
  const pessoal = pode("dado.pessoalDoCliente", "ver");
  // Sem o acesso, a busca so olha o nome: procurar no documento ou no contato confirmaria que um CPF ou telefone existe.
  const campos = pessoal ? ["nome", "nomeFantasia", "documento", "email", "telefone"] : ["nome", "nomeFantasia"];
  const where = ondeDaLista({ termos, incluirInativos }, campos);
  const [total, linhas] = await Promise.all([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({ where, orderBy: { nome: "asc" }, take: limite, include: { enderecos: true, contatos: true, transportadora: { select: { nome: true } } } }),
  ]);
  return {
    total,
    clientes: linhas.map((linha) => {
      const geral = linha.enderecos.find((endereco) => endereco.tipo === "GERAL") ?? null;
      const entrega = linha.enderecos.find((endereco) => endereco.tipo === "ENTREGA") ?? null;
      const so = (valor) => (pessoal ? valor : RESTRITO);
      return {
        nome: linha.nome,
        tipoPessoa: TIPOS_DE_PESSOA[linha.tipoPessoa] ?? linha.tipoPessoa,
        nomeFantasia: linha.nomeFantasia ?? null,
        cidade: geral?.cidade ?? null,
        uf: geral?.uf ?? null,
        clienteDesde: linha.clienteDesde ? linha.clienteDesde.toISOString().slice(0, 10) : null,
        transportadora: linha.transportadora?.nome ?? null,
        ativo: linha.ativo,
        documento: so(linha.documento ?? null),
        inscricaoEstadual: so(linha.ieIsento ? "isento" : (linha.inscricaoEstadual ?? null)),
        telefone: so(telefones(linha.telefone)[0] ?? null),
        outrosTelefones: so(telefones(null, linha.telefonesAdicionais)),
        email: so(linha.email ?? null),
        outrosEmails: so(linha.emailsAdicionais ?? []),
        endereco: so(enderecoParaTela(geral)),
        // Sem linha de entrega, a entrega e no endereco geral ("Mesmo endereço do Geral").
        enderecoDeEntrega: so(entrega ? enderecoParaTela(entrega) : "o mesmo endereço"),
        contatos: so(linha.contatos.map((contato) => ({ nome: contato.nome, cargo: contato.cargo ?? null, telefone: contato.telefone ? formatarTelefone(contato.telefone) : null, email: contato.email ?? null }))),
        observacoes: so(linha.observacoes ?? null),
      };
    }),
  };
}

// ---------------------------------------------------------------------------

export const FERRAMENTAS_DE_CADASTRO = [
  {
    nome: "listarFornecedores",
    descricao: "Os fornecedores cadastrados: CNPJ, site, contato, prazo de entrega, condições de pagamento, pedido mínimo, a fonte coletada (quantos produtos e a última varredura) e quantos produtos do Rise têm o fornecedor vinculado. Só os ativos, salvo incluirInativos.",
    esquema: ESQUEMA_LISTA,
    executar: listarFornecedores,
  },
  {
    nome: "listarConcorrentes",
    descricao: "Os concorrentes cadastrados: site, contato, a fonte coletada (quantos produtos e a última varredura) e quantos produtos do Rise estão ligados a algum produto dele. Só os ativos, salvo incluirInativos.",
    esquema: ESQUEMA_LISTA,
    executar: listarConcorrentes,
  },
  {
    nome: "listarTransportadoras",
    descricao: "As transportadoras cadastradas: modalidade, rastreamento, cidade, telefones, e-mails, contato, prazo de entrega e quantos clientes a têm como preferida.",
    esquema: ESQUEMA_LISTA,
    executar: listarTransportadoras,
  },
  {
    nome: "listarMarcas",
    descricao: "As marcas cadastradas, com quantos produtos do Rise usam cada uma.",
    esquema: ESQUEMA_LISTA,
    executar: listarMarcas,
  },
  {
    nome: "listarClientes",
    descricao: "Os clientes cadastrados (pessoa física ou jurídica): nome, cidade, transportadora preferida e, para quem pode ver dados pessoais, documento, telefones, e-mails, endereço, contatos e observações. '[restrito]' = este login não pode ver aquele dado; não peça nem deduza.",
    esquema: ESQUEMA_LISTA,
    executar: listarClientes,
  },
];

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Package, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { PARCEIROS } from "@/lib/cadastros";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import TabelaClientes from "@/components/cadastros/TabelaClientes";
import TabelaParceiros from "@/components/cadastros/TabelaParceiros";
import TabelaSimples from "@/components/cadastros/TabelaSimples";
import {
  excluirCondicao,
  excluirMarca,
  salvarCondicao,
  salvarMarca,
} from "@/app/cadastros/acoes";

export const dynamic = "force-dynamic";

const contem = (campo, busca) => ({ [campo]: { contains: busca, mode: "insensitive" } });

const SECOES = {
  clientes: { plural: "Clientes", singular: "cliente", novo: "Novo" },
  ...PARCEIROS,
  produtos: { plural: "Produtos" },
  marcas: { plural: "Marcas" },
  condicoes: { plural: "Condicoes de pagamento" },
};

/** Redacao de cada cadastro simples (nome + observacao), para a `TabelaSimples`. */
const TEXTOS_MARCA = {
  item: "marca",
  coluna: "Marca",
  nova: "Nova marca",
  buscar: "Buscar marca",
  vazio: "Nenhuma marca cadastrada ainda.",
  tituloExcluir: "Excluir marca?",
  avisoExcluir: "Produtos que ja usam esta marca nao sao alterados: o campo Marca deles e texto proprio.",
};

const TEXTOS_CONDICAO = {
  item: "condicao",
  coluna: "Condicao de pagamento",
  nova: "Nova condicao",
  buscar: "Buscar condicao",
  vazio: "Nenhuma condicao de pagamento cadastrada ainda.",
  tituloExcluir: "Excluir condicao de pagamento?",
  avisoExcluir: "Condicao preferida por algum cliente nao pode ser excluida.",
};

/**
 * Uma secao de Cadastros, escolhida pelo subitem do menu (`/cadastros/<tipo>`).
 * Fornecedores, concorrentes e transportadoras compartilham tabela e formulario
 * (ver `PARCEIROS`); marcas e condicoes de pagamento compartilham a tabela com
 * edicao na linha; clientes e produtos tem tela propria.
 */
export default async function SecaoDeCadastrosPage({ params, searchParams }) {
  const { tipo } = await params;
  const secao = SECOES[tipo];
  if (!secao) notFound();

  const consulta = await searchParams;
  const busca = (consulta?.q ?? "").trim();
  const ehParceiro = tipo in PARCEIROS;

  let parceiros = [];
  let clientes = [];
  let itens = [];
  let totalProdutos = 0;
  let erro = null;

  try {
    if (tipo === "clientes") {
      const registros = await prisma.cliente.findMany({
        where: busca
          ? { OR: [contem("nome", busca), contem("documento", busca), contem("email", busca), contem("nomeFantasia", busca)] }
          : undefined,
        orderBy: { nome: "asc" },
        include: {
          enderecos: { where: { tipo: "GERAL" }, select: { cidade: true, uf: true } },
        },
      });
      clientes = registros.map((r) => {
        const geral = r.enderecos[0];
        return {
          id: r.id,
          nome: r.nome,
          nomeFantasia: r.nomeFantasia,
          documento: r.documento,
          tipoPessoa: r.tipoPessoa,
          ativo: r.ativo,
          contato: [r.telefone, r.email].filter(Boolean).join(" · "),
          cidade: geral ? [geral.cidade, geral.uf].filter(Boolean).join("/") : "",
        };
      });
    } else if (tipo === "fornecedores") {
      const registros = await prisma.fornecedor.findMany({
        where: busca
          ? { OR: [contem("nome", busca), contem("contato", busca), contem("cnpj", busca), contem("site", busca)] }
          : undefined,
        orderBy: { nome: "asc" },
        include: {
          fonte: { select: { id: true, tipo: true, ativa: true } },
          _count: { select: { produtos: true } },
        },
      });
      parceiros = registros.map((r) => ({
        id: r.id,
        nome: r.nome,
        contato: [r.contato, r.telefone, r.email].filter(Boolean).join(" · "),
        site: r.site,
        ativo: r.ativo,
        fonte: r.fonte,
        usos: r._count.produtos,
      }));
    } else if (tipo === "concorrentes") {
      const registros = await prisma.concorrente.findMany({
        where: busca ? { OR: [contem("nome", busca), contem("site", busca)] } : undefined,
        orderBy: { nome: "asc" },
        include: { fonte: { select: { id: true, tipo: true, ativa: true } } },
      });
      parceiros = registros.map((r) => ({
        id: r.id,
        nome: r.nome,
        contato: [r.telefone, r.email].filter(Boolean).join(" · "),
        site: r.site,
        ativo: r.ativo,
        fonte: r.fonte,
      }));
    } else if (tipo === "transportadoras") {
      const registros = await prisma.transportadora.findMany({
        where: busca
          ? { OR: [contem("nome", busca), contem("contato", busca), contem("cnpj", busca), contem("site", busca)] }
          : undefined,
        orderBy: { nome: "asc" },
        include: { _count: { select: { clientes: true } } },
      });
      parceiros = registros.map((r) => ({
        id: r.id,
        nome: r.nome,
        contato: [r.contato, r.telefone, r.email].filter(Boolean).join(" · "),
        site: r.site,
        ativo: r.ativo,
        fonte: null,
        usos: r._count.clientes,
      }));
    } else if (tipo === "marcas" || tipo === "condicoes") {
      const modelo = tipo === "marcas" ? prisma.marca : prisma.condicaoPagamento;
      itens = await modelo.findMany({
        where: busca ? { OR: [contem("nome", busca), contem("observacoes", busca)] } : undefined,
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, observacoes: true },
      });
    } else {
      totalProdutos = await prisma.produto.count();
    }
  } catch (excecao) {
    erro = excecao;
  }

  const total =
    tipo === "clientes" ? clientes.length : ehParceiro ? parceiros.length : itens.length;
  const comBotaoNovo = tipo === "clientes" || ehParceiro;

  return (
    <>
      <PageHeader
        titulo={secao.plural}
        descricao={
          tipo === "produtos"
            ? `${totalProdutos} produto(s) cadastrado(s).`
            : `${total} ${busca ? "encontrado(s)" : "cadastrado(s)"}.`
        }
        acao={
          comBotaoNovo && (
            <Link
              href={`/cadastros/${tipo}/novo`}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={16} />
              {secao.novo} {secao.singular}
            </Link>
          )
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          {tipo === "clientes" && <TabelaClientes linhas={clientes} busca={busca} />}

          {ehParceiro && <TabelaParceiros linhas={parceiros} slug={tipo} busca={busca} />}

          {tipo === "marcas" && (
            <TabelaSimples
              itens={itens}
              busca={busca}
              salvar={salvarMarca}
              excluir={excluirMarca}
              textos={TEXTOS_MARCA}
              maiusculas
            />
          )}

          {tipo === "condicoes" && (
            <TabelaSimples
              itens={itens}
              busca={busca}
              salvar={salvarCondicao}
              excluir={excluirCondicao}
              textos={TEXTOS_CONDICAO}
            />
          )}

          {tipo === "produtos" && (
            <div className="rounded-lg border border-borda bg-superficie p-6">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-fundo text-suave">
                <Package size={20} />
              </span>
              {/*
                Sem formulario proprio, de proposito (pedido do dono em
                18/09/2026): cadastrar produto aqui abre a MESMA tela do "Novo
                produto" de Produtos. Duas telas para o mesmo cadastro
                acabariam divergindo.
              */}
              <p className="max-w-md text-sm text-suave">
                O cadastro de produto e o mesmo do item Produtos do menu.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/produtos/novo"
                  className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  <Plus size={16} />
                  Cadastrar novo produto
                </Link>
                <Link
                  href="/produtos"
                  className="inline-flex items-center gap-1 text-sm text-acento hover:underline"
                >
                  Ver todos os produtos
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

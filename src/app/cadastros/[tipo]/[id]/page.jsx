import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { PARCEIROS } from "@/lib/cadastros";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import FormularioCliente from "@/components/cadastros/FormularioCliente";
import FormularioParceiro from "@/components/cadastros/FormularioParceiro";

export const dynamic = "force-dynamic";

/** Nulo vira "" — os campos controlados do endereco e dos contatos nao aceitam `value={null}`. */
const texto = (valor) => valor ?? "";

const CAMPOS_DE_ENDERECO = ["cep", "uf", "cidade", "bairro", "logradouro", "numero", "complemento"];

function enderecoParaTela(endereco) {
  if (!endereco) return null;
  return Object.fromEntries(CAMPOS_DE_ENDERECO.map((campo) => [campo, texto(endereco[campo])]));
}

/**
 * Carrega o cliente com o que a tela precisa e o devolve em forma simples: sem
 * `Date` de banco nem `null` nos campos de texto.
 *
 * A transportadora e as condicoes que ele ja tem entram nas listas MESMO
 * inativas — senao editar um cliente apagaria, ao salvar, uma preferencia que a
 * tela nem chegou a mostrar.
 */
async function carregarCliente(id) {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      enderecos: true,
      contatos: { orderBy: { criadoEm: "asc" } },
      condicoesPreferidas: { select: { id: true } },
    },
  });
  if (!cliente) return null;

  const condicoesIds = cliente.condicoesPreferidas.map((condicao) => condicao.id);

  const [transportadoras, condicoes] = await Promise.all([
    prisma.transportadora.findMany({
      where: { OR: [{ ativo: true }, { id: cliente.transportadoraId ?? "" }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.condicaoPagamento.findMany({
      where: { OR: [{ ativo: true }, { id: { in: condicoesIds } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return {
    transportadoras,
    condicoes,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      tipoPessoa: cliente.tipoPessoa,
      documento: texto(cliente.documento),
      clienteDesde: cliente.clienteDesde.toISOString().slice(0, 10),
      sexo: texto(cliente.sexo),
      naturalidade: texto(cliente.naturalidade),
      nomeFantasia: texto(cliente.nomeFantasia),
      regimeTributario: texto(cliente.regimeTributario),
      inscricaoEstadual: texto(cliente.inscricaoEstadual),
      ieIsento: cliente.ieIsento,
      inscricaoMunicipal: texto(cliente.inscricaoMunicipal),
      telefone: texto(cliente.telefone),
      email: texto(cliente.email),
      observacoes: texto(cliente.observacoes),
      ativo: cliente.ativo,
      transportadoraId: texto(cliente.transportadoraId),
      condicoesIds,
      enderecos: {
        geral: enderecoParaTela(cliente.enderecos.find((e) => e.tipo === "GERAL")),
        entrega: enderecoParaTela(cliente.enderecos.find((e) => e.tipo === "ENTREGA")),
      },
      contatos: cliente.contatos.map((contato) => ({
        nome: contato.nome,
        cargo: texto(contato.cargo),
        telefone: texto(contato.telefone),
        email: texto(contato.email),
      })),
    },
  };
}

export default async function EditarCadastroPage({ params }) {
  const { tipo, id } = await params;
  const config = PARCEIROS[tipo];
  if (!config && tipo !== "clientes") notFound();

  let registro = null;
  let dadosDoCliente = null;
  let fontes = [];
  let usos = 0;
  let erro = null;

  try {
    if (tipo === "clientes") {
      dadosDoCliente = await carregarCliente(id);
    } else {
      registro = await prisma[config.modelo].findUnique({ where: { id } });

      if (registro) {
        if (config.tiposDeFonte.length > 0) {
          fontes = await prisma.fonteColeta.findMany({
            where: { tipo: { in: config.tiposDeFonte } },
            orderBy: { nome: "asc" },
            select: { id: true, nome: true, dominio: true },
          });
        }
        if (tipo === "fornecedores") {
          usos = await prisma.produtoFornecedor.count({ where: { fornecedorId: id } });
        }
        if (tipo === "transportadoras") {
          usos = await prisma.cliente.count({ where: { transportadoraId: id } });
        }
      }
    }
  } catch (excecao) {
    erro = excecao;
  }

  if (!erro && !registro && !dadosDoCliente) notFound();

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente: converta aqui.
  const parceiro = registro && {
    ...registro,
    pedidoMinimo: registro.pedidoMinimo != null ? Number(registro.pedidoMinimo) : null,
  };

  const plural = tipo === "clientes" ? "Clientes" : config.plural;
  const titulo = dadosDoCliente?.cliente.nome ?? parceiro?.nome ?? plural;
  const singular = tipo === "clientes" ? "cliente" : config.singular;

  return (
    <>
      <Link
        href={`/cadastros/${tipo}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para {plural}
      </Link>

      <PageHeader titulo={titulo} descricao={`Cadastro de ${singular}.`} />

      {erro ? (
        <AvisoBanco erro={erro} />
      ) : tipo === "clientes" ? (
        <FormularioCliente
          cliente={dadosDoCliente.cliente}
          transportadoras={dadosDoCliente.transportadoras}
          condicoes={dadosDoCliente.condicoes}
          hoje={new Date().toLocaleDateString("sv-SE")}
        />
      ) : (
        <FormularioParceiro slug={tipo} parceiro={parceiro} fontes={fontes} usos={usos} />
      )}
    </>
  );
}

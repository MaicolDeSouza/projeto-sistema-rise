import { headers } from "next/headers";
import { CircleAlert, CircleCheck } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import CartaoConector from "@/components/CartaoConector";
import CartaoAliExpress from "@/components/integracoes/CartaoAliExpress";
import CartaoServidorVps from "@/components/integracoes/CartaoServidorVps";
import { estadoDaChave } from "@/lib/compras/aliexpress/chave";
import { fornecedorDoAliExpress } from "@/lib/compras/aliexpress/fornecedor";
import { prisma } from "@/lib/db";
import { ehOPcDeDesenvolvimento } from "@/lib/vps/regras";
import AvisoBanco from "@/components/ui/AvisoBanco";
import { conectores } from "@/lib/integracoes/registro";
import { listarConexoes } from "@/lib/integracoes/conexoes";
import { config } from "@/lib/integracoes/config";

export const dynamic = "force-dynamic";

// O Personal Token da Loja Integrada vence (o Rise conta 3 meses a partir do salvamento):
// avisa a 30 dias. Calculado aqui, no servidor, porque o relogio no render do cartao
// (componente de cliente) daria um valor diferente a cada render.
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
function tokenVencePerto(conector, conexao) {
  if (conector.id !== "LOJA_INTEGRADA" || !conexao?.expiraEm) return false;
  return new Date(conexao.expiraEm).getTime() - Date.now() <= TRINTA_DIAS_MS;
}

export default async function IntegracoesPage({ searchParams }) {
  // Acessos: a tela em ver; conectar, testar, desconectar e salvar chaves com editar. O cartao da VPS continua so no PC.
  const { pode } = await exigirAcessoNaPagina("tela.integracoes", "ver");
  const podeEditar = pode("tela.integracoes", "editar");
  const params = await searchParams;

  let conexoes = new Map();
  let erroBanco = null;

  // Cartao AliExpress (spec 2026-10-28): estado da chave, a ultima importacao (o log do ultimo clique) e o fornecedor.
  let aliexpress = null;
  try {
    conexoes = await listarConexoes();
    const [estado, ultimo, marcado, fornecedores] = await Promise.all([
      estadoDaChave(),
      prisma.logIntegracao.findFirst({ where: { servico: "ALIEXPRESS", endpoint: "importar/lista" }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true, responseResumo: true, erro: true } }),
      fornecedorDoAliExpress(),
      prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    ]);
    aliexpress = {
      estado: JSON.parse(JSON.stringify(estado)),
      ultimaImportacao: ultimo ? { em: ultimo.criadoEm.toISOString(), resumo: ultimo.erro ?? ultimo.responseResumo } : null,
      fornecedorMarcado: marcado ? { id: marcado.id, nome: marcado.nome } : null,
      fornecedores,
    };
  } catch (excecao) {
    erroBanco = excecao;
  }

  // Cartao "Servidor VPS": so no Rise do PC, aberto em localhost (nunca na VPS, nunca pela rede local).
  const mostrarServidorVps = ehOPcDeDesenvolvimento(process.env, (await headers()).get("host"));

  const travasLigadas =
    config.travas.mlPublicacao ||
    config.travas.blingEscrita ||
    config.travas.liEscrita;

  // Os conectores carregam funcoes, que nao atravessam a fronteira
  // servidor/cliente. Manda so o que a tela precisa exibir.
  const paraTela = conectores.map((conector) => ({
    id: conector.id,
    nome: conector.nome,
    descricao: conector.descricao,
    tipoAuth: conector.tipoAuth,
    origemOAuth: conector.origemOAuth,
    campos: conector.campos ?? [],
    configurado: conector.configurado,
    faltando: conector.faltando,
    bloqueado: conector.bloqueado ?? null,
    painel: conector.painel ?? null,
  }));

  return (
    <>
      <PageHeader
        titulo="Integrações"
        voltarPara="/configuracoes"
        voltarRotulo="Configurações"
        somenteLeitura={podeEditar ? null : "Seu acesso a Integrações é de leitura"}
        descricao="Conexões com os sistemas externos. Conecte a conta, acompanhe a situação e teste o acesso quando precisar."
      />

      {params?.erro && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.erro}
        </p>
      )}
      {params?.conectado && (
        <p className="mb-4 rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {params.conectado} conectado com sucesso.
        </p>
      )}

      <div
        className={`mb-6 flex items-start gap-2 rounded border px-4 py-3 text-sm ${
          travasLigadas
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-borda bg-superficie text-suave"
        }`}
      >
        {travasLigadas ? (
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
        ) : (
          <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        )}
        <span>
          {travasLigadas ? (
            <>
              <strong>Escrita liberada.</strong> Publicação no Mercado Livre:{" "}
              {config.travas.mlPublicacao ? "ligada" : "desligada"} · Escrita no
              Bling: {config.travas.blingEscrita ? "ligada" : "desligada"} ·
              Escrita na Loja Integrada:{" "}
              {config.travas.liEscrita ? "ligada" : "desligada"}.
            </>
          ) : (
            <>
              <strong>Somente leitura.</strong> As travas{" "}
              <code>ML_PUBLICACAO</code>, <code>BLING_ESCRITA</code> e{" "}
              <code>LI_ESCRITA</code> estão desligadas: nada é
              escrito nas plataformas.
            </>
          )}
        </span>
      </div>

      {erroBanco && <AvisoBanco erro={erroBanco} />}

      {/*
        O "Servidor VPS" entra na mesma grade, no desenho dos conectores, e aparece mesmo com o banco do PC fora do
        ar: trazer o banco da VPS e justamente o que resolve uma copia quebrada.
      */}
      <div className={`grid gap-4 lg:grid-cols-2 xl:grid-cols-3 ${erroBanco ? "mt-4" : ""}`}>
        {!erroBanco &&
          paraTela.map((conector) => (
            <CartaoConector
              key={conector.id}
              conector={conector}
              conexao={conexoes.get(conector.id) ?? null}
              podeEditar={podeEditar}
              tokenPertoDoVencimento={tokenVencePerto(
                conector,
                conexoes.get(conector.id),
              )}
            />
          ))}
        {aliexpress && <CartaoAliExpress {...aliexpress} podeEditar={podeEditar} />}
        {mostrarServidorVps && <CartaoServidorVps />}
      </div>
    </>
  );
}

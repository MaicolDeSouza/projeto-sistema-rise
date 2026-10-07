import { CircleAlert, CircleCheck } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import CartaoConector from "@/components/CartaoConector";
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
  const params = await searchParams;

  let conexoes = new Map();
  let erroBanco = null;

  try {
    conexoes = await listarConexoes();
  } catch (excecao) {
    erroBanco = excecao;
  }

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
  }));

  return (
    <>
      <PageHeader
        titulo="Integracoes"
        descricao="Conexoes com os sistemas externos. Conecte a conta, acompanhe a situacao e teste o acesso quando precisar."
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
              <strong>Escrita liberada.</strong> Publicacao no Mercado Livre:{" "}
              {config.travas.mlPublicacao ? "ligada" : "desligada"} · Escrita no
              Bling: {config.travas.blingEscrita ? "ligada" : "desligada"} ·
              Escrita na Loja Integrada:{" "}
              {config.travas.liEscrita ? "ligada" : "desligada"}.
            </>
          ) : (
            <>
              <strong>Somente leitura.</strong> As travas{" "}
              <code>ML_PUBLICACAO</code>, <code>BLING_ESCRITA</code> e{" "}
              <code>LI_ESCRITA</code> estao desligadas: nada e
              escrito nas plataformas.
            </>
          )}
        </span>
      </div>

      {erroBanco ? (
        <AvisoBanco erro={erroBanco} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {paraTela.map((conector) => (
            <CartaoConector
              key={conector.id}
              conector={conector}
              conexao={conexoes.get(conector.id) ?? null}
              tokenPertoDoVencimento={tokenVencePerto(
                conector,
                conexoes.get(conector.id),
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

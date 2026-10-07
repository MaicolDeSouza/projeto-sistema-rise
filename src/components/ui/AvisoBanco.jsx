import { DatabaseZap, Bug } from "lucide-react";

/**
 * Mostrado quando uma consulta ao Postgres falha. Sem isso, o Next exibiria a
 * tela de erro do framework — que nao diz ao operador o que fazer a respeito.
 *
 * DOIS CASOS, e confundi-los custa caro. O aviso dizia "nao foi possivel
 * conversar com o banco de dados" para QUALQUER falha e mandava subir o
 * Postgres: a tela de Anuncios pedia um campo que nao existe mais e o operador
 * foi mandado conferir o banco, que estava perfeito. Erro de consulta e defeito
 * nosso, no codigo da tela; so o primeiro caso tem algo para ele fazer.
 */

/** O banco esta fora do ar, ou a consulta e que esta errada? */
function bancoInacessivel(erro) {
  // P1000-P1002 e P1017 sao os codigos de conexao do Prisma (autenticacao,
  // servidor inalcancavel, tempo esgotado, conexao fechada). A checagem por
  // nome cobre a falha que acontece antes de o cliente ter codigo: o processo
  // nem chegou a falar com o servidor.
  const codigo = erro?.code;
  if (["P1000", "P1001", "P1002", "P1017"].includes(codigo)) return true;
  if (erro?.name === "PrismaClientInitializationError") return true;

  return /can't reach database|connection refused|ECONNREFUSED|server has closed/i.test(
    erro?.message ?? "",
  );
}

export default function AvisoBanco({ erro }) {
  const semBanco = bancoInacessivel(erro);
  const Icone = semBanco ? DatabaseZap : Bug;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-amber-100 p-2 text-amber-700">
          <Icone size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-amber-900">
            {semBanco
              ? "Não foi possível conversar com o banco de dados"
              : "Esta tela pediu ao banco algo que ele não reconhece"}
          </p>

          <p className="mt-1 text-sm text-amber-800">
            {semBanco ? (
              <>
                Verifique se o Postgres está no ar: ele roda como serviço do
                Windows (<code className="rounded bg-amber-100 px-1">postgresql-x64-17</code>)
                e sobe junto com a máquina. Depois recarregue esta página.
              </>
            ) : (
              <>
                O banco está no ar — o defeito é da consulta desta tela, e não há
                nada a fazer no Postgres. A mensagem abaixo diz qual campo ou
                tabela não existe; ela é o que o desenvolvedor precisa ver.
              </>
            )}
          </p>

          {erro?.message && (
            <pre className="mt-3 overflow-x-auto rounded bg-amber-100 p-3 text-xs text-amber-900">
              {erro.message}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

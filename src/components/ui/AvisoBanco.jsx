import { DatabaseZap } from "lucide-react";

/**
 * Mostrado quando uma consulta ao Postgres falha. Sem isso, o Next exibiria a
 * tela de erro do framework — que nao diz ao operador o que fazer a respeito.
 */
export default function AvisoBanco({ erro }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-amber-100 p-2 text-amber-700">
          <DatabaseZap size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-amber-900">
            Nao foi possivel conversar com o banco de dados
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Verifique se o Postgres esta no ar. Com o Docker Desktop aberto,
            rode <code className="rounded bg-amber-100 px-1">docker compose up -d</code>{" "}
            na pasta do projeto e recarregue esta pagina.
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

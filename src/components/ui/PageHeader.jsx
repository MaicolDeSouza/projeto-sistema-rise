import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Cabecalho de pagina. `voltarPara` poe uma SETA ao lado do titulo que leva de volta a tela anterior
 * (pedido do dono em 21/09/2026, no cadastro de produto novo): substitui a linha "Voltar para ..."
 * que ficava acima do titulo e gastava altura a toa. So a seta, sem texto; o `voltarRotulo` e o
 * nome acessivel e a dica ao passar o mouse.
 */
export default function PageHeader({ titulo, descricao, acao, voltarPara, voltarRotulo = "Voltar" }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          {voltarPara && (
            <Link
              href={voltarPara}
              aria-label={voltarRotulo}
              title={voltarRotulo}
              className="-ml-1 rounded p-1 text-suave hover:bg-fundo hover:text-texto"
            >
              <ArrowLeft size={22} />
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        </div>
        {descricao && <p className="mt-1 text-sm text-suave">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

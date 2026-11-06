import Link from "next/link";

import { dia, diaEmSaoPaulo } from "./formato";

/**
 * A aba "Licenças (N)" do cadastro do cliente: as vagas de licenca entregues a ele, as ativas primeiro. A licenca abre a
 * tela de Licencas no programa certo, ja filtrada por ela.
 */
export default function TabelaLicencasDoCliente({ linhas }) {
  const th = "px-3 py-2 font-medium";
  const td = "px-3 py-2";
  return (
    <div className="relative overflow-x-auto rounded-lg border border-borda">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className={th}>Programa</th>
            <th className={th}>Licença</th>
            <th className={th}>Data</th>
            <th className={th}>Nome do PC</th>
            <th className={th}>Equipamento</th>
            <th className={th}>Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => (
            <tr key={linha.linhaId} className={linha.situacao === "ATIVA" ? "" : "text-suave"}>
              <td className={td}>{linha.software.nome}</td>
              <td className={`${td} max-w-xs truncate`}>
                <Link
                  href={`/ferramentas/licencas?programa=${encodeURIComponent(linha.software.slug)}&busca=${encodeURIComponent(linha.identificador)}`}
                  title="Abrir na tela de Licenças"
                  className="font-mono text-[12px] hover:text-acento hover:underline"
                >
                  {linha.identificador}
                </Link>
              </td>
              <td className={`${td} tabular-nums`}>{dia(linha.data) || <span className="text-suave">—</span>}</td>
              <td className={td}>{linha.nomeDoPc ?? <span className="text-suave">—</span>}</td>
              <td className={`${td} max-w-48 truncate`} title={linha.equipamento ?? undefined}>
                {linha.equipamento ?? <span className="text-suave">—</span>}
              </td>
              <td className={`${td} whitespace-nowrap`}>{linha.situacao === "ATIVA" ? "Ativa" : `Encerrada${linha.encerradaEm ? ` em ${diaEmSaoPaulo(linha.encerradaEm)}` : ""}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

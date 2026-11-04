import { dataCompleta } from "./formato";

/** Aba Histórico: cada situacao que o canal informou, com data e hora, da mais recente para a mais antiga. */
export default function AbaHistorico({ historico }) {
  const passos = (Array.isArray(historico) ? historico : []).slice().sort((a, b) => String(b.em).localeCompare(String(a.em)));
  if (passos.length === 0) return <p className="p-5 text-sm text-suave">O canal ainda não informou nenhuma situação.</p>;
  return (
    <ol className="space-y-2 p-5 text-sm">
      {passos.map((passo) => (
        <li key={`${passo.em}-${passo.statusDaOrigem}`} className="flex gap-4">
          <span className="w-36 shrink-0 text-suave tabular-nums">{dataCompleta(passo.em)}</span>
          <span className="font-mono text-xs leading-5">{passo.statusDaOrigem ?? "—"}</span>
        </li>
      ))}
    </ol>
  );
}

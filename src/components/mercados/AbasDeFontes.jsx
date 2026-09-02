import Link from "next/link";
import { FileText, Globe } from "lucide-react";

/**
 * Fornecedores e concorrentes em abas, com a mesma tabela em cada uma.
 *
 * Sao dois tipos de fonte com rotinas diferentes: concorrente e varrido sozinho
 * e so se olha o resultado; fornecedor exige alguem baixar a lista e envia-la.
 * Numa tabela unica, a coluna "Lista do fornecedor" ficava vazia na maioria das
 * linhas e as duas rotinas se misturavam.
 *
 * A ABA VIVE NA URL, e nao em estado local — como ja acontece com o filtro de
 * Mercados: sobrevive a recarga, volta com o botao do navegador e pode ser
 * mandada como link. Por isso sao <Link>, e nao botoes: navegacao de verdade,
 * sem JavaScript nenhum no cliente.
 */
export default function AbasDeFontes({ ativa, quantos }) {
  const abas = [
    { id: "FORNECEDOR", titulo: "Fornecedores", icone: FileText },
    { id: "CONCORRENTE", titulo: "Concorrentes", icone: Globe },
  ];

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-borda">
      {abas.map(({ id, titulo, icone: Icone }) => {
        const selecionada = ativa === id;

        return (
          <Link
            key={id}
            href={`/mercados/fontes?tipo=${id}`}
            aria-current={selecionada ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium tracking-wide uppercase transition ${
              selecionada
                ? "border-acento text-acento"
                : "border-transparent text-suave hover:text-texto"
            }`}
          >
            <Icone size={14} />
            {titulo} ({quantos[id] ?? 0})
          </Link>
        );
      })}
    </div>
  );
}

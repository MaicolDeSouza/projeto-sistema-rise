import Link from "next/link";

import SeloDoNivel from "./SeloDoNivel";

/** Um par rotulo/valor das abas do pedido; valor vazio nao desenha nada (regra 4: so o que tem dado). */
export function Dado({ rotulo, children, className = "" }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-suave">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-pretty">{children}</dd>
    </div>
  );
}

export function Secao({ titulo, children, acao = null }) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function enderecoEmLinhas(endereco) {
  if (!endereco) return [];
  const rua = [endereco.endereco, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join(" - ");
  return [
    [rua, endereco.complemento].filter(Boolean).join(" · "),
    endereco.bairro,
    [cidade, endereco.cep ? `CEP ${endereco.cep}` : null].filter(Boolean).join(" · "),
    endereco.referencia ? `Referência: ${endereco.referencia}` : null,
  ].filter(Boolean);
}

/** Uma linha da aba Dados do cliente: o rotulo a esquerda, o valor a direita, uma linha divisoria entre elas. */
function Linha({ rotulo, children }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-sm text-suave">{rotulo}</dt>
      <dd className="min-w-0 text-[15px] font-medium">{children}</dd>
    </div>
  );
}

/**
 * Aba "Dados do cliente" (pedido do dono em 04/11/2026: so Nome, CPF e endereco, bem separados): uma informacao por
 * linha, com o rotulo a esquerda. Sem cliente no cadastro, a faixa ambar com "Vincular cliente" fica em cima. O
 * pagamento tem aba propria e os totais ficam no pe da aba Itens.
 */
export default function AbaGeral({ pedido, podeVincular, aoVincular }) {
  const cliente = pedido.cliente;
  const documento = cliente?.documento ?? pedido.documentoDoComprador;
  const linhasDoEndereco = enderecoEmLinhas(pedido.enderecoDeEntrega);

  return (
    <div className="max-w-3xl px-5 py-2">
      {!cliente && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>Pedido sem cliente no cadastro.</span>
          <button
            type="button"
            onClick={aoVincular}
            disabled={!podeVincular}
            title={podeVincular ? undefined : "Sem permissão para vincular cliente"}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Vincular cliente
          </button>
        </div>
      )}
      <dl className="divide-y divide-borda">
        <Linha rotulo="Nome">
          <span className="inline-flex max-w-full items-center gap-2">
            {cliente ? (
              <Link href={`/cadastros/clientes/${cliente.id}`} title="Abrir o cadastro do cliente" className="truncate hover:text-acento hover:underline">
                {cliente.nome}
              </Link>
            ) : (
              <span className="truncate">{pedido.nomeDoComprador ?? "Sem nome"}</span>
            )}
            <SeloDoNivel nivel={cliente?.nivel} completo />
          </span>
        </Linha>
        <Linha rotulo="CPF/CNPJ">{documento ? <span className="tabular-nums">{documento}</span> : <span className="font-normal text-suave">Não informado</span>}</Linha>
        <Linha rotulo="Endereço">
          {linhasDoEndereco.length > 0 ? (
            <address className="leading-relaxed not-italic">
              {linhasDoEndereco.map((linha) => (
                <span key={linha} className="block">
                  {linha}
                </span>
              ))}
            </address>
          ) : (
            <span className="font-normal text-suave">Não informado</span>
          )}
        </Linha>
      </dl>
    </div>
  );
}

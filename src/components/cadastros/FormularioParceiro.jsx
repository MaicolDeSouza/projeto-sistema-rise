"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

import { salvarParceiro } from "@/app/cadastros/acoes";
import { PARCEIROS } from "@/lib/cadastros";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";

/**
 * Formulario de fornecedor ou concorrente (`slug`). `parceiro` nulo = cadastro
 * novo. `fontes` sao as de Mercados que podem ser ligadas a este tipo.
 *
 * Campos nao controlados (`defaultValue`). O envio e MANUAL (`onSubmit`), e nao
 * `<form action>`: o React 19 limpa o formulario depois de uma action de
 * formulario e devolve cada campo ao valor inicial, entao num Salvar recusado
 * (nome repetido) a lista de fonte de coleta voltava ao que estava salvo. Chamando
 * a action a mao, nada e limpo e o que o operador digitou fica. (Antes o que foi
 * enviado virava o valor inicial, o que nao alcancava a lista.)
 */
export default function FormularioParceiro({ slug, parceiro, fontes, usos }) {
  const router = useRouter();
  const config = PARCEIROS[slug];
  // Concorrente nao e alguem com quem se negocia: sem CNPJ, contato nem prazo.
  // So o fornecedor tem pedido minimo e condicoes; so quem tem site varrido
  // oferece a ligacao com uma fonte de Mercados. (A transportadora tem formulario
  // proprio: `FormularioTransportadora`.)
  const ehFornecedor = slug === "fornecedores";
  const temNegociacao = ehFornecedor;
  const temFonte = config.tiposDeFonte.length > 0;
  const inicial = parceiro ?? { ativo: true };

  const voltar = `/cadastros/${slug}`;

  const [estado, acao, enviando] = useActionState(async (anterior, formData) => {
    const resultado = await salvarParceiro(slug, parceiro?.id ?? null, anterior, formData);
    if (resultado.ok) router.push(voltar);
    return resultado;
  }, null);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  }

  const erros = estado?.erros ?? {};
  const valor = (campo) => inicial[campo] ?? "";

  return (
    <form onSubmit={aoEnviar} className="max-w-3xl space-y-4">
      <div className="grid gap-4 rounded-lg border border-borda bg-superficie p-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Campo nome="nome" rotulo="Nome" erro={erros.nome} defaultValue={valor("nome")} required autoFocus />
        </div>

        {temNegociacao && (
          <>
            <Campo
              nome="cnpj"
              rotulo="CNPJ"
              erro={erros.cnpj}
              defaultValue={valor("cnpj")}
              placeholder="00.000.000/0000-00"
            />
            <Campo
              nome="contato"
              rotulo="Contato"
              erro={erros.contato}
              defaultValue={valor("contato")}
              ajuda="Nome de quem atende, por exemplo o vendedor."
            />
          </>
        )}

        <Campo nome="telefone" rotulo="Telefone / WhatsApp" erro={erros.telefone} defaultValue={valor("telefone")} />
        <Campo nome="email" rotulo="E-mail" type="email" erro={erros.email} defaultValue={valor("email")} />

        <div className="md:col-span-2">
          <Campo
            nome="site"
            rotulo="Site"
            erro={erros.site}
            defaultValue={valor("site")}
            placeholder="https://"
            ajuda="Endereco de venda do site, com http ou https."
          />
        </div>

        {temNegociacao && (
          <Campo
            nome="prazoEntregaDias"
            rotulo="Prazo de entrega (dias)"
            type="number"
            min="0"
            step="1"
            erro={erros.prazoEntregaDias}
            defaultValue={valor("prazoEntregaDias")}
          />
        )}

        {ehFornecedor && (
          <>
            <Campo
              nome="pedidoMinimo"
              rotulo="Pedido minimo (R$)"
              type="number"
              min="0"
              step="0.01"
              erro={erros.pedidoMinimo}
              defaultValue={valor("pedidoMinimo") === "" ? "" : String(valor("pedidoMinimo"))}
            />
            <div className="md:col-span-2">
              <Campo
                nome="condicoesPagamento"
                rotulo="Condicoes de pagamento"
                erro={erros.condicoesPagamento}
                defaultValue={valor("condicoesPagamento")}
                placeholder="Ex.: pix a vista, boleto 28 dias"
              />
            </div>
          </>
        )}

        {temFonte && (
          <div className="md:col-span-2">
            <Campo
              nome="fonteId"
              rotulo="Fonte de coleta"
              erro={erros.fonteId}
              ajuda="Liga este cadastro ao site que o sistema varre em Mercados. Opcional: nada muda na coleta."
            >
              <select
                id="fonteId"
                name="fonteId"
                defaultValue={valor("fonteId")}
                className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.fonteId)}`}
              >
                <option value="">Nenhuma</option>
                {fontes.map((fonte) => (
                  <option key={fonte.id} value={fonte.id}>
                    {fonte.nome} — {fonte.dominio}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        )}

        <div className="md:col-span-2">
          <Campo nome="observacoes" rotulo="Observacoes" erro={erros.observacoes}>
            <textarea
              id="observacoes"
              name="observacoes"
              rows={4}
              defaultValue={valor("observacoes")}
              className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
            />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="ativo" defaultChecked={inicial.ativo !== false} className="h-4 w-4 accent-acento" />
          Ativo
        </label>
      </div>

      {ehFornecedor && parceiro && (
        <p className="text-xs text-suave">
          {usos > 0
            ? `Este fornecedor abastece ${usos} produto(s) do catalogo, por isso nao pode ser excluido enquanto houver vinculo.`
            : "Nenhum produto do catalogo usa este fornecedor ainda."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {enviando && <Loader size={14} className="animate-spin" />}
          Salvar
        </button>
        <Link href={voltar} className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo">
          Cancelar
        </Link>
        {estado?.erro && <span className="text-sm text-red-700">{estado.erro}</span>}
      </div>
    </form>
  );
}

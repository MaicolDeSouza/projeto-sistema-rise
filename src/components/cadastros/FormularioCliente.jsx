"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

import { salvarCliente } from "@/app/cadastros/acoes-clientes";
import { formatarCnpj, formatarCpf } from "@/lib/documentos";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";
import ContatosDoCliente from "./ContatosDoCliente";
import EnderecoDoCliente from "./EnderecoDoCliente";

const REGIMES = [
  { valor: "SIMPLES_NACIONAL", rotulo: "1 - Simples Nacional" },
  { valor: "SIMPLES_EXCESSO_SUBLIMITE", rotulo: "2 - Simples Nacional, excesso de sublimite" },
  { valor: "REGIME_NORMAL", rotulo: "3 - Regime Normal" },
];

function Secao({ titulo, children }) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="mb-3 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Formulario de Cliente, pessoa fisica ou juridica. `cliente` nulo = cadastro novo.
 *
 * **Os campos dos dois tipos ficam MONTADOS e so um conjunto e visivel**
 * (`hidden`): trocar Fisica por Juridica e voltar nao perde o que foi digitado,
 * e o servidor descarta o que nao e do tipo escolhido (ver `salvarCliente`).
 *
 * **O envio e MANUAL (`onSubmit`), e nao `<form action>`.** O React 19 limpa o
 * formulario depois de uma action de formulario e devolve cada campo ao valor
 * inicial: num Salvar recusado (CNPJ invalido) a lista "Tipo da Pessoa" voltava
 * sozinha para "Fisica" enquanto a tela seguia mostrando os campos de Juridica —
 * e reenviar gravaria o tipo errado. Ja aconteceu neste formulario, no primeiro
 * teste. Chamando a action a mao, nada e limpo: o que o operador digitou fica.
 * (O `FormularioProduto` contorna isso guardando o que foi enviado como valor
 * inicial, o que nao alcanca lista nem caixa de marcacao.)
 *
 * Ficam controlados so o que outra parte da tela precisa ler: o tipo, a IE
 * isenta, o endereco (a lupa do CEP o preenche) e os contatos.
 */
export default function FormularioCliente({ cliente, transportadoras, condicoes, hoje }) {
  const router = useRouter();
  const inicial = cliente ?? { ativo: true };
  const [tipo, setTipo] = useState(inicial.tipoPessoa ?? "FISICA");
  const [ieIsento, setIeIsento] = useState(inicial.ieIsento ?? false);

  const [estado, acao, enviando] = useActionState(async (anterior, formData) => {
    const resultado = await salvarCliente(cliente?.id ?? null, anterior, formData);
    if (resultado.ok) router.push("/cadastros/clientes");
    return resultado;
  }, null);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  }

  const erros = estado?.erros ?? {};
  const valor = (campo) => inicial[campo] ?? "";
  const juridica = tipo === "JURIDICA";

  // So a pessoa do tipo escolhido enxerga os campos do outro tipo — e nunca os
  // dois conjuntos ao mesmo tempo.
  const soJuridica = juridica ? "" : "hidden";
  const soFisica = juridica ? "hidden" : "";

  /** CPF/CNPJ formatado ao sair do campo, se os digitos batem com o tamanho do tipo. */
  function formatarDocumento(evento) {
    const digitos = evento.target.value.replace(/\D/g, "");
    if (!juridica && digitos.length === 11) evento.target.value = formatarCpf(digitos);
    if (juridica && digitos.length === 14) evento.target.value = formatarCnpj(digitos);
  }

  return (
    <form onSubmit={aoEnviar} className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {enviando && <Loader size={14} className="animate-spin" />}
          Salvar
        </button>
        <Link
          href="/cadastros/clientes"
          className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo"
        >
          Cancelar
        </Link>
        {estado?.erro && <span className="text-sm text-red-700">{estado.erro}</span>}
        {estado && !estado.ok && !estado.erro && (
          <span className="text-sm text-red-700">Confira os campos marcados.</span>
        )}
      </div>

      <Secao titulo="Dados cadastrais">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo nome="nome" rotulo="Nome *" erro={erros.nome} defaultValue={valor("nome")} required autoFocus />

          <div className={soJuridica}>
            <Campo
              nome="nomeFantasia"
              rotulo="Fantasia"
              erro={erros.nomeFantasia}
              defaultValue={valor("nomeFantasia")}
            />
          </div>

          <Campo nome="tipoPessoa" rotulo="Tipo da Pessoa">
            <select
              id="tipoPessoa"
              name="tipoPessoa"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value)}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(false)}`}
            >
              <option value="FISICA">Pessoa Fisica</option>
              <option value="JURIDICA">Pessoa Juridica</option>
            </select>
          </Campo>

          <Campo
            nome="documento"
            rotulo={juridica ? "CNPJ" : "CPF"}
            erro={erros.documento}
            defaultValue={valor("documento")}
            inputMode="numeric"
            placeholder={juridica ? "00.000.000/0000-00" : "000.000.000-00"}
            onBlur={formatarDocumento}
          />

          <div className={soJuridica}>
            <Campo nome="regimeTributario" rotulo="Codigo de regime tributario" erro={erros.regimeTributario}>
              <select
                id="regimeTributario"
                name="regimeTributario"
                defaultValue={valor("regimeTributario")}
                className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.regimeTributario)}`}
              >
                <option value="">Nao definido</option>
                {REGIMES.map((regime) => (
                  <option key={regime.valor} value={regime.valor}>
                    {regime.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo
            nome="clienteDesde"
            rotulo="Cliente desde"
            type="date"
            erro={erros.clienteDesde}
            defaultValue={valor("clienteDesde") || hoje}
          />

          <div className={soJuridica}>
            <Campo
              nome="inscricaoEstadual"
              rotulo="Inscricao Estadual"
              erro={erros.inscricaoEstadual}
              defaultValue={valor("inscricaoEstadual")}
              disabled={ieIsento}
            />
          </div>

          <div className={`${soJuridica} flex items-end pb-2`}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="ieIsento"
                checked={ieIsento}
                onChange={(evento) => setIeIsento(evento.target.checked)}
                className="h-4 w-4 accent-acento"
              />
              IE Isento
            </label>
          </div>

          <div className={soJuridica}>
            <Campo
              nome="inscricaoMunicipal"
              rotulo="Inscricao Municipal"
              erro={erros.inscricaoMunicipal}
              defaultValue={valor("inscricaoMunicipal")}
            />
          </div>
        </div>
      </Secao>

      <Secao titulo="Endereco">
        <EnderecoDoCliente inicial={cliente?.enderecos} erros={erros} />
      </Secao>

      <Secao titulo="Contato">
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <Campo nome="telefone" rotulo="Telefone / WhatsApp" erro={erros.telefone} defaultValue={valor("telefone")} />
          <Campo nome="email" rotulo="E-mail" type="email" erro={erros.email} defaultValue={valor("email")} />
        </div>

        <p className="mb-2 text-sm font-semibold">Pessoas de contato</p>
        <ContatosDoCliente inicial={cliente?.contatos} erro={erros.contatos} />
      </Secao>

      <Secao titulo="Dados adicionais">
        <div className="grid gap-4 md:grid-cols-3">
          <div className={soFisica}>
            <Campo nome="sexo" rotulo="Sexo" erro={erros.sexo}>
              <select
                id="sexo"
                name="sexo"
                defaultValue={valor("sexo")}
                className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.sexo)}`}
              >
                <option value="">Selecione</option>
                <option value="MASCULINO">Masculino</option>
                <option value="FEMININO">Feminino</option>
              </select>
            </Campo>
          </div>

          <div className={soFisica}>
            <Campo
              nome="naturalidade"
              rotulo="Naturalidade"
              erro={erros.naturalidade}
              defaultValue={valor("naturalidade")}
            />
          </div>

          <Campo
            nome="transportadoraId"
            rotulo="Transportadora preferida"
            erro={erros.transportadoraId}
            ajuda="Escolhida do cadastro de Transportadoras."
          >
            <select
              id="transportadoraId"
              name="transportadoraId"
              defaultValue={valor("transportadoraId")}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.transportadoraId)}`}
            >
              <option value="">Nenhuma</option>
              {transportadoras.map((transportadora) => (
                <option key={transportadora.id} value={transportadora.id}>
                  {transportadora.nome}
                </option>
              ))}
            </select>
            {transportadoras.length === 0 && (
              <p className="mt-1 text-[11px] text-suave">
                Nenhuma transportadora cadastrada.{" "}
                <Link href="/cadastros/transportadoras/novo" className="text-acento hover:underline">
                  Cadastrar
                </Link>
              </p>
            )}
          </Campo>
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-1 text-sm font-semibold">Condicoes de pagamento preferidas</p>
          {condicoes.length === 0 ? (
            <p className="mt-1 text-sm text-suave">
              Nenhuma condicao cadastrada.{" "}
              <Link href="/cadastros/condicoes" className="text-acento hover:underline">
                Cadastrar
              </Link>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {condicoes.map((condicao) => (
                <label
                  key={condicao.id}
                  className="flex cursor-pointer items-center gap-2 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
                >
                  <input
                    type="checkbox"
                    name="condicoes"
                    value={condicao.id}
                    defaultChecked={(inicial.condicoesIds ?? []).includes(condicao.id)}
                    className="h-4 w-4 accent-acento"
                  />
                  {condicao.nome}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          <Campo nome="observacoes" rotulo="Observacoes" erro={erros.observacoes}>
            <textarea
              id="observacoes"
              name="observacoes"
              rows={4}
              defaultValue={valor("observacoes")}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.observacoes)}`}
            />
          </Campo>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={inicial.ativo !== false}
            className="h-4 w-4 accent-acento"
          />
          Ativo
        </label>
      </Secao>
    </form>
  );
}

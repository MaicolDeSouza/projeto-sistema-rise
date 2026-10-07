"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

import { salvarCliente } from "@/app/cadastros/acoes-clientes";
import { formatarCnpj, formatarCpf } from "@/lib/documentos";
import { filtrarDigitacaoDeTelefone, formatarTelefone } from "@/lib/telefone";
import Card from "@/components/ui/Card";
import { BarraDeAbas, Painel, useAbasDoFormulario } from "./Abas";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";
import ContatosDoCliente from "./ContatosDoCliente";
import EnderecoDoCliente from "./EnderecoDoCliente";
import ListaDeValores from "./ListaDeValores";

const REGIMES = [
  { valor: "SIMPLES_NACIONAL", rotulo: "1 - Simples Nacional" },
  { valor: "SIMPLES_EXCESSO_SUBLIMITE", rotulo: "2 - Simples Nacional, excesso de sublimite" },
  { valor: "REGIME_NORMAL", rotulo: "3 - Regime Normal" },
];

const TIPOS = [
  { valor: "FISICA", rotulo: "Pessoa Física" },
  { valor: "JURIDICA", rotulo: "Pessoa Jurídica" },
];

const ABAS = [
  { id: "cadastro", rotulo: "Dados cadastrais" },
  { id: "endereco", rotulo: "Endereço" },
  { id: "contato", rotulo: "Contato" },
  { id: "adicionais", rotulo: "Dados adicionais" },
];

/// Em que aba mora cada campo com erro. Serve ao ponto vermelho do titulo da aba e
/// a levar o operador para a primeira aba com erro depois de um Salvar recusado.
const ABA_DO_CAMPO = {
  nome: "cadastro",
  nomeFantasia: "cadastro",
  documento: "cadastro",
  regimeTributario: "cadastro",
  inscricaoEstadual: "cadastro",
  inscricaoMunicipal: "cadastro",
  telefones: "contato",
  emails: "contato",
  contatos: "contato",
  sexo: "contato",
  naturalidade: "contato",
  clienteDesde: "adicionais",
  transportadoraId: "adicionais",
  observacoes: "adicionais",
};

/** Os campos de endereco vem prefixados (`geral_cep`, `entrega_uf`...). */
const abaDoCampo = (chave) =>
  /^(geral|entrega)_/.test(chave) ? "endereco" : (ABA_DO_CAMPO[chave] ?? null);

/**
 * Fisica ou Juridica, como duas opcoes lado a lado. Sao <input type="radio">
 * de verdade (escondidos, o rotulo e o alvo do clique): entram no envio com o
 * nome `tipoPessoa`, como entrava o <select>, e o teclado (setas, Tab) continua
 * funcionando.
 */
function EscolhaDoTipo({ tipo, aoMudar }) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo da pessoa"
      className="inline-flex overflow-hidden rounded border border-borda text-sm"
    >
      {TIPOS.map((opcao) => (
        <label
          key={opcao.valor}
          className={`cursor-pointer px-3 py-1 font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento ${
            tipo === opcao.valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"
          }`}
        >
          <input
            type="radio"
            name="tipoPessoa"
            value={opcao.valor}
            checked={tipo === opcao.valor}
            onChange={() => aoMudar(opcao.valor)}
            className="sr-only"
          />
          {opcao.rotulo}
        </label>
      ))}
    </div>
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
 *
 * **Quatro abas** (Dados cadastrais, Endereco, Contato, Dados adicionais), como as
 * do cadastro de Produto (pedido do dono em 19/09/2026). Todas ficam montadas e so
 * escondidas. Erro do servidor leva a primeira aba com erro (`abaDoCampo`), e campo
 * invalido para o navegador numa aba escondida a abre (`aoInvalidar`): o Salvar
 * fica fora das abas, entao da para clicar nele de qualquer uma.
 */
export default function FormularioCliente({ cliente, transportadoras, hoje }) {
  const router = useRouter();
  const inicial = cliente ?? { ativo: true };
  const [tipo, setTipo] = useState(inicial.tipoPessoa ?? "FISICA");
  const [ieIsento, setIeIsento] = useState(inicial.ieIsento ?? false);
  const { aba, setAba, comErro, levarAoPrimeiroErro, aoInvalidar } = useAbasDoFormulario({
    abas: ABAS,
    abaDoCampo,
  });

  const [estado, acao, enviando] = useActionState(async (anterior, formData) => {
    const resultado = await salvarCliente(cliente?.id ?? null, anterior, formData);
    if (resultado.ok) router.push("/cadastros/clientes");
    else if (resultado.erros) levarAoPrimeiroErro(resultado.erros);
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
    <form onSubmit={aoEnviar} onInvalidCapture={aoInvalidar} className="max-w-5xl space-y-4">
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

      <Card className="p-0">
        {/* O tipo da pessoa fica na barra das abas: ele decide o que aparece em TODAS
            elas (Fantasia e IE na primeira, Sexo e Pessoas de contato em Contato). */}
        <BarraDeAbas abas={ABAS} aba={aba} aoMudar={setAba} comErro={comErro(erros)}>
          <EscolhaDoTipo tipo={tipo} aoMudar={setTipo} />
        </BarraDeAbas>

        <div className="p-5">
      <Painel id="cadastro" aba={aba}>
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

          <Campo
            nome="documento"
            rotulo={juridica ? "CNPJ *" : "CPF *"}
            erro={erros.documento}
            defaultValue={valor("documento")}
            required
            inputMode="numeric"
            placeholder={juridica ? "00.000.000/0000-00" : "000.000.000-00"}
            onBlur={formatarDocumento}
          />

          <div className={soJuridica}>
            <Campo nome="regimeTributario" rotulo="Código de regime tributário" erro={erros.regimeTributario}>
              <select
                id="regimeTributario"
                name="regimeTributario"
                defaultValue={valor("regimeTributario")}
                className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.regimeTributario)}`}
              >
                <option value="">Não definido</option>
                {REGIMES.map((regime) => (
                  <option key={regime.valor} value={regime.valor}>
                    {regime.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className={soJuridica}>
            <Campo
              nome="inscricaoEstadual"
              rotulo="Inscrição Estadual"
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
              rotulo="Inscrição Municipal"
              erro={erros.inscricaoMunicipal}
              defaultValue={valor("inscricaoMunicipal")}
            />
          </div>
        </div>
      </Painel>

      <Painel id="endereco" aba={aba}>
        <EnderecoDoCliente inicial={cliente?.enderecos} erros={erros} />
      </Painel>

      <Painel id="contato" aba={aba}>
        <div className="grid gap-4 md:grid-cols-2">
          <ListaDeValores
            nome="telefones"
            rotulo="Telefone / WhatsApp"
            rotuloIncluir="incluir telefone"
            inicial={cliente?.telefones}
            erro={erros.telefones}
            inputMode="tel"
            placeholder="(00) 00000-0000"
            maxLength={20}
            filtrar={filtrarDigitacaoDeTelefone}
            formatar={formatarTelefone}
          />
          <ListaDeValores
            nome="emails"
            rotulo="E-mail"
            rotuloIncluir="incluir e-mail"
            inicial={cliente?.emails}
            erro={erros.emails}
            type="email"
          />
        </div>

        {/* Sexo e naturalidade: so pessoa fisica. */}
        <div className={`${soFisica} mt-4 grid gap-4 md:grid-cols-2`}>
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

          <Campo
            nome="naturalidade"
            rotulo="Naturalidade"
            erro={erros.naturalidade}
            defaultValue={valor("naturalidade")}
          />
        </div>

        {/* Pessoas de contato: so pessoa juridica. Ficam montadas e ocultas, como os
            demais campos de um tipo, para trocar de tipo e voltar nao perder a lista. */}
        <div className={`${soJuridica} mt-5`}>
          <p className="mb-2 text-sm font-semibold">Pessoas de contato</p>
          <ContatosDoCliente inicial={cliente?.contatos} erro={erros.contatos} />
        </div>
      </Painel>

      <Painel id="adicionais" aba={aba}>
        <div className="grid gap-4 md:grid-cols-3">
          <Campo
            nome="clienteDesde"
            rotulo="Cliente desde"
            type="date"
            erro={erros.clienteDesde}
            defaultValue={valor("clienteDesde") || hoje}
          />

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
          <Campo nome="observacoes" rotulo="Observações" erro={erros.observacoes}>
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
      </Painel>
        </div>
      </Card>
    </form>
  );
}

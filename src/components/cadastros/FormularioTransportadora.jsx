"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader, Search } from "lucide-react";

import { salvarTransportadora } from "@/app/cadastros/acoes-transportadoras";
import { formatarCnpj } from "@/lib/documentos";
import { filtrarDigitacaoDeTelefone, formatarTelefone } from "@/lib/telefone";
import Card from "@/components/ui/Card";
import { BarraDeAbas, Painel, useAbasDoFormulario } from "./Abas";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";
import ContatosDoCliente from "./ContatosDoCliente";
import { CamposDeEndereco } from "./EnderecoDoCliente";
import ListaDeValores from "./ListaDeValores";

const MODALIDADES = [
  { valor: "CORREIOS", rotulo: "Correios" },
  { valor: "RODOVIARIA", rotulo: "Transportadora rodoviária" },
  { valor: "ENTREGA_LOCAL", rotulo: "Entrega local (motoboy)" },
  { valor: "OUTRA", rotulo: "Outra" },
];

const ABAS = [
  { id: "cadastro", rotulo: "Dados cadastrais" },
  { id: "endereco", rotulo: "Endereço" },
  { id: "contato", rotulo: "Contato" },
];

/// Em que aba mora cada campo com erro (ver `Abas.jsx`). Campo novo entra aqui.
const ABA_DO_CAMPO = {
  nome: "cadastro",
  nomeFantasia: "cadastro",
  cnpj: "cadastro",
  inscricaoEstadual: "cadastro",
  modalidade: "cadastro",
  urlRastreamento: "cadastro",
  site: "cadastro",
  observacoes: "cadastro",
  telefones: "contato",
  emails: "contato",
  contatos: "contato",
};

/** Os campos de endereco vem prefixados (`endereco_cep`, `endereco_uf`...). */
const abaDoCampo = (chave) => (chave.startsWith("endereco_") ? "endereco" : (ABA_DO_CAMPO[chave] ?? null));

const ENDERECO_VAZIO = { cep: "", uf: "", cidade: "", bairro: "", logradouro: "", numero: "", complemento: "" };

/**
 * Formulario de transportadora, em tres abas — Dados cadastrais, Endereco e Contato —
 * como o do cliente (`Abas.jsx`). `transportadora` nulo = cadastro novo.
 *
 * O envio e MANUAL (`onSubmit`), e nao `<form action>`: o React 19 limpa o
 * formulario depois de uma action de formulario e devolve cada campo ao valor
 * inicial, e num Salvar recusado (nome repetido) o operador perderia o que digitou.
 *
 * Ficam controlados so o endereco (a lupa do CEP o preenche), a IE isenta e as
 * listas de telefone e e-mail.
 *
 * **A lupa do CNPJ esta DESLIGADA de proposito.** Ela vai buscar os dados da empresa
 * pelo CNPJ (razao social, endereco, telefone), mas a integracao ainda nao existe:
 * so o botao ficou pronto no lugar. Ver "Busca de dados pelo CNPJ" no CLAUDE.md.
 */
export default function FormularioTransportadora({ transportadora, usos }) {
  const router = useRouter();
  const inicial = transportadora ?? { ativo: true };
  const [ieIsento, setIeIsento] = useState(inicial.ieIsento ?? false);
  const [endereco, setEndereco] = useState({ ...ENDERECO_VAZIO, ...inicial.endereco });
  const { aba, setAba, comErro, levarAoPrimeiroErro, aoInvalidar } = useAbasDoFormulario({
    abas: ABAS,
    abaDoCampo,
  });

  const [estado, acao, enviando] = useActionState(async (anterior, formData) => {
    const resultado = await salvarTransportadora(transportadora?.id ?? null, anterior, formData);
    if (resultado.ok) router.push("/cadastros/transportadoras");
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

  /** CNPJ formatado ao sair do campo, se tiver os 14 digitos. */
  function formatarDocumento(evento) {
    const digitos = evento.target.value.replace(/\D/g, "");
    if (digitos.length === 14) evento.target.value = formatarCnpj(digitos);
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
          href="/cadastros/transportadoras"
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
        <BarraDeAbas abas={ABAS} aba={aba} aoMudar={setAba} comErro={comErro(erros)} />

        <div className="p-5">
          <Painel id="cadastro" aba={aba}>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo
                nome="nome"
                rotulo="Nome *"
                erro={erros.nome}
                defaultValue={valor("nome")}
                required
                autoFocus
                ajuda="Razão social. O nome pelo qual você a conhece vai em Nome fantasia."
              />
              <Campo
                nome="nomeFantasia"
                rotulo="Nome fantasia"
                erro={erros.nomeFantasia}
                defaultValue={valor("nomeFantasia")}
              />

              <Campo
                nome="cnpj"
                rotulo="CNPJ"
                erro={erros.cnpj}
                ajuda="Opcional, mas conferido quando preenchido. A busca dos dados da empresa pelo CNPJ (Sintegra) ainda não está ligada: o botão da lupa fica desligado."
              >
                <div className="relative">
                  <input
                    id="cnpj"
                    name="cnpj"
                    defaultValue={valor("cnpj")}
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    onBlur={formatarDocumento}
                    className={`${CLASSE_CAMPO} pr-10 ${bordaDoCampo(erros.cnpj)}`}
                  />
                  <button
                    type="button"
                    disabled
                    aria-label="Buscar dados pelo CNPJ (Sintegra) - em breve"
                    title="Em breve: buscar os dados da empresa pelo CNPJ"
                    className="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 cursor-not-allowed rounded p-1.5 text-suave opacity-50"
                  >
                    <Search size={16} />
                  </button>
                </div>
              </Campo>

              <Campo nome="modalidade" rotulo="Modalidade" erro={erros.modalidade}>
                <select
                  id="modalidade"
                  name="modalidade"
                  defaultValue={valor("modalidade")}
                  className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.modalidade)}`}
                >
                  <option value="">Não definida</option>
                  {MODALIDADES.map((modalidade) => (
                    <option key={modalidade.valor} value={modalidade.valor}>
                      {modalidade.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo
                nome="inscricaoEstadual"
                rotulo="Inscrição Estadual"
                erro={erros.inscricaoEstadual}
                defaultValue={valor("inscricaoEstadual")}
                disabled={ieIsento}
                ajuda="Dado do transportador que a NF-e pede."
              />
              <div className="flex items-end pb-2">
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

              <div className="md:col-span-2">
                <Campo
                  nome="urlRastreamento"
                  rotulo="Link de rastreamento"
                  erro={erros.urlRastreamento}
                  defaultValue={valor("urlRastreamento")}
                  placeholder="https://site.com/rastrear/{codigo}"
                  ajuda="Endereço de consulta com {código} no lugar do código de rastreio. O bloco Pedidos vai usar para montar o link do cliente."
                />
              </div>

              <div className="md:col-span-2">
                <Campo
                  nome="site"
                  rotulo="Site"
                  erro={erros.site}
                  defaultValue={valor("site")}
                  placeholder="https://"
                  ajuda="Endereço do site, com http ou https."
                />
              </div>

              <div className="md:col-span-2">
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

              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="ativo"
                  defaultChecked={inicial.ativo !== false}
                  className="h-4 w-4 accent-acento"
                />
                Ativo
              </label>
            </div>
          </Painel>

          <Painel id="endereco" aba={aba}>
            <CamposDeEndereco prefixo="endereco" valores={endereco} aoMudar={setEndereco} erros={erros} />
          </Painel>

          <Painel id="contato" aba={aba}>
            <div className="grid gap-4 md:grid-cols-2">
              <ListaDeValores
                nome="telefones"
                rotulo="Telefone / WhatsApp"
                rotuloIncluir="incluir telefone"
                inicial={transportadora?.telefones}
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
                inicial={transportadora?.emails}
                erro={erros.emails}
                type="email"
              />
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Pessoas de contato</p>
              <ContatosDoCliente inicial={transportadora?.contatos} erro={erros.contatos} />
            </div>
          </Painel>
        </div>
      </Card>

      {transportadora && (
        <p className="text-xs text-suave">
          {usos > 0
            ? `Esta transportadora é a preferida de ${usos} cliente(s), por isso não pode ser excluída enquanto houver vínculo.`
            : "Nenhum cliente tem esta transportadora como preferida ainda."}
        </p>
      )}
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Search, Trash2, Upload } from "lucide-react";

import { buscarCep } from "@/app/cadastros/acoes-clientes";
import { enviarLogoDaEmpresaAcao, salvarDadosDaEmpresaAcao, tirarLogoDaEmpresaAcao } from "@/app/configuracoes/acoes";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";
import { formatarTelefone } from "@/lib/telefone";

const CAMPOS = ["razaoSocial", "nomeFantasia", "cnpj", "inscricaoEstadual", "inscricaoMunicipal", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep", "telefone", "celular", "email"];
const TELEFONES = ["telefone", "celular"];

/**
 * Dados da empresa: o que vai no cabecalho do pedido de compra. Linha-guia: o dono confere os dados da Receita e salva.
 * Formulario de Cadastros (`Campo` em `Card`, envio manual), com a lupa do CEP do cadastro de clientes.
 */
/**
 * O logo inteiro (pedido do dono em 07/11/2026): envia na hora, sem o Salvar dos dados, e vai no PDF do pedido de compra.
 * A margem branca em volta e cortada no servidor. Sem logo, o PDF usa a engrenagem.
 */
function CartaoDoLogo({ inicial, podeEditar }) {
  const [previa, setPrevia] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef(null);

  function enviar(arquivo) {
    if (!arquivo) return;
    setErro(null);
    const dados = new FormData();
    dados.append("logo", arquivo);
    iniciar(async () => {
      const resposta = await enviarLogoDaEmpresaAcao(dados);
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível enviar o logo.");
        return;
      }
      setPrevia(resposta.previa ?? null);
    });
  }

  function tirar() {
    setErro(null);
    iniciar(async () => {
      const resposta = await tirarLogoDaEmpresaAcao();
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível tirar o logo.");
        return;
      }
      setPrevia(null);
    });
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-1.5">
        <h2 className="font-semibold">Logo</h2>
        <BolhaDeAjuda variante="inline" texto="Vai no PDF do pedido de compra. PNG, JPG, WebP ou SVG até 5 MB; a margem branca em volta é cortada." />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-72 items-center justify-center rounded border border-borda bg-white p-2">
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt="Logo da empresa" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-suave">Sem logo: o PDF usa a engrenagem.</span>
          )}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <input
              ref={entrada}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(evento) => {
                enviar(evento.target.files?.[0]);
                evento.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-md border border-acento/50 px-3 py-2 text-sm font-semibold text-acento hover:bg-acento/5 disabled:opacity-50"
            >
              {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {previa ? "Trocar logo" : "Enviar logo"}
            </button>
            {previa && (
              <button type="button" onClick={tirar} disabled={ocupado} aria-label="Tirar o logo" title="Tirar o logo (o PDF volta à engrenagem)" className="rounded p-2 text-suave hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      {erro && <p className="mt-2 text-sm text-rose-600">{erro}</p>}
    </Card>
  );
}

export default function FormularioEmpresa({ inicial, logoInicial = null, podeEditar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(CAMPOS.map((campo) => [campo, TELEFONES.includes(campo) ? formatarTelefone(inicial?.[campo] ?? "") : inicial?.[campo] ?? ""])),
  );
  const [erros, setErros] = useState({});
  const [aviso, setAviso] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [buscandoCep, iniciarCep] = useTransition();

  const mudar = (campo) => (evento) => {
    setValores((antes) => ({ ...antes, [campo]: evento.target.value }));
    setSalvo(false);
  };

  function lupaDoCep() {
    setAviso(null);
    iniciarCep(async () => {
      const resposta = await buscarCep(valores.cep);
      if (!resposta?.ok) {
        setAviso(resposta?.erro ?? "CEP não encontrado.");
        return;
      }
      const { uf, cidade, bairro, logradouro } = resposta.endereco ?? resposta;
      setValores((antes) => ({ ...antes, uf: uf ?? antes.uf, cidade: cidade ?? antes.cidade, bairro: bairro ?? antes.bairro, endereco: logradouro ?? antes.endereco }));
    });
  }

  function enviar(evento) {
    evento.preventDefault();
    setAviso(null);
    iniciar(async () => {
      const resposta = await salvarDadosDaEmpresaAcao(valores);
      if (!resposta?.ok) {
        setErros(resposta?.erros ?? {});
        setAviso(resposta?.erros ? "Confira os campos marcados." : resposta?.erro ?? "Não foi possível salvar.");
        return;
      }
      setErros({});
      setSalvo(true);
    });
  }

  const campo = (nome, rotulo, props = {}) => (
    <Campo nome={nome} rotulo={rotulo} erro={erros[nome]} value={valores[nome]} onChange={mudar(nome)} {...props} />
  );

  return (
    <div className="max-w-3xl space-y-4">
    <CartaoDoLogo inicial={logoInicial} podeEditar={podeEditar} />
    <form onSubmit={enviar} className="space-y-4">
      <fieldset disabled={!podeEditar} className="space-y-4">
        <Card>
          <h2 className="mb-4 font-semibold">Empresa</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("razaoSocial", "Razão social")}
            {campo("nomeFantasia", "Nome fantasia")}
            {campo("cnpj", "CNPJ", { inputMode: "numeric" })}
            {campo("inscricaoEstadual", "Inscrição estadual")}
            {campo("inscricaoMunicipal", "Inscrição municipal")}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Endereço</h2>
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Campo nome="cep" rotulo="CEP" erro={erros.cep}>
                <div className="mt-1 flex gap-2">
                  <input id="cep" value={valores.cep} onChange={mudar("cep")} inputMode="numeric" className={`${CLASSE_CAMPO} mt-0 ${bordaDoCampo(erros.cep)}`} />
                  <button type="button" onClick={lupaDoCep} disabled={buscandoCep} aria-label="Buscar o endereço pelo CEP" title="Buscar o endereço pelo CEP" className="rounded border border-borda px-2.5 text-suave hover:text-acento">
                    {buscandoCep ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  </button>
                </div>
              </Campo>
            </div>
            <div className="sm:col-span-4">{campo("endereco", "Endereço")}</div>
            <div className="sm:col-span-2">{campo("numero", "Número")}</div>
            <div className="sm:col-span-4">{campo("complemento", "Complemento")}</div>
            <div className="sm:col-span-3">{campo("bairro", "Bairro")}</div>
            <div className="sm:col-span-2">{campo("cidade", "Cidade")}</div>
            <div className="sm:col-span-1">{campo("uf", "UF", { maxLength: 2 })}</div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Contato</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {campo("telefone", "Telefone", { inputMode: "tel", onBlur: () => setValores((antes) => ({ ...antes, telefone: formatarTelefone(antes.telefone) })) })}
            {campo("celular", "Celular / WhatsApp", { inputMode: "tel", onBlur: () => setValores((antes) => ({ ...antes, celular: formatarTelefone(antes.celular) })) })}
            {campo("email", "E-mail", { type: "email" })}
          </div>
        </Card>
      </fieldset>

      {podeEditar && (
        <div className="flex items-center justify-end gap-3">
          {aviso && <span className="text-sm text-rose-600">{aviso}</span>}
          {salvo && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 size={15} /> Salvo
            </span>
          )}
          <button type="submit" disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-md bg-acento px-4 py-2 text-sm font-semibold text-white hover:bg-acento/90 disabled:opacity-50">
            {ocupado && <Loader2 size={15} className="animate-spin" />}
            Salvar
          </button>
        </div>
      )}
    </form>
    </div>
  );
}

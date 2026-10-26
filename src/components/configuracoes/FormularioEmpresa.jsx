"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";

import { buscarCep } from "@/app/cadastros/acoes-clientes";
import { salvarDadosDaEmpresaAcao } from "@/app/configuracoes/acoes";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Card from "@/components/ui/Card";
import { formatarTelefone } from "@/lib/telefone";

const CAMPOS = ["razaoSocial", "nomeFantasia", "cnpj", "inscricaoEstadual", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep", "telefone", "email"];

/**
 * Dados da empresa: o que vai no cabecalho do pedido de compra. Linha-guia: o dono confere os dados da Receita e salva.
 * Formulario de Cadastros (`Campo` em `Card`, envio manual), com a lupa do CEP do cadastro de clientes.
 */
export default function FormularioEmpresa({ inicial, podeEditar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(CAMPOS.map((campo) => [campo, campo === "telefone" ? formatarTelefone(inicial?.telefone ?? "") : inicial?.[campo] ?? ""])),
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
    <form onSubmit={enviar} className="max-w-3xl space-y-4">
      <fieldset disabled={!podeEditar} className="space-y-4">
        <Card>
          <h2 className="mb-4 font-semibold">Empresa</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("razaoSocial", "Razão social")}
            {campo("nomeFantasia", "Nome fantasia")}
            {campo("cnpj", "CNPJ", { inputMode: "numeric" })}
            {campo("inscricaoEstadual", "Inscrição estadual")}
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
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("telefone", "Telefone", { inputMode: "tel", onBlur: () => setValores((antes) => ({ ...antes, telefone: formatarTelefone(antes.telefone) })) })}
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
  );
}

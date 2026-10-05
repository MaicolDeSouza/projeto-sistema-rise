"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader, X } from "lucide-react";

import { fontesParaCadastroRapidoFornecedor, salvarParceiro } from "@/app/cadastros/acoes";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import CampoCnpjFornecedor from "@/components/cadastros/CampoCnpjFornecedor";
import CampoSite from "@/components/cadastros/CampoSite";

/** O mesmo cadastro de fornecedor, em dialogo sobre o formulario do produto. */
export default function CadastroRapidoFornecedor({ nomeInicial, aoFechar, aoCadastrar }) {
  const [fontes, setFontes] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fontesParaCadastroRapidoFornecedor()
      .then((lista) => { if (!cancelado) setFontes(lista); })
      .catch(() => { if (!cancelado) setErro("Nao foi possivel carregar as fontes de coleta."); });
    return () => { cancelado = true; };
  }, []);

  async function salvar(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const nome = String(dados.get("nome") ?? "").trim();
    setSalvando(true);
    setErros({});
    setErro(null);
    try {
      const resultado = await salvarParceiro("fornecedores", null, null, dados);
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        setErro(resultado.erro ?? null);
        return;
      }
      aoCadastrar({ id: resultado.id, nome });
    } catch {
      setErro("Nao foi possivel cadastrar o fornecedor. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Cadastro rapido de fornecedor" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-superficie p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cadastrar fornecedor</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-suave">Cadastre a empresa para poder adiciona-la ao produto.</p>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Campo nome="nome" rotulo="Nome" defaultValue={nomeInicial} erro={erros.nome} required autoFocus /></div>
            <CampoCnpjFornecedor erro={erros.cnpj} />
            <Campo nome="contato" rotulo="Contato" erro={erros.contato} />
            <Campo nome="telefone" rotulo="Telefone / WhatsApp" erro={erros.telefone} />
            <Campo nome="email" rotulo="E-mail" type="email" erro={erros.email} />
            <div className="sm:col-span-2"><CampoSite erro={erros.site} /></div>
            <Campo nome="prazoEntregaDias" rotulo="Prazo de entrega (dias)" type="number" min="0" step="1" erro={erros.prazoEntregaDias} />
            <Campo nome="pedidoMinimo" rotulo="Pedido minimo (R$)" type="number" min="0" step="0.01" erro={erros.pedidoMinimo} />
            <div className="sm:col-span-2"><Campo nome="condicoesPagamento" rotulo="Condicoes de pagamento" erro={erros.condicoesPagamento} /></div>
            <div className="sm:col-span-2">
              <Campo nome="fonteId" rotulo="Fonte de coleta" erro={erros.fonteId}>
                <select id="fonteId" name="fonteId" defaultValue="" className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.fonteId)}`}>
                  <option value="">Nenhuma</option>
                  {fontes.map((fonte) => <option key={fonte.id} value={fonte.id}>{fonte.nome} — {fonte.dominio}</option>)}
                </select>
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <Campo nome="observacoes" rotulo="Observacoes" erro={erros.observacoes}>
                <textarea id="observacoes" name="observacoes" rows={3} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.observacoes)}`} />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="ativo" defaultChecked className="h-4 w-4 accent-acento" />Ativo</label>
          </div>
          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{salvando && <Loader size={14} className="animate-spin" />}Cadastrar fornecedor</button>
            <button type="button" onClick={aoFechar} className="rounded border border-borda px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

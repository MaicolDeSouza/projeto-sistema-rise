"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { excluirCaixaAcao, salvarCaixaAcao } from "@/app/cadastros/caixas-de-envio/acoes";
import Campo from "@/components/cadastros/Campo";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import CabecalhoOrdenavel from "@/components/ui/CabecalhoOrdenavel";
import { lerDecimal, medidasInternas, nomeDaCaixa } from "@/lib/frete/regras";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const cm = (valor) => String(valor ?? "").replace(".", ",");
const tresMedidas = (c, l, a) => `${cm(c)} × ${cm(l)} × ${cm(a)} cm`;
const temInterna = (caixa) => Boolean(caixa.comprimentoInternoCm && caixa.larguraInternaCm && caixa.alturaInternaCm);
const volume = (m) => m.comprimentoCm * m.larguraCm * m.alturaCm;

const ORDENS = {
  nome: (caixa) => caixa.nome,
  externas: (caixa) => volume(caixa),
  internas: (caixa) => volume(medidasInternas(caixa)),
  peso: (caixa) => caixa.pesoVazioKg,
  situacao: (caixa) => (caixa.ativo ? 0 : 1),
};

/**
 * A tabela das caixas de envio, ordenada em memoria (sao poucas, sem paginacao), e a janela de cadastro. O nome nunca e
 * digitado: aparece montado pelas medidas enquanto se digita.
 */
export default function TabelaDeCaixas({ caixas, podeEditar, podeExcluir }) {
  const router = useRouter();
  const [ordem, setOrdem] = useState({ ordenar: null, direcao: "asc" });
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erroDaExclusao, setErroDaExclusao] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pendente, iniciar] = useTransition();

  const linhas = useMemo(() => {
    if (!ordem.ordenar) return caixas;
    const chave = ORDENS[ordem.ordenar];
    const fator = ordem.direcao === "asc" ? 1 : -1;
    return [...caixas].sort((a, b) => {
      const [x, y] = [chave(a), chave(b)];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * fator;
    });
  }, [caixas, ordem]);

  function ordenarPor(campo) {
    setOrdem((atual) =>
      atual.ordenar !== campo ? { ordenar: campo, direcao: "asc" } : atual.direcao === "asc" ? { ordenar: campo, direcao: "desc" } : { ordenar: null, direcao: "asc" },
    );
  }

  function confirmarExclusao() {
    iniciar(async () => {
      const resposta = await excluirCaixaAcao(excluindo.id);
      if (!resposta?.ok) return setErroDaExclusao(resposta?.erro ?? "Não foi possível excluir.");
      setAviso(resposta.desativada ? `${excluindo.nome} já foi usada em envio: ficou desativada.` : null);
      setExcluindo(null);
      router.refresh();
    });
  }

  const cabecalho = (campo, rotulo, className) => (
    <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordem.ordenar} direcao={ordem.direcao} aoClicar={ordenarPor} className={className} />
  );

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <span className="text-sm text-suave">{caixas.length === 1 ? "1 caixa" : `${caixas.length} caixas`}</span>
        {aviso && <span className="text-sm text-amber-700">{aviso}</span>}
        <button
          type="button"
          onClick={() => setEditando({})}
          disabled={!podeEditar}
          title={podeEditar ? undefined : "Sem permissão para cadastrar caixas"}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} /> Nova caixa
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              {cabecalho("nome", "Nome")}
              {cabecalho("externas", "Medidas externas")}
              {cabecalho("internas", "Medidas internas")}
              {cabecalho("peso", "Peso vazio", "text-right")}
              {cabecalho("situacao", "Situação")}
              <th className="w-20 px-3 py-2.5" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((caixa) => {
              const interna = medidasInternas(caixa);
              return (
                <tr key={caixa.id} className={`border-b border-borda last:border-0 ${caixa.ativo ? "" : "text-suave"}`}>
                  <td className="px-3 py-2.5 font-medium">{caixa.nome}</td>
                  <td className="px-3 py-2.5 tabular-nums">{tresMedidas(caixa.comprimentoCm, caixa.larguraCm, caixa.alturaCm)}</td>
                  <td className="px-3 py-2.5 tabular-nums" title={temInterna(caixa) ? undefined : "Calculada: a externa menos 0,5 cm de cada lado"}>
                    <span className={temInterna(caixa) ? "" : "text-suave"}>{tresMedidas(interna.comprimentoCm, interna.larguraCm, interna.alturaCm)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(caixa.pesoVazioKg * 1000)} g</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${caixa.ativo ? "bg-emerald-500" : "bg-zinc-300"}`} />
                      {caixa.ativo ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditando(caixa)}
                        disabled={!podeEditar}
                        aria-label={`Editar ${caixa.nome}`}
                        title={podeEditar ? "Editar" : "Sem permissão para editar"}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErroDaExclusao(null);
                          setExcluindo(caixa);
                        }}
                        disabled={!podeExcluir}
                        aria-label={`Excluir ${caixa.nome}`}
                        title={podeExcluir ? "Excluir" : "Sem permissão para excluir"}
                        className="rounded p-1.5 text-suave hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <JanelaDaCaixa
          caixa={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            setAviso(null);
            router.refresh();
          }}
        />
      )}
      {excluindo && (
        <PopupExclusao
          titulo="Excluir caixa de envio"
          nome={excluindo.nome}
          aviso="Se a caixa já foi usada em algum envio, ela só é desativada."
          erro={erroDaExclusao}
          pendente={pendente}
          aoConfirmar={confirmarExclusao}
          aoCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}

const paraTexto = (valor) => (valor === null || valor === undefined ? "" : String(valor).replace(".", ","));

/** Janela de cadastro: externas, internas (opcionais), peso vazio em gramas e se esta ativa. */
function JanelaDaCaixa({ caixa, aoFechar, aoSalvar }) {
  const [campos, setCampos] = useState({
    comprimentoCm: paraTexto(caixa.comprimentoCm),
    larguraCm: paraTexto(caixa.larguraCm),
    alturaCm: paraTexto(caixa.alturaCm),
    comprimentoInternoCm: paraTexto(caixa.comprimentoInternoCm),
    larguraInternaCm: paraTexto(caixa.larguraInternaCm),
    alturaInternaCm: paraTexto(caixa.alturaInternaCm),
    pesoGramas: caixa.pesoVazioKg ? String(Math.round(caixa.pesoVazioKg * 1000)) : "",
    ativo: caixa.ativo ?? true,
  });
  const [erros, setErros] = useState({});
  const [pendente, iniciar] = useTransition();
  const mudar = (campo, valor) => setCampos((atual) => ({ ...atual, [campo]: valor }));

  const medidas = { comprimentoCm: lerDecimal(campos.comprimentoCm), larguraCm: lerDecimal(campos.larguraCm), alturaCm: lerDecimal(campos.alturaCm) };
  const nome = medidas.comprimentoCm && medidas.larguraCm && medidas.alturaCm ? nomeDaCaixa(medidas) : caixa.id ? caixa.nome : "Nova caixa";

  function salvar(evento) {
    evento.preventDefault();
    const gramas = lerDecimal(campos.pesoGramas);
    const { pesoGramas: _gramas, ...resto } = campos;
    iniciar(async () => {
      const resposta = await salvarCaixaAcao({ ...resto, pesoVazioKg: gramas ? gramas / 1000 : "" }, caixa.id);
      if (resposta?.ok) return aoSalvar();
      setErros(resposta?.erros ?? { geral: resposta?.erro ?? "Não foi possível salvar." });
    });
  }

  const medida = (nomeDoCampo, rotulo) => (
    <Campo
      nome={nomeDoCampo}
      rotulo={rotulo}
      erro={erros[nomeDoCampo]}
      inputMode="decimal"
      value={campos[nomeDoCampo]}
      onChange={(e) => mudar(nomeDoCampo, e.target.value.replace(/[^\d.,]/g, ""))}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(aoFechar)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={caixa.id ? "Editar caixa de envio" : "Nova caixa de envio"}
        onSubmit={salvar}
        className="w-full max-w-lg rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <span className="font-semibold tabular-nums">{nome}</span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-3">
            {medida("comprimentoCm", "Comprimento (cm)")}
            {medida("larguraCm", "Largura (cm)")}
            {medida("alturaCm", "Altura (cm)")}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-suave">Medidas internas (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              {medida("comprimentoInternoCm", "Comprimento")}
              {medida("larguraInternaCm", "Largura")}
              {medida("alturaInternaCm", "Altura")}
            </div>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <Campo
              nome="pesoGramas"
              rotulo="Peso vazio (g)"
              ajuda="A caixa vazia na balança. Entra no peso do pacote junto dos produtos."
              erro={erros.pesoVazioKg}
              inputMode="decimal"
              value={campos.pesoGramas}
              onChange={(e) => mudar("pesoGramas", e.target.value.replace(/[^\d.,]/g, ""))}
            />
            <label className="col-span-2 mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={campos.ativo} onChange={(e) => mudar("ativo", e.target.checked)} className="h-4 w-4" />
              Ativa (entra na sugestão de caixa)
            </label>
          </div>
          {(erros.medidas || erros.geral) && (
            <p role="alert" className="text-sm text-red-600">
              {erros.medidas ?? erros.geral}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-borda px-4 py-3">
          <button type="button" onClick={aoFechar} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendente}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pendente && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

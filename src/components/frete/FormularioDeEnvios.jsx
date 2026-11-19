"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { salvarConfigDeFreteAcao } from "@/app/configuracoes/envios/acoes";
import Campo from "@/components/cadastros/Campo";
import Card from "@/components/ui/Card";

const paraTexto = (valor) => String(valor ?? "").replace(".", ",");

/** Os dois numeros da cotacao de frete. Envio manual (React 19 limpa o formulario depois de uma action). */
export default function FormularioDeEnvios({ inicial, podeEditar }) {
  const [campos, setCampos] = useState({
    acrescimoDeEmbalagem: paraTexto(inicial.acrescimoDeEmbalagem.toFixed(2)),
    percentualDePesoExtra: paraTexto(inicial.percentualDePesoExtra),
  });
  const [erros, setErros] = useState({});
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const mudar = (campo, valor) => {
    setSalvo(false);
    setCampos((atual) => ({ ...atual, [campo]: valor.replace(/[^\d.,]/g, "") }));
  };

  function salvar(evento) {
    evento.preventDefault();
    iniciar(async () => {
      const resposta = await salvarConfigDeFreteAcao(campos);
      if (resposta?.ok) {
        setErros({});
        setSalvo(true);
      } else setErros(resposta?.erros ?? { geral: resposta?.erro ?? "Não foi possível salvar." });
    });
  }

  return (
    <form onSubmit={salvar}>
      <Card className="max-w-xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="acrescimoDeEmbalagem"
            rotulo="Acréscimo de embalagem (R$)"
            ajuda="Somado ao frete cotado no valor cobrado do cliente: a caixinha, o plástico bolha e a fita."
            erro={erros.acrescimoDeEmbalagem}
            inputMode="decimal"
            disabled={!podeEditar}
            value={campos.acrescimoDeEmbalagem}
            onChange={(e) => mudar("acrescimoDeEmbalagem", e.target.value)}
          />
          <Campo
            nome="percentualDePesoExtra"
            rotulo="Peso extra de embalagem (%)"
            ajuda="Folga sobre o peso dos produtos mais a caixa vazia, para o plástico bolha e o papel. Cotar com peso a menos vira cobrança depois."
            erro={erros.percentualDePesoExtra}
            inputMode="decimal"
            disabled={!podeEditar}
            value={campos.percentualDePesoExtra}
            onChange={(e) => mudar("percentualDePesoExtra", e.target.value)}
          />
        </div>
        {erros.geral && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {erros.geral}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          {salvo && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 size={15} /> Salvo
            </span>
          )}
          <button
            type="submit"
            disabled={!podeEditar || pendente}
            title={podeEditar ? undefined : "Sem permissão para editar"}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendente && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </Card>
    </form>
  );
}

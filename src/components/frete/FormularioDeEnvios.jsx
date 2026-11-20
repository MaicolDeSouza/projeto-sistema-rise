"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { salvarConfigDeFreteAcao } from "@/app/configuracoes/envios/acoes";
import Campo, { bordaDoCampo, CLASSE_CAMPO } from "@/components/cadastros/Campo";
import Card from "@/components/ui/Card";
import { TEXTOS_DO_AVISO } from "@/lib/frete/regras";

const paraTexto = (valor) => String(valor ?? "").replace(".", ",");
const MARCADORES = "Marcadores: {cliente} (primeiro nome), {pedido}, {transportadora}, {servico}, {rastreio} e {link}. Vazio usa o texto do exemplo.";

/**
 * Os dois numeros da cotacao de frete e o texto do aviso de postagem ao cliente (fase 2). Envio manual (React 19 limpa o
 * formulario depois de uma action).
 */
export default function FormularioDeEnvios({ inicial, podeEditar }) {
  const [campos, setCampos] = useState({
    acrescimoDeEmbalagem: paraTexto(inicial.acrescimoDeEmbalagem.toFixed(2)),
    percentualDePesoExtra: paraTexto(inicial.percentualDePesoExtra),
    assuntoDoEmail: inicial.assuntoDoEmail ?? "",
    textoDoEmail: inicial.textoDoEmail ?? "",
    textoDoWhatsapp: inicial.textoDoWhatsapp ?? "",
  });
  const [erros, setErros] = useState({});
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const mudar = (campo, valor) => {
    setSalvo(false);
    setCampos((atual) => ({ ...atual, [campo]: valor.replace(/[^\d.,]/g, "") }));
  };
  const mudarTexto = (campo, valor) => {
    setSalvo(false);
    setCampos((atual) => ({ ...atual, [campo]: valor }));
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
      <Card className="max-w-2xl">
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
        <h2 className="mt-6 border-t border-borda pt-4 text-sm font-semibold">Aviso de postagem ao cliente</h2>
        <div className="mt-3 grid gap-4">
          <Campo
            nome="assuntoDoEmail"
            rotulo="Assunto do e-mail"
            ajuda={MARCADORES}
            erro={erros.assuntoDoEmail}
            maxLength={150}
            disabled={!podeEditar}
            placeholder={TEXTOS_DO_AVISO.assunto}
            value={campos.assuntoDoEmail}
            onChange={(e) => mudarTexto("assuntoDoEmail", e.target.value)}
          />
          <Campo nome="textoDoEmail" rotulo="Texto do e-mail" ajuda={MARCADORES} erro={erros.textoDoEmail}>
            <textarea
              id="textoDoEmail"
              rows={8}
              maxLength={2000}
              disabled={!podeEditar}
              placeholder={TEXTOS_DO_AVISO.email}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.textoDoEmail)} text-sm font-normal`}
              value={campos.textoDoEmail}
              onChange={(e) => mudarTexto("textoDoEmail", e.target.value)}
            />
          </Campo>
          <Campo nome="textoDoWhatsapp" rotulo="Texto do WhatsApp" ajuda={MARCADORES} erro={erros.textoDoWhatsapp}>
            <textarea
              id="textoDoWhatsapp"
              rows={3}
              maxLength={1000}
              disabled={!podeEditar}
              placeholder={TEXTOS_DO_AVISO.whatsapp}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.textoDoWhatsapp)} text-sm font-normal`}
              value={campos.textoDoWhatsapp}
              onChange={(e) => mudarTexto("textoDoWhatsapp", e.target.value)}
            />
          </Campo>
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

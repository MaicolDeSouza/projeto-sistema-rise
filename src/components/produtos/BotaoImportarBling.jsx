"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import { importarDoBlingPorCodigo } from "@/app/produtos/acoes";

import { Popup } from "./EdicaoRapida";

/**
 * "Importar do Bling": pede o CODIGO e importa so aquele produto (pedido do dono em 07/10/2026). Ate
 * ali o botao lia o catalogo inteiro e trazia em lotes tudo o que faltava, inclusive o que ele tinha
 * apagado de proposito.
 *
 * A janela fica aberta depois de importar, com o resultado e o link para o produto: da para importar
 * o proximo codigo em seguida. A lista se atualiza sozinha (a acao revalida /produtos).
 */
export default function BotaoImportarBling() {
  const [aberta, setAberta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo"
      >
        <Download size={16} />
        Importar do Bling
      </button>
      {aberta && <JanelaImportar aoFechar={() => setAberta(false)} />}
    </>
  );
}

function JanelaImportar({ aoFechar }) {
  const [codigo, setCodigo] = useState("");
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);

  function importar() {
    setErro(null);
    setResultado(null);
    iniciarTransicao(async () => {
      const r = await importarDoBlingPorCodigo(codigo);
      if (r.ok) {
        setResultado(r);
        setCodigo("");
      } else {
        setErro(r.erro);
        // Ja existe aqui: o link leva ao produto, em vez de so dizer nao.
        if (r.produtoId) setResultado({ jaExiste: true, produtoId: r.produtoId });
      }
    });
  }

  return (
    <Popup
      titulo="Importar do Bling"
      aoFechar={() => {
        if (!pendente) aoFechar();
      }}
      aoEnviar={importar}
      rotuloBotao={pendente ? "Importando..." : "Importar"}
      pendente={pendente}
      erro={erro}
    >
      <label className="mb-1 block text-xs text-suave" htmlFor="importar-bling-codigo">
        Código do produto no Bling
      </label>
      <input
        id="importar-bling-codigo"
        type="text"
        autoFocus
        required
        maxLength={64}
        value={codigo}
        onChange={(evento) => {
          setCodigo(evento.target.value);
          setErro(null);
        }}
        placeholder="Ex.: 100101"
        className="w-full rounded border border-borda bg-superficie px-2.5 py-2 font-mono text-sm focus:border-acento focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-suave">
        Importa só o produto ativo com este código, com as fotos e o fornecedor (como rascunho). Só lê o Bling: nada é
        alterado lá.
      </p>

      {resultado?.ok && (
        <div role="status" className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <p className="font-medium">
            Importado: <span className="font-mono">{resultado.sku}</span> · {resultado.nome}
          </p>
          <p className="mt-0.5">
            {resultado.salvas} foto(s)
            {resultado.recusadas?.length ? `, ${resultado.recusadas.length} recusada(s)` : ""}
            {resultado.fornecedorBling ? ` · fornecedor ${resultado.fornecedorBling.nome} (rascunho)` : ""}
          </p>
          <Link href={`/produtos/${resultado.produtoId}`} className="mt-1 inline-block font-medium underline">
            Abrir o produto
          </Link>
        </div>
      )}
      {resultado?.jaExiste && (
        <Link href={`/produtos/${resultado.produtoId}`} className="mt-2 inline-block text-xs font-medium text-acento underline">
          Abrir o produto que já existe
        </Link>
      )}
    </Popup>
  );
}

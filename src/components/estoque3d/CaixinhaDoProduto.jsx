"use client";

import { Check, Loader } from "lucide-react";
import { useState, useTransition } from "react";

import { salvarCaixinhaDoProdutoAcao } from "@/app/estoque/mapa/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { menorCaixinha, pecasQueCabem } from "@/lib/estoque3d/regras";

const CLASSE = "mt-1 w-full rounded border border-borda px-2.5 py-2 text-[15px] font-medium focus:border-acento focus:outline-none disabled:bg-fundo";

/**
 * Bloco "Caixinha do estoque" do cadastro do produto (Mapa do estoque, 12/11/2026): o modelo da caixinha, quantas pecas
 * cabem nela e a posicao na prateleira. Grava NA HORA, pelo proprio botao, e fica fora do Salvar do cadastro: os campos
 * nao tem `name` (nao entram no envio do formulario em volta) e os eventos nao sobem (nao marcam o cadastro como
 * alterado nem entram no rascunho). A estimativa usa as medidas e o estoque maximo JA SALVOS do produto.
 */
export default function CaixinhaDoProduto({ produtoId, caixinha, medidas, podeEditar }) {
  const [modeloId, setModeloId] = useState(caixinha.modeloCaixinhaId ?? "");
  const [pecas, setPecas] = useState(caixinha.pecasPorCaixinha ?? "");
  const [ordem, setOrdem] = useState(caixinha.ordemNaPrateleira ?? "");
  const [estado, setEstado] = useState({ erro: null, salvo: false });
  const [pendente, iniciar] = useTransition();

  const modelo = caixinha.modelos.find((item) => item.id === modeloId) ?? null;
  const estimativa = modelo ? pecasQueCabem(modelo, medidas) : null;
  const sugerida = menorCaixinha(caixinha.modelos, medidas);
  const motivo = podeEditar ? undefined : "Sem permissão para editar o Mapa do estoque.";

  function salvar() {
    setEstado({ erro: null, salvo: false });
    iniciar(async () => {
      const resultado = await salvarCaixinhaDoProdutoAcao(produtoId, { modeloCaixinhaId: modeloId, pecasPorCaixinha: pecas, ordemNaPrateleira: ordem });
      setEstado(resultado?.ok ? { erro: null, salvo: true } : { erro: resultado?.erro ?? "Não foi possível salvar.", salvo: false });
    });
  }
  const alterar = (definir) => (evento) => {
    definir(evento.target.value);
    setEstado({ erro: null, salvo: false });
  };
  const naoSobe = (evento) => evento.stopPropagation();

  return (
    <fieldset className="mt-4 rounded-lg border border-borda p-4" onInput={naoSobe} onChange={naoSobe}>
      <legend className="flex items-center gap-1 px-1 text-sm font-semibold">
        Caixinha do estoque
        <BolhaDeAjuda variante="inline" texto="A caixinha em que as peças deste código ficam na prateleira. Grava na hora, separado do Salvar do cadastro, e não vai para o Bling nem para os canais." />
      </legend>
      <div className="grid items-end gap-4 sm:grid-cols-4">
        <label className="text-sm font-semibold">
          Modelo
          <select value={modeloId} onChange={alterar(setModeloId)} disabled={!podeEditar} title={motivo} className={CLASSE}>
            <option value="">Sem caixinha</option>
            {caixinha.modelos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Peças por caixinha
          <input
            type="number"
            min="1"
            step="1"
            value={pecas}
            onChange={alterar(setPecas)}
            disabled={!podeEditar}
            title={motivo}
            placeholder={estimativa?.pecas ? `estimado: ${estimativa.pecas}` : ""}
            className={CLASSE}
          />
        </label>
        <label className="text-sm font-semibold">
          Posição na prateleira
          <input type="number" min="1" step="1" value={ordem} onChange={alterar(setOrdem)} disabled={!podeEditar} title={motivo} placeholder="da esquerda" className={CLASSE} />
        </label>
        <button
          type="button"
          onClick={salvar}
          disabled={!podeEditar || pendente}
          title={motivo}
          className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded border border-borda px-3 text-sm font-medium hover:bg-fundo disabled:opacity-50"
        >
          {pendente ? <Loader size={14} className="animate-spin" /> : estado.salvo ? <Check size={14} className="text-emerald-600" /> : null}
          {estado.salvo ? "Caixinha salva" : "Salvar caixinha"}
        </button>
      </div>
      {estado.erro && <p className="mt-2 text-sm text-red-700">{estado.erro}</p>}
      {!estado.erro && modelo && estimativa?.motivo && <p className="mt-2 text-xs text-amber-800">{estimativa.motivo}</p>}
      {!estado.erro && sugerida && sugerida.modelo.id !== modeloId && (
        <p className="mt-2 text-xs text-suave">
          Caixinha sugerida: <strong className="font-semibold text-texto">{sugerida.modelo.nome}</strong> (cabem cerca de {sugerida.pecas}
          {sugerida.cabe ? "" : ", menos que o estoque máximo"}).
        </p>
      )}
    </fieldset>
  );
}

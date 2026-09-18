"use client";

import { useState, useTransition } from "react";
import { Loader, Search } from "lucide-react";

import { buscarCep } from "@/app/cadastros/acoes-clientes";
import { UFS, formatarCep } from "@/lib/documentos";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";

const VAZIO = { cep: "", uf: "", cidade: "", bairro: "", logradouro: "", numero: "", complemento: "" };

const ABAS = [
  { id: "geral", titulo: "Geral" },
  { id: "entrega", titulo: "Entrega" },
];

/** Os campos de UM endereco, com a lupa do CEP. `prefixo` compoe o `name` (`geral_cep`, `entrega_cep`...). */
function CamposDeEndereco({ prefixo, valores, aoMudar, erros }) {
  const [consultando, iniciarConsulta] = useTransition();
  const [aviso, setAviso] = useState(null);

  const mudar = (campo) => (evento) => aoMudar({ ...valores, [campo]: evento.target.value });
  const nome = (campo) => `${prefixo}_${campo}`;

  function consultar() {
    setAviso(null);
    iniciarConsulta(async () => {
      const resultado = await buscarCep(valores.cep);
      if (!resultado.ok) {
        setAviso(resultado.erro);
        return;
      }
      // Preenche o que o CEP sabe; numero e complemento sao do operador e ficam.
      aoMudar({ ...valores, ...resultado.endereco });
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Campo
        nome={nome("cep")}
        rotulo="CEP"
        erro={erros[nome("cep")] ?? aviso}
        ajuda="Clique na lupa para preencher estado, cidade, bairro e endereco. So o CEP e consultado."
      >
        <div className="relative">
          <input
            id={nome("cep")}
            name={nome("cep")}
            inputMode="numeric"
            value={valores.cep}
            onChange={(evento) => aoMudar({ ...valores, cep: formatarCep(evento.target.value) })}
            onKeyDown={(evento) => {
              // Enter no CEP consulta; sem isso enviaria o formulario inteiro.
              if (evento.key === "Enter") {
                evento.preventDefault();
                consultar();
              }
            }}
            className={`${CLASSE_CAMPO} pr-10 ${bordaDoCampo(erros[nome("cep")] ?? aviso)}`}
          />
          <button
            type="button"
            onClick={consultar}
            disabled={consultando}
            aria-label="Buscar endereco pelo CEP"
            className="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 rounded p-1.5 text-emerald-700 hover:bg-fundo disabled:opacity-50"
          >
            {consultando ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </div>
      </Campo>

      <Campo nome={nome("uf")} rotulo="UF" erro={erros[nome("uf")]}>
        <select
          id={nome("uf")}
          name={nome("uf")}
          value={valores.uf}
          onChange={mudar("uf")}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erros[nome("uf")])}`}
        >
          <option value="">UF ...</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </Campo>

      <Campo nome={nome("cidade")} rotulo="Cidade" value={valores.cidade} onChange={mudar("cidade")} />
      <Campo nome={nome("bairro")} rotulo="Bairro" value={valores.bairro} onChange={mudar("bairro")} />

      <div className="md:col-span-2">
        <Campo
          nome={nome("logradouro")}
          rotulo="Endereco"
          value={valores.logradouro}
          onChange={mudar("logradouro")}
        />
      </div>
      <Campo nome={nome("numero")} rotulo="Numero" value={valores.numero} onChange={mudar("numero")} />
      <Campo
        nome={nome("complemento")}
        rotulo="Complemento"
        value={valores.complemento}
        onChange={mudar("complemento")}
      />
    </div>
  );
}

/**
 * Endereco do cliente em duas abas, Geral e Entrega (pedido do dono em
 * 18/09/2026: o endereco do cliente nem sempre e o de entrega).
 *
 * **As duas abas ficam MONTADAS e so uma visivel** (`hidden`): campo desmontado
 * nao entra no FormData, e salvar pela aba Geral perderia o que foi digitado em
 * Entrega. Um ponto vermelho no titulo da aba avisa de erro numa aba escondida.
 *
 * **"Mesmo endereco do Geral"** e o caso comum e vem marcada. Marcada, nada e
 * gravado para Entrega — uma copia ficaria velha quando o Geral mudasse.
 * `inicial.entrega` nulo (cliente novo, ou sem endereco de entrega salvo) abre
 * com a caixa marcada.
 *
 * Os campos sao controlados porque a lupa do CEP os preenche por codigo.
 */
export default function EnderecoDoCliente({ inicial, erros }) {
  const [aba, setAba] = useState("geral");
  const [geral, setGeral] = useState({ ...VAZIO, ...inicial?.geral });
  const [entrega, setEntrega] = useState({ ...VAZIO, ...inicial?.entrega });
  const [igual, setIgual] = useState(!inicial?.entrega);

  const temErro = (prefixo) => Object.keys(erros).some((chave) => chave.startsWith(`${prefixo}_`));

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-borda">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            onClick={() => setAba(item.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              aba === item.id
                ? "border-acento text-texto"
                : "border-transparent text-suave hover:text-texto"
            }`}
          >
            {item.titulo}
            {temErro(item.id) && (
              <span aria-label="Ha erro nesta aba" className="h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" className={aba === "geral" ? "" : "hidden"}>
        <CamposDeEndereco prefixo="geral" valores={geral} aoMudar={setGeral} erros={erros} />
      </div>

      <div role="tabpanel" className={aba === "entrega" ? "" : "hidden"}>
        <label className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="entregaIgualGeral"
            checked={igual}
            onChange={(evento) => setIgual(evento.target.checked)}
            className="h-4 w-4 accent-acento"
          />
          Mesmo endereco do Geral
        </label>

        {/* Montado mesmo quando escondido: so o `hidden` muda, e o servidor ignora
            estes campos com a caixa marcada. */}
        <div className={igual ? "hidden" : ""}>
          <CamposDeEndereco prefixo="entrega" valores={entrega} aoMudar={setEntrega} erros={erros} />
        </div>
        {igual && (
          <p className="text-sm text-suave">A entrega vai para o endereco da aba Geral.</p>
        )}
      </div>
    </div>
  );
}

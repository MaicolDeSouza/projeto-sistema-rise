"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { buscarDestinatariosAcao, criarEnvioAvulsoAcao } from "@/app/envios/acoes";
import Campo from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";
import { lerDecimal } from "@/lib/frete/regras";

import CotadorDeFrete from "./CotadorDeFrete";

const VAZIO = { nome: "", email: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };
const ORIGENS = [
  ["CLIENTE", "Cliente"],
  ["FORNECEDOR", "Fornecedor"],
  ["DIGITAR", "Digitar"],
];

/**
 * Envio avulso (garantia, troca, amostra, devolucao a fornecedor). Linha-guia: o operador escolhe para quem vai, diz o que
 * vai no pacote (a declaracao de conteudo) e cota; escolher o servico cria o envio e abre o detalhe, onde ele compra.
 */
export default function FormularioDeEnvioAvulso({ caixas }) {
  const router = useRouter();
  const [origem, setOrigem] = useState("CLIENTE");
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState([]);
  const [destino, setDestino] = useState(VAZIO);
  const [itens, setItens] = useState([{ descricao: "", quantidade: "1", valor: "" }]);
  const [erros, setErros] = useState({});
  const [buscando, iniciarBusca] = useTransition();
  const [criando, iniciarCriacao] = useTransition();

  const mudar = (campo, valor) => {
    setErros((atual) => ({ ...atual, [campo]: undefined }));
    setDestino((atual) => ({ ...atual, [campo]: valor }));
  };
  const mudarItem = (indice, campo, valor) => setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));

  function procurar(evento) {
    evento.preventDefault();
    iniciarBusca(async () => {
      const resposta = await buscarDestinatariosAcao(busca);
      setAchados((resposta?.itens ?? []).filter((item) => item.tipo === origem));
    });
  }

  function usar(item) {
    const e = item.endereco ?? {};
    setDestino({
      nome: item.nome ?? "",
      email: item.email ?? "",
      telefone: item.telefone ?? "",
      cep: e.cep ?? "",
      logradouro: e.logradouro ?? "",
      numero: e.numero ?? "",
      complemento: e.complemento ?? "",
      bairro: e.bairro ?? "",
      cidade: e.cidade ?? "",
      uf: e.uf ?? "",
    });
    setAchados([]);
  }

  const itensValidos = itens
    .map((item) => ({ descricao: item.descricao.trim(), quantidade: Number.parseInt(item.quantidade, 10), valorUnitario: lerDecimal(item.valor) }))
    .filter((item) => item.descricao);
  const valorDeclarado = Math.round(itensValidos.reduce((soma, item) => soma + (item.quantidade || 0) * (item.valorUnitario || 0), 0) * 100) / 100;

  function escolher(servico, pacote, cotadoEm) {
    iniciarCriacao(async () => {
      const resposta = await criarEnvioAvulsoAcao({
        destinatario: {
          nome: destino.nome,
          email: destino.email,
          telefone: destino.telefone,
          endereco: { cep: destino.cep, logradouro: destino.logradouro, numero: destino.numero, complemento: destino.complemento, bairro: destino.bairro, cidade: destino.cidade, uf: destino.uf },
        },
        pacote,
        servico,
        cotadoEm,
        itensDaDeclaracao: itensValidos,
      });
      if (!resposta?.ok) return setErros(resposta?.erros ?? { geral: resposta?.erro ?? "Não foi possível criar o envio." });
      router.push(`/envios/${resposta.id}`);
    });
  }

  const campo = (nome, rotulo, props = {}) => (
    <Campo nome={`destino-${nome}`} rotulo={rotulo} erro={erros[nome]} value={destino[nome]} onChange={(e) => mudar(nome, e.target.value)} {...props} />
  );

  return (
    <div className="grid gap-5">
      <Card>
        <h2 className="text-sm font-semibold">Para quem vai</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Origem do destinatário">
          {ORIGENS.map(([valor, rotulo]) => (
            <label key={valor} className={`cursor-pointer rounded border px-3 py-1.5 text-sm ${origem === valor ? "border-acento bg-acento/10 font-medium" : "border-borda hover:bg-fundo"}`}>
              <input
                type="radio"
                name="origem"
                value={valor}
                checked={origem === valor}
                onChange={() => {
                  setOrigem(valor);
                  setAchados([]);
                }}
                className="sr-only"
              />
              {rotulo}
            </label>
          ))}
        </div>
        {origem !== "DIGITAR" && (
          <form onSubmit={procurar} className="mt-3 flex max-w-md gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={origem === "CLIENTE" ? "Nome ou CPF/CNPJ do cliente" : "Nome ou CNPJ do fornecedor"}
              className="w-full rounded border border-borda px-2.5 py-1.5 text-sm focus:border-acento focus:outline-none"
            />
            <button type="submit" disabled={buscando || busca.trim().length < 2} className="inline-flex items-center gap-1.5 rounded border border-borda px-3 text-sm hover:bg-fundo disabled:opacity-50">
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
            </button>
          </form>
        )}
        {achados.length > 0 && (
          <ul className="mt-2 max-w-md divide-y divide-borda rounded border border-borda text-sm">
            {achados.map((item) => (
              <li key={`${item.tipo}-${item.id}`}>
                <button type="button" onClick={() => usar(item)} className="w-full px-3 py-2 text-left hover:bg-fundo">
                  {item.nome}
                  <span className="ml-2 text-xs text-suave">{item.endereco?.cidade ? `${item.endereco.cidade} (${item.endereco.uf ?? ""})` : "sem endereço"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-3">{campo("nome", "Nome")}</div>
          <div className="sm:col-span-2">{campo("email", "E-mail", { type: "email" })}</div>
          <div>{campo("telefone", "Telefone", { inputMode: "tel" })}</div>
          <div>{campo("cep", "CEP", { inputMode: "numeric" })}</div>
          <div className="sm:col-span-3">{campo("logradouro", "Rua")}</div>
          <div>{campo("numero", "Número")}</div>
          <div>{campo("complemento", "Complemento")}</div>
          <div className="sm:col-span-2">{campo("bairro", "Bairro")}</div>
          <div className="sm:col-span-3">{campo("cidade", "Cidade")}</div>
          <div>{campo("uf", "UF", { maxLength: 2 })}</div>
        </div>
      </Card>

      <Card>
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          O que vai no pacote
          <BolhaDeAjuda variante="inline" texto="Vai na declaração de conteúdo, que segue impressa junto com o pacote. O valor total é o valor declarado do seguro." />
        </h2>
        <div className="mt-3 space-y-2">
          {itens.map((item, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <input
                aria-label="Descrição"
                value={item.descricao}
                onChange={(e) => mudarItem(indice, "descricao", e.target.value)}
                placeholder="Descrição"
                className="min-w-0 flex-1 rounded border border-borda px-2.5 py-1.5 text-sm focus:border-acento focus:outline-none"
              />
              <input
                aria-label="Quantidade"
                inputMode="numeric"
                value={item.quantidade}
                onChange={(e) => mudarItem(indice, "quantidade", e.target.value.replace(/\D/g, ""))}
                className="w-16 rounded border border-borda px-2 py-1.5 text-right text-sm tabular-nums focus:border-acento focus:outline-none"
              />
              <input
                aria-label="Valor unitário"
                inputMode="decimal"
                value={item.valor}
                onChange={(e) => mudarItem(indice, "valor", e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="R$ 0,00"
                className="w-28 rounded border border-borda px-2 py-1.5 text-right text-sm tabular-nums focus:border-acento focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setItens((atual) => (atual.length > 1 ? atual.filter((_, i) => i !== indice) : atual))}
                disabled={itens.length === 1}
                aria-label="Tirar o item"
                className="rounded p-1.5 text-suave hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setItens((atual) => [...atual, { descricao: "", quantidade: "1", valor: "" }])} className="inline-flex items-center gap-1 text-sm text-acento hover:underline">
            <Plus size={14} /> Item
          </button>
        </div>
        {erros.itensDaDeclaracao && <p className="mt-2 text-xs text-red-700">{erros.itensDaDeclaracao}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Frete</h2>
        <CotadorDeFrete
          key={`${destino.cep}-${valorDeclarado}`}
          caixas={caixas}
          inicial={{ cepDestino: destino.cep, valorDeclarado: valorDeclarado || "" }}
          aoEscolher={escolher}
          rotuloDaEscolha={criando ? "Criando…" : "Escolher"}
        />
        {(erros.geral || erros.servico || erros.pacote) && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {erros.geral ?? erros.servico ?? erros.pacote}
          </p>
        )}
        {Object.entries(erros).some(([chave, mensagem]) => mensagem && chave in VAZIO) && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            Confira o destinatário acima.
          </p>
        )}
      </Card>
    </div>
  );
}

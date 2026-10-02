"use client";

import { useState } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { medidasFaltando } from "@/lib/canaisDeVenda/ml/validacao";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import { filtrarDecimal, lerDecimal, mostrarDigitado } from "./numeros";

const NOMES_DO_MODO = { me2: "Mercado Envios (me2)" };

// `nome` e como `medidasFaltando` chama a medida; `chave` e o campo do envio no rascunho.
const PESO = {
  chave: "pesoKg",
  nome: "peso",
  id: "ml-peso",
  rotulo: "Peso (kg)",
  casas: 3,
  ajuda: "Peso do pacote ja embalado, em quilos. Ate 3 casas: 0,250 sao 250 gramas.",
};
const MEDIDAS = [
  {
    chave: "alturaCm",
    nome: "altura",
    id: "ml-altura",
    rotulo: "Altura (cm)",
    casas: 2,
    ajuda: "Altura do pacote ja embalado, em centimetros.",
  },
  {
    chave: "larguraCm",
    nome: "largura",
    id: "ml-largura",
    rotulo: "Largura (cm)",
    casas: 2,
    ajuda: "Largura do pacote ja embalado, em centimetros.",
  },
  {
    chave: "comprimentoCm",
    nome: "comprimento",
    id: "ml-comprimento",
    rotulo: "Comprimento (cm)",
    casas: 2,
    ajuda: "Comprimento do pacote ja embalado, em centimetros.",
  },
];

/**
 * Campo de numero decimal (virgula ou ponto). Guarda o texto digitado para a virgula nao sumir
 * no meio da digitacao (ver `numeros.js`); o rascunho recebe o numero.
 */
function CampoDecimal({ medida, valor, comErro, aoMudar, children }) {
  const [digitado, setDigitado] = useState(null);
  return (
    <Campo nome={medida.id} rotulo={medida.rotulo} ajuda={medida.ajuda}>
      <input
        id={medida.id}
        inputMode="decimal"
        autoComplete="off"
        value={mostrarDigitado(digitado, valor)}
        onChange={(evento) => {
          const texto = filtrarDecimal(evento.target.value, medida.casas);
          setDigitado(texto);
          aoMudar(medida.chave, lerDecimal(texto));
        }}
        // Ao sair o campo volta ao numero formatado ("5," vira "5").
        onBlur={() => setDigitado(null)}
        className={`${CLASSE_CAMPO} ${bordaDoCampo(comErro)}`}
      />
      {children}
    </Campo>
  );
}

function CaixaDeOpcao({ rotulo, ajuda, marcada, aoMudar }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(evento) => aoMudar(evento.target.checked)}
          className="h-4 w-4 accent-acento"
        />
        {rotulo}
      </label>
      <BolhaDeAjuda variante="inline" texto={ajuda} />
    </div>
  );
}

/**
 * Aba Envio: peso e medidas do pacote (o Mercado Envios precisa dos quatro), o modo de envio e
 * as duas opcoes de entrega. O rascunho guarda o `envio` como um objeto so, e cada mudanca manda
 * o objeto inteiro.
 */
export default function AbaEnvio({ rascunho, alterar, problemas }) {
  const envio = rascunho.envio ?? {};
  const emKit = Boolean(rascunho.composicao);
  const faltando = medidasFaltando(envio);
  const erroDoPeso = problemasDoCampo(problemas, "peso").some((problema) => problema.bloqueante);
  const temErroDeMedida = problemasDoCampo(problemas, "dimensoes").some((problema) => problema.bloqueante);

  // Funcao, e nao o `envio` deste render: o peso do kit pode ser recalculado enquanto o dono digita.
  function mudarEnvio(parcial) {
    alterar((atual) => ({ envio: { ...atual.envio, ...parcial } }));
  }

  return (
    <div className="space-y-4">
      {emKit && (
        <div className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
          Peso sugerido: soma dos itens. Confira as dimensoes da caixa do kit.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <CampoDecimal
          medida={PESO}
          valor={envio[PESO.chave]}
          comErro={erroDoPeso}
          aoMudar={(chave, valor) => mudarEnvio({ [chave]: valor })}
        >
          <MensagensDoCampo problemas={problemas} campo="peso" />
        </CampoDecimal>

        {MEDIDAS.map((medida) => (
          <CampoDecimal
            key={medida.chave}
            medida={medida}
            valor={envio[medida.chave]}
            comErro={temErroDeMedida && faltando.includes(medida.nome)}
            aoMudar={(chave, valor) => mudarEnvio({ [chave]: valor })}
          />
        ))}
      </div>
      <MensagensDoCampo problemas={problemas} campo="dimensoes" />

      <Campo nome="ml-modo-de-envio" rotulo="Modo de envio" ajuda="Somente leitura. Nesta fase o envio e sempre pelo Mercado Envios.">
        <input
          id="ml-modo-de-envio"
          readOnly
          value={NOMES_DO_MODO[envio.modo] ?? envio.modo ?? ""}
          className={`${CLASSE_CAMPO} max-w-xs border-borda bg-fundo text-suave`}
        />
      </Campo>

      <div className="space-y-2">
        <CaixaDeOpcao
          rotulo="Frete gratis"
          ajuda="O frete fica por sua conta: o comprador nao paga o envio."
          marcada={Boolean(envio.freteGratis)}
          aoMudar={(freteGratis) => mudarEnvio({ freteGratis })}
        />
        <CaixaDeOpcao
          rotulo="Retirada no local"
          ajuda="O comprador tambem pode retirar o produto na sua loja."
          marcada={Boolean(envio.retirada)}
          aoMudar={(retirada) => mudarEnvio({ retirada })}
        />
      </div>
    </div>
  );
}

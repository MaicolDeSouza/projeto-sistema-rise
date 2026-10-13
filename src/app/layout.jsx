import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import Sidebar from "@/components/Sidebar";
import { blocosOcultos } from "@/lib/acessos/resolucao";
import { sessaoDeAcessos } from "@/lib/acessos/servidor";
import { sessaoDoRise } from "@/lib/sessao";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Sistema Rise",
  description: "Controle das operações da loja: anúncios, pedidos e estoque.",
};

export default async function RootLayout({ children }) {
  // Quem esta logado (o Remote-User que o login da VPS grava) para o rodape do menu e o botao Sair.
  const acesso = await sessaoDeAcessos();
  const sessao = { ...sessaoDoRise(await headers(), process.env), simulando: acesso.simulando };
  // Lancamento 1 de Acessos: so os blocos cujas telas ja conferem acesso somem do menu; os demais entram no
  // lancamento 2, junto com o resto do Rise.
  const hrefsOcultos = blocosOcultos(acesso.permissoes, ["/rise-ai", "/configuracoes"]);

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar sessao={sessao} hrefsOcultos={hrefsOcultos} />
          <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

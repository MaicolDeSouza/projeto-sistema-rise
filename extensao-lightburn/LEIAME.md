# Rise LightBurn (extensão do Chrome)

Lê as licenças da LightBurn e os PCs ativados em cada uma no **portal de licenças** e leva ao Rise
(**Ferramentas › Licenças Softwares**). É o que mostra as vagas livres de cada chave e o último uso de cada PC.
Spec: `docs/superpowers/specs/2026-11-05-licencas-softwares-design.md`. Medição do portal: `MEDICAO.md`.

## Instalar (uma vez)

1. No Rise: **Configurações › Integrações › LightBurn › Gerar chave da extensão**. Copie a chave (ela aparece uma vez só).
2. No Chrome: abra `chrome://extensions`, ligue **Modo do desenvolvedor** (canto superior direito) e clique em
   **Carregar sem compactação**. Escolha esta pasta (`extensao-lightburn`).
3. Fixe o ícone da extensão na barra, clique nele, abra **Configuração**, cole a chave e confira o endereço do Rise
   (`https://rise.4hobby.com.br`). **Salvar**.

## Usar (quando quiser conferir as vagas; pelo menos uma vez por semana)

1. Entre no portal: `https://lightburn.customer.cryptlex.com/licenses` (com o seu login de sempre).
2. Clique no ícone da extensão e em **Enviar ao Rise**. Não feche a aba até aparecer o resumo (cerca de 1 minuto:
   as ativações vêm em páginas de 50, e o portal demora uns 15 s por página).
3. O resumo diz quantas chaves foram lidas, quantas são novas, quantas mudaram, quantos PCs sumiram e quantos PCs
   ativados estão sem cliente no Rise.
4. No Rise, a tela de licenças mostra o selo "Lido do portal hoje", as vagas livres e o "!" nas chaves com PC sem
   cliente ou que sumiram do portal.

## O que ela faz e o que não faz

- **Só lê o portal.** Todo pedido ao portal é uma consulta (GET); ela não ativa, não desativa, não revoga e não muda
  nada na conta da LightBurn.
- Usa a sessão que já está aberta no portal (o token fica na página e vai só para a API da Cryptlex; nunca vai ao Rise).
- Manda ao Rise as chaves, a situação, a validade, as ativações permitidas e usadas, e de cada PC o nome, o sistema e as
  datas. **Nunca** manda o e-mail nem o nome de quem está logado no portal, nem a localização dos PCs dos clientes.
- O Core/Pro não existe no portal: continua o que você digitou ou o que veio da planilha.
- A chave da extensão vai só para o endereço do Rise configurado, e só nos dois caminhos dela.

## Quando der erro

- **"Abra o portal das licenças da LightBurn e entre"** (botão apagado): a aba ativa não é o portal.
- **"Entre no portal da LightBurn e tente de novo"**: a página não tem sessão. Faça o login e clique de novo.
- **"A sessão do portal expirou"**: recarregue a página do portal (F5), entre se pedir, e clique de novo.
- **"Chave da extensão ausente ou inválida"**: gere outra chave em Integrações e cole na Configuração da extensão.
- **"Leitura incompleta"** (aviso amarelo): alguma página do portal não respondeu. O Rise atualizou o que veio, mas
  não marcou nada como sumido. Clique de novo.

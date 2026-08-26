# Reprodução e downloads em segundo plano

O player usa a integração nativa do `expo-audio` para registrar uma sessão de mídia com título, artista, álbum e capa. Em iPhones com Dynamic Island, o próprio iOS apresenta essa sessão de “Now Playing” na Ilha Dinâmica; a mesma sessão alimenta a Tela Bloqueada e a Central de Controle.

## O que a configuração ativa

- `expo-audio` com `enableBackgroundPlayback`: inclui o modo `audio` no iOS e o serviço de mídia persistente no Android.
- `expo-background-task`: inclui os modos `fetch` e `processing` e acorda o app para retomar a fila persistida de downloads.
- Downloads diretos usam a sessão nativa de transferência em segundo plano. Se o JavaScript for suspenso antes de concluir, a faixa permanece na fila e é retomada na próxima janela concedida pelo sistema.

O sistema operacional decide quando roda uma tarefa de download em segundo plano. O intervalo de 15 minutos é apenas um mínimo; não deve ser apresentado como uma garantia de execução imediata.

## Build e validação no iPhone

Esses recursos não funcionam no Expo Go. O projeto gera o IPA pela ação
**Gerar IPA para iPhone** do GitHub Actions, sem EAS. Antes de disparar a ação,
crie em **Settings → Secrets and variables → Actions → Variables** do
repositório:

- `EXPO_PUBLIC_MUSIC_SERVER_URL`: URL HTTPS da API Vercel.
- `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`: opcional, usado somente pelo login Spotify.

A ação falha cedo se a URL do servidor estiver ausente, impedindo um IPA que
dependa de `localhost`. A ação de APK Android usa as mesmas variáveis.
`SPOTIFY_CLIENT_SECRET` nunca vai para o GitHub Actions, Expo ou app instalado:
ele fica apenas na Vercel.

Valide em um iPhone físico: inicie uma faixa, bloqueie a tela, use play/pause e avanço/retrocesso na Tela Bloqueada, e confira a Ilha Dinâmica. Para downloads, inicie uma faixa para enfileirá-la, coloque o app em segundo plano e confira a Biblioteca após a próxima janela do sistema.

`expo-apple-targets` continua sendo apropriado para uma Live Activity proprietária. Ele não é necessário para a experiência de mídia “Now Playing” do iOS e criaria uma superfície duplicada de controles.

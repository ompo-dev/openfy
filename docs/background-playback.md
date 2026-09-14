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

- `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`: opcional, usado somente pelo login Spotify.

A ação de APK Android usa as mesmas variáveis. O app instalado não usa API
Openfy nem recebe `SPOTIFY_CLIENT_SECRET`; tudo que baixa áudio roda localmente
no aparelho.

O download de faixas do Spotify primeiro identifica o vídeo correspondente e
persiste seu ID na fila. No iPhone, o módulo nativo resolve esse vídeo e salva
áudio AAC/M4A em blocos de 1 MiB na mesma sessão de rede. O fluxo de visitante
usa o perfil `VISIONOS` e a renovação de visitante da biblioteca `ytmusic-rs`
usada pelo Sonora. Não depende de uma URL de áudio gerada pelo JavaScript.

Mudanças nesse módulo exigem gerar e reinstalar o IPA; recarregar o JavaScript
ou usar um IPA anterior não atualiza o código Swift. Nos logs de download,
`audio.native.capability` informa se a instalação tem o método nativo, e
`X-Openfy-Player-Client: VISIONOS` identifica o novo fluxo nas respostas.
`audio.youtube.stream.result` preserva falhas de inicialização e bloqueios do
resolvedor alternativo. Uma resposta `LOGIN_REQUIRED` ou HTTP 403 não é
tratada como arquivo baixado, e o app não fabrica tokens de autorização.

Valide em um iPhone físico: inicie uma faixa, bloqueie a tela, use play/pause e avanço/retrocesso na Tela Bloqueada, e confira a Ilha Dinâmica. Para downloads, inicie uma faixa para enfileirá-la, coloque o app em segundo plano e confira a Biblioteca após a próxima janela do sistema.

`expo-apple-targets` continua sendo apropriado para uma Live Activity proprietária. Ele não é necessário para a experiência de mídia “Now Playing” do iOS e criaria uma superfície duplicada de controles.

## Duração dos arquivos locais

O módulo `openfy-local-audio` normaliza AAC/M4A fragmentado após o download e
antes de abrir arquivos já baixados. O reparo continua inteiramente no aparelho.
Ele não divide a duração por dois nem corta a música pelo tempo do catálogo.
Uma cópia temporária corrige os cabeçalhos vazios de inicialização DASH; um
gravador AVFoundation novo reconstrói o M4A com os pacotes AAC originais.
O arquivo só é substituído depois de validar a duração e o hash de todo o áudio
comprimido. Falhas mantêm o original e permitem uma nova tentativa.

A ação **Validate local audio repair** compila o mesmo código Swift em macOS e
usa um tom sintético de 2 segundos seguido de meio segundo de silêncio. Ela
verifica duração, preservação dos pacotes e repetição sem reprocessar o arquivo.
O teste não baixa músicas nem precisa de credenciais de provedores.

Após instalar o IPA atualizado, reabra uma faixa já baixada e confira o tempo,
o avanço até perto do final e a passagem à próxima faixa. Confira também a
letra sincronizada, a letra simples e o estado sem letra. A validação automatizada
em macOS não substitui essa conferência visual e de reprodução no iPhone.

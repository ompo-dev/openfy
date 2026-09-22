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

Antes de entregar um arquivo de áudio local ao `AVPlayer`, o mesmo módulo
confere a proteção de dados do arquivo e, se necessário, ajusta somente esse
arquivo para `completeUntilFirstUserAuthentication`. Essa classe mantém o
arquivo protegido em repouso antes do primeiro desbloqueio após reiniciar o
iPhone, mas permite leitura depois que a pessoa já desbloqueou o aparelho uma
vez. O app registra a classe encontrada antes/depois para confirmar no aparelho
se algum arquivo estava mais restritivo.

O player móvel mantém a sessão de áudio ativa enquanto troca de estado e reduz
os eventos de progresso para 500 ms. Isso evita trabalho JS desnecessário em
segundo plano sem depender de áudio silencioso, tarefa infinita ou backend. Sem
um crash log ou log nativo do momento da parada, essas mudanças devem ser
tratadas como mitigação e instrumentação, não como prova de causa definitiva.

Preloads são reservados para a janela curta da fila de reprodução. A Home pode
resolver URLs para manter cards prontos para toque, mas não cria preloads nativos
para todos os cards visíveis. `expo-audio` implementa preload nativo com players
retidos; manter isso sem dono para a Home acumula buffers/players durante uso em
segundo plano. O serviço do player também limita os preloads retidos e cancela
operações pendentes antes que elas recriem uma entrada nativa já liberada.

Ao selecionar outra faixa, o serviço invalida carregamentos anteriores e pausa
imediatamente o áudio. A mesma instância recebe `replace()` depois que a fonte
nova está pronta. Não são criados players audíveis independentes para cada faixa.
Ao fechar o player, `remove()` e `release()` liberam o registro e o objeto nativo.
Falhas na limpeza de listeners não impedem essa liberação.

O patch versionado `patches/expo-audio+57.0.4.patch` é aplicado pelo `postinstall`
e exige um novo IPA (runtime 1.0.1). Ele corrige três comportamentos do SDK instalado:

- Remove comandos remotos usando os tokens retornados por `addTarget(handler:)`,
  inclusive ao reativar o mesmo player. `removeTarget(self)` não removia esses handlers.
- Carrega capas locais como arquivos, reduz somente a imagem da tela bloqueada
  para até 512 pixels, cancela pedidos de capas antigas e não repete uma falha a
  cada evento de progresso. As capas da biblioteca e do player completo não mudam.
- Filtra progresso repetido antes da ponte nativa/JS em segundo plano. Transições,
  erros, fim da faixa e seeks continuam emitindo eventos. O iOS calcula o progresso
  da tela bloqueada a partir da posição e velocidade já informadas.

Referências: [comandos remotos](https://developer.apple.com/documentation/mediaplayer/mpremotecommand/addtarget(handler:)),
[tempo decorrido](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfopropertyelapsedplaybacktime),
[trabalho em segundo plano](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/WorkLessInTheBackground.html).

Na entrada em segundo plano, os preloads pendentes são cancelados e os buffers
dos vizinhos são liberados. Eventos de progresso repetidos não atualizam as telas
ocultas; fim da faixa, erro e mudanças de reprodução continuam chegando à fila.
Ao voltar ao app, a posição é lida novamente do player nativo. A recuperação de
uma faixa baixada usa o próprio arquivo e a última posição conhecida, sem buscar
uma nova URL na rede.

A ação **Validate local audio repair** compila o mesmo código Swift em macOS e
usa um tom sintético de 2 segundos seguido de meio segundo de silêncio. Ela
verifica duração, preservação dos pacotes e repetição sem reprocessar o arquivo.
O teste não baixa músicas nem precisa de credenciais de provedores.

O job `validar-audio-local` também executa o filtro nativo de eventos com 2.400
ticks simulados em segundo plano, transições e retorno ao primeiro plano. Isso
valida a lógica, mas não reproduz o encerramento no aparelho. Um relatório
`Openfy*.ips` ou `JetsamEvent*.ips` com horário correspondente ainda é necessário
para distinguir crash nativo, watchdog, pressão de memória e limite de CPU.

Após instalar o IPA atualizado, reabra uma faixa já baixada e confira o tempo,
o avanço até perto do final e a passagem à próxima faixa. Confira também a
letra sincronizada, a letra simples e o estado sem letra. A validação automatizada
em macOS não substitui essa conferência visual e de reprodução no iPhone.

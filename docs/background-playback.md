# Reprodução e downloads em segundo plano

## Correção da biblioteca offline e início rápido (novembro de 2026)

- Downloads concluídos são indexados a partir de `openfy_downloads` e confirmados por listagem do diretório local antes de receber o indicador de arquivo baixado. Um registro antigo sem arquivo não deve aparecer como reproduzível offline.
- URLs absolutas guardadas por builds anteriores podem apontar para um sandbox antigo do iOS. O player reconstroi o caminho dentro do `FileSystem.documentDirectory` atual e tenta validar o arquivo antes de recorrer à rede. Nenhum conteúdo é baixado novamente durante essa recuperação.
- O player verifica o arquivo da música **antes** da hidratação de disponibilidade, resolução de provedores ou outros caches de streaming. A música selecionada offline não precisa consultar um resolvedor remoto para começar.
- Um arquivo de download já concluído pode abrir sem repetir o reparo de contêiner no caminho crítico. Se a inicialização local falhar, o player tenta novamente com a preparação/reparo normal; o arquivo original não é descartado.
- Pausar durante uma queda de rede não impede retomar um item que já esteja carregado no motor de áudio. O alerta modal duplicado foi removido do caminho de reprodução, mantendo o aviso discreto quando não há nenhum arquivo local disponível.
- O índice fica em memória por 30 segundos e é invalidado após alterações de downloads. Na inicialização, uma listagem do diretório evita centenas de chamadas individuais para arquivos normais. Arquivos fora da pasta gerenciada são verificados individualmente.

**Teste em aparelho:** baixar três músicas, entrar em modo avião, abrir cada faixa pela Home, biblioteca e playlist, avançar/voltar, pausar/retomar; conferir que nenhum resolvedor de rede é chamado. Repetir após atualizar o IPA mantendo os arquivos de Documents. Remover um arquivo manualmente e verificar que a interface não o marca como disponível. Comparar o tempo de toque até primeiro áudio, com arquivo novo e com download anterior à migração.


## Buffer temporário de streaming no iPhone (novembro de 2026)

**Problema:** uma faixa reproduzida via rede não era equivalente a uma faixa baixada. O `AVAssetResourceLoader` fazia solicitações HTTP Range com cache LRU de apenas 8 MiB, insuficiente para manter a música inteira após perda de conexão.

**Novo fluxo iOS:**

1. O usuário toca e o AVPlayer começa normalmente por HTTP Range, sem esperar a transferência integral. O cabeçalho/prefixo já preparado continua sendo reutilizado.
2. Um `YouTubeTemporaryPlaybackBuffer` cria um arquivo esparso no diretório temporário do aplicativo, exclusivo para a sessão de reprodução. Somente intervalos confirmados com HTTP 206, tamanho exato e `Content-Range` correto são marcados como disponíveis.
3. O `YouTubeHTTPRangeClient` consulta primeiro esse arquivo e só solicita a rede se a região estiver ausente. Leituras fora de ordem e seeks são suportados. O limite por faixa é **128 MiB**, para não consumir armazenamento indefinidamente.
4. **Depois do primeiro áudio**, uma tarefa de baixa prioridade inicia o preenchimento progressivo do restante da faixa, em intervalos de 512 KiB. Ela compartilha o mesmo cache do player; não salva a música na biblioteca de downloads e não troca o áudio em reprodução.
5. Se a rede cair, todas as regiões já armazenadas continuam disponíveis localmente. Quando um intervalo ainda não foi recebido, a requisição do AVPlayer tolera erros de conectividade transitórios por até **15 segundos**, aguardando o retorno da conexão. Erros de autorização/HTTP 403 não são tratados como simples queda.
6. O buffer é cancelado e excluído ao fechar/trocar de faixa. Os arquivos órfãos de encerramentos abruptos são limpos depois de seis horas. O token de sessão impede que uma limpeza antiga exclua o arquivo de uma nova reprodução.

O buffer temporário é **diferente do download offline persistente**: não é exibido na Biblioteca, não permite baixar conteúdo de forma implícita para outras sessões e não promete audição offline indefinida. Uma queda só pode ser atravessada por todo o restante da música quando os bytes necessários já tiverem sido recebidos; uma conexão lenta, falha imediata após o play, espaço insuficiente ou mídia maior que 128 MiB podem limitar essa proteção. O armazenamento provisório usa a proteção de arquivos adequada para reprodução após o primeiro desbloqueio do iPhone.

O novo evento nativo `onNativePlaybackCache` informa estágios `started`, `progress`, `complete` e `interrupted`, além de `bufferedBytes` e `totalBytes`. O JS registra `native temporary streaming cache`; os estágios finais aparecem em diagnósticos como `native-cache-complete` e `native-cache-interrupted`. Não registrar URLs assinadas, credenciais ou dados binários.

**Disponibilidade:** somente o player YouTube nativo iOS tem essa implementação de buffer temporário compartilhado. Os caminhos com `expo-audio` no Android/web ainda usam as políticas de buffering de cada plataforma, sem garantia equivalente de arquivo temporário completo. É necessário **recompilar e instalar o IPA**; uma atualização OTA JavaScript não instala o novo código Swift.

**Validação obrigatória em iPhone:** reproduzir uma faixa de 4–8 minutos; esperar `native-cache-complete`, desativar Wi-Fi e dados móveis e confirmar que a música termina normalmente; repetir interrompendo a rede após 25%, com retorno em até 15 segundos; testar seek dentro e fora das regiões armazenadas, tela bloqueada, avançar rapidamente para outra música e verificar a limpeza do buffer. Comparar tempos de primeiro áudio e uso de rede antes/depois. O teste macOS `scripts/check-youtube-playback-cache.swift` valida o buffer com dados sintéticos; **não equivale à validação física do AVPlayer**.

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
segundo plano sem depender de áudio silencioso, tarefa infinita ou backend.

## Causa confirmada do encerramento no iPhone

O relatório `Openfy-2026-09-24-124042.ips`, referente à versão 1.0.1 build 13,
confirmou um encerramento por limite de CPU: 48 segundos de CPU em 53 segundos
(média de 91%) enquanto o app não estava em primeiro plano. A pilha amostrada
passava pelo temporizador do JavaScript, `setNativeProps`, commits da árvore de
interface e recálculo de layout do Yoga.

A origem era o equalizador animado usado nas notas e em listas de músicas. Ele
alterava a propriedade `height` continuamente com o driver JavaScript. Uma
segunda implementação duplicada continuava montada dentro do modal de nota.
Como a sessão de áudio mantém o processo vivo com a tela bloqueada, esses ciclos
visuais continuavam recalculando o layout até o watchdog do iOS encerrar o app.

Na versão 1.0.2, o equalizador usa altura fixa e anima apenas `scaleY` com o
driver nativo. Todas as animações visuais observam uma única assinatura de
`AppState`, param ao entrar em `inactive` ou `background` e só reiniciam ao
voltar para `active`. A implementação duplicada foi removida e modais ocultos
não mantêm o ciclo ativo.

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
e exige um novo IPA (runtime 1.0.2). Ele corrige três comportamentos do SDK instalado:

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
ticks simulados em segundo plano, transições e retorno ao primeiro plano. O
relatório do build 13 permitiu distinguir o limite de CPU de crash nativo,
pressão de memória ou falha do arquivo de áudio. A validação final da correção
continua sendo feita em aparelho físico com o IPA 1.0.2 ou posterior.

Após instalar o IPA atualizado, reabra uma faixa já baixada e confira o tempo,
o avanço até perto do final e a passagem à próxima faixa. Confira também a
letra sincronizada, a letra simples e o estado sem letra. A validação automatizada
em macOS não substitui essa conferência visual e de reprodução no iPhone.

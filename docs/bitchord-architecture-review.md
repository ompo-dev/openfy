# BitChord: arquitetura, fluxos e referencias para o Openfy

## Escopo

Analise estatica em 11 de outubro de 2026 da copia local
`BitChord-main/BitChord-main`. Branch de trabalho do Openfy:
`codex/bitchord-integration`, criada a partir de `1b2d763`.

Esta etapa prepara as proximas mudancas: nao altera o comportamento do Openfy,
nao importa codigo do BitChord e nao modifica a copia analisada. O nome da branch
nao representa uma decisao de integrar uma biblioteca ou migrar de framework.

Foram inventariados todos os caminhos dos modulos e rastreados os pontos de
entrada, contratos e fluxos principais. O inventario de arquivos de codigo
(`kt`, `kts`, `java`, `go`, `cpp`, `cc`, `c`, `h`) nos seis modulos abaixo tem
735 arquivos, incluindo testes e codigo de terceiros. A leitura aprofundada
concentrou-se nos arquivos indicados neste documento; nao foi uma leitura
linha a linha de todos esses arquivos.

Nao foram executados builds, testes, instaladores, provedores externos ou
medicoes de desempenho. Tempos relatados nos comentarios do BitChord nao sao
resultados medidos nesta analise. A copia extraida nao fornece um commit Git
verificavel; os valores de versao citados sao os declarados nela.

## Estrutura e plataformas

| Modulo | Responsabilidade | Arquivos de codigo |
| --- | --- | ---: |
| `app` | App Android, bootstrap, sessoes, Media3, downloads e adaptadores de UI | 343 |
| `shared` | Modelos, catalogo, parsers, letras, matching, fila e planejamento de transicoes | 115 |
| `sharedUi` | Telas e componentes Compose compartilhados, player e letras | 67 |
| `desktopApp` | App JVM, integracao com o sistema e motor de audio desktop | 186 |
| `backend` | Salas de reproducao conjunta e presenca, em Go | 14 |
| `native` | Analise DSP em C/C++ e ponte do decoder FFmpeg | 10 |

`settings.gradle.kts` inclui o Android somente quando encontra um SDK valido.
`shared` e `sharedUi` possuem alvos Android/JVM e um source set
`jvmSharedMain`; nao possuem alvos iOS ou web. O backend nao fornece o catalogo
musical nem transporta o audio de cada faixa.

Versoes relevantes declaradas:

- Kotlin 2.3.20; Android Gradle Plugin 8.10.1; plugin Compose 1.10.3.
- App Android: minSdk 26, compileSdk 37, targetSdk 36; versionName `1.8`.
- Android: Media3 1.11.0; Coil 3.0.4; Haze 1.3.1.
- Catalogo compartilhado: Ktor/OkHttp, JSON Kotlin, InnerTubeX e NewPipeExtractor.
- Desktop: JDK 21, Compose, FFmpeg via JavaCPP, JNA e integracoes nativas.
- Automix: frontend C++ e modelos ONNX, com runtimes especificos por plataforma.

As dependencias nao usam todas a mesma versao entre os modulos. Os arquivos
Gradle prevalecem sobre instrucoes antigas: `CONTRIBUTING.md`, por exemplo,
ainda descreve compileSdk 36, mas o app declara 37.

## Fronteiras de responsabilidade

```text
Android: BitChordApplication -> MainActivity / MainViewModel
Desktop: Main.kt -> DesktopApp / adaptadores desktop
                            |
             sharedUi: telas, componentes, player
                            |
        shared: Song, paginas, catalogo, fila, letras
             |                         |
    YtMusicRepository             QueueTimeline
    Innertube / Parser                 |
             |               adaptador de reproducao
    StreamResolver / fontes            |
             |                 Android: Media3
     URL + headers + formato   Desktop: FFmpeg + sink
```

`AppUiHost` e `PlayerHost` injetam capacidades da plataforma na UI compartilhada.
Volume, saidas de audio, configuracoes, Canvas e dialogs nao precisam ser
implementados dentro de cada tela. Isso nao significa que o motor de audio
seja compartilhado: Android e desktop usam motores diferentes.

Os limites conceituais sao uteis, mas a composicao ainda possui arquivos muito
grandes: `MainActivity.kt` tem 5.381 linhas, `MainViewModel.kt` 3.240,
`PlaybackService.kt` 8.337 e `NowPlayingScreen.kt` 3.664. Nao devemos transportar
essa concentracao de responsabilidades para componentes do Openfy.

## Modelo e identidades

Referencia: `shared/.../data/model/Models.kt` e `ArtistCredits.kt`.

- `Song.videoId`: identidade da faixa no catalogo YouTube; fontes alternativas
  tambem possuem chaves com namespace proprio.
- `ArtistRef`: nome exibido e `browseId` do artista creditado.
- `artistId`: referencia do artista principal; `artists`: lista dos creditos.
- `albumId` / `albumName`: lancamento associado, separado da origem do play.
- `setVideoId`: identidade da ocorrencia de uma faixa dentro de uma playlist.
- `queueEntryId`: identidade estavel da entrada de fila, mesmo quando a mesma
  faixa aparece mais de uma vez.
- `playbackSource`, tipo e ID: contexto onde a reproducao foi iniciada.
- `localUri` / `localPath`: copia local; nao sao requisitos para exibir a faixa.
- `HomeShelf`, `HomeFeed`, `DetailPage` e `UiState`: contratos para paginas,
  continuacoes, carregamento, sucesso e erro.

`InnertubeParser.creditsOf` preserva os endpoints de todos os artistas linkados
nos runs dos creditos. Nomes e IDs nao devem ser substituidos pelo uploader do
video. `ArtistNameIndex` guarda os canais que ja foram explicitamente informados
para um nome e so responde quando existe um unico canal conhecido.

Limites importantes: o BitChord tambem possui fallback por nome exato, que nao
resolve por si so homonimos. `completeArtistCredits` pode deixar nomes sem
canal fora da lista de referencias. No Openfy, preservar os participantes
conhecidos, inclusive os metadados Spotify, continua sendo necessario; resolver
o canal de navegacao nao pode apagar creditos nem trocar o artista principal.

## Inicializacao e navegacao

Referencias: `BitChordApplication.kt`, `MainActivity.kt`, `MainViewModel.kt`.

1. Instala os adaptadores de UI/player e configura os hooks de streaming.
2. Abre armazenamento de autenticacao, seleciona conta/perfil e prepara a sessao.
3. Inicializa configuracoes, fontes, downloads, historico, cache e integracoes.
4. Configura o loader de imagens e publica as telas Compose.
5. O ViewModel coordena os pedidos e publica StateFlows por dominio.

Parte da inicializacao roda em outra thread, mas o bootstrap faz `join` dessa
thread antes de concluir. Nao e uma inicializacao totalmente adiada.

Detalhes usam uma pilha de `DetailPage`. `openDetail` publica imediatamente o
cabecalho conhecido no cartao, evita duplo toque durante o carregamento e depois
substitui os dados pela resposta correta. Copias baixadas podem aparecer antes
da resposta online; uma falha de rede nao deve esconder essa copia.

Para albuns/playlists, `browseSongs` devolve a primeira pagina. `fillIn` espera
150 ms e publica as continuacoes, verificando se a pagina ainda existe e se
houve itens novos. Acoes que precisam da colecao inteira usam `allSongs` /
`collectSongs`, em vez de chamar a primeira pagina de colecao completa.

Excecao: `artistPage` espera a lista completa de musicas e as prateleiras de
lancamentos antes de retornar. Esse fluxo nao deve ser copiado como referencia
de abertura instantanea de perfil no Openfy.

## Home, busca e biblioteca

Referencias: `MainViewModel.kt` e `sharedUi/.../ui/screens/`.

### Home

O carregamento central, o historico e os complementos sao pedidos separadamente.
As prateleiras podem ser publicadas conforme ficam prontas. A geracao do pedido
e a identidade da sessao impedem respostas antigas de substituir a Home atual.
O historico recente tem prioridade sobre copias antigas presentes no feed.
Duplicacao de prateleiras considera titulo e identidades dos itens.

### Busca

A busca completa ocorre no submit, escolha de sugestao/historico ou filtro.
Autocomplete textual e typeahead de entidades usam fluxos separados. Ha cache
de resultados exatos e reutilizacao provisoria de prefixos, com protecao contra
respostas atrasadas. A paginacao inicia perto do fim da lista.

`SearchHistory` persiste entidades em JSON, com 20 entradas, remocao individual
e limpeza. Escolher uma sugestao tira o foco do campo. O layout reserva espaco
para o top bar do BitChord: copiar esse padding para o Openfy recriaria o espaco
vazio acima da busca, pois as duas navegacoes nao tem o mesmo cabecalho.

### Biblioteca e componentes

Biblioteca combina colecoes da conta YouTube com downloads, musica local e
playlists locais/importadas. Sincronizacao posterior de curtidas nao bloqueia
a primeira pagina. Pinados e ordenacao sao configuracoes expostas pelo host.

`Common.kt` fornece `SongRow`, estados de reproducao, badges e geometria comum.
`ShelfCard` usa capa com proporcao fixa e variante circular para artistas.
`ShelfRow`, grids e LazyColumn/LazyRow limitam a composicao ao necessario.
Carregamento de paginas e virtualizacao nao equivalem a animar a entrada de
cada item: a revelacao progressiva do Openfy deve continuar sendo uma decisao
explicita dos nossos componentes.

## Reproducao e streaming Android

Referencias: `PlayerConnection.kt`, `PlaybackService.kt`, `StreamResolver.kt`,
`ChunkedDataSource.kt`, `AudioCache.kt`, `StreamChoice.kt`.

```text
toque -> fila/contexto -> Song.toMediaItem
                         | copia local valida: file/content
                         | streaming: URI logica bitchord://
                                      |
                              CacheDataSource
                                      |
                            ResolvingDataSource
                                      |
                         URL real + headers corretos
                                      |
                       ChunkedDataSource -> OkHttp
                                      |
                             decoder -> DSP -> sink
```

`Song.toMediaItem` escolhe a copia local antes da cadeia HTTP e verifica se ela
existe. O resolver roda quando o loader do player precisa abrir o stream, nao
para renderizar um cartao. `MediaLibrarySession` conecta o motor a notificacao,
controles do sistema e navegacao Android Auto.

`StreamResolver` coalesce pedidos simultaneos por video, usa cache de URL com
TTL de 20 minutos e mantem negativas temporarias para falhas definitivas.
O trabalho compartilhado remove seu registro ao terminar, nao quando um unico
consumidor cancela a espera. InnerTubeX e a primeira estrategia; NewPipe e uma
alternativa. A resolucao trata cliente, assinatura, tokens e headers como parte
do pedido de midia, incluindo exclusao de clientes que entregaram URLs recusadas.

O streaming le ranges limitados para URLs progressivas com tamanho conhecido.
Nao exige o arquivo inteiro para iniciar. O load control declara 500 ms para
iniciar e 2.000 ms para retomar apos rebuffer, embora permita acumular um buffer
maior depois. Esses limites nao sao uma garantia de latencia total: resolucao,
rede, inicializacao do decoder e disponibilidade da fonte tambem contam.

### Cache e aquecimento

- O cache de bytes fica acima do resolvedor, usando identidade da faixa/versao,
  e nao apenas a URL temporaria.
- A fonte escolhida fica fixada durante a leitura: nao mistura bytes de WebM,
  MP4 ou FLAC no mesmo arquivo quando uma URL e reaberta.
- A proxima faixa pode ter os primeiros bytes e depois o restante aquecidos em
  background; a seguinte recebe somente resolucao de URL.
- Esse aquecimento espera 8 segundos e troca de alvo quando a fila muda.
- Faixas baixadas nao provocam busca redundante de bytes na rede.
- Playback ignora erro de escrita no cache e segue streaming. Prefetch nao
  esconde esse erro, para evitar gastar dados sem armazenar nada.

### Recuperacao

`recoverFrom` distingue arquivo local ausente, fonte alternativa recusada,
container/manifest incorreto e stream realmente indisponivel. Descarta escolhas
e bytes incompativeis antes de tentar outra fonte, protege o orcamento de
tentativas contra o evento produzido pelo proprio retry e confirma que a faixa
ainda e atual antes de retomar. Uma faixa que nao pode iniciar nao deve prender
a fila indefinidamente.

## Fila e fontes de audio

`QueueTimeline` concentra regras puras compartilhadas. Android aplica essas
regras por `QueueCoordinator`; desktop usa sua propria lista e motor.

Tres grupos: contexto, fila manual e autoplay. Ao iniciar uma colecao, preserva
o historico anterior ao item selecionado, toca esse item, intercala a fila
manual pendente e depois continua o contexto. IDs de entrada sobrevivem as
transformacoes. Shuffle, salto, limpar fila manual e repeat nao devem alterar
grupos que nao fazem parte daquela acao.

`MusicSource` separa search/stream/health e devolve URL, headers e formato.
`SourceRegistry` persiste fontes habilitadas. YouTube e o catalogo principal e
a fonte ativa inicial; outros provedores sao opcionais, nao uma obrigacao.

`SourceResolver` pode disputar fontes para iniciar pelo primeiro audio
utilizavel e continuar procurando qualidade melhor em background. Downloads
e upgrades possuem politicas mais pacientes e verificacoes mais estritas.
Qualidade por rede nao sobrescreve a preferencia permanente de habilitar fonte.

`TrackMatcher` considera titulo, marcadores de versao, artista, duracao, album
e edicao explicita. Existem excecoes de matching; elas sao heuristicas, nao
prova de que dois audios sao a mesma gravacao. `SpotifyImporter.matchTrack`
ainda pode recorrer ao primeiro resultado quando o matcher nao encontra um
vencedor. Esse fallback nao deve virar politica do Openfy.

Add-ons usam manifest/search/stream HTTP JSON. Modulos JavaScript legados ainda
existem via QuickJS/Graal, mas sao outra capacidade, com superficie de risco
maior. Uma analise do protocolo nao autoriza instalar ou executar provedores.

## Downloads e musica local

Referencias: `Downloads.kt`, `DownloadService.kt`, `DownloadSession.kt`,
`Downloader.kt`, `DownloadStore.kt`, `MediaTagger.kt`, `OfflineHls.kt`,
`OfflineDash.kt`, `LocalMediaRepository.kt`.

Downloads pertencem a um servico foreground, nao ao modal. Quatro workers
drenam a fila; fechar a tela nao cancela o lote. Estados individuais distinguem
Queued, Running, Done e Failed. O indicador de sessao pode permanecer ate o
usuario ver o resultado, mesmo apos o trabalho terminar.

A preparacao separa resolucao/qualidade da transferencia. A qualidade e capturada
para aquela operacao. A transferencia usa ranges, progresso e recuperacao
limitada de URL expirada. A escrita usa MediaStore pendente ou arquivo `.part`;
tags e arte sao adicionadas antes de publicar o arquivo. Falha aborta o destino.
HLS/DASH usam pacotes offline especificos, nao fingem ser um unico arquivo MP4.

Ha metadados persistentes das copias e colecoes, validacao de caminhos e apoio
a musica local, WebDAV e SMB. A sessao de downloads e a fila em andamento nao
sao um sistema duravel de retomada apos morte do processo: esse limite e
explicitamente diferente de apenas sobreviver ao fechamento do modal.

## Letras e timing

Referencias: `LyricsRepository.kt`, `LyricLine.kt`, `TtmlLyrics.kt`,
`EnhancedLrc.kt`, `PlayerLyrics.kt`, `LyricClock.kt`, `LyricsTranslation.kt`.

O repositorio consulta provedores habilitados em paralelo, mas aceita respostas
na ordem de prioridade do usuario. Letras por palavra/silaba podem ter
preferencia sobre letras por linha; texto simples e fallback. Genius e iniciado
sob demanda quando as opcoes anteriores nao respondem. Perdedoras sao canceladas.

ISRC conhecido evita uma busca de identidade; quando habilitada, a identificacao
preliminar tem orcamento de 2,5 segundos. Parsers produzem um modelo de linhas,
palavras/silabas e vozes de apoio usado pelo mesmo renderer.

`LyricClock` interpola frames a partir da posicao e do momento monotonicamente
registrado pelo player. Leituras atrasadas nao fazem a letra andar para tras;
seek/troca/reinicio sao descontinuidades explicitas. Estado de pausa interrompe
o relogio visual. Isso evita atualizar toda a tela com o tick de cada palavra.

Traducao/romanizacao sao solicitadas separadamente, possuem cache limitado e
preservam os timestamps originais. O destaque do texto traduzido e uma projecao
visual aproximada, nao alinhamento fonetico comprovado.

## UI, vidro e transicoes

### Mini player e player

Referencias: `PlayerSheetMotion.kt`, `PlayerDock.kt`, `NowPlayingScreen.kt`.

Uma posicao em pixels coordena modal, gesto, progresso de abertura e capa.
`PlayerDock` transforma os dois cantos do mini player para coordenadas de tela,
pois uma janela modal Android nao possui a mesma origem da janela principal.
`NowPlayingScreen` desenha a capa em uma camada compartilhada, interpolando
posicao, dimensoes e raio; nao depende de duas capas visiveis em crossfade.

Fechar pede a mesma animacao coordenada e so desmonta o modal ao terminar.
Tap, gesto e back seguem o mesmo caminho; animacoes extras da janela sao
controladas para nao duplicar o movimento. A capa pequena so fica oculta quando
a camada do modal esta conectada. Reduce motion possui um caminho separado.

No desktop, o player fica dentro da janela e permanece montado durante a saida;
nao usa o popup modal que tomaria os atalhos e as teclas de midia.

### Material glass

`LiquidGlass.kt` combina backdrop, blur, vibrancy, lente, borda, highlight e
sombra. A captura reduzida a 0,33 da resolucao diminui o volume de pixels.
Blur por RenderEffect depende de API 31; refracao por RuntimeShader depende
de API 33. A variante leve usa tint/borda sem o mesmo custo de lente/captura.

O backdrop precisa de uma base opaca correta para nao mostrar texto nitido
por baixo do blur. Haze compartilhado tambem usa escala de entrada reduzida.
As superficies respeitam tema/contraste e a opcao de reduzir blur dinamico.

Essas primitivas sao Compose/Android, nao Liquid Glass nativo Apple e nao CSS.
No Openfy precisamos manter `GlassSurface` e seus adaptadores por plataforma;
uma eventual refracao Android exige trabalho nativo proprio, nao copiar um
modifier Kotlin dentro de um componente React Native.

### Aparencia

Capas, paletas extraidas e Canvas orientam o fundo do player. Pedidos de imagem
do player sao estabilizados e compartilhados entre superficies, com retries
limitados. A geometria de capas/cards e independente do texto dinamico.
O app embute SF Pro Display; fontes e outros assets precisam de verificacao
propria antes de qualquer reutilizacao. Nao assumir que a licenca raiz cobre
direitos de distribuicao de todos os assets.

## Desktop, integracoes e backend

Desktop reaproveita catalogo, fila, modelos e player visual. Seu motor decodifica
com FFmpeg, possui leitura HTTP por ranges, decode-ahead, DSP, crossfade e
seleciona saidas com adaptadores da plataforma. Integra tray, teclas de midia,
Windows SMTC e Linux MPRIS. Os pacotes incluem runtime e recursos nativos;
nao sao builds web do mesmo aplicativo.

Integracoes inventariadas: contas Google/YouTube, Spotify library/import/Canvas,
Last.fm/ListenBrainz, Discord, Cast, biblioteca local/remota e Replay/estatisticas.
Android persiste configuracoes em SharedPreferences e usa armazenamento
criptografado para sessoes. Existe fallback explicito para preferences em texto
claro quando o Keystore falha; isso nao deve ser adotado sem uma decisao propria
de seguranca. Desktop tambem tem caminhos de persistencia/segredos por sistema.

O backend Go guarda salas em memoria e transmite estado por WebSocket. Posicao
e timestamp do servidor formam uma ancora; ping estima diferenca entre relogios.
Resume/seek podem ser agendados adiante e heartbeats corrigem estado perdido.
O servidor limita tamanho/frequencia das mensagens, salas e participantes.
Tokens de sala autenticam as acoes posteriores, mas a identidade Google
declarada no join nao e verificada pelo servidor. Reiniciar o processo perde
as salas; nao ha banco de dados nesse servico.

Atualizacao do BitChord usa GitHub Releases/APK ou pacotes desktop, com estados
de download. Nao e o fluxo OTA/push do Openfy; `AppUpdateChecker` consulta
releases a cada abertura, justamente um comportamento que nao devemos importar.

## Testes, CI e limites da referencia

O inventario encontrou 164 arquivos com nomes de teste: Android 89, desktop 55,
shared 8, sharedUi 6 e backend 6. Isso conta arquivos, nao casos executados.
Foram lidos exemplos de creditos, fila/contexto e relogio de letras.

`.github/workflows/check.yml` configura testes/builds Android, desktop nos tres
sistemas e Go build/vet/test. Outros workflows cuidam de APK assinado, pacotes
de release, deploy do backend e manutencao do repositorio.

Limites para qualquer etapa seguinte:

- APIs privadas, parsers, assinaturas, tokens e headers sao dependencias instaveis.
- Metadados de qualidade, formato decodificado e capacidade de saida nao provam
  o formato fisicamente reproduzido no dispositivo.
- Nenhum resultado de teste/CI ou desempenho foi confirmado nesta leitura.
- Os modelos visiveis nao tornam todo o codigo automaticamente modular.
- O BitChord nao tem o suporte iOS/web que o Openfy precisa preservar.
- GPLv3 na raiz, glue glass atribuido a Echo/GPLv3, backdrop Apache-2.0,
  analise nativa com avisos AGPLv3 e partes DST LGPL requerem verificar cada
  origem antes de reutilizar codigo. O Openfy declara MIT. Esta etapa copia
  conceitos arquiteturais, nao implementacoes, fontes ou assets.

## Mapeamento para a proxima etapa do Openfy

| Referencia BitChord | Ponto existente no Openfy | Direcao a avaliar |
| --- | --- | --- |
| `PlayerSheetMotion` / `PlayerDock` | `components/native/PlayerModal.tsx`, `components/Player/` | Um progresso compartilhado para gesto, modal e capa, com coordenadas consistentes |
| `LiquidGlass` / `OptimizedHaze` | `components/native/GlassSurface*`, `glassMaterial.ts`, `GlassBackdrop.tsx` | Melhorar material sem perder isolamento de captura nem o caminho Apple nativo |
| `SongRow` / `ShelfCard` | `components/Home/`, `components/Library/`, `components/Search/` | Variantes de tamanho e estados uniformes nos componentes existentes |
| `StreamResolver` / `AudioCache` | `services/audio/playerService.ts`, `youtubeStreamResolver.ts`, `modules/openfy-youtube/` | Reuso seguro, cache por versao e recuperacao sem bloquear o primeiro audio |
| `ArtistRef` / `creditsOf` | `services/search/trackCredits.ts`, `services/search/artistIdentity.ts`, `services/library/artistChannelHydration.ts` | Preservar participantes e usar endpoints reais para navegacao |
| `QueueTimeline` | `context/PlayerContext.tsx` e estado de fila | Separar identidade de faixa, ocorrencia e origem de reproducao |
| Paginas/continuacoes | `api/`, `services/library/`, componentes de listagem | Mostrar cabecalho primeiro e manter filas consistentes com o catalogo |
| `DownloadService` / `DownloadSession` | `context/DownloadContext.tsx`, servicos de import/download | Trabalho independente do modal, notificacao e resultado recuperavel |
| `LyricClock` / modelos de letras | `services/lyrics/lyricsService.ts`, `SyncedLyricText*` | Timing monotonicamente datado, seek explicito e render isolado |

Prioridade sugerida, sem iniciar implementacao nesta etapa:

1. Definir a primeira mudanca de produto e seus criterios de aceite.
2. Preservar contratos de catalogo/creditos e testar a mesma fila em tap/play/shuffle.
3. Consolidar movimento de capa/modal e estados dos componentes existentes.
4. Evoluir streaming/cache e carregamento progressivo com metricas por fase.
5. Avaliar funcionalidades novas separadamente: Automix, letras avancadas,
   fontes opcionais e reproducao conjunta nao precisam entrar no mesmo pacote.

Antes de implementar, validar os fluxos no iOS, Android e web: arrastar e cancelar
fechamento, retomar faixa recente, pular fonte invalida, homonimos de artistas,
creditos numerosos, colecoes paginadas e downloads apos fechar o modal. A nova
arquitetura deve aproveitar os limites que o Openfy ja possui, nao criar outro
player, outro cache de dominio ou outra biblioteca dentro das telas.

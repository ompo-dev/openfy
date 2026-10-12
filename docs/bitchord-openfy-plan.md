# Reforma do Openfy: catalogo, letras, configuracoes e audio

## Escopo confirmado

Branch `codex/bitchord-integration`. A referencia e a copia local do BitChord
analisada em `bitchord-architecture-review.md`. Nao copiar implementacoes GPL,
assets ou fontes. Preservar React Native/Expo e suporte iOS, Android e web.

Google login, Last.fm, ListenBrainz, Discord, WebDAV/SMB e salas de reproducao
conjunta ficam fora desta fase, conforme resposta do usuario.

## Contratos e fluxo de catalogo

1. Uma faixa conserva identidade do catalogo, video de reproducao, participantes
   ordenados, lancamentos associados e origem da fila como dados diferentes.
2. YouTube Music fornece endpoints reais dos artistas. Spotify complementa
   identidade da gravacao e creditos; o uploader nao substitui participantes.
3. Nunca deduplicar homonimos por nome. Cache de nome so e utilizavel quando
   existe um unico endpoint conhecido; ambiguidades permanecem explicitas.
4. Renderizar primeiro os metadados conhecidos e a primeira pagina. Continuacoes
   enriquecem a mesma colecao. Play, shuffle e toque usam o mesmo catalogo.
5. Resolver audio somente para tocar/aquecer/baixar. Letras e perfis nunca devem
   bloquear o primeiro audio. Falhas de uma fonte nao bloqueiam a fila inteira.

Primeira correcao: entregar os endpoints dos creditos sem aguardar uma visita
ao perfil de cada participante. Nome creditado permanece o fornecido pelo
catalogo; fotos, biografias e nomes de canais sao enriquecimentos posteriores.

## Letras

- Remover editor, JSON, seletores de sincronizacao e a acao de salvar letra
  manual. O botao passa a abrir o seletor de provedor, mesmo sem letra disponivel.
- Registro de provedores, configuracao de habilitacao/prioridade e escolha
  persistente por faixa. Automatico respeita essa prioridade.
- Buscas independentes, em paralelo, com timeout/cancelamento e estados visiveis
  de carregamento, encontrado, indisponivel e erro. Desabilitado nao e consultado.
- Cache separado por gravacao/provedor/politica; geracoes impedem que a resposta
  da musica anterior ou de uma selecao antiga substitua a atual.
- LRC, enhanced LRC, TTML e payloads estruturados viram o mesmo modelo. Timing
  por palavra permanece no modelo, sem fabricar timestamps para texto simples.
- Matching conserva titulo/versao, artista e duracao. ISRC conhecido identifica
  a gravacao; nao escolher automaticamente o primeiro resultado ambiguo.
- Provedores iniciais: YouTube Music, LRCLIB, Letras, lrc.red, BiniLyrics,
  BetterLyrics/Portato, LyricsPlus e Unison. Outros endpoints do BitChord
  necessitam integracao e verificacao separadas, nao uma opcao sem backend.
- Texto manual existente nao sera apagado do armazenamento, mas nao tem mais
  prioridade sobre os provedores da nova interface.

## Configuracoes e consumidores reais

| Grupo da referencia | Consumidor / criterio de aceite |
| --- | --- |
| Qualidade de streaming/download | Resolver e cache incluem qualidade; download conserva a qualidade escolhida |
| Mono/estereo | Mistura PCM real no Android/iOS e grafo Web Audio no navegador |
| Equalizador manual e tonalidade | Filtros de audio, balanceamento e margem contra clipping; estado restaurado em novas faixas |
| Velocidade | Rate do player ativo e de cada novo player, sem apenas alterar o texto da UI |
| Letras e fontes | Habilitacao, prioridade, preferencia por sync e offset utilizados pela busca/render |
| Aparencia | Reducao de movimento/blur e estado do player aplicados nos componentes existentes |
| Preload | Preparacao seletiva, nunca download completo obrigatorio antes do play |
| Downloads / dados | Preferencias observadas pelo coordenador, independente do modal |
| Armazenamento / diagnosticos | Limpeza efetiva, estado do motor e formato, sem apagar downloads por engano |

Separar preferencias de capacidade da plataforma. Nunca chamar AAC/Opus de
lossless, stereo widening de Atmos ou um fade de volume de crossfade real.

## Recursos que precisam de outra entrega nativa

Automix, alinhamento de versoes por waveform, crossfade com dois decoders,
remocao de silencio, normalizacao por loudness medido, USB DAC/PCM negociado,
Canvas e bibliotecas locais publicas precisam de motores/adaptadores proprios.
O Openfy atual nao oferece esses contratos em todas as plataformas. Nao incluir
switches sem efeito; completar cada recurso em uma entrega verificavel antes
de disponibiliza-lo. Tema claro/sistema e traducao de letras tambem precisam
de cobertura transversal, nao apenas mudar o fundo de configuracoes.

## Ordem de implementacao

1. Catalogo/creditos: remover espera por perfis e preservar identidade/ordem.
2. Letras: contratos, parsers, provedores, cache, seletor e retirada do editor.
3. Audio: curvas, presets, processamento por plataforma e velocidade.
4. Configuracoes: sub-telas comuns, preferencias normalizadas/migradas e ligadas
   aos consumidores. Expor somente capacidades realmente implementadas.
5. Verificar selecao rapida/faixa anterior/offline, erros/timeouts, plain lyrics,
   restauracao de preferencias e tipos. Builds nativos e escuta em dispositivo
   sao criterios separados de testes JS.

## Verificacao e limites

Cada entrega registra o que foi executado e o que exige dispositivo/CI. Windows
nao compila iOS. Mudancas em Expo Audio exigem novo build nativo; OTA nao adiciona
metodos nativos a um binario antigo. O progresso desta reforma nao equivale a
paridade completa com todas as configuracoes do BitChord.

## Entrega de 2026-10-11

Implementado nesta etapa:

- Endpoints de creditos entregues sem aguardar perfis; nomes/participantes
  declarados preservados, inclusive participantes sem ID Spotify. Descoberta
  contextual de artistas usa ate tres gravacoes em paralelo.
- ISRC validado e conservado em metadados, catalogo e downloads, e enviado aos
  provedores. Bini aceita somente a gravacao do ISRC solicitado quando conhecido.
- Editor manual removido e substituido por escolha persistente de provedor por
  faixa. Sub-tela de letras controla fontes, prioridade, sincronizacao e atraso.
- Parsers LRC/enhanced LRC, TTML de clock e LyricsPlus; texto simples nao ganha
  timestamps ficticios. Destaque por palavra tambem usa o renderer SwiftUI.
- Timeout, cancelamento, cache offline limitado, politicas isoladas e protecao
  contra respostas antigas, inclusive aquecimento anterior a uma atualizacao
  forcada. Aquecimento de letras prioriza somente a proxima musica.
- Sub-tela de audio com sete bandas, presets, pad tonal, foco nos medios,
  balanceamento, velocidade e compensacao de ganho. Processamento usa AVPlayer
  audio tap no iOS, Media3 PCM no Android e BiquadFilter no navegador.
- Preferencias aplicadas antes da persistencia, rollback em erro e preservacao
  de ajustes rapidos em bandas diferentes. Novas faixas recebem os ajustes.
- Patch Expo Audio regenerado e sua reversao/reaplicacao verificadas. O CI/CD
  original completo roda na main e em codex/bitchord-integration: validacao,
  testes, audio nativo, OTA temporario, IPA/APK, releases e artefatos. Releases
  apontam para o commit compilado, inclusive quando ele pertence a esta branch.

Executado localmente: TypeScript sem erros, 789 testes aprovados em 110 suites,
24 testes ignorados em 24 suites do projeto, lint sem erros (43 avisos), export
web com 19 rotas e testes do grafo Web Audio/curvas de filtro. Os testes nao
substituem escuta em dispositivo.

Pendencias de verificacao: resultado dos builds completos iOS/Android e escuta
real; o CI/CD tambem verifica o kernel C, o audio tap e o player Swift. Provedores
externos possuem adaptadores/testes de contrato, mas disponibilidade ao vivo,
CORS e cobertura por gravacao ainda precisam de verificacao. O BrowserOS Neo
nao estava disponivel para verificacao visual nesta sessao.

Pendencias de produto continuam na secao de recursos com motor proprio acima:
Automix, crossfade real, normalizacao medida, silencio, DAC/PCM, Canvas, arquivos
publicos locais, tema claro/sistema e traducao. TTML com frames/ticks e duetos
simultaneos tambem exige ampliacao do modelo/render; nao anunciar paridade total.

## Correcao de provedores, timing e diagnosticos

- A busca conserva metadados/creditos na interface, mas consulta pelo artista
  principal e remove apenas embalagem/featuring do titulo. Versoes como remix,
  live e acoustic continuam na identidade. BetterLyrics/Portato e LyricsPlus
  recebem segundos inteiros, como o contrato usado pelo cliente de referencia.
- TTML aceita segundos decimais, clocks e unidades explicitas; spans internos
  preservam os tempos reais de palavras/silabas. Texto escapado, envelopes JSON,
  QRC/YRC e vocais x-bg sao interpretados sem incluir traducoes no texto cantado.
- Destaque continuo por duracao/silaba no renderer SwiftUI e Android/web; apenas
  a linha ativa atualiza o relogio, com pausa, seek, velocidade e limite de
  extrapolacao quando os status de audio param. Letras por linha nao recebem
  tempos por palavra inventados. Duetos independentes e TTML frames/ticks seguem
  pendentes; vocais de apoio associados a uma linha nao equivalem a duetos.
- LyricsPlus consulta seus seis hosts e cancela os demais apos uma resposta
  valida; uma resposta 404 rapida nao vence uma letra valida de outro host.
  O resultado estruturado nao e convertido novamente em texto sem timing.
- Cache de resultados ganhou versao nova para nao reutilizar parsing antigo;
  escolhas de provedores e dados offline existentes continuam preservados.
- Logs do sistema cobrem HTTP/plataforma/status, consultas, matching, parsing,
  cache, prioridades, cancelamento, timeout, render ativo, seletor de fontes,
  ajustes/rollback, processamento de audio e metadados/creditos Spotify. Nao
  registram corpo da letra ou credenciais e nao geram eventos por frame.
- O seletor distingue letra ausente de timeout e acesso restrito HTTP 401/403.
  BetterLyrics permite consultas em seu cache publico, mas respondeu que
  consultas nao armazenadas exigem X-API-Key. Nao foi inserida chave de terceiros
  ou contornado o controle de acesso; o modo automatico usa outras fontes.

Verificacao ao vivo em Windows em 2026-10-11, com o parser real do Openfy e
transporte Node (nao rede nem renderer de um iPhone):

| Gravacao / fonte | Linhas | Palavras | Inicio em ms |
| --- | --- | --- | --- |
| Foi assim / lrc.red, BCGSB2500020 | 54 | 0 | 40 |
| Hotel Caro / lrc.red, BX2DO2200013 | 54 | 408 | 13938 |
| 20 Ligacoes / lrc.red, BX2DO2200004 | 38 | 277 | 26136 |
| 20 Ligacoes / BetterLyrics, d=194 | 38 | 277 | 26136 |
| 20 Ligacoes / LyricsPlus binimum, duration=194 | 38 | 282 | 26136 |

As duracoes na tabela de endpoints sao parametros efetivamente consultados, nao
estimativas inseridas nas letras. BetterLyrics com titulo/duracao diferentes
pode exigir chave. O primeiro host LyricsPlus expirou; binimum respondeu.

Verificacao automatizada: 805 testes aprovados em 112 suites, 24 testes/suites
ignorados pelo projeto, TypeScript sem erros e lint sem erros (43 avisos
preexistentes). Export dos bundles Hermes iOS/Android e web (19 rotas) concluido.
O export nao substitui o build nativo. O aviso appleTeamId e esperado no ambiente
local sem credenciais; o CI/CD configura a assinatura pelo fluxo existente.
Rede iOS e animacao em hardware continuam a exigir dispositivo.

## Correcao do renderer e segunda auditoria do desktop

O log de Hotel Caro continha uma letra lrc.red valida, com 54 linhas e 408
palavras. A duplicacao das capturas nao era outra busca ou texto repetido do
provedor: o Text do ExpoUI mantinha sua propriedade nativa `text` ao trocar
uma string por filhos Text. O renderer agora remonta somente quando muda a
representacao plain/timed, inclusive nos vocais de apoio. O blur continua
nativo; nenhum timing foi inventado para letras simples.

A previa abaixo da capa usa os mesmos runs e relogio de palavras, respeitando
pausa, seek, velocidade e offset. O seletor consulta fontes habilitadas em ate
tres tarefas concorrentes e mostra somente respostas validas para a faixa.
Fechar/trocar faixa cancela a descoberta, que nao altera a escolha salva. As
falhas permanecem nos logs, nao como opcoes sem letra. A localizacao do cliente
YouTube Music agora preserva getLyrics; o wrapper anterior descartava o metodo.
Bini pode repetir uma busca sem a embalagem opcional do album, mas conserva
matching de titulo/artista/duracao e ISRC quando fornecido.

Catalogo, busca por video e importacao compartilham uma sessao leve do YouTube
e metadados por video (ate 128 entradas, uma hora). Essa sessao nao busca player
JS e nao armazena URLs de audio como metadados. Autorizacao/decipher de audio
conserva seu cliente independente. Como na referencia, o resolver nao visita
perfis, letras ou related/next antes de liberar audio. A sondagem JS caiu de
dois blocos de 1 MiB para duas amostras de 16 KiB, ainda verificando a fronteira
de autorizacao de 1 MiB. Arquivos comprovadamente menores nao recebem um Range
alem do fim. Recusas 403 continuam sendo recusas, nao fontes reproduziveis.
O streaming iOS existente responde progressivamente em blocos de 128 KiB e
reutiliza o prefixo preparado; esta entrega nao troca isso por download completo.

Revisado novamente DesktopApp.kt, DesktopAppearanceSettings.kt e os fluxos
Innertube/StreamResolver/PlayerClient da copia local, sem copiar implementacao.
A matriz abaixo impede confundir equivalencia de preferencias com paridade
de motores ou com controles especificos de uma janela desktop.

| Preferencia do desktop | Estado real no Openfy |
| --- | --- |
| Equalizador de sete bandas, presets, tonalidade/foco e balanco | Implementado nos tres motores; requer binario nativo com patch |
| Mono/estereo, velocidade | Implementado; validacao de capacidade e rollback |
| Qualidade de streaming e download | Alta/economia com efeito no resolver; YouTube nao e lossless |
| Letras/fontes/sincronizacao/offset | Implementado; provedores disponiveis por gravacao |
| Destaque palavra a palavra | Novo controle; aplica no modal e na previa |
| Blur de letras inativas | Implementado no renderer de cada plataforma |
| Tamanho da letra e acompanhamento automatico | Novos controles; fonte 18-34 e scroll opcional |
| Reducao de animacoes | Novo controle; combinado com preferencia do sistema em listas, modal e transicoes de capa |
| Reducao de blur dinamico | Novo controle; materiais portaveis/Apple, botoes SwiftUI, mini player, chrome do player e captura Android |
| Fundo com cores da capa | Novo controle; desliga inclusive o fallback da capa na folha |
| Alcance do aquecimento | Novo controle de 1-3 vizinhos por direcao; apenas a proxima faixa aquece letras |
| Shuffle e repeat | Controles existentes da fila; ainda sem sub-tela/persistencia equivalente ao desktop |
| Autoplay relacionado e evitar repeticoes de sugestoes na sessao | Pendente; exige coordenar expansao da fila, contexto e cancelamento |
| Sleep timer | Pendente; prazo deve ser cumprido em segundo plano pelo motor nativo |
| Crossfade, Automix e orcamento de analise | Pendente; dois decoders e analise de transicao, nao simples fade |
| Skip silence e normalizacao medida | Pendente; analise/PCM e coordenacao de seek |
| Stereo widening e Atmos | Pendente; nao rotular fontes AAC/Opus comuns como Atmos |
| Limite de cache de audio em disco | Pendente; downloads permanentes sao diferentes de cache evictavel |
| Gerenciar armazenamento/limpar imagens | Gerenciador existente e nova limpeza Expo Image iOS/Android; nao apaga arquivos da biblioteca nem simula limpeza do browser |
| Pasta local/todas as pastas/filtro de nao-musica | Pendente; permissoes e adaptadores de arquivos por plataforma |
| Idioma do app/traducao das letras | Pendente; cobertura transversal e provedor de traducao |
| Capa full-bleed/Canvas | Pendente; altera geometria/transicoes ou exige fonte de video |
| Dispositivo de saida/precisao PCM | Pendente; capacidades e formato negociado, nunca apenas preferencia visual |
| Fontes de audio adicionais e ordem | YouTube continua a fonte de audio; adaptadores externos pendentes |
| Estatisticas de codec/bitrate/sample rate no player | Diagnosticos existentes; overlay e metadados completos de formato pendentes |
| Titulo da janela, Mica/Acrylic, tray e fechar para tray | Especificos do desktop; sem equivalencia no iPhone |
| Contas, scrobbling, Discord, rede e salas | Fora do escopo confirmado |

As sete preferencias novas sao persistidas, normalizadas e registradas pelo
sistema de logs. As funcionalidades marcadas pendentes nao foram expostas como
switches sem efeito. A melhoria de latencia precisa ser medida em rede e hardware
de destino; reduzir trabalho/bytes nao garante um prazo fixo para todo video.

Verificacao desta entrega (2026-10-11/12): 828 testes Jest aprovados em 117
suites, 24 testes/suites ignorados pelo projeto; 16 testes Node do OTA;
TypeScript sem erros e lint sem erros (42 avisos existentes). Export Hermes
iOS/Android e web com 19 rotas concluido. O export nativo separado foi
compactado/restaurado como o artefato do CI: manifests e hashes de todos os
assets foram verificados pelo servidor real, runtime 1.0.2 (34 assets iOS e
38 Android, alem dos bundles). Scripts bash do workflow passaram na checagem
de sintaxe. A disponibilidade da janela e os builds assinados continuam sendo
criterios do CI, e render/blur/rede/escuta reais exigem hardware iOS/Android.

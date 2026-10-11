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

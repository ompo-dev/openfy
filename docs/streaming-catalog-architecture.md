# Catálogo, streaming e downloads opcionais

## Escopo da análise

Esta decisão foi baseada em três bases de código, verificadas em 24 de setembro de 2026:

- [Sonora](https://github.com/sonorahq/sonora), revisão `75b5afea714e31eeaeabfb0cc3390db5e1715445`;
- [SpotiFLAC Extension Store](https://github.com/spotiflacapp/spotiflac-extension), revisão `acd0f3fda24c125d24188d3f20c86ea00af796cb`;
- Openfy antes desta implementação, revisão `54d5d52`.

O objetivo não é copiar código dos projetos analisados. O Sonora é GPL-3.0-or-later e foi usado apenas como referência arquitetural. O repositório de extensões do SpotiFLAC usa Apache-2.0; ainda assim, o Openfy reimplementa os conceitos usando seus próprios modelos e serviços.

## O que o Sonora faz bem

O Sonora separa três responsabilidades que não devem depender uma da outra:

1. `MusicApi` fornece catálogo: faixas, álbuns, playlists, busca, rádio e Home.
2. `Player` recebe um identificador somente quando precisa carregar, tocar ou pré-carregar áudio.
3. `Queue` mantém histórico, faixa atual, próximas faixas e a origem da fila.

Uma `Track` é válida antes de existir um arquivo de áudio. A Home trabalha com referências de catálogo, e a fila hidrata o que será tocado. Isso permite navegar, adicionar álbuns e montar uma sessão inteira sem baixar mídia.

Arquivos centrais analisados no Sonora:

- `crates/music/src/lib.rs`: contratos `MusicApi`, `Player`, `PlaybackFactory` e `ProviderSession`;
- `crates/state/src/home.rs`: composição das seções da Home;
- `crates/state/src/queue.rs`: estado independente de fila, origem, histórico e modo aleatório;
- `crates/state/src/playback.rs`: um único motor, eventos, avanço automático e pré-carregamento da próxima faixa.

## O que o SpotiFLAC confirma

O protocolo de extensões diferencia capacidades de metadados e de download. A extensão `spotify-web` é um provedor de metadados: pesquisa, abre URLs, fornece faixa, álbum, artista, playlist e Home, mas não fornece download. Já o provedor de YouTube resolve a mídia quando uma operação de reprodução ou download precisa dela.

Essa divisão confirma a regra adotada no Openfy:

> catálogo descreve o que existe; o resolvedor de áudio encontra como tocar; o gerenciador de download decide se haverá um arquivo persistente.

Alguns provedores do SpotiFLAC usam um serviço remoto próprio para sessão ou assinatura. Eles não são compatíveis com o requisito do Openfy de funcionar sem uma API Openfy e não foram adotados. O aplicativo continua fazendo as operações no telefone e usa apenas páginas ou endpoints públicos dos provedores de origem.

### Matriz das extensões examinadas

| Extensão | Capacidades declaradas | Home | Dependência incompatível com o Openfy local |
| --- | --- | --- | --- |
| Spotify Web 1.10.2 | metadados | sim | nenhuma API de download; é a referência correta para separar catálogo de áudio |
| YouTube Music 2.4.1 | metadados e download | sim | PO token externo é opcional; o Openfy mantém resolução local e fallback controlado |
| Apple Music 1.4.9 | metadados e letras | sim | letras exigem token de usuário; não é necessário para o fluxo implementado |
| SoundCloud 1.0.8 | metadados e download | não | usa streams públicos do próprio SoundCloud; pode virar provedor futuro |
| Amazon Music 2.3.11 | metadados e download | sim | sessão assinada obrigatória em `api.zarz.moe` |
| Deezer 1.3.5 | metadados e download | não declarada | sessão e resolvedor remotos obrigatórios |
| Qobuz 1.2.18 | metadados e download | não declarada | sessão assinada obrigatória |
| Tidal 1.2.7 | metadados e download | não declarada | sessão assinada e API remota de download obrigatórias |

Os pacotes `.sflx` também mostram uma fronteira de permissões útil: provedores somente de metadados não precisam de acesso a arquivos; provedores de download precisam. No Openfy, essa fronteira é representada por serviços separados em vez de extensões executáveis.

## Problema anterior do Openfy

O player já sabia:

- preferir um arquivo baixado;
- resolver um stream sob demanda;
- manter uma fila e avançar automaticamente;
- tocar uma coleção inteira.

O gargalo estava acima dele:

- a biblioteca consultava apenas `openfy_downloads`;
- uma playlist importada guardava IDs, mas escondia faixas sem arquivo local;
- álbuns e artistas eram agrupados apenas a partir de downloads;
- a Home resolvia streams de cartões visíveis antes de qualquer toque;
- importar uma faixa ou álbum não criava um registro persistente de catálogo.

Por isso a interface fazia o download parecer obrigatório, embora o motor já suportasse streaming.

## Plano de implementação executado

1. **Separar catálogo e download:** criar um repositório local de metadados e uma visão combinada com arquivos existentes.
2. **Corrigir a entrada de dados:** fazer toda importação persistir catálogo antes de oferecer download.
3. **Migrar superfícies de biblioteca:** músicas, álbuns, artistas e playlists passam a consultar a visão combinada.
4. **Conectar reprodução:** cada superfície entrega a coleção inteira ao player para formar uma fila automática.
5. **Tornar download uma ação:** disponibilizar download por faixa e por coleção e preservar o catálogo ao remover o arquivo.
6. **Montar Home local:** derivar seções do catálogo e do histórico, sem resolver streams na renderização.
7. **Proteger regressões:** testar persistência, sobreposição de download, compatibilidade com registros antigos e ausência de resolução antecipada.

## Arquitetura implementada

### Catálogo local

`services/library/catalogLibrary.ts` mantém metadados persistentes em AsyncStorage:

- identidade da faixa e plataforma de origem;
- título, artistas, álbum, capa e duração;
- número da faixa e do disco;
- referência exata de vídeo quando a origem é YouTube;
- datas de inclusão e atualização.

URLs temporárias de áudio não são gravadas no catálogo. `getLibraryTracks()` combina o catálogo com downloads existentes pelo identificador da faixa. O resultado indica `isDownloaded` e inclui caminhos locais somente quando eles realmente existem.

Downloads antigos continuam aparecendo mesmo sem registro de catálogo, o que preserva instalações existentes.

### Fluxo de importação

1. O usuário cola uma URL de faixa, álbum ou playlist.
2. O Openfy busca somente metadados.
3. As faixas são salvas imediatamente no catálogo local.
4. A playlist mantém a ordem original dos IDs.
5. A interface oferece download individual ou de toda a coleção, sem iniciá-lo automaticamente.

Para uma URL exata do YouTube, a importação usa o `oEmbed` público para nome, canal e capa. A mídia desse vídeo só é resolvida no play ou no download. Isso evita iniciar o resolvedor nativo apenas para mostrar uma tela.

### Reprodução e filas

Toda superfície entrega uma lista completa ao `playWithQueue`:

- músicas da biblioteca: `library:songs`;
- ouvir novamente: `home:continue-listening`;
- escolhas rápidas: `home:quick-picks`;
- álbuns e playlists: identificador da coleção.

Ao tocar uma faixa, o player segue a ordem:

1. arquivo local válido;
2. download registrado;
3. fonte já aquecida e ainda válida;
4. resolução local de stream naquele momento.

O resolvedor preserva IDs `yt_<videoId>` como fonte exata, sem trocar silenciosamente por outro vídeo.

### Home

A Home agora é montada com dados reais do aparelho:

- **Ouça novamente** usa o histórico local e mostra itens ainda presentes no catálogo;
- **Escolhas rápidas** prioriza faixas recentes e diversidade de artistas;
- **Álbuns na sua biblioteca** agrupa as faixas pelo ID real do lançamento;
- **Suas playlists** mantém ordem e capas mesmo quando nenhuma faixa foi baixada.

Cartões estáticos remanescentes podem atualizar metadados públicos, mas não resolvem mais áudio durante a montagem da Home.

### Download opcional

Há ações separadas para:

- baixar uma faixa na biblioteca;
- baixar uma faixa dentro de álbum, playlist ou perfil de artista;
- baixar toda a coleção;
- remover apenas o arquivo baixado sem remover a faixa do catálogo ou da playlist.

## Invariantes

- Nenhuma tela deve exigir `localAudioPath` para exibir ou tocar uma faixa.
- Nenhum carregamento de Home deve iniciar resolução de áudio.
- Um download não cria outra identidade para a mesma faixa.
- Excluir um download não exclui a entrada do catálogo.
- A fila sempre recebe todas as faixas disponíveis na coleção, baixadas ou não.
- Não existe dependência de uma API Openfy.

## Próximas evoluções compatíveis

O contrato atual permite adicionar novos provedores de catálogo sem alterar o player. Uma futura Home remota deve implementar um provedor normalizado de metadados e nunca retornar URL de áudio. Para bibliotecas muito grandes, o armazenamento do catálogo pode migrar de AsyncStorage para SQLite mantendo a mesma API pública.

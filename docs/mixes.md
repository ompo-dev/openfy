# Mixes — edição, reprodução e transferência

Mix é um projeto local editável, independente das playlists importadas. O fluxo é criar um mix na biblioteca ou no seletor de destinos, adicionar músicas, baixar fontes, editar, salvar, compor o áudio local e reproduzir no player existente. Cortes não alteram o original.

O editor oferece timeline horizontal, zoom, seleção, recorte, divisão, reordenação por arraste, volume, remoção e desfazer/refazer. Até oito faixas de áudio podem tocar simultaneamente; dentro de cada faixa os clipes são concatenados a partir de zero. O ganho é dividido pelo número de faixas para reduzir o risco de clipping. Gravação, efeitos, crossfade e compartilhamento do arquivo de áudio não fazem parte desta etapa.

A tela Editar mix usa o page sheet e os botões de cabeçalho padrão do Openfy, com Liquid Glass ativado apenas ao rolar, como nas Configurações. A régua tem escala adaptativa, cursor branco fixo no centro, navegação por arraste horizontal e zoom por pinça; as alças amarelas usam gestos nativos que bloqueiam a rolagem concorrente e aplicam o recorte ao finalizar. A altura dos blocos é 42 px e as linhas da lista são compactas. Cada bloco mostra título, artistas, duração e waveform extraído das amostras PCM do arquivo real. O waveform é calculado em fila serial, com cache limitado, e não é fabricado enquanto a fonte não está disponível. O botão + acrescenta músicas à faixa escolhida; Adicionar faixa de áudio cria outra faixa simultânea. As adições ficam no rascunho até salvar, podendo ser desfeitas. Volume abre um sheet separado. As alças também oferecem ações de acessibilidade em passos de 100 ms. A prévia é pausada e liberada ao fechar, salvar, desmontar o editor ou sair do app; o fechamento também pausa a reprodução principal se ela pertencer ao mesmo mix.

AVFoundation no iOS e Media3 Transformer 1.9.0 no Android compõem arquivos locais em AAC. Alterações nativas exigem IPA/APK. A persistência possui chave e versão próprias, mutações serializadas e verificação de revisão para impedir sobrescrita por um editor antigo. Falhas de leitura preservam os projetos. Downloads usam a fila persistente, inclusive offline; excluir o mix não exclui músicas da biblioteca.

## Fluxos e garantias

- A listagem e o editor usam o componente TrackRow: capas arredondadas, linhas compactas, artistas e duração, indicador explícito quando conhecido. No editor, a duração corresponde ao recorte. Os campos de nome e descrição e o texto duplicado abaixo da timeline foram removidos; o título e descrição existentes são preservados.
- Os metadados atuais da biblioteca fornecem a capa local, URL remota e vínculo de áudio; a duração original permanece estável para os cortes já salvos. Selecionar uma faixa de um mix reproduz a composição, não o original isolado por causa de uma marca antiga de indisponibilidade.
- A renderização valida as fontes locais, recupera caminhos de downloads após migração de sandbox, prepara cada arquivo distinto uma vez e reaproveita o resultado quando arquivos e parâmetros coincidem. A saída é local, sem busca de streaming e sem preparação de contêiner repetida no início do player.
- O JSON versionado openfy.mix contém fontes portáveis e a sequência completa de clipes, incluindo a faixa (lane). Projetos antigos sem lane continuam na faixa zero. Exportações com sobreposição usam a versão 2, para que importadores antigos não interpretem o projeto como sequência simples; mixes de uma faixa mantêm a versão 1. A importação valida limites, IDs, duração, volume e faixa antes de gravar; reaproveita a restauração do catálogo e de vínculos das playlists. Não contém bytes de áudio, caminhos privados ou URLs assinadas. Reimportar o mesmo ID não substitui o mix editado localmente.

## Validação em aparelho

1. Criar um mix com duas músicas baixadas, dividir um clipe, recortar, mudar o volume e reordenar. Conferir capas, duração e seleção no editor.
2. Ouvir a prévia, parar e voltar a ouvir. Salvar e tocar pela página do mix. Testar modo avião após baixar todas as fontes.
3. Repetir a prévia sem editar: deve reutilizar a composição. Modificar um corte: deve gerar uma nova composição. Testar fontes ausentes, retomada de download e atualização do app que preserve os arquivos.
4. Exportar o mix, importar em outro aparelho e conferir cortes, volume e ordem, inclusive clipes repetidos da mesma música. Reimportar após editar localmente e verificar que a edição não é sobrescrita.

Os testes automatizados cobrem o contrato JS e as chamadas ao módulo nativo; a qualidade e a latência do áudio composto exigem um IPA/APK compatível e testes em hardware real. O editor compõe arquivos locais em vez de fazer streaming de todos os clipes em tempo real.

# Mixes — edição, reprodução e transferência

Mix é um projeto local editável, independente das playlists importadas. O fluxo é criar um mix na biblioteca ou no seletor de destinos, adicionar músicas, baixar fontes, editar, salvar, compor o áudio local e reproduzir no player existente. Cortes não alteram o original.

O editor oferece timeline horizontal, zoom, seleção, recorte, divisão, reordenação por arraste, volume, remoção e desfazer/refazer. Os clipes são concatenados. Sobreposição, gravação, efeitos, crossfade e compartilhamento do arquivo de áudio não fazem parte desta etapa.

A tela Editar mix usa o page sheet e os botões de cabeçalho padrão do Openfy, com Liquid Glass permanente no cabeçalho. A régua tem escala adaptativa, cursor branco fixo no centro, navegação por arraste horizontal e zoom por pinça; as alças amarelas ajustam os limites do clipe selecionado. A altura dos blocos é 42 px e as linhas da lista são compactas. Volume abre um sheet de edição separado. As alças também oferecem ações de acessibilidade em passos de 100 ms. A prévia é pausada e liberada ao fechar, salvar, desmontar o editor ou sair do app; o fechamento também pausa a reprodução principal se ela pertencer ao mesmo mix. Requisições antigas de composição não devem iniciar a reprodução após abrir ou sair do editor.

AVFoundation no iOS e Media3 Transformer 1.9.0 no Android compõem arquivos locais em AAC. Alterações nativas exigem IPA/APK. A persistência possui chave e versão próprias, mutações serializadas e verificação de revisão para impedir sobrescrita por um editor antigo. Falhas de leitura preservam os projetos. Downloads usam a fila persistente, inclusive offline; excluir o mix não exclui músicas da biblioteca.

## Fluxos e garantias

- A listagem e o editor usam o componente TrackRow: capas arredondadas, linhas compactas, artistas e duração, indicador explícito quando conhecido. No editor, a duração corresponde ao recorte e não à música inteira. O inspetor mantém os limites de início e fim.
- Os metadados atuais da biblioteca fornecem a capa local, URL remota e vínculo de áudio; a duração original permanece estável para os cortes já salvos. Selecionar uma faixa de um mix reproduz a composição, não o original isolado por causa de uma marca antiga de indisponibilidade.
- A renderização valida as fontes locais, recupera caminhos de downloads após migração de sandbox, prepara cada arquivo distinto uma vez e reaproveita o resultado quando arquivos e parâmetros coincidem. A saída é local, sem busca de streaming e sem preparação de contêiner repetida no início do player.
- O JSON versionado openfy.mix contém fontes portáveis e a sequência completa de clipes. A importação valida limites, IDs, duração e volume antes de gravar; reaproveita a restauração do catálogo e de vínculos das playlists. Não contém bytes de áudio, caminhos privados ou URLs assinadas. Reimportar o mesmo ID não substitui o mix editado localmente.

## Validação em aparelho

1. Criar um mix com duas músicas baixadas, dividir um clipe, recortar, mudar o volume e reordenar. Conferir capas, duração e seleção no editor.
2. Ouvir a prévia, parar e voltar a ouvir. Salvar e tocar pela página do mix. Testar modo avião após baixar todas as fontes.
3. Repetir a prévia sem editar: deve reutilizar a composição. Modificar um corte: deve gerar uma nova composição. Testar fontes ausentes, retomada de download e atualização do app que preserve os arquivos.
4. Exportar o mix, importar em outro aparelho e conferir cortes, volume e ordem, inclusive clipes repetidos da mesma música. Reimportar após editar localmente e verificar que a edição não é sobrescrita.

Os testes automatizados cobrem o contrato JS e as chamadas ao módulo nativo; a qualidade e a latência do áudio composto exigem um IPA/APK compatível e testes em hardware real. O editor compõe arquivos locais em vez de fazer streaming de todos os clipes em tempo real.

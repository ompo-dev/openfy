# Mixes: primeira versao

Mix e um projeto local editavel, independente das playlists importadas. O projeto
guarda os metadados originais e uma lista ordenada de clipes. Um clipe referencia a
musica, inicio/fim no arquivo de origem e volume. Cortes nao alteram o original.

Fluxo: criar Mix na biblioteca ou na aba Mix do seletor de destinos; adicionar
musicas; persistir o projeto; colocar os arquivos originais na fila de downloads;
editar; salvar; compor audio local; reproduzir o resultado no player existente.

O primeiro editor oferece timeline horizontal, zoom, selecao, recorte, divisao,
reordenacao por arraste, volume, remocao e desfazer/refazer. Os clipes se juntam em
sequencia sem silenciar o intervalo cortado. Sobreposicao, gravacao, efeitos,
crossfade e compartilhamento de arquivo ficam para uma etapa posterior.

AVFoundation (iOS) e Media3 Transformer 1.9.0 (Android, mesma versao do expo-audio)
compoem os arquivos locais. O resultado AAC e reutilizado enquanto o projeto e os
arquivos originais forem os mesmos. O renderer rejeita fontes remotas e arquivos
ausentes: Mix nunca faz streaming como fallback. Mudancas nativas exigem IPA/APK.

Persistencia tem chave e versao proprias, mutacoes serializadas e verificacao de
revisao para impedir que um editor antigo sobrescreva uma inclusao recente. Falhas
de leitura nao viram biblioteca vazia nem sobrescrevem projetos. Downloads usam a
fila persistente existente, inclusive offline; remover Mix nao apaga as musicas.

Validacao: testes de persistencia/concorrencia, algebra dos cortes, seletores,
fontes locais e cache; typecheck, lint e bundles. Compilacao e audio/gestos reais
devem ser verificados em builds nativos e aparelhos.

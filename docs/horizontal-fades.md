# Padrão visual — rolagem horizontal

Use `HorizontalFadeScrollView` de `components/common/HorizontalFadeScrollView.tsx` em toda nova lista ou carrossel horizontal. Ele preserva os eventos, a referência de rolagem, o snap e o conteúdo original; o fade é desenhado nas extremidades do viewport, não dos itens.

- Superfícies sólidas: gradiente da cor real de fundo para a mesma cor com alpha zero, com sete pontos de uma curva suave em S. Por padrão, usa `COLORS.PRIMARY` (#121212); passe `fadeColor` apenas quando a superfície for diferente.
- Superfícies translúcidas ou com arte variável: `fadeMode="mask"` usa uma máscara de alpha (CSS no web, MaskedView no aplicativo) para revelar o fundo real sem acrescentar uma faixa opaca.
- `fadeWidth` ajusta a extensão em pontos: 28 por padrão, 30 na barra de ferramentas do Mix; em textos pequenos, use uma largura proporcional.
- Só há fade quando existe conteúdo oculto naquela direção. No início, apenas à direita; no meio, ambos; no fim, apenas à esquerda. Não há fade quando tudo cabe no viewport.
- Use `kind="gesture"` para manter o ScrollView de Gesture Handler ou `kind="animated"` com `animatedOffset` para manter animações ligadas ao scroll no driver nativo.
- Em gestos horizontais customizados, use `HorizontalFadeEdges` para overlays sólidos ou `HorizontalFadeMask` para fundos variáveis. Mantenha o fade estacionário e preserve os controles fixos, a seleção e o cursor acima dele.

O contador fixo da régua do Mix preserva seu gradiente original, opaco até 80% e transparente no último quinto. Os fades laterais das listas são complementares a ele. A renderização do estado das bordas só é atualizada quando o conteúdo passa a entrar ou sair da área visível.

Na timeline do Mix, a coluna de mute é uma camada fixa independente do viewport dos clipes. O fade das faixas utiliza o fundo primário e cobre também os contornos de seleção; o cursor e os controles fixos ficam acima dele.

Exemplo:

```tsx
<HorizontalFadeScrollView fadeColor={COLORS.PRIMARY} fadeWidth={28}>
  {items}
</HorizontalFadeScrollView>
```

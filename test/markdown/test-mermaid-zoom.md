# Mermaid Zoom Test

Hover a diagram to show its toolbar. Requires `markdown-preview-enhanced.enableMermaidZoom` (default `true`).

Check:

- A plain mouse wheel over a diagram scrolls the page; the diagram does not zoom.
- Ctrl/Cmd + wheel (or trackpad pinch) over a diagram zooms it around the cursor; outside a diagram it still zooms the whole preview.
- The diagram keeps its height while zoomed, so the text below does not move.
- Dragging pans the diagram. A press that moves less than 4px is still a click, and releasing a drag over the link node (`缩放层`) does not open the link.
- Double-clicking empty space, or clicking the percentage, resets to 100%.
- Editing a label in diagram 1 re-renders it with the same zoom and position.
- Fullscreen: wheel zooms without a modifier; `+` `-` `0` `F` and the arrow keys work; Escape closes and returns focus to the fullscreen button.
- Diagram 3 (`{data-zoom=false}`) has no toolbar and does not zoom.

## 1. Large flowchart (with a link)

```mermaid
flowchart TD
  U[用户输入] --> E[VSCode 编辑器]
  E -->|onDidChangeTextDocument| X[扩展宿主]
  X -->|postMessage| W[Webview 预览]
  W --> C[crossnote 解析 Markdown]
  C --> M[Mermaid]
  C --> P[PlantUML]
  C --> G[GraphViz]
  C --> K[KaTeX / MathJax]
  M --> S[SVG]
  S --> Z[缩放层]
  Z --> T1[工具栏]
  Z --> T2[滚轮 / 捏合]
  Z --> T3[拖拽阈值 4px]
  Z --> T4[全屏浮层]
  click Z "https://example.com" "外部链接"
```

## 2. Sequence diagram

```mermaid
sequenceDiagram
  participant 用户
  participant 预览
  用户->>预览: Ctrl + 滚轮
  预览-->>用户: 缩放
```

## 3. Opted out with `{data-zoom=false}`

```mermaid {data-zoom=false}
flowchart LR
  A[data-zoom=false] --> B[stays static]
```

Filler text so the page can scroll.

Filler text so the page can scroll.

Filler text so the page can scroll.

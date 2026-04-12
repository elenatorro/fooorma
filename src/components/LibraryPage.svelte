<script lang="ts">
  const {
    onBack,
    onAbout,
    theme,
    onToggleTheme,
  }: {
    onBack: () => void
    onAbout: () => void
    theme: 'dark' | 'light'
    onToggleTheme: () => void
  } = $props()
</script>

<div class="lib-page">
  <header class="page-topbar">
    <button class="logo" onclick={onBack}>fooorma</button>
    <span class="beta-badge">beta</span>
    <button class="nav-btn" onclick={onAbout}>About</button>
    <button class="nav-btn active">Library</button>
    <span class="topbar-spacer"></span>
    <button class="theme-btn" onclick={onToggleTheme} title="Toggle light/dark theme">{theme === 'dark' ? '◑' : '◐'}</button>
  </header>

  <div class="lib-body">
    <aside class="sidebar">
      <ul>
        <li><a href="#getting-started">Getting started</a></li>
        <li><a href="#importing">Importing</a></li>
        <li><a href="#api">API</a></li>
      </ul>
      <p class="section-label">Exports</p>
      <ul>
        <li><a href="#render">render()</a></li>
        <li><a href="#evaluateQuery">evaluateQuery()</a></li>
        <li><a href="#renderLayers2D">renderLayers2D()</a></li>
        <li><a href="#builtin-palettes">BUILTIN_PALETTES</a></li>
      </ul>
      <p class="section-label">Drawing API</p>
      <ul>
        <li><a href="#shapes">Shapes</a></li>
        <li><a href="#shapes-3d">3D shapes</a></li>
        <li><a href="#styling">Stroke &amp; gradients</a></li>
        <li><a href="#transforms">Transforms</a></li>
        <li><a href="#effects">Effects</a></li>
        <li><a href="#loops">Loops &amp; distribution</a></li>
        <li><a href="#tile">Tile</a></li>
        <li><a href="#groups-masks">Groups &amp; masks</a></li>
        <li><a href="#stamps">Stamps</a></li>
        <li><a href="#math">Math &amp; helpers</a></li>
        <li><a href="#palettes">Palettes</a></li>
      </ul>
      <p class="section-label">Reference</p>
      <ul>
        <li><a href="#coordinates">Coordinate system</a></li>
        <li><a href="#types">Types</a></li>
      </ul>
    </aside>

    <main>
      <div class="content">

<h1><span class="accent">fooorma</span> library</h1>
<p class="subtitle">
  Standalone procedural art engine. Evaluate code into shapes and render to Canvas2D.
  <br>
  <span class="badge badge-esm">ESM</span>
  <span class="badge badge-umd">UMD</span>
  <span class="badge badge-size">~28 KB min / ~10 KB gzip</span>
</p>

<h2 id="getting-started">Getting started</h2>
<p>Build the library from the project root:</p>
<pre><code>pnpm build:lib</code></pre>
<p>This produces two files in <code>dist-lib/</code>:</p>
<table>
  <thead><tr><th>File</th><th>Format</th><th>Use case</th></tr></thead>
  <tbody><tr><td><code>fooorma.js</code></td><td>ES module</td><td><code>import</code> in bundlers, modern browsers</td></tr><tr><td><code>fooorma.umd.cjs</code></td><td>UMD</td><td><code>&lt;script&gt;</code> tag, Node.js <code>require()</code></td></tr></tbody>
</table>

<h2 id="importing">Importing</h2>

<h3>ES module (recommended)</h3>
<pre><code><span class="kw">import</span> {'{'} render, evaluateQuery, BUILTIN_PALETTES {'}'} <span class="kw">from</span> <span class="str">'./fooorma.js'</span></code></pre>

<p>In an HTML file:</p>
<pre><code><span class="cm">&lt;!-- fooorma.js must be served over HTTP, not file:// --&gt;</span>
&lt;canvas <span class="str">id="canvas"</span>&gt;&lt;/canvas&gt;

&lt;script <span class="str">type="module"</span>&gt;
  <span class="kw">import</span> {'{'} render, BUILTIN_PALETTES {'}'} <span class="kw">from</span> <span class="str">'./fooorma.js'</span>

  <span class="kw">const</span> canvas = document.getElementById(<span class="str">'canvas'</span>)
  <span class="kw">const</span> palettes = BUILTIN_PALETTES.map(p =&gt; ({'{'} name: p.name, colors: p.colors {'}'}))

  render(<span class="str">`
    rect(0, 0, 1, h(1), '#1a1a2e', 1)
    tile(5, (c, r) =&gt; {'{'} ellipse(0.5, 0.5, 0.8, 0.8, palette('Neon', c + r), 0.85) {'}'})
  `</span>, canvas, {'{'} artW: <span class="num">800</span>, artH: <span class="num">800</span>, scale: <span class="num">2</span>, palettes {'}'})
&lt;/script&gt;</code></pre>

<h3>UMD / script tag</h3>
<pre><code>&lt;canvas <span class="str">id="canvas"</span>&gt;&lt;/canvas&gt;
&lt;script <span class="str">src="fooorma.umd.cjs"</span>&gt;&lt;/script&gt;
&lt;script&gt;
  <span class="cm">// All exports are on the global `fooorma` object</span>
  <span class="kw">const</span> canvas = document.getElementById(<span class="str">'canvas'</span>)
  fooorma.render(<span class="str">"rect(0.1, 0.1, 0.8, 0.8, '#8b5cf6', 1)"</span>, canvas)
&lt;/script&gt;</code></pre>

<h3>Bundler (Vite, Webpack, etc.)</h3>
<p>Copy <code>fooorma.js</code> into your project and import it, or point your bundler at the source entry:</p>
<pre><code><span class="kw">import</span> {'{'} render {'}'} <span class="kw">from</span> <span class="str">'fooorma'</span></code></pre>

<h2 id="api">API exports</h2>

<h3 id="render"><code>render(code, canvas, options?)</code></h3>
<p>Evaluate code and render onto a canvas in one call. Returns <code>{'{'} shapes, errors {'}'}</code>.</p>
<table>
  <thead><tr><th>Param</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
  <tbody><tr><td><code>code</code></td><td><code>string</code></td><td></td><td>Fooorma drawing code</td></tr><tr><td><code>canvas</code></td><td><code>HTMLCanvasElement</code></td><td></td><td>Target canvas</td></tr><tr><td><code>options.artW</code></td><td><code>number</code></td><td><code>794</code></td><td>Artboard width in px</td></tr><tr><td><code>options.artH</code></td><td><code>number</code></td><td><code>1123</code></td><td>Artboard height in px</td></tr><tr><td><code>options.scale</code></td><td><code>number</code></td><td><code>1</code></td><td>Pixel scale (2 = retina)</td></tr><tr><td><code>options.bgColor</code></td><td><code>string</code></td><td></td><td>Layer background color</td></tr><tr><td><code>options.palettes</code></td><td><code>{'{'} name, colors {'}'}[]</code></td><td><code>[]</code></td><td>Palettes for <code>palette()</code></td></tr><tr><td><code>options.stamps</code></td><td><code>Pattern[]</code></td><td><code>[]</code></td><td>Stamps for <code>stamp()</code></td></tr></tbody>
</table>

<pre><code><span class="kw">const</span> {'{'} shapes, errors {'}'} = render(<span class="str">`
  rect(0.1, 0.1, 0.3, 0.3, '#ff6b6b', 0.9)
  ellipse(0.5, 0.5, 0.4, 0.4, '#4ecdc4', 0.8)
`</span>, canvas, {'{'} artW: <span class="num">600</span>, artH: <span class="num">600</span>, scale: <span class="num">2</span> {'}'})

<span class="kw">if</span> (errors.length) console.warn(errors)</code></pre>

<h3 id="evaluateQuery"><code>evaluateQuery(code, artW?, artH?, palettes?, stamps?)</code></h3>
<p>Evaluate code into shapes without rendering. Works in non-DOM environments (Node.js, workers).</p>
<pre><code><span class="kw">import</span> {'{'} evaluateQuery {'}'} <span class="kw">from</span> <span class="str">'./fooorma.js'</span>

<span class="kw">const</span> {'{'} shapes, errors {'}'} = evaluateQuery(
  <span class="str">"rect(0.1, 0.1, 0.5, 0.5, '#8b5cf6', 0.85)"</span>,
  <span class="num">800</span>, <span class="num">800</span>
)

console.log(shapes[<span class="num">0</span>].type)   <span class="cm">// 'rect'</span>
console.log(shapes[<span class="num">0</span>].geom)   <span class="cm">// {'{'} x: 0.35, y: 0.35, w: 0.5, h: 0.5 {'}'}</span></code></pre>

<h3 id="renderLayers2D"><code>renderLayers2D(ctx, layers, artW, artH)</code></h3>
<p>Low-level render function. Takes a Canvas2D context and an array of <code>Layer</code> objects. Use this when you need full control over layer composition.</p>
<pre><code><span class="kw">import</span> {'{'} evaluateQuery, renderLayers2D {'}'} <span class="kw">from</span> <span class="str">'./fooorma.js'</span>

<span class="kw">const</span> bg = evaluateQuery(<span class="str">"rect(0, 0, 1, 1, '#1a1a2e', 1)"</span>, <span class="num">800</span>, <span class="num">600</span>)
<span class="kw">const</span> fg = evaluateQuery(<span class="str">"ellipse(0.3, 0.3, 0.4, 0.4, '#8b5cf6', 0.8)"</span>, <span class="num">800</span>, <span class="num">600</span>)

<span class="kw">const</span> layers = [
  {'{'} id: <span class="str">'bg'</span>, name: <span class="str">'BG'</span>, visible: <span class="kw">true</span>, mode: <span class="str">'code'</span>, shapes: bg.shapes, query: <span class="str">''</span> {'}'},
  {'{'} id: <span class="str">'fg'</span>, name: <span class="str">'FG'</span>, visible: <span class="kw">true</span>, mode: <span class="str">'code'</span>, shapes: fg.shapes, query: <span class="str">''</span> {'}'},
]

<span class="kw">const</span> ctx = canvas.getContext(<span class="str">'2d'</span>)
renderLayers2D(ctx, layers, <span class="num">800</span>, <span class="num">600</span>)</code></pre>

<h3 id="builtin-palettes"><code>BUILTIN_PALETTES</code></h3>
<p>Array of built-in palettes. Pass them to <code>render()</code> or <code>evaluateQuery()</code> to use <code>palette()</code> in your code.</p>
<table>
  <thead><tr><th>Name</th><th>Colors</th></tr></thead>
  <tbody><tr><td>Neon</td><td><code>#ff2d78 #ff6b2d #ffe620 #2dff6e #2dffee #2d6aff #cc2dff</code></td></tr><tr><td>Pastel</td><td><code>#ffb3ba #ffdfba #ffffba #baffc9 #bae1ff #dbb3ff</code></td></tr><tr><td>Sunset</td><td><code>#2d1b69 #7b2d8b #c84b7f #f0845a #f7c68a #fff4d0</code></td></tr><tr><td>Ocean</td><td><code>#0d3460 #1a6785 #4ecdc4 #a8f0e2 #f0f7ff #e0fbfc</code></td></tr><tr><td>Earth</td><td><code>#3d2b1f #6b4423 #a0714f #c8a882 #8b9e6e #4a7c59</code></td></tr><tr><td>Mono</td><td><code>#0e0e10 #2e2e34 #555560 #888890 #c8c8d0 #f2f2f6</code></td></tr><tr><td>Aurora</td><td><code>#0d0221 #190d4a #3b1f8c #6b2fa0 #a85ccf #4ecdc4 #a8f0e2</code></td></tr><tr><td>Ember</td><td><code>#1a0a00 #5c1a00 #c0392b #e74c3c #f39c12 #f1c40f #fff3cd</code></td></tr></tbody>
</table>

<pre><code><span class="kw">const</span> palettes = BUILTIN_PALETTES.map(p =&gt; ({'{'} name: p.name, colors: p.colors {'}'}))
render(code, canvas, {'{'} palettes {'}'})</code></pre>

<hr>

<h2 id="shapes">2D shapes</h2>
<p>All positions are normalized 0-1. <code>x, y</code> is the top-left corner. <code>w, h</code> are sizes in artboard-width fractions (uniform space).</p>
<table>
  <thead><tr><th>Function</th><th>Signature</th></tr></thead>
  <tbody><tr><td><code>rect</code></td><td><code>x, y, w, h, color?, opacity?, ...trailing</code></td></tr><tr><td><code>ellipse</code></td><td><code>x, y, w, h, color?, opacity?, ...trailing</code></td></tr><tr><td><code>triangle</code></td><td><code>x1, y1, x2, y2, x3, y3, color?, opacity?, ...trailing</code></td></tr><tr><td><code>arc</code></td><td><code>x, y, r, startDeg, endDeg, color?, opacity?, ...trailing</code></td></tr><tr><td><code>line</code></td><td><code>x1, y1, x2, y2, color?, opacity?, width?, ...trailing</code></td></tr><tr><td><code>curve</code></td><td><code>x1, y1, cx, cy, x2, y2, color?, opacity?, width?, ...trailing</code></td></tr><tr><td><code>spline</code></td><td><code>[x1, y1, ...], color?, opacity?, width?, ...trailing</code></td></tr></tbody>
</table>
<p>The <code>...trailing</code> arguments accept <code>stroke()</code>, <code>transform()</code>, and effect calls in any order.</p>
<pre><code><span class="cm">// Basic shapes</span>
rect(<span class="num">0.1</span>, <span class="num">0.1</span>, <span class="num">0.3</span>, <span class="num">0.3</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>)
ellipse(<span class="num">0.5</span>, <span class="num">0.2</span>, <span class="num">0.4</span>, <span class="num">0.4</span>, <span class="str">'#4ecdc4'</span>, <span class="num">0.9</span>, stroke(<span class="str">'#000'</span>, <span class="num">1</span>, <span class="num">0.005</span>))
triangle(<span class="num">0.5</span>, <span class="num">0.1</span>, <span class="num">0.2</span>, <span class="num">0.9</span>, <span class="num">0.8</span>, <span class="num">0.9</span>, <span class="str">'#ff6b6b'</span>, <span class="num">0.85</span>)
line(<span class="num">0.1</span>, <span class="num">0.5</span>, <span class="num">0.9</span>, <span class="num">0.5</span>, <span class="str">'#fff'</span>, <span class="num">0.6</span>, <span class="num">0.003</span>)

<span class="cm">// Spline through points</span>
spline([<span class="num">0.1</span>,<span class="num">0.3</span>, <span class="num">0.3</span>,<span class="num">0.7</span>, <span class="num">0.5</span>,<span class="num">0.4</span>, <span class="num">0.7</span>,<span class="num">0.7</span>, <span class="num">0.9</span>,<span class="num">0.3</span>], <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>)

<span class="cm">// Build a spline vertex by vertex</span>
beginSpline()
repeat(<span class="num">20</span>, (i, t) =&gt; vertex(t, <span class="num">0.3</span> + nz(t * <span class="num">4</span>) * <span class="num">0.4</span>))
endSpline(<span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>)</code></pre>

<h2 id="shapes-3d">3D shapes</h2>
<p>Rendered as isometric projections on Canvas2D (not WebGL).</p>
<table>
  <thead><tr><th>Function</th><th>Signature</th></tr></thead>
  <tbody><tr><td><code>cube</code></td><td><code>x, y, size, color?, opacity?, ...trailing</code></td></tr><tr><td><code>sphere</code></td><td><code>x, y, size, color?, opacity?, ...trailing</code></td></tr><tr><td><code>cylinder</code></td><td><code>x, y, w, h, color?, opacity?, ...trailing</code></td></tr><tr><td><code>torus</code></td><td><code>x, y, size, color?, opacity?, ...trailing</code></td></tr></tbody>
</table>
<pre><code>cube(<span class="num">0.35</span>, <span class="num">0.35</span>, <span class="num">0.3</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>)
sphere(<span class="num">0.35</span>, <span class="num">0.35</span>, <span class="num">0.3</span>, <span class="str">'#4ecdc4'</span>, <span class="num">0.85</span>, material(<span class="str">'glass'</span>))
cylinder(<span class="num">0.35</span>, <span class="num">0.3</span>, <span class="num">0.25</span>, <span class="num">0.35</span>, <span class="str">'#ff6b6b'</span>, <span class="num">0.85</span>)
torus(<span class="num">0.3</span>, <span class="num">0.3</span>, <span class="num">0.35</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>, wireframe(<span class="str">'#000'</span>, <span class="num">1</span>, <span class="num">0.003</span>))</code></pre>

<h2 id="styling">Stroke &amp; gradients</h2>
<table>
  <thead><tr><th>Function</th><th>Signature</th><th>Description</th></tr></thead>
  <tbody><tr><td><code>stroke</code></td><td><code>hex?, opacity?, width?, align?, join?</code></td><td>Shape outline. Align: <code>'center'</code>, <code>'inner'</code>, <code>'outer'</code></td></tr><tr><td><code>wireframe</code></td><td><code>hex?, opacity?, width?, join?</code></td><td>3D edges only, no face fill</td></tr><tr><td><code>grad</code></td><td><code>angle, ...stops</code></td><td>Linear gradient. Stops: hex strings or <code>[hex, opacity, pos]</code></td></tr><tr><td><code>radGrad</code></td><td><code>...stops</code></td><td>Radial gradient</td></tr></tbody>
</table>
<pre><code><span class="cm">// Stroke with alignment</span>
rect(<span class="num">0.2</span>, <span class="num">0.2</span>, <span class="num">0.6</span>, <span class="num">0.3</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>, stroke(<span class="str">'#000'</span>, <span class="num">1</span>, <span class="num">0.01</span>, <span class="str">'inner'</span>, <span class="str">'round'</span>))

<span class="cm">// Linear gradient</span>
rect(<span class="num">0</span>, <span class="num">0</span>, <span class="num">1</span>, h(<span class="num">1</span>), grad(<span class="num">135</span>, <span class="str">'#8b5cf6'</span>, <span class="str">'#4ecdc4'</span>), <span class="num">1</span>)

<span class="cm">// Radial gradient with opacity stops</span>
ellipse(<span class="num">0.2</span>, <span class="num">0.2</span>, <span class="num">0.6</span>, <span class="num">0.6</span>, radGrad([<span class="str">'#fff'</span>, <span class="num">1</span>, <span class="num">0</span>], [<span class="str">'#000'</span>, <span class="num">0.5</span>, <span class="num">1</span>]), <span class="num">1</span>)</code></pre>

<h2 id="transforms">Transforms</h2>
<table>
  <thead><tr><th>Function</th><th>Signature</th></tr></thead>
  <tbody><tr><td><code>rotate</code></td><td><code>deg</code></td></tr><tr><td><code>translate</code></td><td><code>x, y</code></td></tr><tr><td><code>transform</code></td><td><code>{'{'} translateX?, translateY?, rotate?, scaleX?, scaleY?, skewX?, skewY? {'}'}</code></td></tr></tbody>
</table>
<p>Pass as a trailing argument to any shape:</p>
<pre><code>rect(<span class="num">0.3</span>, <span class="num">0.3</span>, <span class="num">0.4</span>, <span class="num">0.4</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>, rotate(<span class="num">45</span>))
ellipse(<span class="num">0.3</span>, <span class="num">0.3</span>, <span class="num">0.3</span>, <span class="num">0.3</span>, <span class="str">'#ff6b6b'</span>, <span class="num">0.9</span>, transform({'{'} scaleX: <span class="num">1.5</span>, skewX: <span class="num">15</span> {'}'}))</code></pre>
<p>3D shapes also accept: <code>rotateX</code>, <code>rotateY</code>, <code>rotateZ</code>, <code>depth</code> (perspective 0-1), <code>smooth</code> (tessellation 3-128).</p>

<h2 id="effects">Effects</h2>
<p>Pass as trailing arguments to shapes or to <code>beginGroup()</code>:</p>
<table>
  <thead><tr><th>Function</th><th>Signature</th><th>Description</th></tr></thead>
  <tbody><tr><td><code>shadow</code></td><td><code>color?, opacity?, blur?, offsetX?, offsetY?</code></td><td>Drop shadow</td></tr><tr><td><code>blur</code></td><td><code>amount?</code></td><td>Gaussian blur (default 4)</td></tr><tr><td><code>bevel</code></td><td><code>intensity?</code></td><td>Edge highlight (default 0.6)</td></tr><tr><td><code>noise</code></td><td><code>amount?</code></td><td>Noise texture overlay (default 0.3)</td></tr><tr><td><code>warp</code></td><td><code>strength?, freq?</code></td><td>Sine-wave pixel displacement</td></tr><tr><td><code>material</code></td><td><code>kind?, roughness?, intensity?</code></td><td>3D material: <code>'default'</code>, <code>'metal'</code>, <code>'plastic'</code>, <code>'marble'</code>, <code>'glass'</code></td></tr></tbody>
</table>
<pre><code>rect(<span class="num">0.2</span>, <span class="num">0.3</span>, <span class="num">0.6</span>, <span class="num">0.3</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.9</span>, shadow(), noise(<span class="num">0.2</span>))
cube(<span class="num">0.35</span>, <span class="num">0.35</span>, <span class="num">0.3</span>, <span class="str">'#4ecdc4'</span>, <span class="num">0.85</span>, material(<span class="str">'metal'</span>, <span class="num">0.3</span>))</code></pre>

<h2 id="loops">Loops &amp; distribution</h2>
<table>
  <thead><tr><th>Function</th><th>Signature</th><th>Description</th></tr></thead>
  <tbody><tr><td><code>repeat</code></td><td><code>n, (i, t) =&gt; {'{}'}</code></td><td>Loop n times. <code>t</code>: normalized 0-1</td></tr><tr><td><code>grid</code></td><td><code>cols, rows, (c, r, ct, rt) =&gt; {'{}'}</code></td><td>Iterate a grid. Position shapes manually</td></tr><tr><td><code>wave</code></td><td><code>n, amp, freq, (i, t, x, y) =&gt; {'{}'}</code></td><td>Distribute along a sine wave</td></tr><tr><td><code>circular</code></td><td><code>n, cx, cy, r, (i, t, x, y, angle) =&gt; {'{}'}</code></td><td>Distribute around a circle</td></tr></tbody>
</table>
<pre><code><span class="cm">// Repeat</span>
repeat(<span class="num">8</span>, (i, t) =&gt; {'{'} rect(i * <span class="num">0.12</span> + <span class="num">0.01</span>, <span class="num">0.45</span>, <span class="num">0.1</span>, <span class="num">0.1</span>, <span class="str">'#8b5cf6'</span>, lerp(<span class="num">0.3</span>, <span class="num">1</span>, t)) {'}'})

<span class="cm">// Circular</span>
circular(<span class="num">12</span>, <span class="num">0.5</span>, <span class="num">0.5</span>, <span class="num">0.35</span>, (i, t, x, y) =&gt; {'{'} ellipse(x - <span class="num">0.03</span>, y - sy(<span class="num">0.06</span>) / <span class="num">2</span>, <span class="num">0.06</span>, <span class="num">0.06</span>, palette(<span class="str">'Neon'</span>, i), <span class="num">0.9</span>) {'}'})</code></pre>

<h2 id="tile">Tile</h2>
<p>The primary tool for repeating patterns. Shapes inside the callback are drawn in tile-local 0-1 space and automatically placed into each cell.</p>
<pre><code><span class="cm">// Square tiles (rows auto-computed from aspect ratio)</span>
tile(<span class="num">5</span>, (c, r, ct, rt) =&gt; {'{'} rect(<span class="num">0.5</span>, <span class="num">0.5</span>, <span class="num">0.9</span>, <span class="num">0.9</span>, palette(<span class="str">'Neon'</span>, c + r), <span class="num">0.85</span>); <span class="kw">if</span> (c % <span class="num">2</span>) mirror(<span class="str">'x'</span>) {'}'})

<span class="cm">// Explicit grid with gaps</span>
tile(<span class="num">4</span>, <span class="num">6</span>, (c, r) =&gt; {'{'} rect(<span class="num">0.5</span>, <span class="num">0.5</span>, <span class="num">0.8</span>, <span class="num">0.8</span>, palette(<span class="str">'Sunset'</span>, c + r), <span class="num">0.85</span>) {'}'}, {'{'} gapX: <span class="num">0.005</span>, gapY: <span class="num">0.005</span> {'}'})</code></pre>
<p><code>mirror(axis)</code> flips shapes inside a tile: <code>'x'</code>, <code>'y'</code>, or <code>'xy'</code>.</p>
<p>Options: <code>{'{'} offsetX, offsetY, gapX, gapY {'}'}</code></p>

<h2 id="groups-masks">Groups &amp; masks</h2>
<pre><code><span class="cm">// Group with shared effects</span>
beginGroup(warp(<span class="num">10</span>, <span class="num">0.03</span>))
  repeat(<span class="num">8</span>, (i, t) =&gt; {'{'} rect(t * <span class="num">0.88</span> + <span class="num">0.01</span>, <span class="num">0.45</span>, <span class="num">0.08</span>, <span class="num">0.08</span>, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>) {'}'})
endGroup()

<span class="cm">// Mask: clip content to mask shape alpha</span>
beginMask()
  ellipse(<span class="num">0.15</span>, <span class="num">0.15</span>, <span class="num">0.7</span>, <span class="num">0.7</span>, <span class="str">'#fff'</span>, <span class="num">1</span>)
endMask()
  rect(<span class="num">0</span>, <span class="num">0</span>, <span class="num">1</span>, h(<span class="num">1</span>), grad(<span class="num">45</span>, <span class="str">'#8b5cf6'</span>, <span class="str">'#4ecdc4'</span>), <span class="num">1</span>)
endClip()</code></pre>

<h2 id="stamps">Stamps</h2>
<p>Reusable shape groups. Pass them via the <code>stamps</code> option as <code>Pattern</code> objects with a <code>code</code> field.</p>
<pre><code><span class="kw">const</span> stamps = [{'{'} id: <span class="str">'diamond'</span>, name: <span class="str">'Diamond'</span>, type: <span class="str">'single'</span>, shape: <span class="str">'rect'</span>,
  color: <span class="str">'#8b5cf6'</span>, opacity: <span class="num">1</span>, count: <span class="num">1</span>, cols: <span class="num">1</span>, rows: <span class="num">1</span>,
  code: <span class="str">`rect(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85, rotate(45))`</span> {'}'}]

render(<span class="str">`stamp('Diamond')
stamp('Diamond', {'{'} x: 0.7, y: 0.3, scale: 0.5, rotate: 20 {'}'})`</span>, canvas, {'{'} stamps {'}'})</code></pre>

<h2 id="math">Math &amp; helpers</h2>
<table>
  <thead><tr><th>Function</th><th>Description</th></tr></thead>
  <tbody><tr><td><code>lerp(a, b, t)</code></td><td>Linear interpolation</td></tr><tr><td><code>clamp(v, lo, hi)</code></td><td>Clamp to range</td></tr><tr><td><code>map(v, a, b, c, d)</code></td><td>Remap from [a,b] to [c,d]</td></tr><tr><td><code>fract(v)</code></td><td>Fractional part</td></tr><tr><td><code>smoothstep(e0, e1, x)</code></td><td>Hermite interpolation 0-1</td></tr><tr><td><code>nz(x, y?)</code></td><td>Value noise, returns 0-1</td></tr><tr><td><code>w(v)</code> / <code>width(v)</code></td><td>Size as fraction of artboard width (identity)</td></tr><tr><td><code>h(v)</code> / <code>height(v)</code></td><td>Size as fraction of artboard height (converts to uniform space)</td></tr><tr><td><code>sy(v)</code></td><td>Convert size to y-position offset (for centering)</td></tr><tr><td><code>W</code> / <code>H</code></td><td>Artboard width / height in pixels</td></tr></tbody>
</table>
<p>Standard math is also available: <code>PI</code>, <code>TAU</code>, <code>E</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>abs</code>, <code>floor</code>, <code>ceil</code>, <code>round</code>, <code>sqrt</code>, <code>pow</code>, <code>min</code>, <code>max</code>, <code>random</code>.</p>

<h2 id="palettes">Palettes</h2>
<pre><code><span class="cm">// Get a single color by index (wraps around)</span>
palette(<span class="str">'Neon'</span>, <span class="num">0</span>)    <span class="cm">// '#ff2d78'</span>

<span class="cm">// Get the full color array</span>
<span class="kw">const</span> colors = palette(<span class="str">'Neon'</span>)   <span class="cm">// ['#ff2d78', ...]</span>

<span class="cm">// Use with gradients</span>
rect(<span class="num">0</span>, <span class="num">0</span>, <span class="num">1</span>, h(<span class="num">1</span>), grad(<span class="num">90</span>, ...palette(<span class="str">'Sunset'</span>)), <span class="num">1</span>)</code></pre>

<p>You can also pass your own palettes:</p>
<pre><code>render(code, canvas, {'{'} palettes: [
  {'{'} name: <span class="str">'Custom'</span>, colors: [<span class="str">'#ff0000'</span>, <span class="str">'#00ff00'</span>, <span class="str">'#0000ff'</span>] {'}'},
  ...BUILTIN_PALETTES.map(p =&gt; ({'{'} name: p.name, colors: p.colors {'}'})),
] {'}'})</code></pre>

<hr>

<h2 id="coordinates">Coordinate system</h2>
<ul>
  <li><strong>Position:</strong> <code>x, y</code> is the top-left corner. Both are 0-1 fractions (<code>x</code> of artW, <code>y</code> of artH). <code>(0, 0)</code> = top-left.</li>
  <li><strong>Size:</strong> <code>w</code> and <code>h</code> are both in artboard-width fractions (uniform space). Equal <code>w</code> and <code>h</code> always produce a square.</li>
  <li><code>h(v)</code> converts a height-relative fraction to uniform space: <code>v * artH / artW</code>.</li>
  <li><code>sy(v)</code> converts a width-fraction size to a y-position offset: <code>v * artW / artH</code>.</li>
</ul>
<pre><code><span class="cm">// A square at the origin</span>
rect(<span class="num">0</span>, <span class="num">0</span>, <span class="num">0.3</span>, <span class="num">0.3</span>)

<span class="cm">// Full-artboard background</span>
rect(<span class="num">0</span>, <span class="num">0</span>, <span class="num">1</span>, h(<span class="num">1</span>), <span class="str">'#1a1a2e'</span>, <span class="num">1</span>)

<span class="cm">// Centered circle</span>
<span class="kw">const</span> s = <span class="num">0.3</span>
ellipse(<span class="num">0.5</span> - s/<span class="num">2</span>, <span class="num">0.5</span> - sy(s)/<span class="num">2</span>, s, s, <span class="str">'#8b5cf6'</span>, <span class="num">0.85</span>)</code></pre>

<h2 id="types">Types</h2>
<p>The library exports all TypeScript types for use in typed projects:</p>
<pre><code><span class="kw">import type</span> {'{'} Shape, ShapeType, ShapeColor, ShapeStroke,
  ShapeGeom, ShapeTransform, ShapeEffect,
  Layer, Pattern, QueryResult,
  Gradient, LinearGradient, RadialGradient, ColorStop,
  Material3D, Palette {'}'} <span class="kw">from</span> <span class="str">'./fooorma.js'</span></code></pre>

      </div>
    </main>
  </div>
</div>

<style>
  .lib-page {
    position: fixed;
    inset: 0;
    background: var(--bg-panel);
    z-index: 500;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Shared page topbar ── */
  .page-topbar {
    height: 44px;
    background: var(--bg-bar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 10px;
    flex-shrink: 0;
  }
  .logo {
    background: none;
    border: none;
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: .08em;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    margin: 0;
    flex-shrink: 0;
    transition: opacity .15s;
  }
  .logo:hover { opacity: 0.75; }
  .beta-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    padding: 1px 5px;
    border-radius: 4px;
    line-height: 1.4;
  }
  .nav-btn {
    background: none;
    border: none;
    color: var(--text-4);
    font-size: 12px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: color .12s, background .12s;
  }
  .nav-btn:hover { color: var(--text-2); background: var(--bg-hover); }
  .nav-btn.active { color: var(--text-1); }
  .topbar-spacer { flex: 1; }
  .theme-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 14px;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
    flex-shrink: 0;
  }
  .theme-btn:hover { border-color: var(--text-5); color: var(--text-2); }

  /* ── Body layout ── */
  .lib-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 200px;
    flex-shrink: 0;
    background: var(--bg-bar);
    border-right: 1px solid var(--border);
    padding: 1rem 0.8rem;
    font-size: 0.82rem;
    overflow-y: auto;
  }
  .sidebar ul { list-style: none; }
  .sidebar li { margin-bottom: 0.1rem; }
  .sidebar a {
    color: var(--text-3);
    text-decoration: none;
    display: block;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .sidebar a:hover { color: var(--text-1); background: var(--bg-hover); }
  .section-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-5);
    margin-top: 1rem;
    margin-bottom: 0.3rem;
    padding-left: 0.5rem;
  }

  /* ── Content ── */
  main {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
  }
  .content {
    max-width: 720px;
    width: 100%;
    padding: 2rem 3rem 6rem;
  }

  /* ── Typography ── */
  h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 0.4rem;
    letter-spacing: -0.02em;
    color: var(--text-1);
  }
  .accent { color: var(--accent); }
  .subtitle {
    color: var(--text-3);
    font-size: 0.95rem;
    margin-bottom: 2.5rem;
  }
  h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 3rem;
    margin-bottom: 0.8rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-1);
  }
  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-top: 1.8rem;
    margin-bottom: 0.5rem;
    color: var(--text-1);
  }
  h2 + h3 { margin-top: 0.8rem; }
  p { margin-bottom: 0.8rem; font-size: 13px; color: var(--text-3); line-height: 1.65; }
  ul:not(.sidebar ul) { margin-bottom: 0.8rem; padding-left: 1.2rem; font-size: 13px; color: var(--text-3); line-height: 1.8; }
  a { color: var(--accent); }
  strong { color: var(--text-2); }
  hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

  /* ── Code ── */
  code {
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    font-size: 0.82em;
    background: var(--bg-sunken);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    color: var(--accent);
  }
  pre {
    background: var(--bg-sunken);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.2rem;
    overflow-x: auto;
    margin-bottom: 1.2rem;
    line-height: 1.55;
  }
  pre code { background: none; padding: 0; font-size: 0.8rem; color: var(--text-2); }
  .cm  { color: var(--cm-comment, #444454); }
  .kw  { color: var(--cm-keyword, #c4b0f8); }
  .str { color: var(--cm-string, #86c99a); }
  .num { color: var(--cm-number, #d19a66); }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.2rem; font-size: 0.85rem; }
  th {
    text-align: left; padding: 0.5rem 0.75rem;
    border-bottom: 2px solid var(--border);
    color: var(--text-3); font-weight: 500; font-size: 0.75rem;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  td { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  td code { font-size: 0.78rem; }
  tr:last-child td { border-bottom: none; }

  /* ── Badges ── */
  .badge { display: inline-block; font-size: 0.7rem; padding: 0.15em 0.5em; border-radius: 4px; font-weight: 500; letter-spacing: 0.04em; }
  .badge-esm { background: color-mix(in srgb, #4ecdc4 15%, transparent); color: #4ecdc4; }
  .badge-umd { background: color-mix(in srgb, #f7c68a 15%, transparent); color: #f7c68a; }
  .badge-size { background: var(--bg-sunken); color: var(--text-3); }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .sidebar { display: none; }
    .content { padding: 1.5rem; }
  }
</style>

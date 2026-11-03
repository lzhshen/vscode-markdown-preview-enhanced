// Mermaid zoom & pan for Markdown Preview Enhanced
//
// Wraps every rendered mermaid <svg> in a viewport/stage pair and drives a
// CSS transform on the stage, so the SVG itself (and thus every export) is
// untouched. Inline: Ctrl/Cmd + wheel or pinch zooms, drag pans, hover
// toolbar. Fullscreen: an overlay over the preview panel with keyboard
// shortcuts. View state is kept per diagram index across re-renders.
(function () {
  'use strict';

  var MIN_SCALE = 0.1;
  var MAX_SCALE = 10;
  var STEP = 1.2;
  var DRAG_THRESHOLD = 4;
  var PAN_STEP = 50;
  var FIT_PADDING = 16;

  var ICONS = {
    zoomOut: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>',
    zoomIn: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg>',
    fit: '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
    fullscreen:
      '<svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
  };

  var STRINGS = {
    en: {
      toolbar: 'Diagram zoom',
      zoomIn: 'Zoom in (Ctrl/Cmd + wheel)',
      zoomOut: 'Zoom out',
      reset: 'Reset to 100% (or double-click empty space)',
      fit: 'Fit to view',
      fullscreen: 'Fullscreen',
      close: 'Close (Esc)',
      dialog: 'Diagram fullscreen view',
      hint: 'Wheel / pinch to zoom · drag to pan · <kbd>+</kbd> <kbd>-</kbd> zoom · <kbd>0</kbd> 100% · <kbd>F</kbd> fit · <kbd>←↑→↓</kbd> pan · <kbd>Esc</kbd> close',
    },
    zh: {
      toolbar: '图表缩放',
      zoomIn: '放大（也可 Ctrl/⌘ + 滚轮）',
      zoomOut: '缩小',
      reset: '重置为 100%（双击空白处同效）',
      fit: '适应容器',
      fullscreen: '全屏查看',
      close: '关闭（Esc）',
      dialog: '全屏查看图表',
      hint: '滚轮 / 捏合缩放 · 拖拽平移 · <kbd>+</kbd> <kbd>-</kbd> 缩放 · <kbd>0</kbd> 100% · <kbd>F</kbd> 适应 · <kbd>←↑→↓</kbd> 平移 · <kbd>Esc</kbd> 关闭',
    },
  };

  function getStrings() {
    var locale = '';
    try {
      var data = document.getElementById('crossnote-data');
      var config = JSON.parse(
        (data && data.getAttribute('data-config')) || '{}',
      );
      locale = config.locale || '';
    } catch (e) {
      // fall through to navigator.language
    }
    locale = (locale || navigator.language || 'en').toLowerCase();
    return locale.indexOf('zh') === 0 ? STRINGS.zh : STRINGS.en;
  }

  var t = getStrings();

  // View state per mermaid diagram index; survives preview re-renders but
  // not a webview reload.
  var viewStates = [];

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    node.className = className;
    return node;
  }

  // The preview applies CSS `zoom` for its own page zoom, so client
  // coordinates have to be scaled back into the viewport's local units.
  function localFactor(vp) {
    var r = vp.getBoundingClientRect();
    return vp.offsetWidth ? r.width / vp.offsetWidth : 1;
  }

  // The preview container itself is usually transparent; the theme colour
  // sits on an ancestor, so walk up to the first opaque background.
  function effectiveBackground(node) {
    while (node && node.nodeType === 1) {
      var bg = getComputedStyle(node).backgroundColor;
      var m =
        bg &&
        bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
        return { css: bg, r: +m[1], g: +m[2], b: +m[3] };
      }
      node = node.parentElement;
    }
    return { css: 'rgb(255, 255, 255)', r: 255, g: 255, b: 255 };
  }

  function isDarkBackground(node) {
    var bg = effectiveBackground(node);
    return 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b < 128;
  }

  function createPanZoom(vp, stage, options) {
    var pz = {
      s: (options.state && options.state.s) || 1,
      x: (options.state && options.state.x) || 0,
      y: (options.state && options.state.y) || 0,
      wheelNeedsModifier: options.wheelNeedsModifier !== false,
    };

    pz.apply = function (animate) {
      stage.classList.toggle('mpe-mz-animating', !!animate);
      // Leave the identity view transform-free so it renders exactly as before.
      stage.style.transform =
        pz.s === 1 && pz.x === 0 && pz.y === 0
          ? ''
          : 'translate(' + pz.x + 'px, ' + pz.y + 'px) scale(' + pz.s + ')';
      options.onChange({ s: pz.s, x: pz.x, y: pz.y });
    };

    pz.zoomAt = function (factor, px, py, animate) {
      var ns = clampScale(pz.s * factor);
      var k = ns / pz.s;
      pz.x = px - (px - pz.x) * k;
      pz.y = py - (py - pz.y) * k;
      pz.s = ns;
      pz.apply(animate);
    };

    pz.zoomCenter = function (factor) {
      pz.zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2, true);
    };

    pz.reset = function () {
      pz.s = 1;
      pz.x = 0;
      pz.y = 0;
      pz.apply(true);
    };

    pz.fit = function (animate) {
      var svg = stage.querySelector('svg');
      if (!svg) {
        return;
      }
      var f = localFactor(vp);
      var vr = vp.getBoundingClientRect();
      var r = svg.getBoundingClientRect();
      // Position and size of the svg at scale 1 without translation.
      var left0 = ((r.left - vr.left) / f - pz.x) / pz.s;
      var top0 = ((r.top - vr.top) / f - pz.y) / pz.s;
      var w0 = r.width / f / pz.s;
      var h0 = r.height / f / pz.s;
      if (!w0 || !h0) {
        return;
      }
      var vw = vp.clientWidth;
      var vh = vp.clientHeight;
      if (vw <= 2 * FIT_PADDING || vh <= 2 * FIT_PADDING) {
        return; // not laid out (e.g. hidden panel)
      }
      var ns = clampScale(
        Math.min((vw - 2 * FIT_PADDING) / w0, (vh - 2 * FIT_PADDING) / h0),
      );
      pz.s = ns;
      pz.x = (vw - w0 * ns) / 2 - left0 * ns;
      pz.y = (vh - h0 * ns) / 2 - top0 * ns;
      pz.apply(animate !== false);
    };

    pz.pan = function (dx, dy) {
      pz.x += dx;
      pz.y += dy;
      pz.apply(true);
    };

    pz.wheel = function (e) {
      var f = localFactor(vp);
      var r = vp.getBoundingClientRect();
      var delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      delta = Math.max(-60, Math.min(60, delta));
      pz.zoomAt(
        Math.exp(-delta * 0.01),
        (e.clientX - r.left) / f,
        (e.clientY - r.top) / f,
        false,
      );
    };

    var start = null;
    var dragging = false;
    var suppressClick = false;

    vp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) {
        return;
      }
      start = {
        cx: e.clientX,
        cy: e.clientY,
        x: pz.x,
        y: pz.y,
        id: e.pointerId,
      };
      dragging = false;
    });

    vp.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) {
        return;
      }
      var f = localFactor(vp);
      var dx = (e.clientX - start.cx) / f;
      var dy = (e.clientY - start.cy) / f;
      if (!dragging) {
        if (Math.hypot(dx * f, dy * f) < DRAG_THRESHOLD) {
          return;
        }
        dragging = true;
        try {
          vp.setPointerCapture(e.pointerId);
        } catch (err) {
          // the pointer may already be gone; panning still works without capture
        }
        vp.classList.add('mpe-mz-dragging');
        document.body.classList.add('mpe-mz-noselect');
        var selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      }
      pz.x = start.x + dx;
      pz.y = start.y + dy;
      pz.apply(false);
    });

    function endDrag() {
      if (dragging) {
        // Swallow the click that follows a drag so links / mermaid click
        // callbacks don't fire.
        suppressClick = true;
        setTimeout(function () {
          suppressClick = false;
        }, 0);
        vp.classList.remove('mpe-mz-dragging');
        document.body.classList.remove('mpe-mz-noselect');
      }
      start = null;
      dragging = false;
    }
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    // Links inside the svg are natively draggable; a native drag would
    // cancel the pointer stream and the pan with it.
    vp.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });

    vp.addEventListener(
      'click',
      function (e) {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );

    vp.addEventListener('dblclick', function (e) {
      if (
        e.target.closest &&
        e.target.closest('.node, .edgeLabel, .actor, .messageText, a')
      ) {
        return;
      }
      e.preventDefault();
      pz.reset();
    });

    vp.mpeMermaidZoom = pz;
    pz.apply(false);
    return pz;
  }

  function button(icon, label, onClick, className) {
    var b = el('button', className || '');
    b.type = 'button';
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  function createToolbar(getPz, handlers) {
    var bar = el('div', 'mpe-mz-toolbar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t.toolbar);
    var pct = button(
      '100%',
      t.reset,
      function () {
        getPz().reset();
      },
      'mpe-mz-pct',
    );
    bar.appendChild(
      button(ICONS.zoomOut, t.zoomOut, function () {
        getPz().zoomCenter(1 / STEP);
      }),
    );
    bar.appendChild(pct);
    bar.appendChild(
      button(ICONS.zoomIn, t.zoomIn, function () {
        getPz().zoomCenter(STEP);
      }),
    );
    bar.appendChild(el('span', 'mpe-mz-sep'));
    bar.appendChild(
      button(ICONS.fit, t.fit, function () {
        getPz().fit();
      }),
    );
    if (handlers.onFullscreen) {
      bar.appendChild(
        button(ICONS.fullscreen, t.fullscreen, handlers.onFullscreen),
      );
    }
    if (handlers.onClose) {
      bar.appendChild(button(ICONS.close, t.close, handlers.onClose));
    }
    // Keep toolbar presses from starting a drag or reaching the preview.
    bar.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    bar.addEventListener('dblclick', function (e) {
      e.stopPropagation();
    });
    return {
      el: bar,
      setPct: function (s) {
        pct.textContent = Math.round(s * 100) + '%';
      },
    };
  }

  function mount(graph, svg, index) {
    graph.classList.add('mpe-mz');
    graph.classList.toggle('mpe-mz-dark', isDarkBackground(graph));
    var vp = el('div', 'mpe-mz-viewport');
    var stage = el('div', 'mpe-mz-stage');
    graph.insertBefore(vp, svg);
    // Move (not re-create) the svg so mermaid's bound listeners survive.
    stage.appendChild(svg);
    vp.appendChild(stage);

    var pz;
    var toolbar = createToolbar(
      function () {
        return pz;
      },
      {
        onFullscreen: function (e) {
          openFullscreen(svg, graph, e.currentTarget);
        },
      },
    );
    graph.appendChild(toolbar.el);
    pz = createPanZoom(vp, stage, {
      state: viewStates[index],
      onChange: function (st) {
        viewStates[index] = st;
        toolbar.setPct(st.s);
      },
    });
  }

  var activeOverlay = null;

  function openFullscreen(svg, graph, trigger) {
    if (activeOverlay) {
      return;
    }
    // `fixed` lets the preview counter-zoom the overlay under page zoom.
    var overlay = el('div', 'mpe-mz-overlay fixed');
    overlay.classList.toggle('mpe-mz-dark', isDarkBackground(graph));
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t.dialog);

    var frame = el('div', 'mpe-mz mpe-mz-frame');
    var vp = el('div', 'mpe-mz-viewport');
    var stage = el('div', 'mpe-mz-stage');
    var clone = svg.cloneNode(true);
    var vb = clone.viewBox && clone.viewBox.baseVal;
    clone.style.maxWidth = 'none';
    if (vb && vb.width && vb.height) {
      clone.setAttribute('width', String(vb.width));
      clone.setAttribute('height', String(vb.height));
    }
    stage.appendChild(clone);
    vp.appendChild(stage);
    vp.style.backgroundColor = effectiveBackground(graph).css;

    var pz;
    function close() {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      activeOverlay = null;
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      }
    }
    var toolbar = createToolbar(
      function () {
        return pz;
      },
      { onClose: close },
    );
    frame.appendChild(vp);
    frame.appendChild(toolbar.el);

    var hint = el('div', 'mpe-mz-hint');
    hint.innerHTML = t.hint;
    overlay.appendChild(frame);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    pz = createPanZoom(vp, stage, {
      wheelNeedsModifier: false,
      onChange: function (st) {
        toolbar.setPct(st.s);
      },
    });
    pz.fit(false);
    var firstButton = toolbar.el.querySelector('button');
    if (firstButton) {
      firstButton.focus();
    }

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      var actions = {
        'Escape': close,
        '+': function () {
          pz.zoomCenter(STEP);
        },
        '=': function () {
          pz.zoomCenter(STEP);
        },
        '-': function () {
          pz.zoomCenter(1 / STEP);
        },
        '_': function () {
          pz.zoomCenter(1 / STEP);
        },
        '0': function () {
          pz.reset();
        },
        'f': function () {
          pz.fit();
        },
        'F': function () {
          pz.fit();
        },
        'ArrowLeft': function () {
          pz.pan(PAN_STEP, 0);
        },
        'ArrowRight': function () {
          pz.pan(-PAN_STEP, 0);
        },
        'ArrowUp': function () {
          pz.pan(0, PAN_STEP);
        },
        'ArrowDown': function () {
          pz.pan(0, -PAN_STEP);
        },
      };
      var action = actions[e.key];
      if (!action) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      action();
    }
    window.addEventListener('keydown', onKey, true);
  }

  // Registered on window in the capture phase so it runs before the
  // preview's own document-level Ctrl/Cmd + wheel page zoom.
  window.addEventListener(
    'wheel',
    function (e) {
      var vp =
        e.target && e.target.closest && e.target.closest('.mpe-mz-viewport');
      var pz = vp && vp.mpeMermaidZoom;
      if (!pz) {
        return;
      }
      if (pz.wheelNeedsModifier && !(e.ctrlKey || e.metaKey)) {
        return; // let the page scroll normally
      }
      e.preventDefault();
      e.stopPropagation();
      pz.wheel(e);
    },
    { capture: true, passive: false },
  );

  // `{data-zoom=false}` on the fence; a bare `zoom` attribute would be
  // stripped by the preview's HTML sanitizer.
  function isZoomDisabled(graph) {
    return (
      graph.getAttribute('data-zoom') === 'false' ||
      !!graph.closest('.reveal, .mpe-mz-overlay')
    );
  }

  function scan() {
    var graphs = document.querySelectorAll('div.mermaid');
    for (var i = 0; i < graphs.length; i++) {
      var graph = graphs[i];
      var svg = graph.querySelector(':scope > svg');
      if (svg && !isZoomDisabled(graph)) {
        mount(graph, svg, i);
      }
    }
  }

  // Mermaid renders asynchronously and the preview replaces its DOM on every
  // update, so watch for freshly rendered svgs and coalesce per frame.
  var scheduled = false;
  function scheduleScan() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      scan();
    });
  }

  function start() {
    new MutationObserver(scheduleScan).observe(document.body, {
      childList: true,
      subtree: true,
    });
    scheduleScan();
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();

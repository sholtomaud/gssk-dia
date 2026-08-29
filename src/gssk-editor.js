import styles from './styles.css?inline';
import { SYMBOLS } from './symbols.js';
import { validateModel } from './validator.js';

export class GsskEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._value = { nodes: [], edges: [] };
    this._symbols = 'odum';
    this._readOnly = false;
    this._gridSize = 20;
    this._selectedId = null;
    this._isDragging = false;
    this._draggedElement = null;
    this._isDraggingHandle = false;
    this._activeHandle = null;
    this._animationRequested = false;

    // Pan & Zoom state
    this._viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
    this._zoom = 1;
    this._isPanning = false;

    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onDrop = this.onDrop.bind(this);
    this._onDoubleClick = this.onDoubleClick.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._domains = [{ name: 'None', types: [] }];
  }

  static get observedAttributes() {
    return ['symbols', 'readonly', 'grid', 'invalid', 'theme'];
  }

  get domains() { return this._domains; }
  set domains(val) {
      this._domains = val;
      if (this._selectedType === 'node') this.showPropertyPanel();
  }

  connectedCallback() {
    this.render();
    window.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('keydown', this._onKeyDown);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    switch (name) {
      case 'symbols':
        this._symbols = newValue;
        break;
      case 'readonly':
        this._readOnly = newValue !== null;
        break;
      case 'grid':
        this._gridSize = parseInt(newValue, 10) || 20;
        break;
      case 'theme':
        // No internal state needed, handled by CSS
        break;
    }
    this.update();
  }

  get symbols() { return this._symbols; }
  set symbols(val) { this.setAttribute('symbols', val); }

  get readOnly() { return this._readOnly; }
  set readOnly(val) {
    if (val) this.setAttribute('readonly', '');
    else this.removeAttribute('readonly');
  }

  get gridSize() { return this._gridSize; }
  set gridSize(val) { this.setAttribute('grid', val.toString()); }

  get value() { return this.getJson(); }
  set value(val) { this.loadModel(val); }

  loadModel(json) {
    this._value = JSON.parse(JSON.stringify(json));
    if (!this._value.nodes) this._value.nodes = [];
    if (!this._value.edges) this._value.edges = [];
    if (!this._value.boundaries) this._value.boundaries = [];

    this._value.nodes.forEach(node => {
        node.currentValue = node.value;
    });
    // Ensure boundaries have IDs
    this._value.boundaries.forEach((b, i) => {
        if (!b.id) b.id = `boundary-${i}-${Date.now()}`;
    });
    this.validate();
    this.update();
    const panel = this.shadowRoot.getElementById('property-panel');
    if (panel && !panel.classList.contains('hidden')) {
        this.showPropertyPanel();
    }
  }

  validate() {
    const result = validateModel(this._value);
    if (result.valid) {
      this.removeAttribute('invalid');
    } else {
      this.setAttribute('invalid', '');
    }
    this.dispatchEvent(new CustomEvent('validation', { detail: result }));
    return result.valid;
  }

  getJson() {
    // Ensure the JSON matches GSSK expectations
    // GSSK expects nodes and edges.
    return JSON.parse(JSON.stringify(this._value));
  }

  updateState(stateMap, fitnessMap = null) {
    if (!this._value || !this._value.nodes) return;
    this._value.nodes.forEach((node) => {
      if (stateMap[node.id] !== undefined) {
        node.currentValue = stateMap[node.id];
      }
      if (fitnessMap && fitnessMap[node.id]) {
          node.fitness = fitnessMap[node.id];
      } else if (fitnessMap) {
          delete node.fitness;
      }
    });
    if (!this._animationRequested) {
      this._animationRequested = true;
      requestAnimationFrame(() => {
        this.updateVisuals();
        this.updatePropertyPanelValues();
        this._animationRequested = false;
      });
    }
  }

  updateVisuals() {
    this._value.nodes.forEach(node => {
        const group = this.shadowRoot.querySelector(`[data-id="${node.id}"]`);
        if (group && node.fitness) {
            let badge = group.querySelector('.fitness-badge');
            if (!badge) {
                badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                badge.setAttribute('class', 'fitness-badge');
                group.appendChild(badge);
            }
            const color = node.fitness.r2 > 0.8 ? '#4ade80' : node.fitness.r2 > 0.5 ? '#f59e0b' : '#f87171';
            badge.innerHTML = `
                <circle cx="70" cy="10" r="8" fill="${color}" stroke="var(--bg-color)" stroke-width="2"/>
                <text x="70" y="25" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">${node.fitness.r2.toFixed(2)}</text>
            `;
        } else if (group) {
            const badge = group.querySelector('.fitness-badge');
            if (badge) badge.remove();
        }

        const fillElement = this.shadowRoot.querySelector(`#fill-${node.id}`);
        if (fillElement && node.visual && node.visual.capacity) {
            const val = node.currentValue !== undefined ? node.currentValue : node.value;
            const ratio = Math.min(1, Math.max(0, val / node.visual.capacity));
            const fillHeight = ratio * 60;
            fillElement.setAttribute('height', fillHeight.toString());
            fillElement.setAttribute('y', (80 - fillHeight).toString());
        }
    });
    // Optional: add flow animation here if state includes flows
  }

  updatePropertyPanelValues() {
    if (this._selectedType === 'node') {
        const node = this._value.nodes.find(n => n.id === this._selectedId);
        if (node) {
            const currentInput = this.shadowRoot.getElementById('prop-current-value');
            if (currentInput) {
                currentInput.value = (node.currentValue !== undefined ? node.currentValue : node.value).toFixed(2);
            }
        }
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="editor-container">
        <div id="palette" class="panel palette">
          <div class="panel-header">Nodes</div>

          <!-- (a) Source — plain circle -->
          <div class="palette-item" draggable="true" data-type="source" title="Source (a) — external forcing function">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Source</span>
          </div>

          <!-- (c) Storage / Tank — triangular roof + semicircular bottom -->
          <div class="palette-item" draggable="true" data-type="storage" title="Storage (c) — state variable tank">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M 15,50 L 15,44.75 L 50,22 L 85,44.75 L 85,50 A 35,35 0 0 1 15,50 Z"
                    fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Storage</span>
          </div>

          <!-- (b) Heat Sink — downward arrow + three decreasing bars -->
          <div class="palette-item" draggable="true" data-type="sink" title="Heat Sink (b) — degraded energy dispersion">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <line x1="50" y1="18" x2="50" y2="50" stroke="currentColor" stroke-width="4"/>
              <polygon points="50,58 43,46 57,46" fill="currentColor"/>
              <line x1="32" y1="64" x2="68" y2="64" stroke="currentColor" stroke-width="3.5"/>
              <line x1="38" y1="72" x2="62" y2="72" stroke="currentColor" stroke-width="3.5"/>
              <line x1="44" y1="80" x2="56" y2="80" stroke="currentColor" stroke-width="3.5"/>
            </svg>
            <span>Heat Sink</span>
          </div>

          <!-- Constant — circle with horizontal bar (fixed forcing function) -->
          <div class="palette-item" draggable="true" data-type="constant" title="Constant — fixed-value forcing function">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="4"/>
              <line x1="26" y1="50" x2="74" y2="50" stroke="currentColor" stroke-width="3"/>
            </svg>
            <span>Constant</span>
          </div>

          <!-- (d) Interaction / Work Gate — forward chevron with V-notch -->
          <div class="palette-item" draggable="true" data-type="interaction" title="Interaction (d) — work gate, two flows interact">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M 10,28 L 60,28 L 82,50 L 60,72 L 10,72 L 28,50 Z"
                    fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>
            <span>Interact.</span>
          </div>

          <!-- (e) Transaction — diamond -->
          <div class="palette-item" draggable="true" data-type="transaction" title="Transaction (e) — exchange of goods/money">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <polygon points="50,16 84,50 50,84 16,50"
                       fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Trans.</span>
          </div>

          <!-- (f) Producer — D-shape: flat left, semicircle right -->
          <div class="palette-item" draggable="true" data-type="producer" title="Producer (f) — collects/transforms low-quality energy">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M 18,25 L 65,25 A 25,25 0 0 1 65,75 L 18,75 Z"
                    fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Producer</span>
          </div>

          <!-- (g) Consumer — regular hexagon, flat top/bottom (rotate 30°) -->
          <div class="palette-item" draggable="true" data-type="consumer" title="Consumer (g) — transforms energy, autocatalytic">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <polygon points="84,50 67,79.5 33,79.5 16,50 33,20.5 67,20.5"
                       fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>
            <span>Consumer</span>
          </div>

          <!-- (h) Switch — four-pointed concave star -->
          <div class="palette-item" draggable="true" data-type="switch" title="Switch (h) — conditional switching action">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M 15,15 C 27.25,27.25 72.75,27.25 85,15
                       C 72.75,27.25 72.75,72.75 85,85
                       C 72.75,72.75 27.25,72.75 15,85
                       C 27.25,72.75 27.25,27.25 15,15 Z"
                    fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>
            <span>Switch</span>
          </div>

          <!-- (i) Receiver — flat left, semicircle right (narrow D, self-limiting) -->
          <div class="palette-item" draggable="true" data-type="receiver" title="Receiver (i) — self-limiting saturating receiver">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M 38,18 L 50,18 A 32,32 0 0 1 50,82 L 38,82 Z"
                    fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Receiver</span>
          </div>

          <!-- (j) Amplifier — right-pointing isosceles triangle -->
          <div class="palette-item" draggable="true" data-type="amplifier" title="Amplifier (j) — constant-gain unit">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <polygon points="18,30 18,70 82,50"
                       fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>
            <span>Amplifier</span>
          </div>

          <!-- (k) Box — plain rectangle (miscellaneous subsystem) -->
          <div class="palette-item" draggable="true" data-type="box" title="Box (k) — miscellaneous subsystem">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <rect x="14" y="28" width="72" height="44" rx="2"
                    fill="none" stroke="currentColor" stroke-width="4"/>
            </svg>
            <span>Box</span>
          </div>

        </div>
        <div id="canvas-container">
          <svg id="svg-canvas" viewBox="${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}">
            <defs id="symbol-defs"></defs>
            <g id="grid-layer"></g>
            <g id="boundaries-layer"></g>
            <g id="edges-layer"></g>
            <g id="nodes-layer"></g>
          </svg>
        </div>
        <div id="property-panel" class="panel property-panel hidden">
          <div class="panel-header">
            Properties
            <button class="toggle" id="close-props">&times;</button>
          </div>
          <div id="props-content"></div>
        </div>
      </div>
    `;
    this.setupEventListeners();
    this.update();
  }

  update() {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    if (svg) {
        svg.setAttribute('viewBox', `${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}`);
    }
    const defs = this.shadowRoot.getElementById('symbol-defs');
    if (defs) {
      defs.innerHTML = SYMBOLS.odum + SYMBOLS.generic;
    }
    // Render boundaries first so they are at the bottom of the z-stack
    this.renderBoundaries();
    this.renderEdges();
    this.renderNodes();
  }

  renderBoundaries() {
    const layer = this.shadowRoot.getElementById('boundaries-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (!this._value.boundaries) return;

    this._value.boundaries.forEach(boundary => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', boundary.id);
      g.setAttribute('class', `boundary-group ${this._selectedId === boundary.id ? 'selected' : ''}`);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', boundary.x);
      rect.setAttribute('y', boundary.y);
      rect.setAttribute('width', boundary.w);
      rect.setAttribute('height', boundary.h);
      rect.setAttribute('rx', '15');
      rect.setAttribute('ry', '15');
      rect.setAttribute('fill', 'rgba(100, 116, 139, 0.05)');
      rect.setAttribute('stroke', this._selectedId === boundary.id ? 'var(--primary-color)' : 'var(--grid-color)');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '5,5');
      rect.style.cursor = 'grab';
      g.appendChild(rect);

      if (boundary.label) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', boundary.x + 10);
          text.setAttribute('y', boundary.y + 20);
          text.setAttribute('class', 'node-label');
          text.style.fontStyle = 'italic';
          text.style.pointerEvents = 'none';
          text.textContent = boundary.label;
          g.appendChild(text);
      }

      if (this._selectedId === boundary.id && !this._readOnly) {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          handle.setAttribute('x', boundary.x + boundary.w - 10);
          handle.setAttribute('y', boundary.y + boundary.h - 10);
          handle.setAttribute('width', '20');
          handle.setAttribute('height', '20');
          handle.setAttribute('fill', 'var(--primary-color)');
          handle.setAttribute('class', 'resize-handle');
          handle.style.cursor = 'nwse-resize';
          g.appendChild(handle);
      }

      layer.appendChild(g);
    });
  }

  renderNodes() {
    const layer = this.shadowRoot.getElementById('nodes-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._value.nodes.forEach(node => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${node.visual.x - 40}, ${node.visual.y - 40})`);
      g.setAttribute('data-id', node.id);
      g.setAttribute('class', `node-group ${this._selectedId === node.id ? 'selected' : ''}`);
      g.style.cursor = this._readOnly ? 'default' : 'grab';

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '80');
      bg.setAttribute('height', '80');
      bg.setAttribute('fill', 'transparent');
      g.appendChild(bg);

      const symbolId = `${this._symbols}-${node.type}`;
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${symbolId}`);
      use.setAttribute('width', '80');
      use.setAttribute('height', '80');
      use.setAttribute('color', 'var(--text-color)');
      g.appendChild(use);

      if (node.type === 'storage') {
        const fillClipPathId = `clip-${node.id}`;
        let clipPath = this.shadowRoot.getElementById(fillClipPathId);
        if (!clipPath) {
            clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', fillClipPathId);
            const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            clipRect.setAttribute('id', `fill-${node.id}`);
            clipRect.setAttribute('x', '20');
            clipRect.setAttribute('y', '80');
            clipRect.setAttribute('width', '60');
            clipRect.setAttribute('height', '0');
            clipPath.appendChild(clipRect);
            this.shadowRoot.getElementById('symbol-defs').appendChild(clipPath);
        }

        const fillUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        fillUse.setAttribute('href', `#${symbolId}`);
        fillUse.setAttribute('width', '80');
        fillUse.setAttribute('height', '80');
        fillUse.setAttribute('fill', 'var(--primary-color)');
        fillUse.setAttribute('clip-path', `url(#${fillClipPathId})`);
        g.appendChild(fillUse);
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '40');
      text.setAttribute('y', '95');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'node-label');
      text.textContent = node.visual.label || node.id;
      g.appendChild(text);

      const ports = [
          { x: 40, y: 10, pos: 'top' },
          { x: 70, y: 40, pos: 'right' },
          { x: 40, y: 70, pos: 'bottom' },
          { x: 10, y: 40, pos: 'left' }
      ];
      ports.forEach(p => {
          const portG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          portG.setAttribute('class', 'node-port');
          portG.setAttribute('data-pos', p.pos);

          const portVisible = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          portVisible.setAttribute('cx', p.x);
          portVisible.setAttribute('cy', p.y);
          portVisible.setAttribute('r', '4');
          portVisible.setAttribute('fill', 'var(--bg-color)');
          portVisible.setAttribute('stroke', 'var(--primary-color)');
          portVisible.setAttribute('stroke-width', '1');
          portG.appendChild(portVisible);

          const portHit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          portHit.setAttribute('cx', p.x);
          portHit.setAttribute('cy', p.y);
          portHit.setAttribute('r', '12');
          portHit.setAttribute('fill', 'transparent');
          portHit.style.cursor = 'crosshair';
          portG.appendChild(portHit);

          g.appendChild(portG);
      });

      layer.appendChild(g);
    });
    this.updateVisuals();
  }

  renderEdges() {
    const layer = this.shadowRoot.getElementById('edges-layer');
    if (!layer) return;
    layer.innerHTML = '';

    // Create markers if they don't exist
    let marker = this.shadowRoot.getElementById('arrowhead');
    if (!marker) {
        const defs = this.shadowRoot.getElementById('symbol-defs');
        marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        arrowPath.setAttribute('fill', 'var(--edge-color)');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
    }

    this._value.edges.forEach(edge => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', edge.id);
      g.setAttribute('class', `edge-group ${this._selectedId === edge.id ? 'selected' : ''}`);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const geo = this.getEdgeGeometry(edge);
      if (!geo) return;

      const d = `M ${geo.x1},${geo.y1} C ${geo.cx1},${geo.cy1} ${geo.cx2},${geo.cy2} ${geo.x2},${geo.y2}`;

      hitPath.setAttribute('d', d);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '20');
      hitPath.setAttribute('class', 'hit-path');
      g.appendChild(hitPath);

      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--edge-color)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.setAttribute('class', 'main-path');

      if (edge.logic === 'interaction') {
        path.setAttribute('stroke-dasharray', '5,5');
      }
      g.appendChild(path);

      // Render control handles if selected
      if (this._selectedId === edge.id && this._selectedType === 'edge' && !this._readOnly) {
          const createHandle = (x, y, handleId) => {
              const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('cx', x);
              circle.setAttribute('cy', y);
              circle.setAttribute('r', '5');
              circle.setAttribute('class', 'control-handle');
              circle.setAttribute('data-handle', handleId);
              circle.setAttribute('data-edge-id', edge.id);
              return circle;
          };

          const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line1.setAttribute('x1', geo.x1);
          line1.setAttribute('y1', geo.y1);
          line1.setAttribute('x2', geo.cx1);
          line1.setAttribute('y2', geo.cy1);
          line1.setAttribute('class', 'handle-line');
          g.appendChild(line1);

          const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line2.setAttribute('x1', geo.x2);
          line2.setAttribute('y1', geo.y2);
          line2.setAttribute('x2', geo.cx2);
          line2.setAttribute('y2', geo.cy2);
          line2.setAttribute('class', 'handle-line');
          g.appendChild(line2);

          g.appendChild(createHandle(geo.cx1, geo.cy1, 'ctrl1'));
          g.appendChild(createHandle(geo.cx2, geo.cy2, 'ctrl2'));
      }

      const controlNodeId = edge.params?.control_node || edge.control_node;
      if (edge.logic === 'interaction' || controlNodeId) {
        const midPoint = this.getPathMidpoint(edge);
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#gate');
        use.setAttribute('x', midPoint.x - 15);
        use.setAttribute('y', midPoint.y - 15);
        use.setAttribute('width', '30');
        use.setAttribute('height', '30');
        use.setAttribute('color', 'var(--edge-color)');
        g.appendChild(use);

        if (controlNodeId) {
            const controlNode = this._value.nodes.find(n => n.id === controlNodeId);
            if (controlNode) {
                const controlLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                controlLine.setAttribute('x1', controlNode.visual.x);
                controlLine.setAttribute('y1', controlNode.visual.y);
                controlLine.setAttribute('x2', midPoint.x);
                controlLine.setAttribute('y2', midPoint.y);
                controlLine.setAttribute('stroke', 'var(--grid-color)');
                controlLine.setAttribute('stroke-dasharray', '2,2');
                g.appendChild(controlLine);
            }
        }
      }

      layer.appendChild(g);
    });
  }

  intersectRect(angle, w, h) {
    const absCos = Math.abs(Math.cos(angle));
    const absSin = Math.abs(Math.sin(angle));
    if (w * absSin <= h * absCos) {
      const x = Math.sign(Math.cos(angle)) * w / 2;
      const y = x * Math.tan(angle);
      return { x, y };
    } else {
      const y = Math.sign(Math.sin(angle)) * h / 2;
      const x = y / Math.tan(angle);
      return { x, y };
    }
  }

  intersectEllipse(angle, rx, ry) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const r = (rx * ry) / Math.sqrt((ry * cos) ** 2 + (rx * sin) ** 2);
    return { x: r * cos, y: r * sin };
  }

  intersectDiamond(angle, size) {
    // A diamond is just a rectangle rotated by 45 degrees.
    // Or we can treat it as 4 lines: |x| + |y| = size/2
    // But our diamond is a square 50x50 rotated, so its side in axis-aligned is different.
    // The vertices are (size/2, 0), (0, size/2), (-size/2, 0), (0, -size/2)
    const absCos = Math.abs(Math.cos(angle));
    const absSin = Math.abs(Math.sin(angle));
    const r = (size / 2) / (absCos + absSin);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }

  getNodeBoundaryPoint(node, controlPoint) {
    const cx = node.visual.x;
    const cy = node.visual.y;
    const dx = controlPoint.x - cx;
    const dy = controlPoint.y - cy;
    const angle = Math.atan2(dy, dx);

    let localPoint = { x: 0, y: 0 };
    const symbols = this._symbols || 'odum';

    if (symbols === 'odum') {
      switch (node.type) {
        case 'storage':
          localPoint = this.intersectRect(angle, 48, 48); // 60 * 0.8
          break;
        case 'source':
          // Cloud approximation: ellipse 70x40 in 100x100 -> 56x32 in editor
          localPoint = this.intersectEllipse(angle, 28, 16);
          break;
        case 'sink':
          // Sink input is at the top of the vertical line: (50, 20) in 100x100 -> (0, -24) relative
          localPoint = { x: 0, y: -24 };
          break;
        case 'constant':
          // Diamond is a square rotated 45 degrees. Diagonal is 50*sqrt(2) = 70.7 in 100x100
          // Scaled by 0.8 -> diagonal is 56.56
          localPoint = this.intersectDiamond(angle, 56.56);
          break;
        default:
          localPoint = this.intersectEllipse(angle, 24, 24);
      }
    } else {
      // Generic symbols
      switch (node.type) {
        case 'source':
          localPoint = this.intersectEllipse(angle, 24, 24); // Radius 30 * 0.8 = 24
          break;
        case 'storage':
          localPoint = this.intersectRect(angle, 40, 40); // 50 * 0.8 = 40
          break;
        case 'sink':
          // Generic sink is a right-pointing arrow. Input at (20, 50) -> (-24, 0)
          localPoint = { x: -24, y: 0 };
          break;
        case 'constant':
          // Diagonal of 50x50 square is 70.7. Scaled by 0.8 -> 56.56
          localPoint = this.intersectDiamond(angle, 56.56);
          break;
        default:
          localPoint = this.intersectEllipse(angle, 24, 24);
      }
    }
    return { x: cx + localPoint.x, y: cy + localPoint.y };
  }

  getEdgeGeometry(edge) {
      const originNode = this._value.nodes.find(n => n.id === edge.origin);
      const targetNode = this._value.nodes.find(n => n.id === edge.target);
      if (!originNode || !targetNode) return null;

      // Initial centers
      const c1 = { x: originNode.visual.x, y: originNode.visual.y };
      const c2 = { x: targetNode.visual.x, y: targetNode.visual.y };

      // Determine control points
      let cx1, cy1, cx2, cy2;
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      if (edge.visual && edge.visual.ctrl1) {
          // Stored offsets are relative to the endpoints.
          // For initial calculation of intersections, we use them relative to centers
          // OR we use the old logic.
          // Let's assume they are relative to the centers for the sake of finding the intersection ray.
          cx1 = c1.x + edge.visual.ctrl1.x;
          cy1 = c1.y + edge.visual.ctrl1.y;
      } else {
          cx1 = c1.x + Math.cos(angle - 0.2) * dist / 3;
          cy1 = c1.y + Math.sin(angle - 0.2) * dist / 3;
      }

      if (edge.visual && edge.visual.ctrl2) {
          cx2 = c2.x + edge.visual.ctrl2.x;
          cy2 = c2.y + edge.visual.ctrl2.y;
      } else {
          cx2 = c2.x - Math.cos(angle + 0.2) * dist / 3;
          cy2 = c2.y - Math.sin(angle + 0.2) * dist / 3;
      }

      // Find intersection points
      const p1 = this.getNodeBoundaryPoint(originNode, { x: cx1, y: cy1 });
      const p2 = this.getNodeBoundaryPoint(targetNode, { x: cx2, y: cy2 });

      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;

      // Re-adjust control points to be relative to the new endpoints if they were stored
      if (edge.visual && edge.visual.ctrl1) {
          cx1 = x1 + edge.visual.ctrl1.x;
          cy1 = y1 + edge.visual.ctrl1.y;
      }
      if (edge.visual && edge.visual.ctrl2) {
          cx2 = x2 + edge.visual.ctrl2.x;
          cy2 = y2 + edge.visual.ctrl2.y;
      }

      return { x1, y1, cx1, cy1, cx2, cy2, x2, y2 };
  }

  calculatePathData(edge) {
    const geo = this.getEdgeGeometry(edge);
    if (geo) {
        return `M ${geo.x1},${geo.y1} C ${geo.cx1},${geo.cy1} ${geo.cx2},${geo.cy2} ${geo.x2},${geo.y2}`;
    }
    return '';
  }

  getPathMidpoint(edge) {
      const geo = this.getEdgeGeometry(edge);
      if (geo) {
          // Cubic Bezier midpoint formula (t=0.5)
          const x = 0.125 * geo.x1 + 0.375 * geo.cx1 + 0.375 * geo.cx2 + 0.125 * geo.x2;
          const y = 0.125 * geo.y1 + 0.375 * geo.cy1 + 0.375 * geo.cy2 + 0.125 * geo.y2;
          return { x, y };
      }
      return { x: 0, y: 0 };
  }

  getSVGPoint(e) {
      const svg = this.shadowRoot.getElementById('svg-canvas');
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  setupEventListeners() {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    const paletteItems = this.shadowRoot.querySelectorAll('.palette-item');
    const closeProps = this.shadowRoot.getElementById('close-props');

    svg.removeEventListener('mousedown', this._onMouseDown);
    svg.addEventListener('mousedown', this._onMouseDown);

    window.removeEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousemove', this._onMouseMove);

    window.removeEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mouseup', this._onMouseUp);

    svg.removeEventListener('wheel', this._onWheel);
    svg.addEventListener('wheel', this._onWheel, { passive: false });

    paletteItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('type', item.dataset.type);
      });
    });

    svg.addEventListener('dragover', (e) => e.preventDefault());
    svg.removeEventListener('drop', this._onDrop);
    svg.addEventListener('drop', this._onDrop);

    closeProps.addEventListener('click', () => {
      this.shadowRoot.getElementById('property-panel').classList.add('hidden');
    });

    this.shadowRoot.removeEventListener('dblclick', this._onDoubleClick);
    this.shadowRoot.addEventListener('dblclick', this._onDoubleClick);

    this.setupPanelDragging();
  }

  setupPanelDragging() {
    const panels = this.shadowRoot.querySelectorAll('.panel');
    panels.forEach(panel => {
      const header = panel.querySelector('.panel-header');
      let isDraggingPanel = false;
      let startX, startY;

      const onDown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDraggingPanel = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!isDraggingPanel) return;
        panel.style.left = `${e.clientX - startX}px`;
        panel.style.top = `${e.clientY - startY}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      const onUp = () => {
        isDraggingPanel = false;
      };

      header.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  onMouseDown(e) {
    if (this._readOnly) return;

    const svgP = this.getSVGPoint(e);

    const port = e.target.closest('.node-port');
    if (port) {
        this._isWiring = true;
        this._wireStartNodeId = port.parentElement.dataset.id;
        this._wireStartPos = svgP;
        this.createTempWire();
        return;
    }

    const resizeHandle = e.target.closest('.resize-handle');
    if (resizeHandle) {
        this._isResizing = true;
        this._selectedId = resizeHandle.parentElement.dataset.id;
        this._selectedType = 'boundary';
        return;
    }

    const controlHandle = e.target.closest('.control-handle');
    if (controlHandle) {
        this._isDraggingHandle = true;
        this._activeHandle = controlHandle.dataset.handle;
        this._selectedId = controlHandle.dataset.edgeId;
        this._selectedType = 'edge';
        return;
    }

    const nodeTarget = e.target.closest('.node-group');
    const edgeTarget = e.target.closest('.edge-group');
    const boundaryTarget = e.target.closest('.boundary-group');

    if (nodeTarget) {
      this._isDragging = true;
      this._selectedId = nodeTarget.dataset.id;
      this._selectedType = 'node';
      this._dragOffset = {
          x: svgP.x - this._value.nodes.find(n => n.id === this._selectedId).visual.x,
          y: svgP.y - this._value.nodes.find(n => n.id === this._selectedId).visual.y
      };
    } else if (edgeTarget) {
        this._selectedId = edgeTarget.dataset.id;
        this._selectedType = 'edge';
    } else if (boundaryTarget) {
        this._isDragging = true;
        this._selectedId = boundaryTarget.dataset.id;
        this._selectedType = 'boundary';
        const b = this._value.boundaries.find(b => b.id === this._selectedId);
        this._dragOffset = { x: svgP.x - b.x, y: svgP.y - b.y };
    } else {
        this._selectedId = null;
        this._selectedType = null;
        this._isPanning = true;
        this._lastMousePos = { x: e.clientX, y: e.clientY };
    }

    if (this._selectedId) {
        this.showPropertyPanel();
    } else {
        this.shadowRoot.getElementById('property-panel').classList.add('hidden');
    }
    this.update();
  }

  onMouseMove(e) {
    const svgP = this.getSVGPoint(e);

    if (this._isWiring) {
        const tempWire = this.shadowRoot.getElementById('temp-wire');
        if (tempWire) {
            tempWire.setAttribute('x2', svgP.x);
            tempWire.setAttribute('y2', svgP.y);
        }
        return;
    }

    if (this._isResizing) {
        const b = this._value.boundaries.find(b => b.id === this._selectedId);
        if (b) {
            b.w = Math.max(50, Math.round((svgP.x - b.x) / this._gridSize) * this._gridSize);
            b.h = Math.max(50, Math.round((svgP.y - b.y) / this._gridSize) * this._gridSize);
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        }
        return;
    }

    if (this._isDraggingHandle) {
        const edge = this._value.edges.find(e => e.id === this._selectedId);
        if (edge) {
            const geo = this.getEdgeGeometry(edge);
            if (geo) {
                if (!edge.visual) edge.visual = {};
                if (this._activeHandle === 'ctrl1') {
                    edge.visual.ctrl1 = {
                        x: svgP.x - geo.x1,
                        y: svgP.y - geo.y1
                    };
                } else {
                    edge.visual.ctrl2 = {
                        x: svgP.x - geo.x2,
                        y: svgP.y - geo.y2
                    };
                }
                this.update();
                this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
            }
        }
        return;
    }

    if (this._isPanning) {
        const dx = (e.clientX - this._lastMousePos.x) * this._zoom;
        const dy = (e.clientY - this._lastMousePos.y) * this._zoom;
        this._viewBox.x -= dx;
        this._viewBox.y -= dy;
        this._lastMousePos = { x: e.clientX, y: e.clientY };
        this.update();
        return;
    }

    if (!this._isDragging) return;

    let x = svgP.x - this._dragOffset.x;
    let y = svgP.y - this._dragOffset.y;
    x = Math.round(x / this._gridSize) * this._gridSize;
    y = Math.round(y / this._gridSize) * this._gridSize;

    if (this._selectedType === 'node') {
        const node = this._value.nodes.find(n => n.id === this._selectedId);
        if (node) {
            node.visual.x = x;
            node.visual.y = y;
            this.update();
            this.validate();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        }
    } else if (this._selectedType === 'boundary') {
        const b = this._value.boundaries.find(b => b.id === this._selectedId);
        if (b) {
            b.x = x;
            b.y = y;
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        }
    }
  }

  onMouseUp(e) {
    if (this._isWiring) {
        this._isWiring = false;
        const tempWire = this.shadowRoot.getElementById('temp-wire');
        if (tempWire) tempWire.remove();

        const path = e.composedPath();
        const target = path[0];
        const targetNode = (target instanceof Element) ? target.closest('.node-group') : null;
        const targetEdge = (target instanceof Element) ? target.closest('.edge-group') : null;

        if (targetNode && targetNode.dataset.id !== this._wireStartNodeId) {
            this.createEdge(this._wireStartNodeId, targetNode.dataset.id);
        } else if (targetEdge && targetEdge.dataset.id) {
            this.setControlNode(this._wireStartNodeId, targetEdge.dataset.id);
        }
    }
    this._isDragging = false;
    this._isResizing = false;
    this._isPanning = false;
    this._isDraggingHandle = false;
  }

  onWheel(e) {
    e.preventDefault();
    const zoomFactor = 1.1;
    const delta = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;

    const svgP = this.getSVGPoint(e);

    const newW = this._viewBox.w * delta;
    const newH = this._viewBox.h * delta;

    this._viewBox.x = svgP.x - (svgP.x - this._viewBox.x) * delta;
    this._viewBox.y = svgP.y - (svgP.y - this._viewBox.y) * delta;
    this._viewBox.w = newW;
    this._viewBox.h = newH;
    this._zoom = this._viewBox.w / this.offsetWidth;

    this.update();
  }

  createTempWire() {
      const svg = this.shadowRoot.getElementById('svg-canvas');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('id', 'temp-wire');
      line.setAttribute('x1', this._wireStartPos.x);
      line.setAttribute('y1', this._wireStartPos.y);
      line.setAttribute('x2', this._wireStartPos.x);
      line.setAttribute('y2', this._wireStartPos.y);
      line.setAttribute('stroke', 'var(--primary-color)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      line.style.pointerEvents = 'none';
      svg.appendChild(line);
  }

  createEdge(originId, targetId) {
      const id = `edge-${Date.now()}`;
      const newEdge = {
          id,
          origin: originId,
          target: targetId,
          logic: 'linear',
          params: { k: 0.1 },
          visual: {
              points: [],
              max_flow: 5.0
          }
      };
      this._value.edges.push(newEdge);
      this.validate();
      this.update();
      this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  setControlNode(controlId, edgeId) {
      const edge = this._value.edges.find(e => e.id === edgeId);
      if (edge) {
          if (!edge.params) edge.params = {};
          edge.params.control_node = controlId;
          if (edge.control_node) delete edge.control_node;
          edge.logic = 'interaction';
          this.validate();
          this.update();
          this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
      }
  }

  onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('type');
    if (!type) return;

    const svgP = this.getSVGPoint(e);
    const x = Math.round(svgP.x / this._gridSize) * this._gridSize;
    const y = Math.round(svgP.y / this._gridSize) * this._gridSize;

    if (type === 'boundary') {
        const id = `boundary-${Date.now()}`;
        this._value.boundaries.push({
            id, x, y, w: 200, h: 200, label: 'System Boundary'
        });
    } else {
        const id = `${type}-${Date.now()}`;
        const newNode = {
            id,
            type,
            value: type === 'storage' ? 10 : 0,
            visual: { x, y, label: type.charAt(0).toUpperCase() + type.slice(1), capacity: 100 }
        };
        this._value.nodes.push(newNode);
    }

    this.validate();
    this.update();
    this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  onDoubleClick(e) {
      const target = e.target.closest('.node-label');
      if (target) {
          const parent = target.parentElement;
          const id = parent.dataset.id;
          let item = this._value.nodes.find(n => n.id === id) || this._value.boundaries.find(b => b.id === id);
          if (!item) return;

          const currentLabel = item.visual ? item.visual.label : item.label;
          const newLabel = prompt('Enter new label:', currentLabel);
          if (newLabel !== null) {
              if (item.visual) item.visual.label = newLabel;
              else item.label = newLabel;
              this.update();
              this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
          }
      }
  }

  onKeyDown(e) {
      if (this._readOnly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
          const target = e.composedPath()[0];
          if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
          if (this._selectedId) {
              if (this._selectedType === 'node') {
                  this._value.nodes = this._value.nodes.filter(n => n.id !== this._selectedId);
                  this._value.edges = this._value.edges.filter(edge => edge.origin !== this._selectedId && edge.target !== this._selectedId);
              } else if (this._selectedType === 'edge') {
                  this._value.edges = this._value.edges.filter(edge => edge.id !== this._selectedId);
              } else if (this._selectedType === 'boundary') {
                  this._value.boundaries = this._value.boundaries.filter(b => b.id !== this._selectedId);
              }
              this._selectedId = null;
              this._selectedType = null;
              this.shadowRoot.getElementById('property-panel').classList.add('hidden');
              this.update();
              this.validate();
              this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
          }
      }
  }

  showPropertyPanel() {
    const panel = this.shadowRoot.getElementById('property-panel');
    const content = this.shadowRoot.getElementById('props-content');

    if (this._selectedType === 'node') {
        const node = this._value.nodes.find(n => n.id === this._selectedId);
        if (!node) return;

        panel.classList.remove('hidden');
        content.innerHTML = `
          <div class="prop-group">
            <label>ID</label>
            <input type="text" id="prop-id">
          </div>
          <div class="prop-group">
            <label>Label</label>
            <input type="text" id="prop-label">
          </div>
          <div class="prop-group">
            <label>Initial Value</label>
            <input type="number" id="prop-value" step="0.1">
          </div>
          <div class="prop-group">
            <label>Current Value</label>
            <input type="number" id="prop-current-value" step="0.1" readonly>
          </div>
          <div class="prop-group">
            <label>Data Mapping (dataType)</label>
            <select id="prop-data-type">
                <option value="">None</option>
                ${this._domains.map(d => `
                    <optgroup label="${d.name}">
                        ${d.types.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </optgroup>
                `).join('')}
            </select>
          </div>
          <div id="storage-props"></div>
          <div class="prop-group">
            <label>Type</label>
            <select id="prop-type">
                <option value="source">Source</option>
                <option value="storage">Storage</option>
                <option value="sink">Sink</option>
                <option value="constant">Constant</option>
            </select>
          </div>
        `;
        content.querySelector('#prop-id').value = node.id;
        content.querySelector('#prop-label').value = node.visual.label || '';
        content.querySelector('#prop-value').value = node.value;
        content.querySelector('#prop-current-value').value = (node.currentValue !== undefined ? node.currentValue : node.value).toFixed(2);
        content.querySelector('#prop-data-type').value = node.dataType || '';
        content.querySelector('#prop-type').value = node.type;

        if (node.type === 'storage') {
            const storageProps = content.querySelector('#storage-props');
            storageProps.innerHTML = `
              <div class="prop-group">
                <label>Capacity</label>
                <input type="number" id="prop-capacity">
              </div>
            `;
            storageProps.querySelector('#prop-capacity').value = node.visual.capacity || 100;
        }

        const updateProp = (id, field, isVisual = false) => {
            content.querySelector(id).addEventListener('change', (e) => {
                const val = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                if (isVisual) node.visual[field] = val;
                else node[field] = val;

                if (field === 'value') {
                    node.currentValue = val;
                }

                if (field === 'id') {
                    this._value.edges.forEach(edge => {
                        if (edge.origin === this._selectedId) edge.origin = val;
                        if (edge.target === this._selectedId) edge.target = val;
                        if (edge.params && edge.params.control_node === this._selectedId) edge.params.control_node = val;
                        if (edge.control_node === this._selectedId) {
                            if (!edge.params) edge.params = {};
                            edge.params.control_node = val;
                            delete edge.control_node;
                        }
                    });
                    this._selectedId = val;
                }

                this.validate();
                this.update();
                this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
            });
        };

        updateProp('#prop-id', 'id');
        updateProp('#prop-label', 'label', true);
        updateProp('#prop-value', 'value');
        updateProp('#prop-data-type', 'dataType');
        if (node.type === 'storage') updateProp('#prop-capacity', 'capacity', true);
        updateProp('#prop-type', 'type');
    } else if (this._selectedType === 'boundary') {
        const boundary = this._value.boundaries.find(b => b.id === this._selectedId);
        if (!boundary) return;

        panel.classList.remove('hidden');
        content.innerHTML = `
          <div class="prop-group">
            <label>ID</label>
            <input type="text" id="prop-b-id">
          </div>
          <div class="prop-group">
            <label>Label</label>
            <input type="text" id="prop-b-label">
          </div>
        `;
        content.querySelector('#prop-b-id').value = boundary.id;
        content.querySelector('#prop-b-label').value = boundary.label || '';

        content.querySelector('#prop-b-id').addEventListener('change', (e) => {
            boundary.id = e.target.value;
            this._selectedId = boundary.id;
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });

        content.querySelector('#prop-b-label').addEventListener('change', (e) => {
            boundary.label = e.target.value;
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });
    } else if (this._selectedType === 'edge') {
        const edge = this._value.edges.find(e => e.id === this._selectedId);
        if (!edge) return;

        panel.classList.remove('hidden');
        content.innerHTML = `
          <div class="prop-group">
            <label>ID</label>
            <input type="text" id="prop-edge-id">
          </div>
          <div class="prop-group">
            <label>Logic</label>
            <select id="prop-edge-logic">
                <option value="linear">Linear</option>
                <option value="interaction">Interaction</option>
            </select>
          </div>
          <div class="prop-group">
            <label>Parameter (k)</label>
            <input type="number" id="prop-edge-k" step="0.001">
          </div>
          <div class="prop-group">
            <label>Control Node</label>
            <input type="text" id="prop-edge-control">
          </div>
          <button id="delete-edge" style="width:100%; margin-top:10px; color:red;">Delete Edge</button>
        `;
        content.querySelector('#prop-edge-id').value = edge.id;
        content.querySelector('#prop-edge-logic').value = edge.logic;
        content.querySelector('#prop-edge-k').value = edge.params?.k || 0.1;
        content.querySelector('#prop-edge-control').value = edge.params?.control_node || edge.control_node || '';

        content.querySelector('#prop-edge-id').addEventListener('change', (e) => {
            edge.id = e.target.value;
            this._selectedId = edge.id;
            this.validate();
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });

        content.querySelector('#prop-edge-logic').addEventListener('change', (e) => {
            edge.logic = e.target.value;
            this.validate();
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });

        content.querySelector('#prop-edge-k').addEventListener('change', (e) => {
            if (!edge.params) edge.params = {};
            edge.params.k = parseFloat(e.target.value);
            this.validate();
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });

        content.querySelector('#prop-edge-control').addEventListener('change', (e) => {
            if (!edge.params) edge.params = { k: 0.1 };
            edge.params.control_node = e.target.value;
            if (edge.control_node) delete edge.control_node;
            if (edge.params.control_node) edge.logic = 'interaction';
            this.validate();
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });

        content.querySelector('#delete-edge').addEventListener('click', () => {
            this._value.edges = this._value.edges.filter(e => e.id !== this._selectedId);
            this._selectedId = null;
            this._selectedType = null;
            panel.classList.add('hidden');
            this.validate();
            this.update();
            this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
        });
    }
  }

  async getDiagramImage() {
    const svg = this.shadowRoot.getElementById('svg-canvas').cloneNode(true);
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = styles;
    svg.insertBefore(style, svg.firstChild);

    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '1000');

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
        img.onload = () => {
            const theme = this.getAttribute('theme') || 'light';
            ctx.fillStyle = theme === 'dark' ? '#020617' : '#f1f5f9';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
  }
}

customElements.define('gssk-editor', GsskEditor);

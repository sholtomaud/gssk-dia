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
  }

  static get observedAttributes() {
    return ['symbols', 'readonly', 'grid', 'invalid', 'theme'];
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

  updateState(stateMap) {
    if (!this._value || !this._value.nodes) return;
    this._value.nodes.forEach((node) => {
      if (stateMap[node.id] !== undefined) {
        node.currentValue = stateMap[node.id];
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
          <div class="panel-header">
            Nodes
          </div>
          <div class="palette-item" draggable="true" data-type="source" title="Source">Src</div>
          <div class="palette-item" draggable="true" data-type="storage" title="Storage">Sto</div>
          <div class="palette-item" draggable="true" data-type="sink" title="Sink">Snk</div>
          <div class="palette-item" draggable="true" data-type="constant" title="Constant">Con</div>
          <div class="palette-item" draggable="true" data-type="boundary" title="System Boundary">Bnd</div>
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
        marker.setAttribute('refX', '10');
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
      const d = this.calculatePathData(edge);
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--edge-color)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#arrowhead)');

      if (edge.logic === 'interaction') {
        path.setAttribute('stroke-dasharray', '5,5');
      }
      g.appendChild(path);

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

  calculatePathData(edge) {
    const originNode = this._value.nodes.find(n => n.id === edge.origin);
    const targetNode = this._value.nodes.find(n => n.id === edge.target);
    if (originNode && targetNode) {
        // Adjust points to node boundaries
        const dx = targetNode.visual.x - originNode.visual.x;
        const dy = targetNode.visual.y - originNode.visual.y;
        const angle = Math.atan2(dy, dx);
        const offset = 40;

        const x1 = originNode.visual.x + Math.cos(angle) * offset;
        const y1 = originNode.visual.y + Math.sin(angle) * offset;
        const x2 = targetNode.visual.x - Math.cos(angle) * (offset + 5);
        const y2 = targetNode.visual.y - Math.sin(angle) * (offset + 5);

        return `M ${x1},${y1} L ${x2},${y2}`;
    }
    return '';
  }

  getPathMidpoint(edge) {
      const originNode = this._value.nodes.find(n => n.id === edge.origin);
      const targetNode = this._value.nodes.find(n => n.id === edge.target);
      if (originNode && targetNode) {
          return { x: (originNode.visual.x + targetNode.visual.x) / 2, y: (originNode.visual.y + targetNode.visual.y) / 2 };
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
}

customElements.define('gssk-editor', GsskEditor);

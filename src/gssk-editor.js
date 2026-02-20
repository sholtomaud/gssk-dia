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

    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onDrop = this.onDrop.bind(this);
    this._onDoubleClick = this.onDoubleClick.bind(this);
  }

  static get observedAttributes() {
    return ['symbols', 'readonly', 'grid'];
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
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
    if (validateModel(json)) {
        this._value = JSON.parse(JSON.stringify(json));
        this.update();
    } else {
        console.warn('Invalid GSSK model provided. Not loading.');
    }
  }

  getJson() {
    return JSON.parse(JSON.stringify(this._value));
  }

  updateState(stateArray) {
    if (!this._value || !this._value.nodes) return;
    this._value.nodes.forEach((node, index) => {
      if (index < stateArray.length) {
        node.value = stateArray[index];
      }
    });
    if (!this._animationRequested) {
      this._animationRequested = true;
      requestAnimationFrame(() => {
        this.updateVisuals();
        this._animationRequested = false;
      });
    }
  }

  updateVisuals() {
    this._value.nodes.forEach(node => {
        const fillElement = this.shadowRoot.querySelector(`#fill-${node.id}`);
        if (fillElement && node.visual && node.visual.capacity) {
            const ratio = Math.min(1, Math.max(0, node.value / node.visual.capacity));
            const fillHeight = ratio * 60;
            fillElement.setAttribute('height', fillHeight.toString());
            fillElement.setAttribute('y', (80 - fillHeight).toString());
        }
    });
    const edges = this.shadowRoot.querySelectorAll('#edges-layer path');
    edges.forEach(edge => {
        edge.style.transition = 'stroke-width 0.2s';
        edge.setAttribute('stroke-width', (2 + Math.sin(Date.now() / 200) * 0.5).toString());
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="editor-container">
        <div id="palette" class="panel palette">
          <div class="panel-header">
            Palette
            <button class="toggle" id="close-palette">&times;</button>
          </div>
          <div class="palette-item" draggable="true" data-type="source" title="Source">S</div>
          <div class="palette-item" draggable="true" data-type="storage" title="Storage">St</div>
          <div class="palette-item" draggable="true" data-type="sink" title="Sink">Sk</div>
          <div class="palette-item" draggable="true" data-type="constant" title="Constant">C</div>
        </div>
        <div id="canvas-container" style="background-size: ${this._gridSize}px ${this._gridSize}px">
          <svg id="svg-canvas" viewBox="0 0 1000 1000">
            <defs id="symbol-defs"></defs>
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
    const canvas = this.shadowRoot.getElementById('canvas-container');
    if (canvas) {
      canvas.style.backgroundSize = `${this._gridSize}px ${this._gridSize}px`;
    }
    const defs = this.shadowRoot.getElementById('symbol-defs');
    if (defs) {
      defs.innerHTML = SYMBOLS.odum + SYMBOLS.generic;
    }
    this.renderNodes();
    this.renderEdges();
  }

  renderNodes() {
    const layer = this.shadowRoot.getElementById('nodes-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._value.nodes.forEach(node => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${node.visual.x - 40}, ${node.visual.y - 40})`);
      g.setAttribute('data-id', node.id);
      g.setAttribute('class', 'node-group');
      g.style.cursor = this._readOnly ? 'default' : 'grab';

      // Background rect for better hit testing
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
      g.appendChild(use);

      if (node.type === 'storage') {
        const fillClipPathId = `clip-${node.id}`;
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', fillClipPathId);
        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        clipRect.setAttribute('id', `fill-${node.id}`);
        clipRect.setAttribute('x', '20');
        clipRect.setAttribute('y', '80');
        clipRect.setAttribute('width', '60');
        clipRect.setAttribute('height', '0');
        clipPath.appendChild(clipRect);

        const defs = this.shadowRoot.getElementById('symbol-defs');
        defs.appendChild(clipPath);

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
          const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          port.setAttribute('cx', p.x);
          port.setAttribute('cy', p.y);
          port.setAttribute('r', '6');
          port.setAttribute('fill', 'rgba(0,0,0,0.1)');
          port.setAttribute('class', 'node-port');
          port.setAttribute('data-pos', p.pos);
          g.appendChild(port);
      });

      layer.appendChild(g);
    });
    this.updateVisuals();
  }

  renderEdges() {
    const layer = this.shadowRoot.getElementById('edges-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._value.edges.forEach(edge => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', edge.id);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = this.calculatePathData(edge);
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'black');
      path.setAttribute('stroke-width', '2');
      if (edge.logic === 'interaction') {
        path.setAttribute('stroke-dasharray', '5,5');
      }
      g.appendChild(path);

      const markerId = 'arrowhead';
      if (!this.shadowRoot.getElementById(markerId)) {
        const defs = this.shadowRoot.getElementById('symbol-defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
      }
      path.setAttribute('marker-end', `url(#${markerId})`);

      if (edge.logic === 'interaction') {
        const midPoint = this.getPathMidpoint(edge);
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#gate');
        use.setAttribute('x', midPoint.x - 20);
        use.setAttribute('y', midPoint.y - 20);
        use.setAttribute('width', '40');
        use.setAttribute('height', '40');
        g.appendChild(use);
      }

      layer.appendChild(g);
    });
  }

  calculatePathData(edge) {
    const originNode = this._value.nodes.find(n => n.id === edge.origin);
    const targetNode = this._value.nodes.find(n => n.id === edge.target);
    if (originNode && targetNode) {
        return `M ${originNode.visual.x},${originNode.visual.y} L ${targetNode.visual.x},${targetNode.visual.y}`;
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
    const closePalette = this.shadowRoot.getElementById('close-palette');

    closePalette.addEventListener('click', () => {
        this.shadowRoot.getElementById('palette').classList.add('hidden');
    });

    svg.removeEventListener('mousedown', this._onMouseDown);
    svg.addEventListener('mousedown', this._onMouseDown);

    window.removeEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousemove', this._onMouseMove);

    window.removeEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mouseup', this._onMouseUp);

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

    const target = e.target.closest('.node-group');
    if (target) {
      this._isDragging = true;
      this._draggedElement = target;
      this._selectedId = target.dataset.id;
      this.dispatchEvent(new CustomEvent('node-select', { detail: this._value.nodes.find(n => n.id === this._selectedId) }));
      this.showPropertyPanel();

      this._dragOffset = {
          x: svgP.x - this._value.nodes.find(n => n.id === this._selectedId).visual.x,
          y: svgP.y - this._value.nodes.find(n => n.id === this._selectedId).visual.y
      };
    } else {
        this._selectedId = null;
        this.shadowRoot.getElementById('property-panel').classList.add('hidden');
    }
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

    if (!this._isDragging || !this._draggedElement) return;
    let x = svgP.x - this._dragOffset.x;
    let y = svgP.y - this._dragOffset.y;

    x = Math.round(x / this._gridSize) * this._gridSize;
    y = Math.round(y / this._gridSize) * this._gridSize;

    const node = this._value.nodes.find(n => n.id === this._selectedId);
    if (node) {
      node.visual.x = x;
      node.visual.y = y;
      this.update();
      this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
    }
  }

  onMouseUp(e) {
    if (this._isWiring) {
        this._isWiring = false;
        const tempWire = this.shadowRoot.getElementById('temp-wire');
        if (tempWire) tempWire.remove();

        const targetNode = e.target.closest('.node-group');
        const targetEdge = e.target.closest('g[data-id] > path');

        if (targetNode && targetNode.dataset.id !== this._wireStartNodeId) {
            this.createEdge(this._wireStartNodeId, targetNode.dataset.id);
        } else if (targetEdge) {
            const edgeId = targetEdge.parentElement.dataset.id;
            this.setControlNode(this._wireStartNodeId, edgeId);
        }
    }
    this._isDragging = false;
    this._draggedElement = null;
  }

  createTempWire() {
      const svg = this.shadowRoot.getElementById('svg-canvas');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('id', 'temp-wire');
      line.setAttribute('x1', this._wireStartPos.x);
      line.setAttribute('y1', this._wireStartPos.y);
      line.setAttribute('x2', this._wireStartPos.x);
      line.setAttribute('y2', this._wireStartPos.y);
      line.setAttribute('stroke', 'gray');
      line.setAttribute('stroke-dasharray', '5,5');
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
      this.update();
      this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  setControlNode(controlId, edgeId) {
      const edge = this._value.edges.find(e => e.id === edgeId);
      if (edge) {
          edge.control_node = controlId;
          edge.logic = 'interaction';
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

    const id = `node-${Date.now()}`;
    const newNode = {
      id,
      type,
      value: 0,
      visual: { x, y, label: type.charAt(0).toUpperCase() + type.slice(1), capacity: 100 }
    };

    this._value.nodes.push(newNode);
    this.update();
    this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  onDoubleClick(e) {
      const target = e.target.closest('.node-label');
      if (target) {
          const nodeId = target.parentElement.dataset.id;
          const node = this._value.nodes.find(n => n.id === nodeId);
          const newLabel = prompt('Enter new label:', node.visual.label);
          if (newLabel !== null) {
              node.visual.label = newLabel;
              this.update();
              this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
          }
      }
  }

  showPropertyPanel() {
    const panel = this.shadowRoot.getElementById('property-panel');
    const content = this.shadowRoot.getElementById('props-content');
    const node = this._value.nodes.find(n => n.id === this._selectedId);
    if (!node) return;

    panel.classList.remove('hidden');
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label>ID: <input type="text" value="${node.id}" readonly></label>
        <label>Label: <input type="text" id="prop-label" value="${node.visual.label || ''}"></label>
        <label>Value: <input type="number" id="prop-value" value="${node.value}"></label>
        <label>Capacity: <input type="number" id="prop-capacity" value="${node.visual.capacity || 100}"></label>
      </div>
    `;

    content.querySelector('#prop-label').addEventListener('input', (e) => {
        node.visual.label = e.target.value;
        this.update();
        this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
    });
    content.querySelector('#prop-value').addEventListener('input', (e) => {
        node.value = parseFloat(e.target.value);
        this.update();
        this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
    });
    content.querySelector('#prop-capacity').addEventListener('input', (e) => {
        node.visual.capacity = parseFloat(e.target.value);
        this.update();
        this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
    });
  }
}

customElements.define('gssk-editor', GsskEditor);

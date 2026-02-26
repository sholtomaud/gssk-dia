# ADVANCED_FEATURES_ROADMAP.md - GSSK-DIA

This document outlines the functional requirements, architectural placement, and implementation roadmap for advanced features in the GSSK Diagrammatic Interface.

## 1. Real-time Data Integration & Mapping

### Functional Requirements
- **Data Type Mapping:** Nodes should possess a `dataType` property that maps them to external data streams (e.g., Hydstra sensor types like `Rainfall` or `WaterLevel`).
- **Continuous Forcing:** External data should act as a continuous forcing function or initial state update for the simulation.
- **Mock Hydstra Update:** The existing Hydstra mock should be updated to utilize `dataType` mapping instead of hardcoded IDs.

### Architectural Placement
- **Frontend (`gssk-dia`):** Implementation of the `dataType` schema extension and mapping logic.
- **WASM Core (`gssk-wasm`):** No change required if data is injected as node value updates.

---

## 2. Live Fitness Monitoring

### Functional Requirements
- **Statistical Dashboard:** Real-time calculation of R-squared ($R^2$), Chi-squared ($\chi^2$), and p-values ($p$) comparing simulated storage nodes against observed data streams with matching `dataType`.
- **UI Display:** A dedicated "Fitness" section in the Right-Hand Side (RHS) panel.
- **Visual Feedback:** Color-coded fitness indicators on the diagram or chart (e.g., green for high correlation, red for divergence).

### Architectural Placement
- **Frontend (`gssk-dia`):** Lightweight statistical calculations in JavaScript for immediate UI feedback.

---

## 3. Parameter Calibration (Optimization)

### Functional Requirements
- **Genetic/MOGA Optimization:** Automatic tuning of model coefficients (edge $k$ values) to minimize the error between simulated and observed data.
- **Modes:** Support for both "Calibrate Now" (one-off optimization) and "Auto-calibrate" (background continuous tuning).
- **Goal Seeking:** Ability to define target values or ranges for specific nodes.

### Architectural Placement
- **Hybrid Approach:**
    - **Optimization Logic:** Implemented in WASM (either `gssk-wasm` or a new `gssk-optimizer-wasm`) to handle high-frequency simulation runs.
    - **Orchestration:** `gssk-dia` manages the optimization process and displays convergence progress.

---

## 4. Ensemble Forecasting & Confidence Envelopes

### Functional Requirements
- **Uncertainty Modeling:** Running multiple simulation variants with perturbed parameters (coefficients) and future input scenarios.
- **Forecasting Envelope:** Visualization of a shaded "confidence range" on the time-series chart rather than a single deterministic line.
- **Probability Distribution:** (Optional) Visualizing the probability density of future states at specific time horizons.

### Architectural Placement
- **WASM Core (`gssk-wasm`):** Batch execution of multiple models in parallel.
- **Frontend (`gssk-dia`):** Aggregation of ensemble results and rendering of the shaded SVG envelope.

---

## 5. Structural Discovery (Genetic ML Layer)

### Functional Requirements
- **Genetic Programming:** Random/Evolutionary mutation of the model structure—adding storage nodes, sinks, or interaction arrows to find a better structural fit for the data.
- **Population Visualization:** A "Miro-style" grid or swarm of small-scale diagrams representing the current population of candidate models.
- **Level of Detail (LOD):** Support for zooming into thousands of candidate models to inspect their topology and fitness.
- **Aggregation/Complexity:** Handling complexity via aggregation and hierarchy (zooming into a node to see its internal sub-model).

### Architectural Placement
- **New Repository (`gssk-evolution`):** A dedicated engine for graph manipulation and evolutionary algorithms.
- **Frontend (`gssk-dia`):** Acting as the "Discovery Lab" client. It handles the visualization of the population and the user-guided "promotion" of successful models to the main workspace.
- **GSSK Runtime:** May require extensions to handle hierarchical/aggregated nodes more natively.

---

## 6. Implementation Strategy Summary

| Feature | Placement | Priority |
| :--- | :--- | :--- |
| **Data Mapping** | `gssk-dia` (Local) | High |
| **Fitness Dashboard** | `gssk-dia` (Local) | High |
| **Parameter Calibration** | WASM (Core/Optimizer) | Medium |
| **Ensemble Forecasting** | `gssk-dia` + WASM | Medium |
| **Structural Discovery** | `gssk-evolution` (New Repo) | Long-term |

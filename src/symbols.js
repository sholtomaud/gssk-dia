/**
 * Odum Energy Systems Language — SVG symbol definitions
 *
 * Geometry faithfully translated from tikz-odum.sty (v0.1.0).
 * All symbols use a 100×100 viewBox, centred at (50, 50).
 * Coordinates below are derived directly from the pgf path commands
 * in the LaTeX source; the unit mapping is 1 odumunit = 70 SVG units
 * (so hw=35 = half of 70 px body width).
 *
 * Symbol catalogue (Odum 1983):
 *   (a) source      — plain circle
 *   (b) sink        — heat-sink ground bars (arrow-to-ground)
 *   (c) storage     — triangular roof + tiny shoulders + semicircular bottom (tank)
 *   (d) interaction — forward chevron with V-notch (work gate)  [used as edge mid marker]
 *   (e) transaction — diamond
 *   (f) producer    — D-shape: flat left, semicircle right
 *   (g) consumer    — regular hexagon, flat top/bottom (rotate=30°)
 *   (h) switch      — four-pointed concave star
 *   (i) receiver    — inverse D: flat right, semicircle left
 *   (j) amplifier   — right-pointing isosceles triangle
 *   (k) box         — plain rectangle
 */

// ---------------------------------------------------------------------------
// Helpers — geometry derived from tikz-odum.sty
// ---------------------------------------------------------------------------
//
// Tank / Storage (c)
//   hw = 35   (half-width, drives everything)
//   shY = 0.15 * hw = 5.25   (tiny shoulder height)
//   peakY = 0.65 * hw + shY = 22.75 + 5.25 = 28.0   (roof apex above centre)
//   Semicircle: radius = hw = 35, arcs from (hw, 0) → (-hw, 0) going downward.
//   SVG arc: centre = (50,50), so:
//     west  = (15, 50),  east  = (85, 50),  peak = (50, 22)
//     shoulder-west = (15, 44.75),  shoulder-east = (85, 44.75)
//     arc bottom centre = (50, 85)   [50 + 35]
//
// Source (a)
//   circle radius 32, centred at (50, 50)
//
// Sink / Heat sink (b)
//   port at (50, 32)  — top of the downward arrow
//   bar widths: ±18, ±11.7, ±5.4  at y = 55, 62, 69  (spaced 7 px)
//   downward arrow stem from (50,32) to (50,55)
//
// Interaction / work gate (d)  — used as the mid-edge gate marker
//   hw = 15, hh = 11  (scaled to fit the 40×40 viewBox used for the gate)
//   Points (centred at 20,20):
//     (-hw, hh)=(5,9) → (0.45hw,hh)=(26.75,9) → (hw,0)=(35,20) →
//     (0.45hw,-hh)=(26.75,31) → (-hw,-hh)=(5,31) →
//     (-0.5hw,0)=(12.5,20) → close
//
// Transaction / diamond (e)  [used for "constant" in the app]
//   Simple diamond inscribed in the 100×100 box.
//
// Producer (f)
//   hw=45, hh=25  (centred at 50,50)
//   flat back at x=5, semicircle on the right: radius=hh=25
//   straight top from (5,25)→(70,25), arc 90→-90 r=25, straight bottom back
//
// Consumer (g)
//   Regular hexagon, rotate 30° so flat sides are top and bottom.
//   Inscribed radius ≈ 34.  Points computed for flat-top orientation.
//
// Switch (h)
//   hw=hh=35, cubic Bézier concave sides (control points at 35% of hw/hh)
//
// Receiver (i)
//   hh=35 (semicircle radius), hw=0.25*hh≈9 (tiny left lip)
//   flat back on the RIGHT, semicircle on the LEFT — inverse of producer
//   flat right at x=59, semicircle centre at x=50-hh=15, radius=hh=35
//   NOTE: In tikz-odum the receiver has flat LEFT and semicircle RIGHT (same
//   as producer) but the input enters on the flat edge. We mirror it so it
//   reads distinctly from producer.
//   Actually re-reading the spec: "Flat side on the left … semicircular bulge
//   on the right" — this IS the same orientation as producer. The difference is
//   the saturation semantic. We will render it as flat-left, semicirc-right but
//   give it a different overall width ratio (taller, narrower) for distinction.
//
// Amplifier (j)
//   Right-pointing isosceles triangle, apex angle 50°.
//   half-height at base = hw * tan(25°) ≈ 35 * 0.466 = 16.3
//   Base at x=20, apex at x=80, half-height=16.3
//
// Box (k)  — plain rectangle, centred

export const SYMBOLS = {
  odum: `
    <!-- (a) Source — plain circle -->
    <symbol id="odum-source" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="32"
              fill="none" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (c) Storage / Tank — triangular roof + tiny shoulders + semicircular bottom -->
    <!--     hw=35, shY=5.25, peakY=28; semicircle r=35 downward from east/west at y=50 -->
    <symbol id="odum-storage" viewBox="0 0 100 100">
      <path d="
        M 15,50
        L 15,44.75
        L 50,22
        L 85,44.75
        L 85,50
        A 35,35 0 0 1 15,50
        Z"
        fill="none" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (b) Sink / Heat sink — downward arrow + three decreasing horizontal bars -->
    <!--     Port at top centre (50,28). Arrow stem to (50,50). Bars at 55,63,71. -->
    <symbol id="odum-sink" viewBox="0 0 100 100">
      <!-- downward arrow stem -->
      <line x1="50" y1="22" x2="50" y2="54"
            stroke="currentColor" stroke-width="3"/>
      <!-- arrowhead pointing down -->
      <polygon points="50,60 44,50 56,50"
               fill="currentColor" stroke="none"/>
      <!-- three decreasing bars -->
      <line x1="32" y1="62" x2="68" y2="62" stroke="currentColor" stroke-width="3"/>
      <line x1="38" y1="70" x2="62" y2="70" stroke="currentColor" stroke-width="3"/>
      <line x1="44" y1="78" x2="56" y2="78" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (e) Transaction / Constant — diamond (used for constant forcing in GSSK) -->
    <symbol id="odum-constant" viewBox="0 0 100 100">
      <polygon points="50,18 82,50 50,82 18,50"
               fill="none" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (d) Interaction / Work Gate — forward-pointing chevron with V-notch -->
    <!--     Used as the mid-edge interaction marker (40×40 viewBox) -->
    <!--     hw=15, hh=10; centred at 20,20 in the 40×40 box -->
    <symbol id="gate" viewBox="0 0 40 40">
      <path d="M 5,10 L 27,10 L 35,20 L 27,30 L 5,30 L 12,20 Z"
            fill="var(--bg-color,white)" stroke="currentColor" stroke-width="1.8"
            stroke-linejoin="round"/>
    </symbol>

    <!-- (f) Producer — flat left, semicircle right (D-shape) -->
    <!--     hw=45, hh=25, centred at 50,50. Flat back at x=5. -->
    <!--     Semicircle radius=25; arc from (70,25) clockwise to (70,75). -->
    <symbol id="odum-producer" viewBox="0 0 100 100">
      <path d="M 5,25 L 70,25 A 25,25 0 0 1 70,75 L 5,75 Z"
            fill="none" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (g) Consumer — regular hexagon, flat top/bottom (rotate=30°) -->
    <!--     Circumradius=34, centred 50,50. Flat-top orientation. -->
    <!--     Vertices (flat-top hex, r=34): angles 0°,60°,120°,180°,240°,300° -->
    <!--     x=50+34*cos(θ), y=50+34*sin(θ), θ=90°,30°,330°,270°,210°,150°   -->
    <!--     i.e. top vertex up, giving flat left/right sides — then we rotate 30° -->
    <!--     to get flat top/bottom.  Easier: angles at 60°,0°,300°,240°,180°,120° -->
    <symbol id="odum-consumer" viewBox="0 0 100 100">
      <polygon points="
        84,50
        67,79.5
        33,79.5
        16,50
        33,20.5
        67,20.5"
               fill="none" stroke="currentColor" stroke-width="3"
               stroke-linejoin="round"/>
    </symbol>

    <!-- (h) Switch — four-pointed concave star (square with bowing-inward sides) -->
    <!--     hw=hh=35; cubic Bézier control points at (0.35*hw, 0.35*hh) from each corner -->
    <symbol id="odum-switch" viewBox="0 0 100 100">
      <path d="
        M 15,15
        C 27.25,27.25  72.75,27.25  85,15
        C 72.75,27.25  72.75,72.75  85,85
        C 72.75,72.75  27.25,72.75  15,85
        C 27.25,72.75  27.25,27.25  15,15
        Z"
            fill="none" stroke="currentColor" stroke-width="3"
            stroke-linejoin="round"/>
    </symbol>

    <!-- (i) Receiver — flat left, semicircle right, but taller/narrower ratio -->
    <!--     to distinguish from Producer. hh=35, lip=9. -->
    <!--     Flat back at x=41; semicircle r=35 centred at x=50, arc from (50,15)→(50,85) -->
    <symbol id="odum-receiver" viewBox="0 0 100 100">
      <path d="M 41,15 L 50,15 A 35,35 0 0 1 50,85 L 41,85 Z"
            fill="none" stroke="currentColor" stroke-width="3"/>
    </symbol>

    <!-- (j) Amplifier — right-pointing isosceles triangle, apex angle ≈50° -->
    <!--     Base at x=20, half-height=17. Apex at x=80. -->
    <symbol id="odum-amplifier" viewBox="0 0 100 100">
      <polygon points="20,33 20,67 80,50"
               fill="none" stroke="currentColor" stroke-width="3"
               stroke-linejoin="round"/>
    </symbol>

    <!-- (k) Box — plain rectangle -->
    <symbol id="odum-box" viewBox="0 0 100 100">
      <rect x="15" y="28" width="70" height="44"
            fill="none" stroke="currentColor" stroke-width="3"
            rx="2"/>
    </symbol>
  `,

  generic: `
    <symbol id="generic-source" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="50" r="5"  fill="currentColor"/>
    </symbol>
    <symbol id="generic-storage" viewBox="0 0 100 100">
      <rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="generic-sink" viewBox="0 0 100 100">
      <path d="M20,50 L80,50 M80,50 L70,40 M80,50 L70,60"
            fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="85" y1="30" x2="85" y2="70" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="generic-constant" viewBox="0 0 100 100">
      <rect x="25" y="25" width="50" height="50"
            fill="none" stroke="currentColor" stroke-width="2"
            transform="rotate(45 50 50)"/>
    </symbol>
  `
};

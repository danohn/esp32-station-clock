# Swiss station-clock artwork reference

The Swiss theme follows the **Mobatime clock photographed at Zürich
Hauptbahnhof on 10 June 2006**, rather than a Mondaine wristwatch or a generic
Swiss-style illustration. The reference is [*BahnhofsuhrZuerich RZ.jpg*, by
JuergenG, modified by Rainer Zenz](https://commons.wikimedia.org/wiki/File:BahnhofsuhrZuerich_RZ.jpg).
The original is 1100 × 1100 pixels; it was retrieved on 21 October 2026.

This example has twelve equal hour markers, smaller minute marks, flat black
hands with visible counterweights, a solid red signalling disc, and a small
Mobatime maker mark below the spindle. It does not carry SBB lettering or a
Mondaine wordmark. The DB theme retains its separate Munich reference.

## Measurement method

`tools/analyze_swiss_reference.py` isolates **59 of the 60 dial markers** as
dark connected components. The minute hand joins the remaining marker. A robust
least-squares projective fit uses the known six-degree spacing, fitting separate
centroid radii for minute and hour markers. The median reprojection residual is
**0.37 pixels in the original photograph**.

The minute-marker centroid radius defines one unit. The reconstruction uses
147.5 display pixels per unit, giving a case radius of approximately 183 pixels
and a shared dial centre of (184, 224). Perspective correction is appropriate
for the dial plane. The raised hands, glass, and outer case sit at different
depths, so this fit cannot perfectly rectify all of them at once. The
photographed spindle also appears about two display pixels above the fitted
marker centre; the reconstruction centres the hands on the dial instead of
baking that small photographic offset into the theme.

To reproduce the measurements:

```sh
mkdir -p .local/swiss-reference
curl -L 'https://upload.wikimedia.org/wikipedia/commons/b/b7/BahnhofsuhrZuerich_RZ.jpg' -o .local/swiss-reference/zurich.jpg
uv run tools/analyze_swiss_reference.py .local/swiss-reference/zurich.jpg
```

The optional NumPy, OpenCV, and SciPy dependencies are isolated by `uv`; they
are not needed to build the firmware. Output stays under the ignored
`.local/swiss-reference/analysis/` folder:

- `measurements.json`: fitted transform, marker measurements, hand corner
  coordinates selected in the original photograph, and disc ellipse fit.
- `reference-rectified.png`: display-sized photograph for comparison.
- `reference-rectified-10x.png`: enlarged rectification for inspecting details.
- `maker-mark.svg`: the traced maker mark used in the dial master.

Marker widths and lengths are measured from transformed component rectangles.
The black hand outlines are measured from manually identified tip and
counterweight corners, which are included in the JSON for review. The solid
red disc is measured by fitting an ellipse to its outline after excluding the
shaft junction. The maker mark is thresholded and contour traced after
perspective correction; no official vector logo or official clock component
has been copied.

## Dimensions at 368 × 448

All lengths below are display pixels. Dimensions in the artwork are rounded;
allow approximately **1–2 pixels** for edge interpretation, reflections,
parallax, the case boundary, and the common centre. The small reprojection
residual describes marker-centre consistency, not absolute accuracy of the
whole reconstruction.

| Detail | Measurement / artwork |
| --- | --- |
| All twelve hour markers | 10.91 × 37.56 / 10.9 × 37.6 |
| Minute markers | 4.02 × 10.70 / 4.0 × 10.7 |
| Marker outer radius | Approximately 152.9 |
| White face radius | Approximately 164 |
| Case outer radius | Approximately 183 |
| Hour-hand reach | 102.08 / 102 |
| Hour-hand tip width | 16.39 / 16.4 |
| Hour counterweight | 36.48 reach, 18.93 wide / 36 reach, 18.8 wide |
| Minute-hand reach | 151.41 / 151 |
| Minute-hand tip width | 11.81 / 11.8 |
| Minute counterweight | 38.60 reach, 15.20 wide / 38 reach, 15.2 wide |
| Seconds-disc diameter | Fitted axes 32.18 and 32.45 / 32.4 |
| Seconds-disc centre reach | 98.64 / 99 |
| Seconds-hand counterweight | Approximately 52 |
| Seconds shaft width | Approximately 3.8–4.6 |
| Maker mark | Approximately 44 wide, below the spindle |

The hour and minute hands widen slightly toward their counterweights. The
seconds disc is solid, unlike the open ring in the Munich DB reference. This
Swiss example has no large black centre cap; a small red spindle detail sits
on the seconds shaft.

Neutral near-black, off-white and the project's red are deliberate palette
choices. The source photograph is not colour calibrated: its green cast,
reflections, exposure, and shadows are not paint specifications. Case rings
reproduce the principal dimensions with flat colours; photographed glare,
fasteners, dirt, and damage are omitted.

The editable masters and dimensions are in `assets/swiss/`. The generator
reads `theme.json` and creates the PNGs, LVGL arrays and renderer metadata so
firmware and the website use the same geometry and pivots.

## Movement

[SBB's own clock-component documentation](https://digital.sbb.ch/en/design-system/lyne/components/clock/)
specifies an approximately **58.5-second revolution**, followed by a pause at
the top before the next revolution. The Swiss movement profile therefore uses
a 58.5-second sweep and 1.5-second pause. That is independent timing evidence;
the still photograph cannot establish it.

The **180 ms minute advance remains an approximation**, shared with our DB
movement until a suitable video or mechanism specification establishes its
physical acceleration and duration. The shared animation engine takes these
values from each theme rather than embedding a single sweep speed in the
renderer.

## Attribution and third-party design rights

The reference photograph is offered under several licences. This project uses
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/):
**JuergenG, modified by Rainer Zenz, “BahnhofsuhrZuerich RZ.jpg,” Wikimedia
Commons**. The photograph is downloaded for analysis, not embedded as a
background image in the firmware or website.

The Swiss SVG reconstruction, including its rectified/traced maker mark, and
its generated raster representations are separately attributed under **CC
BY-SA 3.0**. Changes include perspective correction, measurement, rebuilding
shapes, tracing the maker mark, neutral colours, centring the hands, and
removing photographic reflections and wear. The project's original software
continues under its own MIT licence; the photographic/artwork attribution is
not an offer to license third-party marks under MIT.

SBB [states that its station-clock design is protected by trademark and
copyright law](https://digital.sbb.ch/en/foundation/brand/watch/). SBB clock
design rights and Mobatime maker marks remain with their owners; the photograph
licence does not grant trademark rights or imply endorsement. This is an
independent reconstruction, not the official SBB digital clock component.

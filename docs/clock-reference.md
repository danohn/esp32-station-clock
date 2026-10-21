# Clock artwork reference

The face is reconstructed from [Wilfredor's photograph of the clock at Munich
Hauptbahnhof](https://commons.wikimedia.org/wiki/File:Deutsche_Bahn_clock_at_Munich_Central_Station.jpg).
Wikimedia lists the photograph as CC0. The photograph is a reference, not an
image embedded in the firmware. Deutsche Bahn branding retains its own terms.

## Measurement method

Analysis used the original 8256 × 5504 photograph, downloaded on 21 October 2026.
Dark connected components isolate 59 of the 60 markers; the minute hand merges
with the remaining marker. The marker centres fit a projective transform with
three centroid radii: minute, ordinary hour, and cardinal hour. The median
reprojection error is about 0.76 pixels in the original photograph.

The rectified geometry uses 161 display pixels per unit, where one unit is the
minute-marker centroid radius. This puts the visible case at approximately
183 pixels from the pivot, fitting a 368-pixel-wide display. The case boundary,
face boundary and hand outlines need visual interpretation because of glass
reflections, shadows and parallax. The small fit residual is not a claim of
subpixel accuracy for the entire clock.

To reproduce the marker measurements without adding analysis packages to the
firmware build environment:

```sh
mkdir -p .local
curl -L 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Deutsche_Bahn_clock_at_Munich_Central_Station.jpg' -o .local/munich-clock.jpg
uv run tools/analyze_clock_reference.py .local/munich-clock.jpg
```

The analysis writes a rectified reference and JSON measurements under
`.local/reference-analysis/`. The full photograph and analysis output are not
tracked. `uv` installs the script's optional dependencies separately.

## Proportions at 368 × 448

All lengths are display pixels, measured from the common pivot at (184, 224).
Values are rounded reconstructions; allow approximately 1–2 pixels for details
affected by reflections and the estimated case boundary.

| Detail | Previous artwork | Munich reference / revised artwork |
| --- | --- | --- |
| Ordinary hour marker | 8.1 × 25.5 | 13.4 × 42.6 |
| 12, 3, 6, 9 marker | 8.1 × 25.5 | 14.2 × 51.6 |
| Minute marker | 2.7 × 10.8 | 6.3 × 14.7 |
| Marker outer radius | 164 | 168.3 |
| Hour hand | Pointed blue hand, 104 reach | Flat black bar, 102 reach, 18.8 wide |
| Minute hand | Pointed blue hand, 151 reach | Flat black tip, 162 reach, 16 wide at tip and 13.2 at pivot |
| Seconds ring | 24 outer diameter, 39 behind pivot | 40.8 outer diameter, 97 in front of pivot |
| Seconds ring stroke | 3 | 5.6 |
| Seconds-hand tip radius | 162 | 168.3 |
| Centre cap | Red, 8.8 diameter | Black, 36.6 diameter |
| DB logo width | 42 | 35.1 |
| DB logo centre above pivot | About 61 | About 96 |
| White face radius | 180.5 | 171, allowing for the broader case rim |

The black hand shafts and red ring were measured on rectified, vertically
aligned crops. Circle fits to visible inner and outer ring edges give radii
of approximately 14.8 and 20.4 pixels. The seconds shaft tapers toward its tip
and stops at each side of the open ring. The black cap is drawn last in the
seconds-hand sprite so it covers the roots of all three hands.

The palette uses neutral black hands and markers, an off-white face, and the
existing DB red. The photograph's warm, dark red and uneven grey face are not
used as paint samples: lighting, exposure and reflections alter them. The
flat case rings reproduce the main proportions without baking photographed
glare or wear into the artwork.

`assets/*.svg` remain the editable masters. `uv run tools/generate_assets.py`
regenerates the PNGs, LVGL arrays and composed preview. Firmware and browser
preview use the same artwork and matching sprite pivots. The composed preview
uses approximately 09:40 with the seconds hand at 105°, matching the photograph.

## Movement

A still image does not establish sweep speed, minute-hand acceleration,
settling or frame rate. This artwork revision retains the existing 58-second
sweep, two-second pause and 180 ms minute advance. See [movement.md](movement.md)
for the timing model and its limits; the minute transition remains an
approximation rather than a measured profile of this particular clock.

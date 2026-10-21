# /// script
# requires-python = ">=3.14"
# dependencies = ["numpy>=2", "opencv-python-headless>=4.12", "scipy>=1.16"]
# ///
"""Measure the full-resolution Munich Hbf reference photograph.

Run with uv run tools/analyze_clock_reference.py PHOTO.jpg. This is a
reference-specific research tool, separate from the firmware asset generator.
Its optional analysis packages are managed by uv and are not build dependencies.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import least_squares

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("photo", type=Path)
parser.add_argument("--output", type=Path, default=Path(".local/reference-analysis"))
args = parser.parse_args()
photo = cv2.imread(str(args.photo))
if photo is None or photo.shape[:2] != (5504, 8256):
    parser.error("Use the original 8256 × 5504 Wikimedia photograph, not a thumbnail.")
args.output.mkdir(parents=True, exist_ok=True)

# The bounds and threshold select dark markers in this photograph. Reflections
# obscure one marker; connected glass/bezel features are rejected by size.
gray = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
_, labels, stats, centers = cv2.connectedComponentsWithStats((gray < 85).astype("uint8"))
markers = []
for label, (x, y, w, h, area) in enumerate(stats[1:], 1):
    center = centers[label]
    distance = np.linalg.norm(center - [4210, 2460])
    if not (1100 < distance < 1630 and 900 < area < 65000
            and x > 2500 and x + w < 5900 and y > 800 and y + h < 4200):
        continue
    local_y, local_x = np.where(labels[y:y+h, x:x+w] == label)
    points = np.column_stack([local_x + x, local_y + y]).astype("float32")
    rectangle = cv2.minAreaRect(points)
    if max(rectangle[1]) > 600:
        continue
    angle = np.degrees(np.arctan2(center[0] - 4210, 2460 - center[1])) % 360
    tick = round(angle / 6) % 60
    kind = 2 if tick % 15 == 0 else 1 if tick % 5 == 0 else 0
    markers.append((tick, kind, center, cv2.boxPoints(rectangle)))
if len(markers) < 50 or len({m[0] for m in markers}) != len(markers):
    raise SystemExit("Marker detection is incomplete or ambiguous; inspect the photograph.")

angles = np.deg2rad([m[0] * 6 for m in markers])
kinds = np.array([m[1] for m in markers])
observed = np.array([m[2] for m in markers])


def homography(values):
    return np.array([[*values[:3]], [*values[3:6]], [*values[6:8], 1.]])


def residual(values):
    # Minute-marker centroid radius defines one unit. Hour and cardinal
    # centroids are closer to the centre because those markers are longer.
    radii = np.choose(kinds, [1, values[8], values[9]])
    ideal = np.column_stack([radii * np.sin(angles), -radii * np.cos(angles),
                             np.ones(len(markers))])
    projected = ideal @ homography(values).T
    return (projected[:, :2] / projected[:, 2:] - observed).ravel()


fit = least_squares(residual, [1490, 0, 4210, 0, 1490, 2460, 0, 0, .915, .89],
                    loss="soft_l1", f_scale=3, max_nfev=5000)
inverse = np.linalg.inv(homography(fit.x))
error = float(np.median(np.linalg.norm(residual(fit.x).reshape(-1, 2), axis=1)))
if not fit.success or error > 5:
    raise SystemExit(f"Perspective fit failed: median marker error {error:.2f} pixels.")
measurements = []
for tick, kind, center, box in markers:
    unprojected = np.column_stack([box, np.ones(4)]) @ inverse.T
    box = unprojected[:, :2] / unprojected[:, 2:]
    angle = np.deg2rad(tick * 6)
    radial = box @ [np.sin(angle), -np.cos(angle)]
    transverse = box @ [np.cos(angle), np.sin(angle)]
    measurements.append(dict(tick=tick, kind=kind, width=float(np.ptp(transverse)),
                             length=float(np.ptp(radial)), outer=float(max(radial))))

# 161 screen pixels per rectified unit maps the visible case to radius ~183.
# Case and face boundaries are visual estimates: glare prevents a precise fit.
scale = 161
summary = {}
for kind, name in enumerate(["minute", "ordinary_hour", "cardinal_hour"]):
    matching = [m for m in measurements if m["kind"] == kind]
    summary[name] = {key: round(float(np.median([m[key] for m in matching])) * scale, 2)
                     for key in ["width", "length", "outer"]}
matrix = np.array([[scale, 0, 184], [0, scale, 224], [0, 0, 1]]) @ inverse
reference = cv2.warpPerspective(photo, matrix, (368, 448), flags=cv2.INTER_AREA)
yy, xx = np.indices((448, 368))
reference[(xx - 184)**2 + (yy - 224)**2 > 183**2] = 0
cv2.imwrite(str(args.output / "reference-rectified.png"), reference)
report = dict(marker_count=len(markers), median_fit_error_photo_px=error,
              homography=homography(fit.x).tolist(), screen_pixels_per_unit=scale,
              markers_screen_px=summary, individual_markers=measurements)
(args.output / "measurements.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: v for k, v in report.items() if k not in
                  ["homography", "individual_markers"]}, indent=2))

"""Render the website's share card from the project's clock artwork. Run with uv run."""
from base64 import b64encode
from io import BytesIO
from pathlib import Path

from PIL import Image, PngImagePlugin
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site/social/station-clock-v0.2.png"


def embedded(name: str) -> str:
    return "data:image/png;base64," + b64encode((ROOT / name).read_bytes()).decode()


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="db"><rect x="640" y="125" width="228" height="280" rx="23"/></clipPath>
    <clipPath id="swiss"><rect x="905" y="125" width="228" height="280" rx="23"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#fcfcfa"/>
  <rect x="52" y="60" width="48" height="6" fill="#d50b20"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="#102b59">
    <text x="52" y="150" font-size="64" font-weight="700" letter-spacing="-2">Station Clock</text>
    <text x="54" y="220" font-size="32">Railway clocks</text>
    <text x="54" y="262" font-size="32">for your desk.</text>
    <text x="54" y="332" font-size="21" fill="#4d5b6b">German + Swiss · ESP32-S3 AMOLED</text>
    <text x="54" y="368" font-size="21" fill="#4d5b6b">Open source. Install from your browser.</text>
    <text x="54" y="508" font-size="27" font-weight="700">stationclock.net</text>
  </g>
  <rect x="635" y="120" width="238" height="290" rx="28" fill="#17202a"/>
  <image href="{embedded('clock-preview.png')}" x="640" y="125" width="228" height="280" clip-path="url(#db)"/>
  <rect x="900" y="120" width="238" height="290" rx="28" fill="#17202a"/>
  <image href="{embedded('swiss-clock-preview.png')}" x="905" y="125" width="228" height="280" clip-path="url(#swiss)"/>
  <g font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#4d5b6b" text-anchor="middle">
    <text x="754" y="448">DB</text><text x="1019" y="448">Swiss</text>
  </g>
  <path d="M52 554H1148" stroke="#e5e9ed"/>
  <g font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#4d5b6b">
    <text x="54" y="588">Independent project · Railway marks belong to their owners.</text>
    <text x="1148" y="588" text-anchor="end">Swiss artwork: JuergenG / Rainer Zenz · CC BY-SA 3.0</text>
  </g>
</svg>'''

image = Image.open(BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGB")
metadata = PngImagePlugin.PngInfo()
metadata.add_text("License", "CC BY-SA 3.0; railway trademarks retain their own rights")
metadata.add_text("Attribution", "Swiss clock artwork derived from JuergenG / Rainer Zenz, BahnhofsuhrZuerich RZ.jpg")
metadata.add_text("Source", "https://commons.wikimedia.org/wiki/File:BahnhofsuhrZuerich_RZ.jpg")
metadata.add_text("License URL", "https://creativecommons.org/licenses/by-sa/3.0/")
OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT, pnginfo=metadata, optimize=True)
print(f"Generated {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")

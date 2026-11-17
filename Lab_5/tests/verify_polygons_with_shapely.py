import json
import math
import random
import subprocess
from pathlib import Path
from shapely.geometry import Polygon, box

ROOT = Path(__file__).resolve().parents[1]
random.seed(2026)
clipping_window = box(-5, -5, 5, 5)
tests = []

for i in range(1400):
    count = random.randrange(3, 15)
    cx, cy = random.uniform(-8, 8), random.uniform(-8, 8)
    angles = sorted(random.random() * 2 * math.pi for _ in range(count))
    ring = [[cx + random.uniform(1, 16) * math.cos(angle),
             cy + random.uniform(1, 16) * math.sin(angle)] for angle in angles]
    polygon = Polygon(ring)
    if polygon.is_valid and polygon.area >= 1e-5:
        tests.append(([ring], polygon.intersection(clipping_window).area))

for _ in range(120):
    width = 10 ** random.uniform(-6, -2)
    x, y = random.uniform(-2, 2), random.uniform(-2, 2)
    ring = [[x, y], [x + width, y],
            [x + width, y + random.uniform(2, 5)],
            [x, y + random.uniform(2, 5)]]
    polygon = Polygon(ring)
    if polygon.is_valid:
        tests.append(([ring], polygon.intersection(clipping_window).area))

for _ in range(130):
    outer = box(random.uniform(-12, -6), random.uniform(-12, -6),
                random.uniform(6, 12), random.uniform(6, 12))
    x, y = random.uniform(-8, 3), random.uniform(-4, 3)
    inner = box(x, y, x + random.uniform(0.5, 8), y + random.uniform(0.5, 8))
    if outer.contains(inner):
        outer_ring = list(outer.exterior.coords)[:-1]
        inner_ring = list(inner.exterior.coords)[:-1]
        tests.append(([outer_ring, inner_ring], outer.difference(inner).intersection(clipping_window).area))

result = subprocess.run(['node', 'tests/audit_driver.mjs'], cwd=ROOT,
                        input=json.dumps([rings for rings, _ in tests]),
                        capture_output=True, text=True, check=True)
actual = json.loads(result.stdout)
errors = []
for i, ((_, reference), item) in enumerate(zip(tests, actual)):
    if 'error' in item or abs(item['area'] - reference) > max(1e-4, reference * 1e-5):
        errors.append((i, reference, item))
print(f'Independent polygon area check: {len(tests)} cases, {len(errors)} failures')
for error in errors[:8]:
    print(error)
if errors:
    raise SystemExit(1)

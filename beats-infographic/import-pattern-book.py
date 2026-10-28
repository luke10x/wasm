#!/usr/bin/env python3
"""Extract the fixed 16-step grids from the supplied drum-pattern book scans."""

from __future__ import annotations

import json
import re
import sys
from glob import glob
from pathlib import Path

import numpy as np
from PIL import Image


LANES = [
    "accent",
    "cymbal",
    "hat",
    "openHat",
    "highTom",
    "midTom",
    "snare",
    "rimshot",
    "lowTom",
    "clap",
    "cowbell",
    "kick",
]

# Printed pages 7-95 contain three grids each. The order follows the contents page.
GROUPS = [
    ("Afro-Cuban", [("Afro-Cuban", 9), ("Afro-Cuban Break", 6)]),
    ("Blues", [("Blues", 6), ("Blues Break", 3)]),
    ("Boogie", [("Boogie", 3), ("Boogie Break", 3)]),
    ("Bossa Nova", [("Bossa Nova", 6), ("Bossa Nova Break", 3)]),
    ("Cha-Cha", [("Cha-Cha", 3), ("Cha-Cha Break", 3)]),
    ("Disco", [("Disco", 12), ("Disco Break", 9)]),
    ("Funk", [("Funk", 15), ("Funk Break", 15)]),
    ("Jazz", [("Jazz", 6), ("Jazz Break", 3)]),
    ("March / Tango", [("March", 2), ("Tango", 1), ("March / Tango Break", 3)]),
    ("Paso Doble / Charleston", [("Paso Doble", 2), ("Charleston", 1), ("Paso / Charleston Break", 3)]),
    ("Pop", [("Pop", 12), ("Pop Break", 6)]),
    ("Reggae", [("Reggae", 12), ("Reggae Break", 9)]),
    ("Rock", [("Rock", 15), ("Rock Break", 12)]),
    ("Rhythm & Blues", [("Rhythm & Blues", 12), ("Rhythm & Blues Break", 6)]),
    ("Samba", [("Samba", 6), ("Samba Break", 3)]),
    ("Shuffle", [("Shuffle", 6), ("Shuffle Break", 3)]),
    ("Ska", [("Ska", 3), ("Ska Break", 3)]),
    ("Slow", [("Slow", 12), ("Slow Break", 6)]),
    ("Swing", [("Swing", 6), ("Swing Break", 3)]),
    ("Twist", [("Twist", 3), ("Twist Break", 3)]),
    ("Waltz", [("Waltz", 3), ("Waltz Break", 3)]),
    ("Ending", [("Ending", 3)]),
]


def runs(values: np.ndarray, threshold: float) -> list[tuple[int, int]]:
    indices = np.flatnonzero(values >= threshold)
    if not len(indices):
        return []
    result: list[tuple[int, int]] = []
    start = previous = int(indices[0])
    for index in map(int, indices[1:]):
        if index > previous + 1:
            result.append((start, previous))
            start = index
        previous = index
    result.append((start, previous))
    return result


def dilate_axis(mask: np.ndarray, axis: int, radius: int = 6) -> np.ndarray:
    padding = [(0, 0), (0, 0)]
    padding[axis] = (radius, radius)
    padded = np.pad(mask, padding)
    if axis == 0:
        return np.maximum.reduce([padded[offset:offset + mask.shape[0], :] for offset in range(radius * 2 + 1)])
    return np.maximum.reduce([padded[:, offset:offset + mask.shape[1]] for offset in range(radius * 2 + 1)])


def grid_boxes(image: Image.Image) -> list[tuple[int, int, int, int, int]]:
    gray = np.asarray(image.convert("L"))
    dark = gray < 160
    height, width = dark.shape
    # Every printed page uses the same three-slot layout. Fixed vertical windows are
    # more reliable than line projection when an entire lane is filled solid.
    slots = [(.129, .332), (.446, .646), (.758, .958)]
    boxes = []
    for top, bottom in slots:
        y0, y1 = int(height * top), int(height * bottom)
        strip = dark[max(0, y0 - 3):min(height, y1 + 4), :]
        column_counts = dilate_axis(strip, 1).sum(axis=0)
        vertical_runs = runs(column_counts, (y1 - y0) * .75)
        verticals = [int((start + end) / 2) for start, end in vertical_runs]
        candidates = []
        for line_count in (17, 13):
            for index in range(len(verticals) - line_count + 1):
                sequence = verticals[index:index + line_count]
                spacing = np.diff(sequence)
                if 32 <= float(np.mean(spacing)) <= 60:
                    candidates.append((line_count, float(np.std(spacing) / np.mean(spacing)), sequence))
        if not candidates:
            continue
        longest = max(candidate[0] for candidate in candidates)
        _, _, verticals = min(
            (candidate for candidate in candidates if candidate[0] == longest),
            key=lambda candidate: candidate[1],
        )
        boxes.append((verticals[0], y0, verticals[-1], y1, len(verticals) - 1))
    return boxes


def grid_vertical_bounds(
    gray: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    steps: int,
) -> tuple[int, int]:
    """Locate the actual grid borders, excluding the notation printed above it."""
    dark = gray < 190
    verticals = np.linspace(x0, x1, steps + 1)
    scan_start = max(0, y0 - 40)
    scan_end = min(gray.shape[0], y1 + 25)
    coverage = []
    for y in range(scan_start, scan_end):
        covered = sum(
            bool(dark[y, max(0, int(x) - 5):min(gray.shape[1], int(x) + 6)].any())
            for x in verticals
        )
        coverage.append(covered / len(verticals))

    candidates = [
        (start, end)
        for start, end in runs(np.asarray(coverage), .55)
        if end - start > 120
    ]
    if not candidates:
        raise RuntimeError("could not locate the grid's vertical extent")
    rough_top, rough_bottom = max(candidates, key=lambda run: run[1] - run[0])
    rough_top += scan_start
    rough_bottom += scan_start

    # The coverage band extends a few pixels beyond the border because of the
    # tolerance around each vertical line. Snap both ends to the darkest nearby
    # horizontal stroke for the exact top and bottom edges.
    row_ink = dark[:, x0:x1 + 1].sum(axis=1)
    top_range = range(max(0, rough_top - 4), min(gray.shape[0], rough_top + 13))
    bottom_range = range(max(0, rough_bottom - 12), min(gray.shape[0], rough_bottom + 5))
    top = max(top_range, key=lambda y: int(row_ink[y]))
    bottom = max(bottom_range, key=lambda y: int(row_ink[y]))
    if bottom - top < 120:
        raise RuntimeError(f"detected grid is too short: {bottom - top}px")
    return top, bottom


def robust_line(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float]:
    slopes = []
    for left in range(len(xs)):
        for right in range(left + 1, len(xs)):
            if xs[right] != xs[left]:
                slopes.append((ys[right] - ys[left]) / (xs[right] - xs[left]))
    slope = float(np.median(slopes))
    intercept = float(np.median(ys - slope * xs))
    residual = np.abs(ys - (slope * xs + intercept))
    tolerance = max(4.0, float(np.median(residual) * 3))
    keep = residual <= tolerance
    if int(keep.sum()) >= 3:
        slope, intercept = map(float, np.polyfit(xs[keep], ys[keep], 1))
    return slope, intercept


def repair_edge(xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    slope, intercept = robust_line(xs, ys)
    expected = slope * xs + intercept
    residual = np.abs(ys - expected)
    tolerance = max(5.0, float(np.median(residual) * 3))
    return np.where(residual <= tolerance, ys, expected)


def grid_edges(
    gray: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    steps: int,
) -> tuple[np.ndarray, np.ndarray]:
    rough_top, rough_bottom = grid_vertical_bounds(gray, x0, y0, x1, y1, steps)
    dark = gray < 190
    verticals = np.linspace(x0, x1, steps + 1)
    tops = []
    bottoms = []
    for x in verticals:
        scan_start = max(0, rough_top - 15)
        scan_end = min(gray.shape[0], rough_bottom + 16)
        signal = dark[
            scan_start:scan_end,
            max(0, int(x) - 5):min(gray.shape[1], int(x) + 6),
        ].any(axis=1)
        radius = 4
        padded = np.pad(signal, (radius, radius))
        joined = np.maximum.reduce([
            padded[offset:offset + len(signal)]
            for offset in range(radius * 2 + 1)
        ])
        candidates = runs(joined.astype(int), 1)
        start, end = max(candidates, key=lambda run: run[1] - run[0])
        tops.append(scan_start + start + radius)
        bottoms.append(scan_start + end - radius)
    repaired_tops = repair_edge(verticals, np.asarray(tops, dtype=float))
    repaired_bottoms = repair_edge(verticals, np.asarray(bottoms, dtype=float))
    heights = repaired_bottoms - repaired_tops
    if float(heights.min()) < 120:
        raise RuntimeError(f"detected grid is too short: {float(heights.min()):.0f}px")
    return repaired_tops, repaired_bottoms


def extract_grid(image: Image.Image, box: tuple[int, int, int, int, int]) -> tuple[int, dict[str, list[int]]]:
    gray = np.asarray(image.convert("L"))
    x0, y0, x1, y1, steps = box
    xs = np.linspace(x0, x1, steps + 1)
    grid_tops, grid_bottoms = grid_edges(gray, x0, y0, x1, y1, steps)
    lanes: dict[str, list[int]] = {}
    for row, lane in enumerate(LANES):
        hits = []
        for step in range(steps):
            cell_width = xs[step + 1] - xs[step]
            grid_top = (grid_tops[step] + grid_tops[step + 1]) / 2
            grid_bottom = (grid_bottoms[step] + grid_bottoms[step + 1]) / 2
            grid_height = grid_bottom - grid_top
            top_edge = grid_top + row * grid_height / 12
            bottom_edge = grid_top + (row + 1) * grid_height / 12
            cell_height = bottom_edge - top_edge
            left, right = int(xs[step] + cell_width * .25), int(xs[step + 1] - cell_width * .25)
            top, bottom = int(top_edge + cell_height * .30), int(bottom_edge - cell_height * .30)
            cell = gray[top:bottom, left:right]
            # Programmed steps are printed as solid blocks. A deliberately high
            # fill threshold rejects scan speckles and grid-line shadows.
            if cell.size and float(np.mean(cell < 120)) > .25:
                hits.append(step)
        if hits:
            lanes[lane] = hits
    return steps, lanes


def validate_grid(title: str, steps: int, lanes: dict[str, list[int]]) -> None:
    hits = sum(len(lane_hits) for lane_hits in lanes.values())
    density = hits / (steps * len(LANES))
    full_lanes = sum(len(lane_hits) == steps for lane_hits in lanes.values())
    if density > .65 or full_lanes >= 4:
        raise RuntimeError(
            f"{title}: implausibly dense extraction "
            f"({density:.0%} filled, {full_lanes} fully filled lanes)"
        )


def names() -> list[tuple[str, str, str]]:
    result = []
    for section, groups in GROUPS:
        for title, count in groups:
            for number in range(1, count + 1):
                slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
                result.append((section, f"{title} {number}", f"book-{slug}-{number}"))
    return result


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: import-pattern-book.py IMAGE_GLOB OUTPUT_JSON")
    images = [Path(path) for path in sorted(glob(sys.argv[1]))]
    metadata = names()
    extracted = []
    for path in images:
        image = Image.open(path)
        boxes = grid_boxes(image)
        if len(boxes) != 3:
            raise RuntimeError(f"{path}: expected 3 grids, found {len(boxes)}")
        extracted.extend(extract_grid(image, box) for box in boxes)
    if len(extracted) != len(metadata):
        raise RuntimeError(f"expected {len(metadata)} grids, extracted {len(extracted)}")
    patterns = []
    for (section, title, identifier), (steps, lanes) in zip(metadata, extracted):
        validate_grid(title, steps, lanes)
        patterns.append({
            "id": identifier,
            "title": title,
            "family": "Drum machine pattern",
            "source": "Pattern book",
            "section": section,
            "steps": steps,
            "lanes": lanes,
            "description": f"A programmable {section.lower()} rhythm from the supplied pattern collection.",
        })
    Path(sys.argv[2]).write_text(json.dumps(patterns, indent=2) + "\n")
    print(f"wrote {len(patterns)} patterns to {sys.argv[2]}")


if __name__ == "__main__":
    main()

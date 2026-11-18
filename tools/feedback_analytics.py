"""Generate summary metrics for exported course feedback.

The production portal runs on Cloudflare Workers. This Python utility is used
for offline analysis and report preparation from a JSON export.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def summarize_feedback(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ratings = [float(row["rating"]) for row in rows if row.get("rating") is not None]
    statuses = Counter(str(row.get("status", "unknown")) for row in rows)

    return {
        "feedback_count": len(rows),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "status_counts": dict(sorted(statuses.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize course feedback JSON")
    parser.add_argument("input", type=Path, help="Path to a JSON array of feedback")
    args = parser.parse_args()

    rows = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("Input must contain a JSON array")

    print(json.dumps(summarize_feedback(rows), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
CSV/Excel -> words.json converter for Deep Sea Word Aquarium.

Usage examples:
  python csv_excel_to_words_json.py --input words.csv --output words.json
  python csv_excel_to_words_json.py --input words.xlsx --sheet Sheet1 --output words.json
  python csv_excel_to_words_json.py --input add_on.csv --output words.json --merge-with words.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from typing import Dict, Iterable, List


POS_MAP = {
    "noun": "Noun",
    "名詞": "Noun",
    "n": "Noun",
    "verb": "Verb",
    "動詞": "Verb",
    "v": "Verb",
    "adjective": "Adjective",
    "形容詞": "Adjective",
    "adj": "Adjective",
    "adverb": "Adverb",
    "副詞": "Adverb",
    "adv": "Adverb",
}


def normalize_pos(raw: str) -> str:
    key = (raw or "").strip().lower()
    if key in POS_MAP:
        return POS_MAP[key]
    # Keep original if already properly cased.
    clean = (raw or "").strip()
    if clean in {"Noun", "Verb", "Adjective", "Adverb"}:
        return clean
    raise ValueError(f"Unknown POS value: {raw}")


def pick_value(row: Dict[str, str], candidates: Iterable[str]) -> str:
    for key in candidates:
        if key in row and row[key] is not None and str(row[key]).strip() != "":
            return str(row[key]).strip()
    return ""


def to_record(row: Dict[str, str], row_index: int) -> Dict[str, str]:
    word = pick_value(row, ["word", "單字", "vocab", "Word", "WORD"])
    pos = pick_value(row, ["pos", "詞性", "part_of_speech", "POS", "Pos"])
    suffix = pick_value(row, ["suffix", "字尾", "ending", "Suffix", "SUFFIX"])

    if not word or not pos or not suffix:
        raise ValueError(f"Row {row_index}: missing required fields (word/pos/suffix).")

    return {"word": word, "pos": normalize_pos(pos), "suffix": suffix}


def load_from_csv(path: str, encoding: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with open(path, "r", encoding=encoding, newline="") as fp:
        reader = csv.DictReader(fp)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row.")
        for idx, row in enumerate(reader, start=2):
            rows.append(to_record(row, idx))
    return rows


def load_from_excel(path: str, sheet: str | None) -> List[Dict[str, str]]:
    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Excel conversion requires pandas + openpyxl. "
            "Install with: pip install pandas openpyxl"
        ) from exc

    df = pd.read_excel(path, sheet_name=sheet or 0)
    records: List[Dict[str, str]] = []
    for i, row in enumerate(df.to_dict(orient="records"), start=2):
        normalized = {str(k): ("" if v is None else str(v)) for k, v in row.items()}
        records.append(to_record(normalized, i))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert CSV/Excel word list to words.json")
    parser.add_argument("--input", "-i", required=True, help="Input file (.csv, .xlsx, .xls)")
    parser.add_argument("--output", "-o", default="words.json", help="Output JSON path")
    parser.add_argument("--sheet", help="Excel sheet name (optional)")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV encoding (default: utf-8-sig)")
    parser.add_argument("--pretty", action="store_true", help="Pretty JSON output")
    parser.add_argument(
        "--merge-with",
        help="Existing words.json path for merge mode (keep existing + new rows, dedupe).",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace output only with imported rows (disable merge mode).",
    )
    args = parser.parse_args()

    in_path = args.input
    ext = os.path.splitext(in_path)[1].lower()
    if ext not in {".csv", ".xlsx", ".xls"}:
        print("Unsupported input extension. Use .csv, .xlsx, or .xls", file=sys.stderr)
        return 1

    try:
        if ext == ".csv":
            records = load_from_csv(in_path, args.encoding)
        else:
            records = load_from_excel(in_path, args.sheet)
    except Exception as err:
        print(f"Conversion failed: {err}", file=sys.stderr)
        return 1

    merge_path = args.merge_with
    if not args.replace and not merge_path and os.path.exists(args.output):
        merge_path = args.output

    merged_source: List[Dict[str, str]] = []
    if merge_path and not args.replace:
        try:
            with open(merge_path, "r", encoding="utf-8") as fp:
                existing = json.load(fp)
            if isinstance(existing, list):
                for item in existing:
                    if (
                        isinstance(item, dict)
                        and isinstance(item.get("word"), str)
                        and isinstance(item.get("pos"), str)
                        and isinstance(item.get("suffix"), str)
                    ):
                        merged_source.append(
                            {
                                "word": item["word"].strip(),
                                "pos": normalize_pos(item["pos"]),
                                "suffix": item["suffix"].strip(),
                            }
                        )
        except FileNotFoundError:
            pass
        except Exception as err:
            print(f"Warning: could not load merge source: {err}", file=sys.stderr)

    if args.replace:
        merged_source = []
    merged_source.extend(records)

    unique_records: List[Dict[str, str]] = []
    seen = set()
    for rec in merged_source:
        key = (rec["word"].lower(), rec["pos"], rec["suffix"])
        if key in seen:
            continue
        seen.add(key)
        unique_records.append(rec)

    with open(args.output, "w", encoding="utf-8") as fp:
        if args.pretty:
            json.dump(unique_records, fp, ensure_ascii=False, indent=2)
        else:
            json.dump(unique_records, fp, ensure_ascii=False, separators=(",", ":"))

    mode_text = "replace"
    if merge_path and not args.replace:
        mode_text = f"merge-with {merge_path}"
    print(f"Done ({mode_text}). Wrote {len(unique_records)} entries -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


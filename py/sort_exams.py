"""
sort_exams.py - Safe execution wrapper for Algerian Educational Documents Organizer.
Defaults to 'dry-run' to ensure safe inspection before performing any moves.
"""

import sys
from pathlib import Path
from organize_dz_exams import run_pipeline, DEFAULT_ROOT_DIR, DEFAULT_TESSDATA_DIR

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Safe Wrapper for Algerian Educational PDF Document Organizer"
    )
    parser.add_argument(
        "--source-dir", "-s",
        type=str,
        default=DEFAULT_ROOT_DIR,
        help=f"Source directory containing PDF exams (default: {DEFAULT_ROOT_DIR})"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help="Target root directory (default: in-place reorganization)"
    )
    parser.add_argument(
        "--action", "-a",
        choices=["dry-run", "move", "copy"],
        default="dry-run",
        help="Action to perform: 'dry-run' (default, safe preview), 'move', or 'copy'"
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Bypass interactive confirmation prompt when performing move or copy"
    )
    parser.add_argument(
        "--tessdata",
        type=str,
        default=DEFAULT_TESSDATA_DIR,
        help=f"Path to Tesseract models (default: {DEFAULT_TESSDATA_DIR})"
    )
    parser.add_argument(
        "--report", "-r",
        type=str,
        default="classification_report.csv",
        help="Path to save execution CSV report (default: classification_report.csv)"
    )
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=None,
        help="Parallel worker processes (default: min(8, CPU count))"
    )
    parser.add_argument(
        "--concurrency", "-c",
        choices=["process", "thread"],
        default="process",
        help="Concurrency execution primitive: 'process' (default, recommended) or 'thread'"
    )

    args = parser.parse_args()

    # Safety confirmation guard when running destructive operations
    if args.action in ["move", "copy"] and not args.yes:
        print("=" * 65)
        print(f"CONFIRMATION REQUIRED: Action is set to '{args.action.upper()}'")
        print(f"Target Directory: {args.source_dir}")
        print("=" * 65)
        try:
            user_response = input(f"Proceed with {args.action.upper()} operations across this directory? [y/N]: ").strip().lower()
            if user_response not in ["y", "yes"]:
                print("Operation aborted by user. Switching to 'dry-run' mode for safety.\n")
                args.action = "dry-run"
        except (EOFError, KeyboardInterrupt):
            print("\nNon-interactive shell detected without -y/--yes flag. Switching to 'dry-run' mode.\n")
            args.action = "dry-run"

    run_pipeline(
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        action=args.action,
        tessdata_dir=args.tessdata,
        report_csv=args.report,
        workers=args.workers,
        concurrency=args.concurrency
    )

if __name__ == "__main__":
    main()
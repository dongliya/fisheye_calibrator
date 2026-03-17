#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fisheye Calibrator - Main Entry Point

Usage:
    python run.py
    python run.py --port 8080
    python run.py --port 5050 --no-browser
"""

import argparse
import os
import sys
import threading
import time

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app import create_app
from backend.state import state


def main():
    parser = argparse.ArgumentParser(description='Fisheye Camera Calibration Tool')
    parser.add_argument('--port', type=int, default=5050, help='Server port (default: 5050)')
    parser.add_argument('--host', default='0.0.0.0', help='Server host (default: 0.0.0.0)')
    parser.add_argument('--output', default='./calibration_output', help='Output directory')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    args = parser.parse_args()

    # Configure state
    state.output_dir = os.path.abspath(args.output)
    os.makedirs(state.output_dir, exist_ok=True)

    # Create app
    app = create_app()

    # Print welcome message
    print(f"""
\033[96m╔══════════════════════════════════════════════════════╗
║     Fisheye Calibration Tool  Web UI  v2.0           ║
╚══════════════════════════════════════════════════════╝\033[0m

  \033[92m▶  Open in browser:  http://localhost:{args.port}\033[0m

  Keyboard Shortcuts:
    V - View mode (drag corners)
    A - Add mode (click to add)
    D - Delete mode (click to remove)
    N - Number edit mode (click to renumber)
    F - Fit to window
    L - Toggle labels
    ← → - Switch images
""")

    # Open browser automatically
    if not args.no_browser:
        def _open():
            time.sleep(1.2)
            import webbrowser
            webbrowser.open(f'http://localhost:{args.port}')
        threading.Thread(target=_open, daemon=True).start()

    # Run server
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Simple undistortion demo.

Read calibration_params.json and one image, then write undistorted output.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def _clip(v: float, lo: float, hi: float) -> float:
    return float(np.clip(float(v), lo, hi))


def undistort_with_params(
    img_bgr: np.ndarray,
    calib: dict,
    balance: float | None = None,
    out_scale: float | None = None,
    focal_scale: float | None = None,
    cx_offset: float | None = None,
    cy_offset: float | None = None,
    crop_enable: bool | None = None,
    crop_x: float | None = None,
    crop_y: float | None = None,
    crop_w: float | None = None,
    crop_h: float | None = None,
) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    preview = calib.get("preview_params") or {}

    out_scale = _clip(out_scale if out_scale is not None else preview.get("out_scale", 1.0), 0.5, 3.0)
    focal_scale = _clip(focal_scale if focal_scale is not None else preview.get("focal_scale", 1.0), 0.4, 2.5)
    out_w = max(1, int(round(w * out_scale)))
    out_h = max(1, int(round(h * out_scale)))
    out_size = (out_w, out_h)

    cx_offset = _clip(cx_offset if cx_offset is not None else preview.get("cx_offset", 0.0), -out_w, out_w)
    cy_offset = _clip(cy_offset if cy_offset is not None else preview.get("cy_offset", 0.0), -out_h, out_h)

    crop_enable = bool(preview.get("crop_enable", False) if crop_enable is None else crop_enable)
    crop_x = _clip(crop_x if crop_x is not None else preview.get("crop_x", 0.05), 0.0, 0.99)
    crop_y = _clip(crop_y if crop_y is not None else preview.get("crop_y", 0.05), 0.0, 0.99)
    crop_w = _clip(crop_w if crop_w is not None else preview.get("crop_w", 0.90), 0.01, 1.0 - crop_x)
    crop_h = _clip(crop_h if crop_h is not None else preview.get("crop_h", 0.90), 0.01, 1.0 - crop_y)

    preferred_model = calib.get("preferred_model")
    if preferred_model not in ("standard", "fisheye"):
        preferred_model = "fisheye" if calib.get("fisheye_K") and calib.get("fisheye_D") else "standard"

    if preferred_model == "fisheye" and calib.get("fisheye_K") and calib.get("fisheye_D"):
        balance = _clip(
            balance if balance is not None else preview.get("balance", calib.get("fisheye_balance", 0.6)),
            0.0,
            1.0,
        )
        K = np.array(calib["fisheye_K"], dtype=np.float64)
        D = np.array(calib["fisheye_D"], dtype=np.float64).reshape(-1, 1)
        nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (w, h), np.eye(3), None, balance, out_size
        )
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        m1, m2 = cv2.fisheye.initUndistortRectifyMap(K, D, np.eye(3), nK, out_size, cv2.CV_16SC2)
        undist = cv2.remap(img_bgr, m1, m2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    elif calib.get("K") and calib.get("dist"):
        K = np.array(calib["K"], dtype=np.float64)
        D = np.array(calib["dist"], dtype=np.float64)
        nK, _ = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 0.0, out_size)
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        undist = cv2.undistort(img_bgr, K, D, None, nK)
    else:
        raise ValueError("Calibration parameters are incomplete")

    if crop_enable:
        x0 = int(np.clip(round(crop_x * out_w), 0, undist.shape[1] - 1))
        y0 = int(np.clip(round(crop_y * out_h), 0, undist.shape[0] - 1))
        ww = max(1, int(round(crop_w * out_w)))
        hh = max(1, int(round(crop_h * out_h)))
        x1 = int(np.clip(x0 + ww, x0 + 1, undist.shape[1]))
        y1 = int(np.clip(y0 + hh, y0 + 1, undist.shape[0]))
        undist = undist[y0:y1, x0:x1]

    return undist


def main() -> None:
    parser = argparse.ArgumentParser(description="Undistort one image using calibration_params.json")
    parser.add_argument("--calib", required=True, help="Path to calibration_params.json")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--output", default="", help="Path to output image (default: <image>_undistorted.jpg)")

    parser.add_argument("--balance", type=float, default=None)
    parser.add_argument("--out-scale", type=float, default=None)
    parser.add_argument("--focal-scale", type=float, default=None)
    parser.add_argument("--cx-offset", type=float, default=None)
    parser.add_argument("--cy-offset", type=float, default=None)
    parser.add_argument("--crop-enable", action="store_true", default=None)
    parser.add_argument("--crop-x", type=float, default=None)
    parser.add_argument("--crop-y", type=float, default=None)
    parser.add_argument("--crop-w", type=float, default=None)
    parser.add_argument("--crop-h", type=float, default=None)
    args = parser.parse_args()

    calib_path = Path(args.calib)
    image_path = Path(args.image)
    if not calib_path.exists():
        raise FileNotFoundError(f"Calibration file not found: {calib_path}")
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    with calib_path.open("r", encoding="utf-8") as f:
        calib = json.load(f)

    img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"Failed to read image: {image_path}")

    undist = undistort_with_params(
        img,
        calib,
        balance=args.balance,
        out_scale=args.out_scale,
        focal_scale=args.focal_scale,
        cx_offset=args.cx_offset,
        cy_offset=args.cy_offset,
        crop_enable=args.crop_enable,
        crop_x=args.crop_x,
        crop_y=args.crop_y,
        crop_w=args.crop_w,
        crop_h=args.crop_h,
    )

    out_path = Path(args.output) if args.output else image_path.with_name(f"{image_path.stem}_undistorted.jpg")
    ok = cv2.imwrite(str(out_path), undist)
    if not ok:
        raise RuntimeError(f"Failed to write output: {out_path}")

    print(f"input : {image_path}")
    print(f"output: {out_path}")
    print(f"model : {calib.get('preferred_model')}")


if __name__ == "__main__":
    main()

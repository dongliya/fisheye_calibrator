#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Camera Calibration Logic for Fisheye and Standard Models
"""

import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Tuple

from .state import ImageRecord, state


def run_calibration() -> Dict[str, Any]:
    """
    Run camera calibration using both standard and fisheye models.
    
    Returns:
        Dictionary containing calibration results
        
    Raises:
        ValueError: If insufficient valid images
        RuntimeError: If both calibration models fail
    """
    cols, rows, sq = state.cols, state.rows, state.square_size
    
    # Filter valid images (full corner detection)
    valid = [
        img for img in state.images
        if img.corners is not None and len(img.corners) == cols * rows
    ]
    
    if len(valid) < 3:
        raise ValueError(
            f"有效图片不足（{len(valid)} 张，需要至少 3 张）"
        )
    
    h, w = valid[0].h, valid[0].w
    img_size = (w, h)
    
    # Prepare object points (one set per image)
    base_obj_pts = _prepare_object_points(cols, rows, sq)
    obj_pts = [base_obj_pts.copy() for _ in valid]
    img_pts = [img.corners.astype(np.float32) for img in valid]
    
    result: Dict[str, Any] = {
        'valid_count': len(valid),
        'image_size': [w, h],
        'chessboard': {'cols': cols, 'rows': rows, 'square_size_mm': sq},
        'calibration_date': datetime.now().isoformat()
    }
    
    # Try standard model
    std_success = _calibrate_standard(result, obj_pts, img_pts, img_size)
    
    # Try fisheye model
    fish_success = _calibrate_fisheye(result, obj_pts, img_pts, img_size)
    
    if 'rms' not in result:
        raise RuntimeError("两种模型均失败")
    
    state.calib_result = result
    return result


def _prepare_object_points(cols: int, rows: int, square_size: float) -> np.ndarray:
    """Prepare 3D object points for chessboard corners."""
    obj_pt = np.zeros((rows * cols, 3), np.float32)
    for r in range(rows):
        for c in range(cols):
            obj_pt[r * cols + c] = [c * square_size, r * square_size, 0]
    return obj_pt


def _calibrate_standard(
    result: Dict[str, Any],
    obj_pts: List[np.ndarray],
    img_pts: List[np.ndarray],
    img_size: Tuple[int, int]
) -> bool:
    """
    Calibrate using standard pinhole model.
    
    Returns:
        True if successful
    """
    try:
        K = np.eye(3, dtype=np.float64)
        D = np.zeros((5, 1), dtype=np.float64)
        
        rms, K, D, rvecs, tvecs = cv2.calibrateCamera(
            obj_pts, img_pts, img_size, K, D, flags=0
        )
        
        result.update({
            'rms': float(rms),
            'K': K.tolist(),
            'dist': D.flatten().tolist()
        })
        
        # Calculate per-image reprojection errors
        per_image_rms = []
        for op, ip, rv, tv in zip(obj_pts, img_pts, rvecs, tvecs):
            proj, _ = cv2.projectPoints(op, rv, tv, K, D)
            error = np.sqrt(np.mean((proj.reshape(-1, 2) - ip) ** 2))
            per_image_rms.append(float(error))
        result['per_image_rms'] = per_image_rms
        
        state.add_log(f"标准模型  RMS={rms:.4f}px", 'ok')
        return True
        
    except Exception as e:
        state.add_log(f"标准模型失败：{e}", 'warn')
        return False


def _calibrate_fisheye(
    result: Dict[str, Any],
    obj_pts: List[np.ndarray],
    img_pts: List[np.ndarray],
    img_size: Tuple[int, int]
) -> bool:
    """
    Calibrate using fisheye model.
    
    Returns:
        True if successful
    """
    try:
        fK = np.eye(3, dtype=np.float64)
        fD = np.zeros((4, 1), dtype=np.float64)
        
        # Reshape for fisheye calibration
        of = [o.reshape(-1, 1, 3) for o in obj_pts]
        pf = [p.reshape(-1, 1, 2) for p in img_pts]
        
        frv = [np.zeros((1, 1, 3), np.float64) for _ in obj_pts]
        ftv = [np.zeros((1, 1, 3), np.float64) for _ in obj_pts]
        
        flags = (
            cv2.fisheye.CALIB_RECOMPUTE_EXTRINSIC |
            cv2.fisheye.CALIB_FIX_SKEW |
            cv2.fisheye.CALIB_CHECK_COND
        )
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 200, 1e-7)
        
        frms, fK, fD, frv, ftv = cv2.fisheye.calibrate(
            of, pf, img_size, fK, fD, frv, ftv, flags, criteria
        )
        
        result.update({
            'fisheye_rms': float(frms),
            'fisheye_K': fK.tolist(),
            'fisheye_D': fD.flatten().tolist()
        })
        
        # Set default RMS if not already set
        if 'rms' not in result:
            result['rms'] = float(frms)
        
        state.add_log(f"鱼眼模型  RMS={frms:.4f}px", 'ok')
        return True
        
    except Exception as e:
        state.add_log(f"鱼眼模型失败：{e}", 'warn')
        return False


# Import cv2 at module level for calibration functions
import cv2

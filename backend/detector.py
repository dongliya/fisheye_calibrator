#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Chessboard Corner Detection for Fisheye Calibration
"""

import cv2
import numpy as np


def detect_corners_cv(img_bgr: np.ndarray, cols: int, rows: int) -> np.ndarray:
    """
    Detect chessboard corners in an image.
    
    Args:
        img_bgr: Input image in BGR format
        cols: Number of chessboard corners (width)
        rows: Number of chessboard corners (height)
    
    Returns:
        Array of corner coordinates (N, 2) or None if not found
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    
    # Standard detection flags
    flags = (
        cv2.CALIB_CB_ADAPTIVE_THRESH |
        cv2.CALIB_CB_NORMALIZE_IMAGE |
        cv2.CALIB_CB_FAST_CHECK
    )
    
    # Try standard detection first
    found, corners = cv2.findChessboardCorners(gray, (cols, rows), flags)
    
    # Fallback without fast check
    if not found:
        found, corners = cv2.findChessboardCorners(gray, (cols, rows), None)
    
    if found and corners is not None:
        # Refine corner positions
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
        corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
        return corners.reshape(-1, 2)
    
    return None

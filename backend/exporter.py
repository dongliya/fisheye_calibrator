#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Export Calibration Results to Various Formats
"""

import os
import json
import numpy as np
from typing import Dict, Any


def export_json(result: Dict[str, Any], out_dir: str) -> str:
    """Export calibration parameters to JSON file."""
    path = os.path.abspath(os.path.join(out_dir, 'calibration_params.json'))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    return path


def export_yaml(result: Dict[str, Any], out_dir: str) -> str:
    """Export calibration parameters to OpenCV YAML format."""
    K = result.get('K') or result.get('fisheye_K')
    D = result.get('dist') or result.get('fisheye_D')
    fD = result.get('fisheye_D')
    w, h = result['image_size']
    
    lines = [
        '%YAML:1.0',
        '---',
        f'# Fisheye Calibration RMS={result["rms"]:.6f}',
        f'image_width: {w}',
        f'image_height: {h}',
        f'rms_error: {result["rms"]:.10f}',
        '',
        'camera_matrix: !!opencv-matrix',
        '   rows: 3',
        '   cols: 3',
        '   dt: d',
        f'   data: [ {", ".join(f"{v:.10f}" for row in K for v in row)} ]',
        '',
        'distortion_coefficients: !!opencv-matrix',
        f'   rows: 1',
        f'   cols: {len(D)}',
        '   dt: d',
        f'   data: [ {", ".join(f"{v:.10f}" for v in D)} ]'
    ]
    
    if fD:
        lines.extend([
            '',
            'fisheye_distortion: !!opencv-matrix',
            '   rows: 1',
            '   cols: 4',
            '   dt: d',
            f'   data: [ {", ".join(f"{v:.10f}" for v in fD)} ]'
        ])
    
    path = os.path.abspath(os.path.join(out_dir, 'calibration.yaml'))
    with open(path, 'w') as f:
        f.write('\n'.join(lines))
    return path


def export_python(result: Dict[str, Any], out_dir: str) -> str:
    """Export calibration parameters as Python module."""
    K = result.get('K') or result.get('fisheye_K')
    D_std = result.get('dist')
    D_fish = result.get('fisheye_D')
    w, h = result['image_size']
    
    Ka = np.array(K)
    
    code = f'''#!/usr/bin/env python3
# Fisheye Camera Calibration Parameters  RMS={result.get("rms", "N/A"):.6f}px
import numpy as np, cv2

K = np.array([
    [{Ka[0, 0]:.10f}, {Ka[0, 1]:.10f}, {Ka[0, 2]:.10f}],
    [{Ka[1, 0]:.10f}, {Ka[1, 1]:.10f}, {Ka[1, 2]:.10f}],
    [{Ka[2, 0]:.10f}, {Ka[2, 1]:.10f}, {Ka[2, 2]:.10f}],
], dtype=np.float64)

{f"D_STANDARD = np.array([{', '.join(f'{v:.10f}' for v in D_std)}])" if D_std else "# D_STANDARD: N/A"}
{f"D_FISHEYE  = np.array([[{'], ['.join(f'{v:.10f}' for v in D_fish)}]])" if D_fish else "# D_FISHEYE: N/A"}


def undistort_fisheye(img, balance=0.0):
    """Undistort image using fisheye model."""
    h, w = img.shape[:2]
    nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
        K, D_FISHEYE, (w, h), np.eye(3), balance=balance
    )
    m1, m2 = cv2.fisheye.initUndistortRectifyMap(K, D_FISHEYE, np.eye(3), nK, (w, h), cv2.CV_16SC2)
    return cv2.remap(img, m1, m2, cv2.INTER_LINEAR, cv2.BORDER_CONSTANT)


def undistort_standard(img, alpha=1.0):
    """Undistort image using standard pinhole model."""
    h, w = img.shape[:2]
    nK, roi = cv2.getOptimalNewCameraMatrix(K, D_STANDARD, (w, h), alpha)
    return cv2.undistort(img, K, D_STANDARD, None, nK)


if __name__ == '__main__':
    import sys
    img = cv2.imread(sys.argv[1])
    out = undistort_fisheye(img)
    cv2.imwrite(sys.argv[1].rsplit('.', 1)[0] + '_undist.jpg', out)
    print('Saved.')
'''
    
    path = os.path.abspath(os.path.join(out_dir, 'calibration_params.py'))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(code)
    return path

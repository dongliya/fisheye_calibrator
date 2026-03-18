#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Image Rendering and Report Generation
"""

import io
import base64
import cv2
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.font_manager as fm

from .state import state


def _setup_cjk_font() -> str:
    """Setup CJK font for matplotlib."""
    for f in fm.fontManager.ttflist:
        if any(k in f.name for k in ['CJK SC', 'CJK JP', 'SimHei', 'WQY', 'AR PL']):
            matplotlib.rcParams['font.family'] = [f.name, 'DejaVu Sans']
            matplotlib.rcParams['axes.unicode_minus'] = False
            return f.name
    return 'DejaVu Sans'


_CJK_FONT = _setup_cjk_font()


def render_thumbnail(rec, size: int = 80) -> str:
    """Render thumbnail image as base64 string."""
    scale = size / max(rec.h, rec.w)
    th, tw = int(rec.h * scale), int(rec.w * scale)
    thumb = cv2.resize(rec.img_bgr, (tw, th))
    _, buf = cv2.imencode('.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.b64encode(buf).decode()


def image_to_base64(img_bgr: np.ndarray, quality: int = 88) -> str:
    """Convert image to base64 string."""
    _, buf = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode()


def render_report_png(result: dict) -> str:
    """Generate calibration report as PNG image."""
    fig = plt.figure(figsize=(16, 10), facecolor='#0d1117')
    gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.46, wspace=0.38,
                           left=0.07, right=0.97, top=0.92, bottom=0.06)
    fig.suptitle('Fisheye Calibration Report', fontsize=15,
                 color='#e8ecf0', fontweight='bold', y=0.97)
    
    preferred_model = result.get('preferred_model', 'fisheye' if result.get('fisheye_K') else 'standard')
    preferred_rms = result.get('preferred_rms')
    if preferred_rms is None:
        preferred_rms = result.get('fisheye_rms' if preferred_model == 'fisheye' else 'rms', float('nan'))
    fisheye_balance = float(result.get('fisheye_balance', 0.6))
    K = result.get('fisheye_K') if preferred_model == 'fisheye' else result.get('K')
    
    # Plot 1: Per-Image RMS Error
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.set_facecolor('#1a1d24')
    per = result.get('per_image_rms', [])
    if per:
        bc = ['#00c98a' if e < 0.5 else '#ffaa00' if e < 1.5 else '#ff4466' for e in per]
        ax1.bar(range(len(per)), per, color=bc, edgecolor='#2a2f3a', lw=0.7, zorder=3)
        ax1.axhline(preferred_rms, color='#7b61ff', ls='--', lw=1.5, label=f"avg {preferred_rms:.4f}")
        ax1.axhline(0.5, color='#00c98a', ls=':', lw=1, alpha=0.7)
        ax1.axhline(1.5, color='#ff4466', ls=':', lw=1, alpha=0.7)
        ax1.legend(fontsize=8, facecolor='#1a1d24', edgecolor='#2a2f3a', labelcolor='#ccc')
    else:
        ax1.axhline(preferred_rms, color='#7b61ff', ls='--', lw=1.5)
        ax1.text(0.5, 0.55, f'RMS {preferred_rms:.4f} px', ha='center', va='center',
                 color='#e8ecf0', fontsize=10, fontweight='bold', transform=ax1.transAxes)
        ax1.text(0.5, 0.43, 'No per-image RMS in this mode', ha='center', va='center',
                 color='#8891a0', fontsize=8, transform=ax1.transAxes)
    ax1.set_title('Per-Image RMS Error', color='#e8ecf0', fontsize=10, fontweight='bold')
    ax1.set_xlabel('Image Index', color='#8891a0', fontsize=8)
    ax1.set_ylabel('RMS (px)', color='#8891a0', fontsize=8)
    ax1.grid(axis='y', color='#2a2f3a', alpha=0.5)
    ax1.tick_params(colors='#8891a0', labelsize=7)
    for sp in ax1.spines.values():
        sp.set_edgecolor('#2a2f3a')
    
    # Plot 2: Camera Matrix K
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.set_facecolor('#1a1d24')
    if K:
        Ka = np.array(K)
        im = ax2.imshow(Ka, cmap='viridis', aspect='auto')
        for i in range(3):
            for j in range(3):
                ax2.text(j, i, f'{Ka[i, j]:.1f}', ha='center', va='center',
                         color='white', fontsize=9, fontweight='bold')
        ax2.set_title('Camera Matrix K', color='#e8ecf0', fontsize=10, fontweight='bold')
        ax2.set_xticks([0, 1, 2])
        ax2.set_yticks([0, 1, 2])
        ax2.set_xticklabels(['c0', 'c1', 'c2'], color='#8891a0', fontsize=8)
        ax2.set_yticklabels(['r0', 'r1', 'r2'], color='#8891a0', fontsize=8)
        plt.colorbar(im, ax=ax2, fraction=0.046, pad=0.04).ax.tick_params(labelcolor='#8891a0', labelsize=7)
        for sp in ax2.spines.values():
            sp.set_edgecolor('#2a2f3a')
    
    # Plot 3: Distortion Coefficients
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.set_facecolor('#1a1d24')
    lbls, vals, bcs2 = [], [], []
    if result.get('dist'):
        for n_, v in zip(['k1', 'k2', 'p1', 'p2', 'k3'], result['dist']):
            lbls.append(f'Std {n_}')
            vals.append(v)
            bcs2.append('#ff6b35')
    if result.get('fisheye_D'):
        for i, v in enumerate(result['fisheye_D']):
            lbls.append(f'Fish k{i + 1}')
            vals.append(v)
            bcs2.append('#7b61ff')
    if lbls:
        bars = ax3.barh(range(len(lbls)), vals, color=bcs2, edgecolor='#2a2f3a', lw=0.7, height=0.65)
        ax3.set_yticks(range(len(lbls)))
        ax3.set_yticklabels(lbls, color='#8891a0', fontsize=8)
        ax3.axvline(0, color='#4a5260', lw=1)
        rng = max(vals) - min(vals) if len(vals) > 1 else abs(vals[0]) * 0.1 + 1e-9
        for bar, val in zip(bars, vals):
            ax3.text(val + rng * 0.01, bar.get_y() + bar.get_height() / 2,
                     f'{val:.5f}', va='center', color='#e8ecf0', fontsize=7)
        ax3.set_title('Distortion Coefficients', color='#e8ecf0', fontsize=10, fontweight='bold')
        ax3.grid(axis='x', color='#2a2f3a', alpha=0.5)
        ax3.tick_params(colors='#8891a0', labelsize=7)
        for sp in ax3.spines.values():
            sp.set_edgecolor('#2a2f3a')
    
    # Plot 4: Undistortion Preview
    ax4 = fig.add_subplot(gs[1, 0:2])
    ax4.set_facecolor('#1a1d24')
    first = next(
        (img for img in state.images
         if img.corners is not None and len(img.corners) == state.cols * state.rows),
        None
    )
    if first and K:
        img = first.img_bgr
        h_i, w_i = img.shape[:2]
        K_m = np.array(K, np.float64)
        try:
            if preferred_model == 'fisheye' and result.get('fisheye_D'):
                D_m = np.array(result['fisheye_D'], np.float64).reshape(-1, 1)
                nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
                    K_m, D_m, (w_i, h_i), np.eye(3), balance=fisheye_balance
                )
                m1, m2 = cv2.fisheye.initUndistortRectifyMap(K_m, D_m, np.eye(3), nK, (w_i, h_i), cv2.CV_16SC2)
                undist = cv2.remap(img, m1, m2, cv2.INTER_LINEAR, cv2.BORDER_CONSTANT)
            else:
                D_m = np.array(result['dist'], np.float64)
                nK, _ = cv2.getOptimalNewCameraMatrix(K_m, D_m, (w_i, h_i), 0.0)
                undist = cv2.undistort(img, K_m, D_m, None, nK)
            combined = np.hstack([img, undist])
            ax4.imshow(cv2.cvtColor(combined, cv2.COLOR_BGR2RGB), aspect='auto')
            ax4.axvline(w_i, color='#00d4aa', lw=2, ls='--', alpha=0.8)
            ax4.text(w_i * 0.5, 18, 'Original', color='#ff6b35', fontsize=9, fontweight='bold',
                     ha='center', va='top', bbox=dict(boxstyle='round,pad=0.3', fc='#0d1117', alpha=0.75))
            ax4.text(w_i * 1.5, 18, 'Undistorted', color='#00d4aa', fontsize=9, fontweight='bold',
                     ha='center', va='top', bbox=dict(boxstyle='round,pad=0.3', fc='#0d1117', alpha=0.75))
        except Exception as e:
            ax4.text(0.5, 0.5, f'Preview failed\n{e}', ha='center', va='center',
                     color='#ff4466', transform=ax4.transAxes)
    ax4.set_title('Undistortion Preview', color='#e8ecf0', fontsize=10, fontweight='bold')
    ax4.axis('off')
    for sp in ax4.spines.values():
        sp.set_edgecolor('#2a2f3a')
    
    # Plot 5: Summary Text
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_facecolor('#111318')
    ax5.axis('off')
    rms = preferred_rms
    Ka = np.array(K) if K else None
    rc = '#00c98a' if rms < 0.5 else '#ffaa00' if rms < 1.5 else '#ff4466'
    grade = 'Excellent' if rms < 0.5 else 'Good' if rms < 1.5 else 'Poor'
    
    lines = [
        ('Calibration Summary', '#e8ecf0', 12, True),
        ('', '', 5, False),
        (f'RMS  {rms:.4f} px  [{grade}]', rc, 10.5, True),
    ]
    if result.get('fisheye_rms'):
        lines.append((f'Fish RMS  {result["fisheye_rms"]:.4f} px', '#00d4aa', 9.5, False))
    lines.extend([
        (f'Images {result.get("valid_count", "?")}  {result["image_size"][0]}x{result["image_size"][1]}', '#8891a0', 9, False),
        ('', '', 4, False),
        ('Camera Matrix K', '#7b61ff', 10, True),
    ])
    if Ka is not None:
        lines.extend([
            (f'  fx={Ka[0, 0]:.2f}  fy={Ka[1, 1]:.2f}', '#00d4aa', 9, False),
            (f'  cx={Ka[0, 2]:.2f}  cy={Ka[1, 2]:.2f}', '#00d4aa', 9, False),
        ])
    if result.get('dist'):
        d = result['dist']
        lines.extend([
            ('Std Distortion', '#7b61ff', 10, True),
            (f'  k1={d[0]:.5f}  k2={d[1]:.5f}', '#ff6b35', 8.5, False),
            (f'  p1={d[2]:.5f}  p2={d[3]:.5f}', '#ff6b35', 8.5, False),
        ])
    if result.get('fisheye_D'):
        fd = result['fisheye_D']
        lines.extend([
            ('Fisheye Distortion', '#7b61ff', 10, True),
            (f'  k1={fd[0]:.5f}  k2={fd[1]:.5f}', '#ff6b35', 8.5, False),
            (f'  k3={fd[2]:.5f}  k4={fd[3]:.5f}', '#ff6b35', 8.5, False),
        ])
    
    y = 0.97
    for text, color, size, bold in lines:
        if not text:
            y -= 0.022
            continue
        ax5.text(0.04, y, text, transform=ax5.transAxes, color=color, fontsize=size,
                 fontweight='bold' if bold else 'normal', fontfamily='monospace', va='top')
        y -= 0.068
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='#0d1117')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

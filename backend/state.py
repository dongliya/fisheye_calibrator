#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Global State Management for Fisheye Calibrator
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
import numpy as np


class ImageRecord:
    """Represents a single calibration image with its detected corners."""

    def __init__(
        self,
        path: str,
        img_bgr: np.ndarray,
        corners: Optional[np.ndarray] = None,
        detected: bool = False,
        image_id: Optional[str] = None
    ):
        self.path = path
        self.name = Path(path).name
        self.img_bgr = img_bgr
        self.h, self.w = img_bgr.shape[:2]
        self.corners = corners  # np.ndarray (N, 2) or None
        self.detected = detected
        self.image_id = image_id or self.name

    def to_dict(self, cols: int, rows: int) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        nc = len(self.corners) if self.corners is not None else 0
        expected = cols * rows
        if nc == expected:
            status = 'full'
        elif nc > 0:
            status = 'partial'
        elif self.detected:
            status = 'failed'
        else:
            status = 'pending'

        return {
            'name': self.name,
            'path': self.path,
            'w': self.w,
            'h': self.h,
            'n_corners': nc,
            'expected': expected,
            'detected': self.detected,
            'status': status
        }


class StateManager:
    """Manages global application state."""

    def __init__(self):
        self.images: List[ImageRecord] = []
        self.cols: int = 9
        self.rows: int = 6
        self.square_size: float = 25.0
        self.calib_result: Optional[Dict[str, Any]] = None
        self.output_dir: str = './calibration_output'
        self.image_dir: Optional[str] = None
        self._log: List[Dict[str, str]] = []
        self._log_max = 200
        self._corner_cache: Dict[str, Dict[str, Any]] = {}
        self.ui_lang: str = 'zh'
        self._i18n: Dict[str, Dict[str, str]] = {
            'zh': {
                'need_calib': '请先完成标定',
                'incomplete_params': '标定参数不完整',
                'dir_read_failed': '读取目录失败: {err}',
                'pick_dir_title': '选择标定图片目录',
                'pick_dir_failed': '无法打开目录选择器: {err}',
                'dir_not_selected': '未选择目录',
                'input_dir_required': '请输入图片目录路径',
                'dir_not_exists': '目录不存在: {path}',
                'no_images_found': '目录中未找到可用图片',
                'undistort_failed': '矫正失败: {err}',
                'invalid_param': '参数无效',
                'no_fisheye_params': '当前结果不包含鱼眼模型参数',
                'restored_corners_log': '恢复角点：{name} ({count} 个)',
                'load_dir_log': '加载目录：{dir}，图片 {added} 张，恢复 {restored} 张',
                'upload_log': '上传：{name} ({w}×{h})',
                'detect_found_log': '检测到 {count} 角点：{name}',
                'detect_not_found_log': '未检测到 0 角点：{name}',
                'detect_all_log': '批量检测：{ok}/{total} 成功',
                'calibrate_failed_log': '标定失败：{err}',
                'save_preview_log': '保存预览参数: balance={balance:.2f}, out_scale={out_scale:.2f}, focal_scale={focal_scale:.2f}',
                'invalid_calibration_mode': '不支持的标定模式: {mode}',
                'insufficient_images': '有效图片不足（{count} 张，需要至少 3 张）',
                'standard_calib_failed': '标准模型标定失败',
                'fisheye_calib_failed': '鱼眼模型标定失败',
                'standard_rms_log': '标准模型  RMS={rms:.4f}px',
                'standard_failed_log': '标准模型失败：{err}',
                'fisheye_rms_log': '鱼眼模型  RMS={rms:.4f}px',
                'fisheye_failed_log': '鱼眼模型失败：{err}'
            },
            'en': {
                'need_calib': 'Please calibrate first',
                'incomplete_params': 'Calibration parameters are incomplete',
                'dir_read_failed': 'Failed to read directory: {err}',
                'pick_dir_title': 'Select calibration image directory',
                'pick_dir_failed': 'Cannot open folder picker: {err}',
                'dir_not_selected': 'No directory selected',
                'input_dir_required': 'Please input image directory path',
                'dir_not_exists': 'Directory does not exist: {path}',
                'no_images_found': 'No usable images found in directory',
                'undistort_failed': 'Undistortion failed: {err}',
                'invalid_param': 'Invalid parameters',
                'no_fisheye_params': 'Current result does not include fisheye model parameters',
                'restored_corners_log': 'Restored corners: {name} ({count})',
                'load_dir_log': 'Loaded directory: {dir}, images {added}, restored {restored}',
                'upload_log': 'Uploaded: {name} ({w}x{h})',
                'detect_found_log': 'Detected {count} corners: {name}',
                'detect_not_found_log': 'No corners detected: {name}',
                'detect_all_log': 'Batch detect: {ok}/{total} success',
                'calibrate_failed_log': 'Calibration failed: {err}',
                'save_preview_log': 'Saved preview params: balance={balance:.2f}, out_scale={out_scale:.2f}, focal_scale={focal_scale:.2f}',
                'invalid_calibration_mode': 'Unsupported calibration mode: {mode}',
                'insufficient_images': 'Insufficient valid images ({count}); at least 3 required',
                'standard_calib_failed': 'Standard model calibration failed',
                'fisheye_calib_failed': 'Fisheye model calibration failed',
                'standard_rms_log': 'Standard model RMS={rms:.4f}px',
                'standard_failed_log': 'Standard model failed: {err}',
                'fisheye_rms_log': 'Fisheye model RMS={rms:.4f}px',
                'fisheye_failed_log': 'Fisheye model failed: {err}'
            }
        }

    def set_lang(self, lang: Optional[str]) -> None:
        """Set current UI language for backend-generated messages."""
        self.ui_lang = 'en' if (lang or '').lower() == 'en' else 'zh'

    def tr(self, key: str, **kwargs) -> str:
        """Translate message template by key with formatting."""
        d = self._i18n.get(self.ui_lang, self._i18n['zh'])
        tpl = d.get(key) or self._i18n['zh'].get(key) or key
        try:
            return tpl.format(**kwargs)
        except Exception:
            return tpl

    def add_log(self, msg: str, level: str = 'info') -> None:
        """Add a log entry."""
        self._log.append({
            't': datetime.now().strftime('%H:%M:%S'),
            'msg': msg,
            'level': level
        })
        if len(self._log) > self._log_max:
            self._log = self._log[-self._log_max:]

    def get_log(self, limit: int = 30) -> List[Dict[str, str]]:
        """Get recent log entries."""
        return self._log[-limit:]

    def clear(self) -> None:
        """Clear all state."""
        self.images = []
        self.calib_result = None
        self._log = []

    @property
    def corner_cache_path(self) -> Path:
        """Path to persisted corner cache file."""
        base_dir = Path(self.image_dir) if self.image_dir else Path(self.output_dir)
        return base_dir / 'corner_cache.json'

    def load_corner_cache(self, image_dir: Optional[str] = None) -> None:
        """Load persisted corner cache from disk."""
        if image_dir is not None:
            self.image_dir = image_dir

        path = self.corner_cache_path
        self._corner_cache = {}
        if not path.exists():
            return

        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            if isinstance(data, dict) and isinstance(data.get('images'), dict):
                self._corner_cache = data.get('images', {})
                meta = data.get('meta', {})
                if isinstance(meta, dict):
                    cols = meta.get('cols')
                    rows = meta.get('rows')
                    square_size = meta.get('square_size')
                    if isinstance(cols, int) and cols > 0:
                        self.cols = cols
                    if isinstance(rows, int) and rows > 0:
                        self.rows = rows
                    if isinstance(square_size, (int, float)) and square_size > 0:
                        self.square_size = float(square_size)
            elif isinstance(data, dict):
                # Backward compatibility with old flat format
                self._corner_cache = data
            else:
                self._corner_cache = {}
        except Exception:
            self._corner_cache = {}

    def _save_corner_cache(self) -> None:
        """Persist corner cache to disk."""
        path = self.corner_cache_path
        os.makedirs(path.parent, exist_ok=True)
        payload = {
            'meta': {
                'cols': int(self.cols),
                'rows': int(self.rows),
                'square_size': float(self.square_size)
            },
            'images': self._corner_cache
        }
        tmp_path = path.with_suffix('.tmp')
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        tmp_path.replace(path)

    def persist_corner_cache(self) -> None:
        """Persist current cache and metadata without changing corners."""
        self._save_corner_cache()

    def _cache_key(self, rec: ImageRecord) -> str:
        """Stable cache key for an image."""
        return rec.image_id

    def restore_corners(self, rec: ImageRecord) -> bool:
        """Restore corners for a record from persisted cache."""
        entry = self._corner_cache.get(self._cache_key(rec))
        if not isinstance(entry, dict):
            return False
        if entry.get('w') != rec.w or entry.get('h') != rec.h:
            return False

        pts = entry.get('corners', [])
        if not isinstance(pts, list) or not pts:
            return False

        rec.corners = np.array(pts, dtype=np.float32)
        rec.detected = bool(entry.get('detected', True))
        return True

    def save_corners(self, rec: ImageRecord) -> None:
        """Update and persist corner cache for a record."""
        key = self._cache_key(rec)
        if rec.corners is None or len(rec.corners) == 0:
            self._corner_cache.pop(key, None)
        else:
            self._corner_cache[key] = {
                'name': rec.name,
                'w': rec.w,
                'h': rec.h,
                'detected': rec.detected,
                'corners': rec.corners.tolist()
            }
        self._save_corner_cache()

    @property
    def valid_images_count(self) -> int:
        """Count images with full corner detection."""
        return sum(
            1 for img in self.images
            if img.corners is not None and len(img.corners) == self.cols * self.rows
        )


# Global state instance
state = StateManager()

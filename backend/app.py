#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flask Application for Fisheye Calibrator
"""

import os
import cv2
import hashlib
import numpy as np
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_file, abort

from backend.state import state, ImageRecord
from backend.detector import detect_corners_cv
from backend.calibrator import run_calibration
from backend.exporter import export_json, export_yaml
from backend.renderer import render_report_png, render_thumbnail, image_to_base64


IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp'}


def create_app(config: dict = None) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        template_folder='../frontend/templates',
        static_folder='../frontend/static'
    )

    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max upload
    if config:
        app.config.update(config)

    state.load_corner_cache()
    register_routes(app)
    return app


def _load_images_from_dir(dir_path: Path) -> tuple[int, int]:
    """Load images from a filesystem directory and restore cached corners."""
    state.images = []
    state.calib_result = None

    state.image_dir = str(dir_path)
    state.load_corner_cache(str(dir_path))

    added = 0
    restored = 0
    files = sorted([p for p in dir_path.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])

    for file_path in files:
        raw = file_path.read_bytes()
        if not raw:
            continue
        data = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            continue

        image_id = hashlib.sha1(raw).hexdigest()
        rec = ImageRecord(str(file_path), img, image_id=image_id)
        if state.restore_corners(rec):
            restored += 1
            state.add_log(f"恢复角点：{rec.name} ({len(rec.corners)} 个)", 'ok')

        state.images.append(rec)
        added += 1

    state.add_log(f"加载目录：{dir_path}，图片 {added} 张，恢复 {restored} 张", 'info')
    state.persist_corner_cache()
    return added, restored


def _undistort_with_result(img_bgr: np.ndarray) -> np.ndarray:
    """Undistort one image using current calibration result."""
    if state.calib_result is None:
        raise ValueError('请先完成标定')

    result = state.calib_result
    h, w = img_bgr.shape[:2]

    if result.get('fisheye_K') and result.get('fisheye_D'):
        K = np.array(result['fisheye_K'], dtype=np.float64)
        D = np.array(result['fisheye_D'], dtype=np.float64).reshape(-1, 1)
        nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (w, h), np.eye(3), balance=0.0
        )
        # Force principal point to stay close to original calibration center.
        nK[0, 2] = K[0, 2]
        nK[1, 2] = K[1, 2]
        m1, m2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), nK, (w, h), cv2.CV_16SC2
        )
        return cv2.remap(img_bgr, m1, m2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    if result.get('K') and result.get('dist'):
        K = np.array(result['K'], dtype=np.float64)
        D = np.array(result['dist'], dtype=np.float64)
        nK, _ = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 1.0)
        return cv2.undistort(img_bgr, K, D, None, nK)

    raise ValueError('标定参数不完整')


def register_routes(app: Flask) -> None:
    """Register all application routes."""

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/api/load_dir', methods=['POST'])
    def api_load_dir():
        data = request.json or {}
        dir_path = (data.get('dir_path') or '').strip()
        if not dir_path:
            return jsonify({'ok': False, 'error': '请输入图片目录路径'})

        p = Path(dir_path).expanduser()
        if not p.exists() or not p.is_dir():
            return jsonify({'ok': False, 'error': f'目录不存在: {p}'})

        try:
            added, restored = _load_images_from_dir(p)
        except Exception as e:
            return jsonify({'ok': False, 'error': f'读取目录失败: {e}'})

        if added == 0:
            return jsonify({'ok': False, 'error': '目录中未找到可用图片'})

        return jsonify({
            'ok': True,
            'added': added,
            'restored': restored,
            'cols': state.cols,
            'rows': state.rows,
            'square_size': state.square_size,
            'image_dir': str(p)
        })

    @app.route('/api/pick_dir', methods=['POST'])
    def api_pick_dir():
        """Open native folder picker and return selected directory."""
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            selected = filedialog.askdirectory(title='选择标定图片目录')
            root.destroy()
        except Exception as e:
            return jsonify({'ok': False, 'error': f'无法打开目录选择器: {e}'})

        if not selected:
            return jsonify({'ok': False, 'error': '未选择目录'})
        return jsonify({'ok': True, 'dir_path': selected})

    @app.route('/api/upload', methods=['POST'])
    def api_upload():
        files = request.files.getlist('files')
        added = 0
        restored = 0

        for f in files:
            if not f.filename:
                continue

            raw = f.read()
            data = np.frombuffer(raw, np.uint8)
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if img is None:
                continue

            image_id = hashlib.sha1(raw).hexdigest()
            rec = ImageRecord(f.filename, img, image_id=image_id)
            if state.restore_corners(rec):
                restored += 1
                state.add_log(f"恢复角点：{rec.name} ({len(rec.corners)} 个)", 'ok')

            state.images.append(rec)
            added += 1
            state.add_log(f"上传：{rec.name} ({rec.w}×{rec.h})", 'info')

        return jsonify({'ok': True, 'added': added, 'restored': restored})

    @app.route('/api/images')
    def api_images():
        out = []
        for rec in state.images:
            d = rec.to_dict(state.cols, state.rows)
            d['thumb_b64'] = render_thumbnail(rec, 80)
            out.append(d)
        return jsonify({'images': out})

    @app.route('/api/image/<int:idx>')
    def api_image(idx: int):
        if not (0 <= idx < len(state.images)):
            return jsonify({'ok': False, 'error': 'index out of range'})

        rec = state.images[idx]
        corners = rec.corners.tolist() if rec.corners is not None else []
        return jsonify({
            'ok': True,
            'w': rec.w,
            'h': rec.h,
            'img_b64': image_to_base64(rec.img_bgr),
            'corners': corners
        })

    @app.route('/api/corners/<int:idx>', methods=['POST'])
    def api_set_corners(idx: int):
        if not (0 <= idx < len(state.images)):
            return jsonify({'ok': False})

        pts = (request.json or {}).get('corners', [])
        rec = state.images[idx]

        if pts:
            rec.corners = np.array(pts, dtype=np.float32)
            rec.detected = True
        else:
            rec.corners = None
            rec.detected = False

        state.save_corners(rec)
        return jsonify({'ok': True})

    @app.route('/api/detect/<int:idx>', methods=['POST'])
    def api_detect(idx: int):
        if not (0 <= idx < len(state.images)):
            return jsonify({'ok': False, 'error': 'index out of range'})

        data = request.json or {}
        state.cols = int(data.get('cols', state.cols))
        state.rows = int(data.get('rows', state.rows))

        rec = state.images[idx]
        corners = detect_corners_cv(rec.img_bgr, state.cols, state.rows)
        rec.corners = corners
        rec.detected = True
        state.save_corners(rec)

        found = corners is not None
        state.add_log(
            f"{'检测到' if found else '未检测到'} {len(corners) if found else 0} 角点：{rec.name}",
            'ok' if found else 'warn'
        )

        return jsonify({'found': found, 'corners': corners.tolist() if found else []})

    @app.route('/api/detect_all', methods=['POST'])
    def api_detect_all():
        data = request.json or {}
        state.cols = int(data.get('cols', state.cols))
        state.rows = int(data.get('rows', state.rows))

        ok_count = 0
        for rec in state.images:
            corners = detect_corners_cv(rec.img_bgr, state.cols, state.rows)
            rec.corners = corners
            rec.detected = True
            state.save_corners(rec)
            if corners is not None:
                ok_count += 1

        if not state.images:
            state.persist_corner_cache()

        state.add_log(f"批量检测：{ok_count}/{len(state.images)} 成功", 'ok')
        return jsonify({'ok': ok_count, 'total': len(state.images)})

    @app.route('/api/calibrate', methods=['POST'])
    def api_calibrate():
        state.square_size = float((request.json or {}).get('square_size', 25.0))

        try:
            state.persist_corner_cache()
            result = run_calibration()
            report_b64 = render_report_png(result)

            os.makedirs(state.output_dir, exist_ok=True)
            export_json(result, state.output_dir)
            export_yaml(result, state.output_dir)

            return jsonify({'ok': True, 'result': result, 'report_b64': report_b64})
        except Exception as e:
            state.add_log(f"标定失败：{e}", 'err')
            return jsonify({'ok': False, 'error': str(e)})

    @app.route('/api/undistort_preview/<int:idx>')
    def api_undistort_preview(idx: int):
        if state.calib_result is None:
            return jsonify({'ok': False, 'error': '请先完成标定'})
        if not (0 <= idx < len(state.images)):
            return jsonify({'ok': False, 'error': 'index out of range'})

        rec = state.images[idx]
        try:
            undist = _undistort_with_result(rec.img_bgr)
        except Exception as e:
            return jsonify({'ok': False, 'error': f'矫正失败: {e}'})

        return jsonify({
            'ok': True,
            'orig_b64': image_to_base64(rec.img_bgr),
            'undist_b64': image_to_base64(undist),
            'name': rec.name
        })

    @app.route('/api/export/<fmt>')
    def api_export(fmt: str):
        if state.calib_result is None:
            abort(404)

        result = state.calib_result
        os.makedirs(state.output_dir, exist_ok=True)

        if fmt == 'json':
            return send_file(
                export_json(result, state.output_dir),
                as_attachment=True,
                download_name='calibration_params.json',
                mimetype='application/json'
            )
        if fmt == 'yaml':
            return send_file(
                export_yaml(result, state.output_dir),
                as_attachment=True,
                download_name='calibration.yaml',
                mimetype='text/plain'
            )
        abort(400)

    @app.route('/api/log')
    def api_log():
        return jsonify({'log': state.get_log(30)})

    @app.route('/api/clear', methods=['POST'])
    def api_clear():
        state.clear()
        return jsonify({'ok': True})

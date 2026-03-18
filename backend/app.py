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
            state.add_log(state.tr('restored_corners_log', name=rec.name, count=len(rec.corners)), 'ok')

        state.images.append(rec)
        added += 1

    state.add_log(state.tr('load_dir_log', dir=dir_path, added=added, restored=restored), 'info')
    state.persist_corner_cache()
    return added, restored


def _undistort_with_result(
    img_bgr: np.ndarray,
    balance_override: float | None = None,
    out_scale: float = 1.0,
    focal_scale: float = 1.0,
    principal_offset: tuple[float, float] = (0.0, 0.0),
    crop_enabled: bool = False,
    crop_rect: tuple[float, float, float, float] | None = None,
) -> tuple[np.ndarray, dict]:
    """Undistort one image using current calibration result."""
    if state.calib_result is None:
        raise ValueError(state.tr('need_calib'))

    result = state.calib_result
    h, w = img_bgr.shape[:2]
    out_scale = float(np.clip(out_scale, 0.5, 3.0))
    focal_scale = float(np.clip(focal_scale, 0.4, 2.5))
    out_w = max(1, int(round(w * out_scale)))
    out_h = max(1, int(round(h * out_scale)))
    out_size = (out_w, out_h)
    cx_offset = float(np.clip(principal_offset[0], -out_w, out_w))
    cy_offset = float(np.clip(principal_offset[1], -out_h, out_h))
    preferred_model = result.get('preferred_model')
    fisheye_balance = float(result.get('fisheye_balance', 0.6))
    if balance_override is not None:
        fisheye_balance = float(np.clip(balance_override, 0.0, 1.0))

    if crop_rect is None:
        crop_rect = (0.05, 0.05, 0.90, 0.90)
    cx, cy, cw, ch = crop_rect
    cx = float(np.clip(cx, 0.0, 0.99))
    cy = float(np.clip(cy, 0.0, 0.99))
    cw = float(np.clip(cw, 0.01, 1.0 - cx))
    ch = float(np.clip(ch, 0.01, 1.0 - cy))
    crop_px = {
        'x': int(round(cx * out_w)),
        'y': int(round(cy * out_h)),
        'w': max(1, int(round(cw * out_w))),
        'h': max(1, int(round(ch * out_h))),
    }

    if preferred_model == 'fisheye' and result.get('fisheye_K') and result.get('fisheye_D'):
        K = np.array(result['fisheye_K'], dtype=np.float64)
        D = np.array(result['fisheye_D'], dtype=np.float64).reshape(-1, 1)
        nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (w, h), np.eye(3), None, fisheye_balance, out_size
        )
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        m1, m2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), nK, out_size, cv2.CV_16SC2
        )
        undist = cv2.remap(img_bgr, m1, m2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    elif preferred_model == 'standard' and result.get('K') and result.get('dist'):
        K = np.array(result['K'], dtype=np.float64)
        D = np.array(result['dist'], dtype=np.float64)
        nK, _ = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 0.0, out_size)
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        undist = cv2.undistort(img_bgr, K, D, None, nK)
    elif result.get('fisheye_K') and result.get('fisheye_D'):
        K = np.array(result['fisheye_K'], dtype=np.float64)
        D = np.array(result['fisheye_D'], dtype=np.float64).reshape(-1, 1)
        nK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (w, h), np.eye(3), None, fisheye_balance, out_size
        )
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        m1, m2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), nK, out_size, cv2.CV_16SC2
        )
        undist = cv2.remap(img_bgr, m1, m2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        preferred_model = 'fisheye'
    elif result.get('K') and result.get('dist'):
        K = np.array(result['K'], dtype=np.float64)
        D = np.array(result['dist'], dtype=np.float64)
        nK, _ = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 0.0, out_size)
        nK[0, 0] *= focal_scale
        nK[1, 1] *= focal_scale
        nK[0, 2] += cx_offset
        nK[1, 2] += cy_offset
        undist = cv2.undistort(img_bgr, K, D, None, nK)
        preferred_model = 'standard'
    else:
        raise ValueError(state.tr('incomplete_params'))

    if crop_enabled:
        x0 = int(np.clip(crop_px['x'], 0, undist.shape[1] - 1))
        y0 = int(np.clip(crop_px['y'], 0, undist.shape[0] - 1))
        x1 = int(np.clip(x0 + crop_px['w'], x0 + 1, undist.shape[1]))
        y1 = int(np.clip(y0 + crop_px['h'], y0 + 1, undist.shape[0]))
        undist = undist[y0:y1, x0:x1]

    meta = {
        'preferred_model': preferred_model,
        'balance': fisheye_balance,
        'out_scale': out_scale,
        'focal_scale': focal_scale,
        'cx_offset': cx_offset,
        'cy_offset': cy_offset,
        'crop_enabled': bool(crop_enabled),
        'crop_rect': crop_px,
    }
    return undist, meta


def register_routes(app: Flask) -> None:
    """Register all application routes."""

    @app.before_request
    def _sync_lang():
        state.set_lang(request.headers.get('X-Lang'))

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/api/load_dir', methods=['POST'])
    def api_load_dir():
        data = request.json or {}
        dir_path = (data.get('dir_path') or '').strip()
        if not dir_path:
            return jsonify({'ok': False, 'error': state.tr('input_dir_required')})

        p = Path(dir_path).expanduser()
        if not p.exists() or not p.is_dir():
            return jsonify({'ok': False, 'error': state.tr('dir_not_exists', path=p)})

        try:
            added, restored = _load_images_from_dir(p)
        except Exception as e:
            return jsonify({'ok': False, 'error': state.tr('dir_read_failed', err=e)})

        if added == 0:
            return jsonify({'ok': False, 'error': state.tr('no_images_found')})

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
            selected = filedialog.askdirectory(title=state.tr('pick_dir_title'))
            root.destroy()
        except Exception as e:
            return jsonify({'ok': False, 'error': state.tr('pick_dir_failed', err=e)})

        if not selected:
            return jsonify({'ok': False, 'error': state.tr('dir_not_selected'), 'cancelled': True})
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
                state.add_log(state.tr('restored_corners_log', name=rec.name, count=len(rec.corners)), 'ok')

            state.images.append(rec)
            added += 1
            state.add_log(state.tr('upload_log', name=rec.name, w=rec.w, h=rec.h), 'info')

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
            state.tr('detect_found_log', count=len(corners), name=rec.name)
            if found else state.tr('detect_not_found_log', name=rec.name),
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

        state.add_log(state.tr('detect_all_log', ok=ok_count, total=len(state.images)), 'ok')
        return jsonify({'ok': ok_count, 'total': len(state.images)})

    @app.route('/api/calibrate', methods=['POST'])
    def api_calibrate():
        payload = request.json or {}
        state.square_size = float(payload.get('square_size', 25.0))
        calibration_mode = (payload.get('calibration_mode') or 'fisheye').strip().lower()

        try:
            state.persist_corner_cache()
            result = run_calibration(calibration_mode)
            report_b64 = render_report_png(result)

            os.makedirs(state.output_dir, exist_ok=True)
            export_json(result, state.output_dir)
            export_yaml(result, state.output_dir)

            return jsonify({'ok': True, 'result': result, 'report_b64': report_b64})
        except Exception as e:
            state.add_log(state.tr('calibrate_failed_log', err=e), 'err')
            return jsonify({'ok': False, 'error': str(e)})

    @app.route('/api/undistort_preview/<int:idx>')
    def api_undistort_preview(idx: int):
        if state.calib_result is None:
            return jsonify({'ok': False, 'error': state.tr('need_calib')})
        if not (0 <= idx < len(state.images)):
            return jsonify({'ok': False, 'error': 'index out of range'})

        rec = state.images[idx]
        try:
            balance_arg = request.args.get('balance', default=None, type=float)
            out_scale = request.args.get('out_scale', default=1.0, type=float)
            focal_scale = request.args.get('focal_scale', default=1.0, type=float)
            cx_offset = request.args.get('cx_offset', default=0.0, type=float)
            cy_offset = request.args.get('cy_offset', default=0.0, type=float)
            crop_enabled = bool(request.args.get('crop_enable', default=0, type=int))
            crop_x = request.args.get('crop_x', default=0.05, type=float)
            crop_y = request.args.get('crop_y', default=0.05, type=float)
            crop_w = request.args.get('crop_w', default=0.90, type=float)
            crop_h = request.args.get('crop_h', default=0.90, type=float)
            undist, meta = _undistort_with_result(
                rec.img_bgr,
                balance_override=balance_arg,
                out_scale=out_scale,
                focal_scale=focal_scale,
                principal_offset=(cx_offset, cy_offset),
                crop_enabled=crop_enabled,
                crop_rect=(crop_x, crop_y, crop_w, crop_h),
            )
        except Exception as e:
            return jsonify({'ok': False, 'error': state.tr('undistort_failed', err=e)})

        return jsonify({
            'ok': True,
            'orig_b64': image_to_base64(rec.img_bgr),
            'undist_b64': image_to_base64(undist),
            'name': rec.name,
            'meta': meta
        })

    @app.route('/api/save_preview_params', methods=['POST'])
    def api_save_preview_params():
        if state.calib_result is None:
            return jsonify({'ok': False, 'error': state.tr('need_calib')})

        result = state.calib_result
        if not result.get('fisheye_K') or not result.get('fisheye_D'):
            return jsonify({'ok': False, 'error': state.tr('no_fisheye_params')})

        data = request.json or {}
        try:
            preview_params = {
                'balance': float(np.clip(float(data.get('balance', result.get('fisheye_balance', 0.6))), 0.0, 1.0)),
                'out_scale': float(np.clip(float(data.get('out_scale', 1.0)), 0.5, 3.0)),
                'focal_scale': float(np.clip(float(data.get('focal_scale', 1.0)), 0.4, 2.5)),
                'crop_enable': bool(int(data.get('crop_enable', 0))),
                'crop_x': float(np.clip(float(data.get('crop_x', 0.05)), 0.0, 0.99)),
                'crop_y': float(np.clip(float(data.get('crop_y', 0.05)), 0.0, 0.99)),
                'crop_w': float(np.clip(float(data.get('crop_w', 0.90)), 0.01, 1.0)),
                'crop_h': float(np.clip(float(data.get('crop_h', 0.90)), 0.01, 1.0)),
                'cx_offset': float(np.clip(float(data.get('cx_offset', 0.0)), -5000.0, 5000.0)),
                'cy_offset': float(np.clip(float(data.get('cy_offset', 0.0)), -5000.0, 5000.0)),
            }
        except Exception:
            return jsonify({'ok': False, 'error': state.tr('invalid_param')})

        result['fisheye_balance'] = preview_params['balance']
        result['preview_params'] = preview_params
        state.calib_result = result

        os.makedirs(state.output_dir, exist_ok=True)
        export_json(result, state.output_dir)
        export_yaml(result, state.output_dir)
        state.add_log(state.tr(
            'save_preview_log',
            balance=preview_params['balance'],
            out_scale=preview_params['out_scale'],
            focal_scale=preview_params['focal_scale']
        ), 'ok')

        return jsonify({'ok': True, 'preview_params': preview_params})

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

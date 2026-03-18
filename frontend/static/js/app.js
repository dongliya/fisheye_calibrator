// ═════════════════════════════════════════════════════════
//  Fisheye Calibrator - Frontend Application
// ═════════════════════════════════════════════════════════

// ══ State ════════════════════════════════════════════════
let images = [];
let curIdx = -1;
let corners = [];       // [{x,y}, ...] local copy
let imgW = 1, imgH = 1;
let zoom = 1.0;
let mode = 'view';      // view | add | del | num
let dragging = -1;
let showLabels = true;
let calResult = null;
let reportB64 = null;
let previewBalanceTimer = null;
let previewCurrentIdx = -1;
let previewLastMeta = null;
let clearConfirmResolver = null;
let currentLang = localStorage.getItem('ui_lang') || 'zh';

// num-mode state
let numTarget = -1;     // index of corner being edited

// pan state
let isPanning = false;
let panX = 0, panY = 0;
let panStartX = 0, panStartY = 0;
let isSpacePressed = false;

const I18N = {
  zh: {
    title: '鱼眼标定工具',
    app_title: '鱼眼矫正标定工具',
    images_count: '{n} 张图片',
    valid_count: '{n} 有效',
    image_list: '图片列表',
    load_images: '输入图片目录并加载',
    load_desc: '支持 JPG / PNG / BMP 等常见格式',
    dir_placeholder: '例如: /workspace/code/image/fisheye',
    pick_dir: '选择目录',
    detect_all: '批量检测',
    calibrate_btn: '计算标定',
    clear_all: '🗑 清空全部',
    mode: '模式',
    move: '👁 移动',
    add: '＋ 添加',
    del: '✕ 删除',
    edit_num: '# 编辑序号',
    auto_detect: '🔍 自动检测',
    flip: '↩ 翻转',
    label_on: '🏷 序号 ✓',
    label_off: '🏷 序号',
    clear: '🗑 清除',
    pan_hint: '🖱 中键拖动 | 空格 + 拖动',
    fit_window: '适应窗口',
    label_image: '图片',
    label_size: '尺寸',
    label_corner: '角点',
    label_coord: '坐标',
    current_image: '当前图像',
    status: '状态',
    corners: '角点',
    valid_images: '有效图片',
    calib_params: '标定参数',
    status_unselected: '未选择',
    calib_results: '标定结果',
    no_calib: '完成检测后点击"计算标定"',
    rms_text: 'pixels RMS 重投影误差',
    model_info: '模型信息',
    calib_mode: '标定模式',
    active_model: '使用模型',
    mat_title_standard: '内参矩阵 K',
    mat_title_fisheye: '鱼眼内参矩阵 fisheye_K',
    dist_title_standard: '标准畸变',
    dist_title_fisheye: '鱼眼系数',
    report: '查看标定报告',
    export_json: '导出 JSON',
    export_yaml: '导出 YAML',
    preview: '参数矫正预览',
    pick_and_preview: '选择并矫正',
    prev: '上一张',
    next: '下一张',
    save_params: '保存参数',
    close: '关闭',
    pop_title: '编辑序号',
    clear_confirm_title: '确认清空全部',
    clear_confirm_message: '确定要清空所有 {n} 张图片吗？此操作不可恢复。',
    clear_confirm_cancel: '取消',
    clear_confirm_ok: '确认清空',
    model_standard: '标准模型',
    model_fisheye: '鱼眼模型',
    mode_hint_view: '移动模式 — 拖拽角点调位置，拖到底部边缘删除',
    mode_hint_add: '添加模式 — 点击图像添加新角点',
    mode_hint_del: '删除模式 — 点击最近角点删除',
    mode_hint_num: '编辑序号 — 点击角点输入新序号，与目标互换',
    coord_label: '坐标',
    target_index: '目标序号',
    swap_hint: '与目标序号的点互换位置（范围 0–{max}）',
    idx_range: '序号须在 0–{max} 范围内',
    idx_swapped: '已将序号 {a} ↔ {b} 互换',
    flipped: '已翻转角点顺序（0↔末尾）',
    detect_running: '自动检测…',
    detect_ok: '检测到 {n} 角点',
    detect_fail: '未检测到棋盘',
    detect_all_running: '批量检测…',
    detect_all_done: '批量检测：{ok}/{total} 成功',
    no_images_to_clear: '没有图片可清空',
    images_cleared: '已清空所有图片',
    calibrating: '计算标定…',
    calib_done: '标定完成！{model} RMS={rms}px',
    no_image_option: '无图片',
    need_calib: '请先完成标定',
    need_select_image: '请先选择图片',
    undistort_failed: '矫正失败',
    preview_title: '矫正预览 - {name}',
    fisheye_only_save: '仅鱼眼模型支持保存参数',
    save_failed: '保存失败',
    saved_params: '已保存参数',
    export_done: '已导出 .{ext}',
    report_title: '标定报告',
    status_full: '完整 ✓',
    status_partial: '部分 {n}/{exp}',
    status_none: '无角点',
    ready: '就绪，请上传图片',
    load_failed: '目录加载失败',
    select_dir_failed: '目录选择失败',
    need_dir: '请输入图片目录路径',
    loading_dir: '加载目录: {dir}',
    loaded_with_restore: '已加载 {added} 张，恢复角点 {restored} 张',
    loaded_only: '已加载 {added} 张',
    mode_view_title: '拖拽角点移位，下拉删除',
    mode_add_title: '点击添加新角点',
    mode_del_title: '点击删除最近角点',
    mode_num_title: '点击角点修改其序号',
    flip_title: '翻转顺序 (0↔末尾)',
    label_title: '显示/隐藏序号',
    tool_canvas_title: '画布与主点',
    tool_crop_title: '裁剪参数',
    crop_enable: '启用 crop',
    crop_note: '未启用时在矫正图显示虚线框'
  },
  en: {
    title: 'Fisheye Calibrator',
    app_title: 'Fisheye Calibration Tool',
    images_count: '{n} Images',
    valid_count: '{n} Valid',
    image_list: 'Image List',
    load_images: 'Enter image directory and load',
    load_desc: 'Supports JPG / PNG / BMP and more',
    dir_placeholder: 'e.g. /workspace/code/image/fisheye',
    pick_dir: 'Choose Folder',
    detect_all: 'Detect All',
    calibrate_btn: 'Calibrate',
    clear_all: '🗑 Clear All',
    mode: 'Mode',
    move: '👁 Move',
    add: '＋ Add',
    del: '✕ Delete',
    edit_num: '# Edit Index',
    auto_detect: '🔍 Auto Detect',
    flip: '↩ Flip',
    label_on: '🏷 Labels ✓',
    label_off: '🏷 Labels',
    clear: '🗑 Clear',
    pan_hint: '🖱 Middle-drag | Space + drag',
    fit_window: 'Fit to window',
    label_image: 'Image',
    label_size: 'Size',
    label_corner: 'Corners',
    label_coord: 'Coord',
    current_image: 'Current Image',
    status: 'Status',
    corners: 'Corners',
    valid_images: 'Valid Images',
    calib_params: 'Calibration Parameters',
    status_unselected: 'Unselected',
    calib_results: 'Calibration Results',
    no_calib: 'Detect corners and click "Calibrate"',
    rms_text: 'pixels RMS reprojection error',
    model_info: 'Model Info',
    calib_mode: 'Calibration Mode',
    active_model: 'Active Model',
    mat_title_standard: 'Intrinsic Matrix K',
    mat_title_fisheye: 'Fisheye Intrinsic Matrix fisheye_K',
    dist_title_standard: 'Standard Distortion',
    dist_title_fisheye: 'Fisheye Coefficients',
    report: 'View Report',
    export_json: 'Export JSON',
    export_yaml: 'Export YAML',
    preview: 'Undistortion Preview',
    pick_and_preview: 'Select & Preview',
    prev: 'Prev',
    next: 'Next',
    save_params: 'Save Params',
    close: 'Close',
    pop_title: 'Edit Index',
    clear_confirm_title: 'Confirm Clear All',
    clear_confirm_message: 'Clear all {n} images? This cannot be undone.',
    clear_confirm_cancel: 'Cancel',
    clear_confirm_ok: 'Clear',
    model_standard: 'Standard Model',
    model_fisheye: 'Fisheye Model',
    mode_hint_view: 'Move mode - drag points; drag to bottom edge to delete',
    mode_hint_add: 'Add mode - click image to add points',
    mode_hint_del: 'Delete mode - click nearest point to remove',
    mode_hint_num: 'Index mode - click point to swap index',
    coord_label: 'Coord',
    target_index: 'Target Index',
    swap_hint: 'Swap with target index (range 0-{max})',
    idx_range: 'Index must be in range 0-{max}',
    idx_swapped: 'Swapped index {a} ↔ {b}',
    flipped: 'Corner order flipped (0↔last)',
    detect_running: 'Detecting...',
    detect_ok: 'Detected {n} corners',
    detect_fail: 'Chessboard not found',
    detect_all_running: 'Batch detecting...',
    detect_all_done: 'Batch detect: {ok}/{total} success',
    no_images_to_clear: 'No images to clear',
    images_cleared: 'All images cleared',
    calibrating: 'Calibrating...',
    calib_done: 'Calibration done! {model} RMS={rms}px',
    no_image_option: 'No Images',
    need_calib: 'Please calibrate first',
    need_select_image: 'Please select an image',
    undistort_failed: 'Undistortion failed',
    preview_title: 'Undistort Preview - {name}',
    fisheye_only_save: 'Save is available only for fisheye model',
    save_failed: 'Save failed',
    saved_params: 'Parameters saved',
    export_done: 'Exported .{ext}',
    report_title: 'Calibration Report',
    status_full: 'Complete ✓',
    status_partial: 'Partial {n}/{exp}',
    status_none: 'No corners',
    ready: 'Ready, load images to start',
    load_failed: 'Failed to load directory',
    select_dir_failed: 'Failed to pick directory',
    need_dir: 'Please input image directory',
    loading_dir: 'Loading directory: {dir}',
    loaded_with_restore: 'Loaded {added}; restored corners for {restored}',
    loaded_only: 'Loaded {added} images',
    mode_view_title: 'Drag corners to move; drag down to delete',
    mode_add_title: 'Click to add new corner',
    mode_del_title: 'Click nearest corner to delete',
    mode_num_title: 'Click corner to edit index',
    flip_title: 'Reverse order (0↔last)',
    label_title: 'Show/hide labels',
    tool_canvas_title: 'Canvas & Principal Point',
    tool_crop_title: 'Crop Parameters',
    crop_enable: 'Enable crop',
    crop_note: 'Show dashed crop box when crop is disabled'
  }
};

if (currentLang !== 'zh' && currentLang !== 'en') currentLang = 'zh';

function t(key, vars = {}) {
  const dict = I18N[currentLang] || I18N.zh;
  const tpl = dict[key] ?? I18N.zh[key] ?? key;
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

function modelLabel(model) {
  return model === 'fisheye' ? t('model_fisheye') : t('model_standard');
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const reqUrl = typeof input === 'string' ? input : (input?.url || '');
  const sameOrigin =
    reqUrl.startsWith('/') ||
    reqUrl.startsWith(window.location.origin) ||
    reqUrl === '';
  if (!sameOrigin) return nativeFetch(input, init);

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  headers.set('X-Lang', currentLang === 'en' ? 'en' : 'zh');
  return nativeFetch(input, { ...init, headers });
};

function updateI18nUI() {
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
  document.title = t('title');
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  const setTitle = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.title = v;
  };

  setText('appTitleText', t('app_title'));
  setText('phImages', t('image_list'));
  setText('upzoneStrong', t('load_images'));
  setText('upzoneDesc', t('load_desc'));
  setText('ilistEmpty', t('load_images'));
  setText('btPickDir', t('pick_dir'));
  setText('btDA', t('detect_all'));
  setText('btCal', t('calibrate_btn'));
  setText('btClearAll', t('clear_all'));
  setText('modeLabel', t('mode'));
  setText('mV', t('move'));
  setText('mA', t('add'));
  setText('mD', t('del'));
  setText('mN', t('edit_num'));
  setText('btDet', t('auto_detect'));
  setText('btFlip', t('flip'));
  setText('btClr', t('clear'));
  setText('panHint', t('pan_hint'));
  setText('emptyHint', t('load_images'));
  setText('lblImg', t('label_image'));
  setText('lblSize', t('label_size'));
  setText('lblCornerNum', t('label_corner'));
  setText('lblCoord', t('label_coord'));
  setText('phParams', t('calib_params'));
  setText('stCurrentImage', t('current_image'));
  setText('lblStatus', t('status'));
  setText('lblCorners', t('corners'));
  setText('lblValidImages', t('valid_images'));
  setText('stCalibResults', t('calib_results'));
  setText('rmsText', t('rms_text'));
  setText('rtitleModelInfo', t('model_info'));
  setText('lblCalMode', t('calib_mode'));
  setText('lblActiveModel', t('active_model'));
  setText('rtitlePreview', t('preview'));
  setText('btReport', t('report'));
  setText('btExportJson', t('export_json'));
  setText('btExportYaml', t('export_yaml'));
  setText('btPreview', t('pick_and_preview'));
  setText('btPrevImg', t('prev'));
  setText('btNextImg', t('next'));
  setText('modalSaveBtn', t('save_params'));
  setText('modalCloseBtn', t('close'));
  setText('clearConfirmTitle', t('clear_confirm_title'));
  setText('clearConfirmMsg', t('clear_confirm_message', { n: images.length || 0 }));
  setText('clearCancelBtn', t('clear_confirm_cancel'));
  setText('clearOkBtn', t('clear_confirm_ok'));
  setText('popTitleText', t('pop_title'));
  setText('popTargetLabel', t('target_index'));
  setText('modalOrigLabel', currentLang === 'en' ? 'Original' : '原图');
  setText('modalRectLabel', currentLang === 'en' ? 'Undistorted' : '矫正图');
  setText('toolCanvasTitle', t('tool_canvas_title'));
  setText('toolCropTitle', t('tool_crop_title'));
  setText('udCropEnableText', t('crop_enable'));
  setText('cropNoteText', t('crop_note'));
  setText('pSt', t('status_unselected'));
  setText('noCalib', t('no_calib'));
  setText('matTitle', t('mat_title_standard'));
  setText('distTitle', t('dist_title_standard'));

  const dirInput = document.getElementById('dirPath');
  if (dirInput) dirInput.placeholder = t('dir_placeholder');
  setTitle('mV', t('mode_view_title'));
  setTitle('mA', t('mode_add_title'));
  setTitle('mD', t('mode_del_title'));
  setTitle('mN', t('mode_num_title'));
  setTitle('btFlip', t('flip_title'));
  setTitle('btLabel', t('label_title'));
  setTitle('btFit', t('fit_window'));

  const modeEl = document.getElementById('calMode');
  if (modeEl?.options?.length >= 2) {
    modeEl.options[0].text = t('model_standard');
    modeEl.options[1].text = t('model_fisheye');
  }

  updateHeader();
  setMode(mode);
  updateLabelButtonText();
  updateCornerUI();
  updateUndistortSelector();
}

function getPreviewBalance() {
  const el = document.getElementById('udBalance');
  const v = Number.parseFloat(el?.value ?? '0.6');
  if (!Number.isFinite(v)) return 0.6;
  return Math.min(1.0, Math.max(0.0, v));
}

function updatePreviewBalanceLabel() {
  const v = getPreviewBalance();
  const label = document.getElementById('udBalanceVal');
  if (label) label.textContent = v.toFixed(2);
}

function getPreviewParamNumber(id, fallback, min, max) {
  const el = document.getElementById(id);
  const v = Number.parseFloat(el?.value ?? `${fallback}`);
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function getPreviewParams() {
  return {
    balance: getPreviewBalance(),
    out_scale: getPreviewParamNumber('udOutScale', 1.0, 0.5, 3.0),
    focal_scale: getPreviewParamNumber('udFocalScale', 1.0, 0.4, 2.5),
    crop_enable: document.getElementById('udCropEnable')?.checked ? 1 : 0,
    crop_x: getPreviewParamNumber('udCropX', 0.05, 0.0, 0.99),
    crop_y: getPreviewParamNumber('udCropY', 0.05, 0.0, 0.99),
    crop_w: getPreviewParamNumber('udCropW', 0.90, 0.01, 1.0),
    crop_h: getPreviewParamNumber('udCropH', 0.90, 0.01, 1.0),
    cx_offset: getPreviewParamNumber('udCxOffset', 0.0, -2000, 2000),
    cy_offset: getPreviewParamNumber('udCyOffset', 0.0, -2000, 2000)
  };
}

function setPreviewParams(params = {}) {
  const num = (v, fallback) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  };

  setVal('udBalance', num(params.balance, 0.6).toFixed(2));
  setVal('udOutScale', num(params.out_scale, 1.0).toFixed(2));
  setVal('udFocalScale', num(params.focal_scale, 1.0).toFixed(2));
  setVal('udCropX', num(params.crop_x, 0.05).toFixed(2));
  setVal('udCropY', num(params.crop_y, 0.05).toFixed(2));
  setVal('udCropW', num(params.crop_w, 0.90).toFixed(2));
  setVal('udCropH', num(params.crop_h, 0.90).toFixed(2));
  setVal('udCxOffset', num(params.cx_offset, 0.0).toFixed(0));
  setVal('udCyOffset', num(params.cy_offset, 0.0).toFixed(0));
  const cropEl = document.getElementById('udCropEnable');
  if (cropEl) cropEl.checked = Boolean(Number(params.crop_enable || 0));
  updatePreviewBalanceLabel();
}

function updatePreviewNavInfo() {
  const total = images.length;
  const info = document.getElementById('udNavInfo');
  if (!info) return;
  if (previewCurrentIdx < 0 || total === 0) {
    info.textContent = '-/-';
  } else {
    info.textContent = `${previewCurrentIdx + 1}/${total}`;
  }
}

function updateCropOverlay() {
  const box = document.getElementById('modalCropRect');
  const img = document.getElementById('modalRectImg');
  if (!box || !img || !previewLastMeta) return;
  if (previewLastMeta.preferred_model !== 'fisheye') {
    box.style.display = 'none';
    return;
  }
  if (previewLastMeta.crop_enabled || !previewLastMeta.crop_rect) {
    box.style.display = 'none';
    return;
  }
  const natW = img.naturalWidth || 0;
  const natH = img.naturalHeight || 0;
  const dispW = img.clientWidth || 0;
  const dispH = img.clientHeight || 0;
  if (!natW || !natH || !dispW || !dispH) {
    box.style.display = 'none';
    return;
  }
  const r = previewLastMeta.crop_rect;
  box.style.display = 'block';
  box.style.left = `${(r.x / natW) * dispW}px`;
  box.style.top = `${(r.y / natH) * dispH}px`;
  box.style.width = `${(r.w / natW) * dispW}px`;
  box.style.height = `${(r.h / natH) * dispH}px`;
}

function scheduleBalancePreview() {
  if (!calResult) return;
  const activeModel = calResult.preferred_model || (calResult.fisheye_K ? 'fisheye' : 'standard');
  const sel = document.getElementById('udSel');
  if (!sel || sel.value === '') return;
  if (previewBalanceTimer) clearTimeout(previewBalanceTimer);
  previewBalanceTimer = setTimeout(() => {
    previewUndistort(previewCurrentIdx >= 0 ? previewCurrentIdx : undefined);
  }, 120);
}

const imgEl = document.getElementById('imgEl');
const overlay = document.getElementById('overlay');
const ov = overlay.getContext('2d');
const wrap = document.getElementById('wrap');
const cc = document.getElementById('cc');

// ══ Directory Load ═════════════════════════════════════
async function pickImageDirectory() {
  const r = await fetch('/api/pick_dir', { method: 'POST' });
  const d = await r.json();
  if (!d.ok) {
    if (!d.cancelled) toast(d.error || t('select_dir_failed'), 'warn');
    return;
  }
  const input = document.getElementById('dirPath');
  if (input) input.value = d.dir_path;
  await loadImageDirectory(d.dir_path);
}

async function loadImageDirectory(forcedPath = '') {
  const input = document.getElementById('dirPath');
  const dirPath = (forcedPath || input?.value || '').trim();
  if (!dirPath) return toast(t('need_dir'), 'warn');

  addLog(t('loading_dir', { dir: dirPath }), 'info');
  const r = await fetch('/api/load_dir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir_path: dirPath })
  });
  const d = await r.json();
  if (d.ok) {
    if (Number.isFinite(d.cols)) document.getElementById('cbc').value = d.cols;
    if (Number.isFinite(d.rows)) document.getElementById('cbr').value = d.rows;
    if (Number.isFinite(d.square_size)) document.getElementById('sqsz').value = d.square_size;

    const msg = d.restored > 0
      ? t('loaded_with_restore', { added: d.added, restored: d.restored })
      : t('loaded_only', { added: d.added });
    toast(msg, 'ok');

    await refreshList();
    if (images.length) await selectImage(0);
  } else {
    toast(d.error || t('load_failed'), 'err');
  }
}

const dirPathInput = document.getElementById('dirPath');
dirPathInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadImageDirectory();
});

// ══ Image List ═════════════════════════════════════════
async function refreshList() {
  const r = await fetch('/api/images');
  const d = await r.json();
  images = d.images;
  renderList();
  updateUndistortSelector();
  updateHeader();
  updateCalibBtn();
  updateRightPanel();
}

function renderList() {
  const el = document.getElementById('ilist');
  if (!images.length) {
    el.innerHTML = `<div style="text-align:center;padding:28px 12px;color:var(--tx3);font-size:11px">${t('load_images')}</div>`;
    return;
  }
  el.innerHTML = images.map((im, i) => {
    const bc = { full: 'bok', partial: 'bwarn', failed: 'berr', pending: 'bpend' }[im.status] || 'bpend';
    const bi = { full: '✓', partial: '△', failed: '✗', pending: '?' }[im.status] || '?';
    const src = im.thumb_b64 ? `data:image/jpeg;base64,${im.thumb_b64}` : '';
    return `
      <div class="iitem ${i === curIdx ? 'active' : ''}" onclick="selectImage(${i})">
        ${src ? `<img class="ithumb" src="${src}">` : '<div class="ithumb"></div>'}
        <div class="iinfo">
          <div class="iname" title="${im.name}">${im.name}</div>
          <div class="imeta">${im.w}×${im.h} · ${im.n_corners}/${im.expected}pt</div>
        </div>
        <div class="ibadge ${bc}">${bi}</div>
      </div>
    `;
  }).join('');
  document.getElementById('btDA').disabled = images.length === 0;
}

function updateHeader() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('hImgCnt').textContent = t('images_count', { n: images.length });
  document.getElementById('hOkCnt').textContent = t('valid_count', { n: ok });
  document.getElementById('hOkCnt').classList.toggle('on', ok > 0);
}

function updateCalibBtn() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('btCal').disabled = ok < 3;
}

function updateRightPanel() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('pUs').textContent = `${ok}/${images.length}`;
}

// ══ Select Image ═══════════════════════════════════════
async function selectImage(idx) {
  curIdx = idx;
  closeIdxPop();
  const r = await fetch(`/api/image/${idx}`);
  const d = await r.json();
  if (!d.ok) {
    toast(d.error, 'err');
    return;
  }
  imgW = d.w;
  imgH = d.h;
  corners = d.corners.map(p => ({ x: p[0], y: p[1] }));
  document.getElementById('emptyS').style.display = 'none';
  wrap.style.display = 'inline-block';
  imgEl.src = `data:image/jpeg;base64,${d.img_b64}`;
  imgEl.onload = () => {
    fitZoom();
    redraw();
  };
  document.getElementById('sn').textContent = images[idx].name;
  document.getElementById('ss').textContent = `${d.w}×${d.h}`;
  document.getElementById('btDet').disabled = false;
  document.getElementById('btClr').disabled = false;
  document.getElementById('btFlip').disabled = false;
  const udSel = document.getElementById('udSel');
  if (udSel && idx >= 0) udSel.value = String(idx);
  updateCornerUI();
  renderList();
}

// ══ Zoom ═══════════════════════════════════════════════
function fitZoom() {
  const cc = document.getElementById('cc');
  const pw = cc.clientWidth - 28, ph = cc.clientHeight - 28;
  if (imgW && imgH) {
    zoom = Math.min(1.5, Math.min(pw / imgW, ph / imgH));
    applyZoom();
  }
}

function changeZoom(d) {
  zoom = Math.min(4, Math.max(0.1, zoom + d));
  applyZoom();
}

function changeZoomAt(d, clientX, clientY) {
  const oldZoom = zoom;
  const nextZoom = Math.min(4, Math.max(0.1, zoom + d));
  if (nextZoom === oldZoom) return;

  const rect = overlay.getBoundingClientRect();
  const baseLeft = rect.left - panX;
  const baseTop = rect.top - panY;

  // Image-space point under cursor (clamped)
  const ix = Math.min(imgW, Math.max(0, (clientX - rect.left) / oldZoom));
  const iy = Math.min(imgH, Math.max(0, (clientY - rect.top) / oldZoom));

  zoom = nextZoom;
  applyZoom({ resetPan: false, redrawNow: false });

  // Keep the same image point under the cursor after zoom
  panX = clientX - baseLeft - ix * zoom;
  panY = clientY - baseTop - iy * zoom;
  applyPan();
  redraw();
}

function applyZoom({ resetPan = true, redrawNow = true } = {}) {
  document.getElementById('zlbl').textContent = `${Math.round(zoom * 100)}%`;
  imgEl.style.width = (imgW * zoom) + 'px';
  imgEl.style.height = (imgH * zoom) + 'px';
  overlay.width = imgW * zoom;
  overlay.height = imgH * zoom;
  overlay.style.width = (imgW * zoom) + 'px';
  overlay.style.height = (imgH * zoom) + 'px';
  if (resetPan) {
    panX = 0;
    panY = 0;
  }
  applyPan();
  if (redrawNow) redraw();
}

function applyPan() {
  imgEl.style.transform = `translate(${panX}px, ${panY}px)`;
  overlay.style.transform = `translate(${panX}px, ${panY}px)`;
}

cc.addEventListener('wheel', e => {
  if (wrap.style.display === 'none') return;
  e.preventDefault();
  const d = e.deltaY < 0 ? 0.1 : -0.1;

  // Prefer zooming around the cursor when it's over the image; otherwise zoom around view center.
  const r = overlay.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (inside) {
    changeZoomAt(d, e.clientX, e.clientY);
  } else {
    const ccr = cc.getBoundingClientRect();
    changeZoomAt(d, ccr.left + ccr.width / 2, ccr.top + ccr.height / 2);
  }
}, { passive: false });

// ══ Draw ═══════════════════════════════════════════════
function redraw() {
  ov.clearRect(0, 0, overlay.width, overlay.height);
  if (!corners.length) return;

  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  const n = corners.length, exp = cols_n * rows_n;
  // Fixed dot size - doesn't scale with zoom
  const DOT = 6;
  const LINE_WIDTH = 1.5;

  // Grid lines when complete
  if (n === exp) {
    ov.strokeStyle = 'rgba(0,210,170,.5)';
    ov.lineWidth = LINE_WIDTH;
    for (let row = 0; row < rows_n; row++) {
      ov.beginPath();
      for (let col = 0; col < cols_n; col++) {
        const { x, y } = corners[row * cols_n + col];
        col === 0 ? ov.moveTo(x * zoom, y * zoom) : ov.lineTo(x * zoom, y * zoom);
      }
      ov.stroke();
    }
    for (let col = 0; col < cols_n; col++) {
      ov.beginPath();
      for (let row = 0; row < rows_n; row++) {
        const { x, y } = corners[row * cols_n + col];
        row === 0 ? ov.moveTo(x * zoom, y * zoom) : ov.lineTo(x * zoom, y * zoom);
      }
      ov.stroke();
    }
  }

  // Draw all detected corners (even if incomplete)
  corners.forEach(({ x, y }, i) => {
    const px = x * zoom, py = y * zoom;
    const t = i / Math.max(1, n - 1);
    const rc = Math.round(255 * Math.max(0, 1 - 2 * t));
    const gc = Math.round(255 * Math.min(1, 2 * t));

    // Shadow
    ov.beginPath();
    ov.arc(px, py, DOT + 2.5, 0, Math.PI * 2);
    ov.fillStyle = 'rgba(0,0,0,.55)';
    ov.fill();

    // Dot
    ov.beginPath();
    ov.arc(px, py, DOT, 0, Math.PI * 2);
    ov.fillStyle = `rgb(${rc},${gc},55)`;
    ov.fill();

    // Highlight rings
    if (i === dragging) {
      ov.beginPath();
      ov.arc(px, py, DOT + 5, 0, Math.PI * 2);
      ov.strokeStyle = '#ffcc00';
      ov.lineWidth = 2.5;
      ov.stroke();
    } else if (i === numTarget && mode === 'num') {
      ov.beginPath();
      ov.arc(px, py, DOT + 5, 0, Math.PI * 2);
      ov.strokeStyle = '#7b61ff';
      ov.lineWidth = 2.5;
      ov.stroke();
    } else if (i === 0) {
      ov.beginPath();
      ov.arc(px, py, DOT + 3, 0, Math.PI * 2);
      ov.strokeStyle = 'rgba(0,190,255,.9)';
      ov.lineWidth = 2;
      ov.stroke();
    }

    // White border
    ov.beginPath();
    ov.arc(px, py, DOT, 0, Math.PI * 2);
    ov.strokeStyle = 'rgba(255,255,255,.75)';
    ov.lineWidth = 1.2;
    ov.stroke();

    // Index label
    if (showLabels) {
      const label = String(i);
      const fs = 11;  // Fixed font size
      ov.font = `600 ${fs}px 'JetBrains Mono',monospace`;
      const tw = ov.measureText(label).width;
      const pad = 3, bw = tw + pad * 2 + 2, bh = fs + pad * 2;
      let bx = px + DOT + 2, by = py - DOT - bh;
      if (bx + bw > overlay.width - 4) bx = px - DOT - bw - 2;
      if (by < 2) by = py + DOT + 2;

      ov.fillStyle = (mode === 'num' && i === numTarget)
        ? 'rgba(123,97,255,.92)'
        : 'rgba(10,12,16,.85)';
      ov.beginPath();
      ov.roundRect(bx, by, bw, bh, 4);
      ov.fill();

      ov.strokeStyle = (mode === 'num' && i === numTarget)
        ? 'rgba(180,160,255,.9)'
        : `rgba(${rc + 60 > 255 ? 255 : rc + 60},${gc + 60 > 255 ? 255 : gc + 60},120)`;
      ov.lineWidth = 1;
      ov.beginPath();
      ov.roundRect(bx, by, bw, bh, 4);
      ov.stroke();

      ov.fillStyle = (mode === 'num' && i === numTarget)
        ? '#fff'
        : `rgb(${rc + 60 > 255 ? 255 : rc + 60},${gc + 60 > 255 ? 255 : gc + 60},120)`;
      ov.fillText(label, bx + pad + 1, by + bh - pad - 1);
    }
  });
}

// ══ Mouse Events ═══════════════════════════════════════
// Mouse down for panning (middle button or space+left click)
wrap.addEventListener('mousedown', e => {
  if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    wrap.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', e => {
  if (isPanning) {
    e.preventDefault();
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyPan();
  }
});

document.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    wrap.style.cursor = isSpacePressed ? 'grab' : (mode === 'view' ? 'default' : 'crosshair');
  }
});

overlay.addEventListener('mousemove', e => {
  if (isPanning) return;  // Don't process corner events while panning
  if (curIdx < 0) return;
  const rect = overlay.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const ix = px / zoom, iy = py / zoom;
  document.getElementById('sp').textContent = `${Math.round(ix)}, ${Math.round(iy)}`;
  if (mode === 'add') {
    const ccRect = cc.getBoundingClientRect();
    const cx = e.clientX - ccRect.left;
    const cy = e.clientY - ccRect.top;
    const chH = document.getElementById('chH');
    const chV = document.getElementById('chV');
    const chDot = document.getElementById('chDot');
    chH.style.top = (cc.scrollTop + cy) + 'px';
    chV.style.left = (cc.scrollLeft + cx) + 'px';
    chDot.style.left = (cc.scrollLeft + cx) + 'px';
    chDot.style.top = (cc.scrollTop + cy) + 'px';
  }
  if (dragging >= 0) {
    corners[dragging] = { x: ix, y: iy };
    redraw();
    document.getElementById('delhint').classList.toggle('show', py > overlay.height - 52);
  }
});

overlay.addEventListener('mousedown', e => {
  if (curIdx < 0) return;
  // Keep middle-button drag for panning; only left-click edits corners.
  if (e.button !== 0) return;
  e.preventDefault();
  const rect = overlay.getBoundingClientRect();
  const ix = (e.clientX - rect.left) / zoom, iy = (e.clientY - rect.top) / zoom;
  const hitR = 14 / zoom;

  if (mode === 'view') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const dx = corners[i].x - ix, dy = corners[i].y - iy;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < hitR) {
      dragging = best;
      overlay.style.cursor = 'grabbing';
    }
  } else if (mode === 'add') {
    corners.push({ x: ix, y: iy });
    pushCorners();
    redraw();
    updateCornerUI();
  } else if (mode === 'del') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - ix, corners[i].y - iy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < (7 + 8) / zoom * 2) {
      corners.splice(best, 1);
      pushCorners();
      redraw();
      updateCornerUI();
    }
  } else if (mode === 'num') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - ix, corners[i].y - iy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < (7 + 10) / zoom * 2) {
      openIdxPop(best, e.clientX, e.clientY);
    }
  }
});

overlay.addEventListener('mouseup', e => {
  if (dragging >= 0) {
    const rect = overlay.getBoundingClientRect();
    const py = e.clientY - rect.top;
    if (py > overlay.height - 52) {
      corners.splice(dragging, 1);
    }
    dragging = -1;
    overlay.style.cursor = 'default';
    document.getElementById('delhint').classList.remove('show');
    pushCorners();
    redraw();
    updateCornerUI();
  }
});

overlay.addEventListener('mouseleave', () => {
  document.getElementById('sp').textContent = '—';
});

// ══ Index Edit Popup ═══════════════════════════════════
function openIdxPop(cornerIdx, clientX, clientY) {
  numTarget = cornerIdx;
  const pop = document.getElementById('idxPop');
  const pt = corners[cornerIdx];
  document.getElementById('popBadge').textContent = cornerIdx;
  document.getElementById('popInfo').innerHTML =
    `${t('target_index')}：<b>${cornerIdx}</b> ${t('coord_label')}：<b>${Math.round(pt.x)}, ${Math.round(pt.y)}</b>`;
  const input = document.getElementById('popInput');
  input.max = corners.length - 1;
  input.value = cornerIdx;
  document.getElementById('popHint').textContent =
    t('swap_hint', { max: corners.length - 1 });

  const pw = 220, ph = 180;
  let left = clientX + 12, top = clientY - 20;
  if (left + pw > window.innerWidth - 8) left = clientX - pw - 12;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.classList.add('show');
  input.select();
  redraw();
}

function closeIdxPop() {
  document.getElementById('idxPop').classList.remove('show');
  numTarget = -1;
  redraw();
}

function confirmIdx() {
  if (numTarget < 0) return;
  const input = document.getElementById('popInput');
  const newIdx = parseInt(input.value);
  const n = corners.length;
  if (isNaN(newIdx) || newIdx < 0 || newIdx >= n) {
    toast(t('idx_range', { max: n - 1 }), 'warn');
    return;
  }
  if (newIdx === numTarget) {
    closeIdxPop();
    return;
  }
  const tmp = corners[numTarget];
  corners[numTarget] = corners[newIdx];
  corners[newIdx] = tmp;
  toast(t('idx_swapped', { a: numTarget, b: newIdx }), 'ok');
  pushCorners();
  closeIdxPop();
  redraw();
  updateCornerUI();
}

document.getElementById('popInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmIdx();
  if (e.key === 'Escape') closeIdxPop();
});

// ══ Push Corners ═══════════════════════════════════════
let pushTimer = null;
function pushCorners() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (curIdx < 0) return;
    const pts = corners.map(p => [p.x, p.y]);
    await fetch(`/api/corners/${curIdx}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corners: pts })
    });
    await refreshList();
  }, 300);
}

// ══ Mode ═══════════════════════════════════════════════
function setMode(m) {
  if (m !== 'num') closeIdxPop();
  mode = m;
  cc.classList.toggle('crosshair-on', m === 'add');
  ['mV', 'mA', 'mD', 'mN'].forEach(id => {
    document.getElementById(id).classList.remove('on');
  });
  const mp = { view: 'mV', add: 'mA', del: 'mD', num: 'mN' };
  document.getElementById(mp[m]).classList.add('on');
  const cursors = { view: 'default', add: 'crosshair', del: 'not-allowed', num: 'pointer' };
  const cursor = isSpacePressed ? 'grab' : cursors[m];
  overlay.style.cursor = cursor;
  wrap.style.cursor = isSpacePressed ? 'grab' : cursor;
  const hints = {
    view: t('mode_hint_view'),
    add: t('mode_hint_add'),
    del: t('mode_hint_del'),
    num: t('mode_hint_num')
  };
  document.getElementById('modeHint').textContent = hints[m];
  redraw();
}

// ══ Corner Tools ═══════════════════════════════════════
function updateLabelButtonText() {
  const b = document.getElementById('btLabel');
  if (!b) return;
  b.classList.toggle('on-blue', showLabels);
  b.textContent = showLabels ? t('label_on') : t('label_off');
}

function toggleLabels() {
  showLabels = !showLabels;
  updateLabelButtonText();
  redraw();
}

function flipCorners() {
  if (!corners.length) return;
  corners.reverse();
  pushCorners();
  redraw();
  updateCornerUI();
  toast(t('flipped'), 'ok');
}

function clearCorners() {
  if (curIdx < 0) return;
  corners = [];
  closeIdxPop();
  pushCorners();
  redraw();
  updateCornerUI();
}

// ══ Detect ═════════════════════════════════════════════
async function detectCurrent() {
  if (curIdx < 0) return;
  addLog(t('detect_running'), 'info');
  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  const r = await fetch(`/api/detect/${curIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols: cols_n, rows: rows_n })
  });
  const d = await r.json();
  corners = d.corners.map(p => ({ x: p[0], y: p[1] }));
  redraw();
  updateCornerUI();
  await refreshList();
  toast(d.found ? t('detect_ok', { n: corners.length }) : t('detect_fail'), d.found ? 'ok' : 'warn');
}

async function detectAll() {
  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  addLog(t('detect_all_running'), 'info');
  const r = await fetch('/api/detect_all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols: cols_n, rows: rows_n })
  });
  const d = await r.json();
  await refreshList();
  if (curIdx >= 0) await selectImage(curIdx);
  toast(t('detect_all_done', { ok: d.ok, total: d.total }), d.ok > 0 ? 'ok' : 'warn');
}

function showClearConfirm(totalCount) {
  const bg = document.getElementById('clearConfirmBg');
  const msg = document.getElementById('clearConfirmMsg');
  if (!bg || !msg) return Promise.resolve(false);
  msg.textContent = t('clear_confirm_message', { n: totalCount });
  bg.classList.add('show');
  return new Promise(resolve => {
    clearConfirmResolver = resolve;
  });
}

function handleClearConfirm(ok) {
  const bg = document.getElementById('clearConfirmBg');
  if (bg) bg.classList.remove('show');
  if (clearConfirmResolver) {
    const resolve = clearConfirmResolver;
    clearConfirmResolver = null;
    resolve(Boolean(ok));
  }
}

// Clear all uploaded images
async function clearAllImages() {
  if (!images.length) {
    toast(t('no_images_to_clear'), 'warn');
    return;
  }
  const confirmed = await showClearConfirm(images.length);
  if (!confirmed) {
    return;
  }
  
  // Call backend to clear state
  try {
    await fetch('/api/clear', { method: 'POST' });
  } catch (e) {
    console.error('Failed to clear backend state:', e);
  }
  
  // Reset frontend state
  images = [];
  curIdx = -1;
  corners = [];
  imgW = 1;
  imgH = 1;
  panX = 0;
  panY = 0;
  
  // Hide canvas
  document.getElementById('emptyS').style.display = 'flex';
  wrap.style.display = 'none';
  
  // Reset UI
  document.getElementById('sn').textContent = '—';
  document.getElementById('ss').textContent = '—';
  document.getElementById('sc').textContent = '0';
  document.getElementById('sp').textContent = '—';
  document.getElementById('btDet').disabled = true;
  document.getElementById('btClr').disabled = true;
  document.getElementById('btFlip').disabled = true;
  document.getElementById('btDA').disabled = true;
  document.getElementById('btCal').disabled = true;
  document.getElementById('hImgCnt').textContent = t('images_count', { n: 0 });
  document.getElementById('hOkCnt').textContent = t('valid_count', { n: 0 });
  document.getElementById('hOkCnt').classList.remove('on');
  document.getElementById('pUs').textContent = '0/0';
  document.getElementById('pSt').textContent = t('status_unselected');
  document.getElementById('pCn').textContent = '—';
  document.getElementById('matK').textContent = '—';
  document.getElementById('distC').innerHTML = '';
  const matTitleEl = document.getElementById('matTitle');
  if (matTitleEl) matTitleEl.textContent = t('mat_title_standard');
  const distTitleEl = document.getElementById('distTitle');
  if (distTitleEl) distTitleEl.textContent = t('dist_title_standard');
  document.getElementById('ilist').innerHTML = `<div style="text-align:center;padding:28px 12px;color:var(--tx3);font-size:11px">${t('load_images')}</div>`;
  
  // Hide calibration results
  document.getElementById('noCalib').style.display = 'block';
  document.getElementById('calRes').style.display = 'none';
  document.querySelectorAll('.exbtn').forEach(b => b.disabled = true);
  
  // Clear log
  document.getElementById('logbox').innerHTML = '';
  
  addLog(t('images_cleared'), 'info');
  toast(t('images_cleared'), 'ok');
}

// ══ Calibrate ══════════════════════════════════════════
async function doCalib() {
  const sq = parseFloat(document.getElementById('sqsz').value);
  const calibrationMode = document.getElementById('calMode')?.value || 'fisheye';
  addLog(t('calibrating'), 'info');
  const r = await fetch('/api/calibrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ square_size: sq, calibration_mode: calibrationMode })
  });
  const d = await r.json();
  if (d.ok) {
    calResult = d.result;
    reportB64 = d.report_b64;
    showCalResult(d.result);
    const shownRms = d.result.preferred_rms ?? d.result.fisheye_rms ?? d.result.rms;
    toast(t('calib_done', { model: modelLabel(d.result.preferred_model || calibrationMode), rms: shownRms.toFixed(4) }), 'ok');
  } else {
    toast(d.error, 'err');
  }
  await refreshLog();
}

function showCalResult(r) {
  document.getElementById('noCalib').style.display = 'none';
  document.getElementById('calRes').style.display = 'block';
  const modeUsed = r.calibration_mode || 'fisheye';
  const activeModel = r.preferred_model || (r.fisheye_K ? 'fisheye' : 'standard');
  const shownRms = activeModel === 'fisheye'
    ? (r.fisheye_rms ?? r.preferred_rms ?? r.rms)
    : (r.rms ?? r.preferred_rms ?? r.fisheye_rms);

  const rv = document.getElementById('rmsv');
  rv.textContent = shownRms.toFixed(4);
  rv.className = 'rmsv ' + (shownRms < 0.5 ? 'rg' : shownRms < 1.5 ? 'ro' : 'rb');
  const modeUsedEl = document.getElementById('modeUsed');
  if (modeUsedEl) modeUsedEl.textContent = modelLabel(modeUsed);
  const activeEl = document.getElementById('activeModel');
  if (activeEl) activeEl.textContent = modelLabel(activeModel);
  const modeEl = document.getElementById('calMode');
  if (modeEl) modeEl.value = modeUsed;
  if (activeModel === 'fisheye') {
    const p = r.preview_params && typeof r.preview_params === 'object' ? r.preview_params : {};
    if (!Number.isFinite(Number(p.balance))) {
      p.balance = Number.isFinite(Number(r.fisheye_balance)) ? Number(r.fisheye_balance) : 0.6;
    }
    setPreviewParams(p);
  }
  const K = activeModel === 'fisheye' ? r.fisheye_K : r.K;
  const matTitleEl = document.getElementById('matTitle');
  if (matTitleEl) {
    matTitleEl.textContent = activeModel === 'fisheye' ? t('mat_title_fisheye') : t('mat_title_standard');
  }
  if (K) {
    document.getElementById('matK').textContent =
      `[[${K[0].map(v => v.toFixed(1)).join(', ')}],\n [${K[1].map(v => v.toFixed(1)).join(', ')}],\n [${K[2].map(v => v.toFixed(1)).join(', ')}]]`;
  } else {
    document.getElementById('matK').textContent = '—';
  }
  const distTitleEl = document.getElementById('distTitle');
  const coeffs = activeModel === 'fisheye' ? r.fisheye_D : r.dist;
  if (distTitleEl) {
    distTitleEl.textContent = activeModel === 'fisheye' ? t('dist_title_fisheye') : t('dist_title_standard');
  }
  document.getElementById('distC').innerHTML =
    coeffs
      ? (activeModel === 'fisheye'
        ? coeffs.map((v, i) => `<span class="cchip">k${i + 1}: ${v.toFixed(5)}</span>`).join('')
        : coeffs.map((v, i) => `<span class="cchip">${['k1', 'k2', 'p1', 'p2', 'k3'][i] || 'c' + i}: ${v.toFixed(5)}</span>`).join(''))
      : '<span style="color:var(--tx3);font-size:10px">N/A</span>';
  document.querySelectorAll('.exbtn').forEach(b => b.disabled = false);
  updateUndistortSelector();
}

function updateUndistortSelector() {
  const sel = document.getElementById('udSel');
  if (!sel) return;
  if (!images.length) {
    sel.innerHTML = `<option value="">${t('no_image_option')}</option>`;
    return;
  }
  sel.innerHTML = images.map((im, i) => `<option value="${i}">${i}. ${im.name}</option>`).join('');
  if (curIdx >= 0 && curIdx < images.length) sel.value = String(curIdx);
}

async function previewUndistort(idxOverride) {
  if (!calResult) return toast(t('need_calib'), 'warn');
  const sel = document.getElementById('udSel');
  if (!sel || sel.value === '') return toast(t('need_select_image'), 'warn');
  const idx = Number.isFinite(idxOverride) ? Number(idxOverride) : parseInt(sel.value, 10);
  if (!Number.isFinite(idx)) return;
  if (idx < 0 || idx >= images.length) return;
  previewCurrentIdx = idx;
  if (sel.value !== String(idx)) sel.value = String(idx);
  updatePreviewNavInfo();
  const activeModel = calResult.preferred_model || (calResult.fisheye_K ? 'fisheye' : 'standard');
  const useBalance = activeModel === 'fisheye';
  const params = getPreviewParams();
  const qs = new URLSearchParams({
    out_scale: params.out_scale.toFixed(2),
    focal_scale: params.focal_scale.toFixed(2),
    cx_offset: params.cx_offset.toFixed(0),
    cy_offset: params.cy_offset.toFixed(0),
    crop_enable: `${params.crop_enable}`,
    crop_x: params.crop_x.toFixed(2),
    crop_y: params.crop_y.toFixed(2),
    crop_w: params.crop_w.toFixed(2),
    crop_h: params.crop_h.toFixed(2)
  });
  if (useBalance) qs.set('balance', params.balance.toFixed(2));
  const url = `/api/undistort_preview/${idx}?${qs.toString()}`;
  const r = await fetch(url);
  const d = await r.json();
  if (!d.ok) return toast(d.error || t('undistort_failed'), 'err');
  previewLastMeta = d.meta || null;

  document.getElementById('modalTitle').textContent = t('preview_title', { name: d.name || '' });
  document.getElementById('modalImg').style.display = 'none';
  document.getElementById('modalBalanceWrap').style.display = useBalance ? 'block' : 'none';
  document.getElementById('modalNav').style.display = 'flex';
  document.getElementById('modalSaveBtn').style.display = useBalance ? '' : 'none';
  document.getElementById('modalPair').style.display = 'grid';
  document.getElementById('modalOrigImg').src = `data:image/jpeg;base64,${d.orig_b64}`;
  const rectImg = document.getElementById('modalRectImg');
  rectImg.onload = updateCropOverlay;
  document.getElementById('modalRectImg').src = `data:image/jpeg;base64,${d.undist_b64}`;
  updateCropOverlay();
  document.getElementById('modalBg').classList.add('show');
}

function previewPrevImage() {
  if (previewCurrentIdx <= 0) return;
  previewUndistort(previewCurrentIdx - 1);
}

function previewNextImage() {
  if (previewCurrentIdx < 0 || previewCurrentIdx >= images.length - 1) return;
  previewUndistort(previewCurrentIdx + 1);
}

async function savePreviewParams() {
  if (!calResult) return toast(t('need_calib'), 'warn');
  const activeModel = calResult.preferred_model || (calResult.fisheye_K ? 'fisheye' : 'standard');
  if (activeModel !== 'fisheye') return toast(t('fisheye_only_save'), 'warn');

  const params = getPreviewParams();
  const r = await fetch('/api/save_preview_params', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const d = await r.json();
  if (!d.ok) return toast(d.error || t('save_failed'), 'err');

  const saved = d.preview_params || params;
  calResult.preview_params = saved;
  if (Number.isFinite(Number(saved.balance))) {
    calResult.fisheye_balance = Number(saved.balance);
  }
  setPreviewParams(saved);
  updatePreviewBalanceLabel();
  toast(t('saved_params'), 'ok');
}

// ══ Export ═════════════════════════════════════════════
async function doExport(fmt) {
  const r = await fetch(`/api/export/${fmt}`);
  const blob = await r.blob();
  const ext = { json: 'json', yaml: 'yaml' }[fmt];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calibration_params.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  toast(t('export_done', { ext }), 'ok');
}

// ══ Report Modal ═══════════════════════════════════════
function showReport() {
  if (!reportB64) return;
  document.getElementById('modalTitle').textContent = t('report_title');
  document.getElementById('modalBalanceWrap').style.display = 'none';
  document.getElementById('modalNav').style.display = 'none';
  document.getElementById('modalPair').style.display = 'none';
  document.getElementById('modalImg').style.display = 'block';
  document.getElementById('modalImg').src = `data:image/png;base64,${reportB64}`;
  document.getElementById('modalBg').classList.add('show');
}

function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
  const cropBox = document.getElementById('modalCropRect');
  if (cropBox) cropBox.style.display = 'none';
}

// ══ Helpers ════════════════════════════════════════════
function updateCornerUI() {
  if (curIdx < 0) return;
  const exp = parseInt(document.getElementById('cbc').value) * parseInt(document.getElementById('cbr').value);
  const n = corners.length;
  document.getElementById('sc').textContent = n;
  document.getElementById('pCn').textContent = `${n}/${exp}`;
  const el = document.getElementById('pSt');
  if (n === exp) {
    el.textContent = t('status_full');
    el.className = 'pval';
  } else if (n > 0) {
    el.textContent = t('status_partial', { n, exp });
    el.className = 'pval na';
  } else {
    el.textContent = t('status_none');
    el.className = 'pval na';
  }
}

async function refreshLog() {
  const r = await fetch('/api/log');
  const d = await r.json();
  const lb = document.getElementById('logbox');
  lb.innerHTML = d.log.slice(-30).map(l =>
    `<div class="lline ${l.level}"><span class="lt">${l.t}</span><span class="lm">${l.msg}</span></div>`
  ).join('');
  lb.scrollTop = lb.scrollHeight;
}

let toastT;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 3200);
  addLog(msg, type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : 'err');
}

function addLog(msg, level = 'info') {
  const lb = document.getElementById('logbox');
  const t = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = `lline ${level}`;
  div.innerHTML = `<span class="lt">${t}</span><span class="lm">${msg}</span>`;
  lb.appendChild(div);
  lb.scrollTop = lb.scrollHeight;
}

// ══ Keyboard Shortcuts ═════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    isSpacePressed = true;
    if (wrap.style.display !== 'none') wrap.style.cursor = 'grab';
    return;
  }
  if (e.key === 'v' || e.key === 'V') setMode('view');
  if (e.key === 'a' || e.key === 'A') setMode('add');
  if (e.key === 'd' || e.key === 'D') setMode('del');
  if (e.key === 'n' || e.key === 'N') setMode('num');
  if (e.key === 'f' || e.key === 'F') fitZoom();
  if (e.key === 'l' || e.key === 'L') toggleLabels();
  if (e.key === 'ArrowRight' && curIdx >= 0 && curIdx < images.length - 1) selectImage(curIdx + 1);
  if (e.key === 'ArrowLeft' && curIdx > 0) selectImage(curIdx - 1);
  if (e.key === 'Escape') { closeModal(); closeIdxPop(); handleClearConfirm(false); }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    if (wrap.style.display !== 'none') {
      wrap.style.cursor = mode === 'view' ? 'default' : 'crosshair';
    }
  }
});

// ══ Initialize ═════════════════════════════════════════
document.getElementById('udBalance')?.addEventListener('input', () => {
  updatePreviewBalanceLabel();
  scheduleBalancePreview();
});
['udOutScale', 'udFocalScale', 'udCropX', 'udCropY', 'udCropW', 'udCropH', 'udCxOffset', 'udCyOffset'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', scheduleBalancePreview);
});
document.getElementById('udCropEnable')?.addEventListener('change', scheduleBalancePreview);
window.addEventListener('resize', updateCropOverlay);
const langSwitchEl = document.getElementById('langSwitch');
if (langSwitchEl) {
  langSwitchEl.value = currentLang;
  langSwitchEl.addEventListener('change', () => {
    currentLang = langSwitchEl.value === 'en' ? 'en' : 'zh';
    localStorage.setItem('ui_lang', currentLang);
    updateI18nUI();
  });
}
updateI18nUI();
updatePreviewBalanceLabel();
updateLabelButtonText();
addLog(t('ready'), 'info');

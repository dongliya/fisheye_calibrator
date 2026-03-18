# Fisheye Calibrator / 鱼眼镜头标定工具

Web-based chessboard calibration tool for fisheye and wide-angle cameras.  
基于 Web 的棋盘格标定工具，支持鱼眼和广角相机。

## Overview / 功能概览

- Load images from a local directory (choose folder and auto-load).  
  从本地目录加载图片（选择目录后自动加载）。
- Automatic and manual corner editing (view/add/delete/index modes).  
  支持自动检测与手动角点编辑（移动/添加/删除/改序号）。
- Select calibration mode (standard or fisheye).  
  支持选择标定模式（标准模型或鱼眼模型）。
- Undistortion preview in modal (left original, right corrected).  
  弹窗查看矫正预览（左原图、右矫正图）。
- Preview controls: `balance` (fisheye only), `out_scale`, `focal_scale`, `cx_offset`, `cy_offset`, `crop_*`.  
  预览参数支持：`balance`（仅鱼眼）、`out_scale`、`focal_scale`、`cx_offset`、`cy_offset`、`crop_*`。
- Save preview parameters (fisheye mode) to calibration output.  
  可在鱼眼模式保存预览参数到标定结果。
- UI language switch (中文 / English), and backend logs/errors follow selected language.  
  支持中英文切换，且后端日志/错误会跟随前端语言输出。
- Export calibration results to JSON and YAML.  
  支持导出 JSON 和 YAML。

## Project Structure / 项目结构

```text
fisheye_calibrator/
├── backend/
│   ├── app.py
│   ├── calibrator.py
│   ├── detector.py
│   ├── exporter.py
│   ├── renderer.py
│   └── state.py
├── frontend/
│   ├── templates/
│   │   └── index.html
│   └── static/
│       ├── css/style.css
│       └── js/app.js
├── requirements.txt
├── run.py
└── README.md
```

## Installation / 安装

```bash
cd fisheye_calibrator
pip install -r requirements.txt
```

## Start / 启动

```bash
# default: port 5050
python run.py

# custom port
python run.py --port 8080

# no browser auto-open
python run.py --no-browser

# custom output directory
python run.py --output ./my-calibration
```

Open `http://localhost:5050` in your browser after startup.  
启动后访问 `http://localhost:5050`。

## Usage / 使用流程

1. Select UI language (`中文` / `English`) from the top-right corner.  
   先在右上角选择界面语言（`中文` / `English`）。
2. Click `选择目录` and select an image folder (auto-load).  
   点击 `选择目录` 并选择图片文件夹（会自动加载）。
3. Set chessboard parameters `W`, `H`, and `mm`.  
   设置棋盘参数 `W`、`H`、`mm`。
4. Choose calibration model (`标准模型` / `鱼眼模型`).  
   选择标定模型（`标准模型` / `鱼眼模型`）。
5. Run `批量检测`, then manually adjust corners if needed.  
   先执行 `批量检测`，必要时手动修正角点。
6. Click `计算标定`.  
   点击 `计算标定`。
7. Review RMS and model parameters in the right panel.  
   在右侧查看 RMS 与模型参数。
8. Open undistortion preview and adjust parameters as needed.  
   打开矫正预览并按需调整参数。
9. In fisheye mode, click `保存参数` to persist preview params.  
   鱼眼模式可点击 `保存参数` 保存预览参数。
10. Export JSON/YAML if needed.  
    按需导出 JSON/YAML。

## Keyboard Shortcuts / 快捷键

| Key | EN | 中文 |
|---|---|---|
| `V` | View mode | 移动模式 |
| `A` | Add mode | 添加模式 |
| `D` | Delete mode | 删除模式 |
| `N` | Index edit mode | 序号编辑模式 |
| `F` | Fit image to view | 自适应窗口 |
| `L` | Toggle labels | 显示/隐藏序号 |
| `←` / `→` | Previous/next image | 切换前后图片 |
| `Esc` | Close popup/modal | 关闭弹窗 |

## Output Files / 输出文件

Saved in `--output` directory:  
保存在 `--output` 目录：

- `calibration_params.json`: full calibration result / 完整标定结果
- `calibration.yaml`: OpenCV YAML / OpenCV YAML 格式参数

Typical saved fields include:  
常见输出字段包括：

- `calibration_mode`, `preferred_model`, `preferred_rms`
- `K`, `dist` (standard model when available)
- `fisheye_K`, `fisheye_D`, `fisheye_balance` (fisheye model when available)
- `preview_params` (saved preview settings in fisheye mode)

## Corner Cache / 角点缓存

- `corner_cache.json` is stored in the selected image directory.  
  `corner_cache.json` 保存在所选图片目录下。
- It stores per-image corners and board metadata (`cols`, `rows`, `square_size`).  
  缓存会保存每张图角点和棋盘元信息（`cols`、`rows`、`square_size`）。
- Reloading the same directory restores manual corner edits automatically.  
  再次加载同一目录会自动恢复手动角点修正。

## Requirements / 依赖

- Python 3.8+
- OpenCV 4.5+
- NumPy
- Matplotlib
- Flask

## License / 许可证

MIT

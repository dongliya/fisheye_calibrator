#include <opencv2/opencv.hpp>
#include <opencv2/core/persistence.hpp>

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

struct PreviewParams {
    double balance = 0.6;
    double out_scale = 1.0;
    double focal_scale = 1.0;
    double cx_offset = 0.0;
    double cy_offset = 0.0;
    bool crop_enable = false;
    double crop_x = 0.05;
    double crop_y = 0.05;
    double crop_w = 0.90;
    double crop_h = 0.90;
};

struct CalibData {
    std::string preferred_model = "standard";
    double fisheye_balance = 0.6;

    cv::Mat K;
    cv::Mat dist;
    cv::Mat fisheye_K;
    cv::Mat fisheye_D;

    PreviewParams preview;
};

static double clipd(double v, double lo, double hi) {
    return std::min(std::max(v, lo), hi);
}

static bool readMatFromNestedSeq(const cv::FileNode& node, cv::Mat& out) {
    if (node.empty() || node.type() != cv::FileNode::SEQ) return false;
    std::vector<std::vector<double>> rows;
    for (const auto& r : node) {
        if (r.type() != cv::FileNode::SEQ) return false;
        std::vector<double> row;
        for (const auto& c : r) row.push_back((double)c);
        rows.push_back(row);
    }
    if (rows.empty() || rows[0].empty()) return false;
    const int h = (int)rows.size();
    const int w = (int)rows[0].size();
    out = cv::Mat::zeros(h, w, CV_64F);
    for (int y = 0; y < h; ++y) {
        if ((int)rows[y].size() != w) return false;
        for (int x = 0; x < w; ++x) out.at<double>(y, x) = rows[y][x];
    }
    return true;
}

static bool readVecAsColMat(const cv::FileNode& node, cv::Mat& out) {
    if (node.empty() || node.type() != cv::FileNode::SEQ) return false;
    std::vector<double> v;
    for (const auto& e : node) v.push_back((double)e);
    if (v.empty()) return false;
    out = cv::Mat((int)v.size(), 1, CV_64F);
    for (int i = 0; i < (int)v.size(); ++i) out.at<double>(i, 0) = v[i];
    return true;
}

static double readDouble(const cv::FileNode& node, double fallback) {
    if (node.empty()) return fallback;
    try { return (double)node; } catch (...) { return fallback; }
}

static bool readBool(const cv::FileNode& node, bool fallback) {
    if (node.empty()) return fallback;
    try {
        int iv = (int)node;
        return iv != 0;
    } catch (...) {
        return fallback;
    }
}

static bool loadCalibration(const std::string& path, CalibData& data) {
    cv::FileStorage fs(path, cv::FileStorage::READ | cv::FileStorage::FORMAT_JSON);
    if (!fs.isOpened()) return false;

    if (!fs["preferred_model"].empty()) data.preferred_model = (std::string)fs["preferred_model"];
    data.fisheye_balance = readDouble(fs["fisheye_balance"], data.fisheye_balance);

    readMatFromNestedSeq(fs["K"], data.K);
    readVecAsColMat(fs["dist"], data.dist);
    readMatFromNestedSeq(fs["fisheye_K"], data.fisheye_K);
    readVecAsColMat(fs["fisheye_D"], data.fisheye_D);

    cv::FileNode p = fs["preview_params"];
    if (!p.empty()) {
        data.preview.balance = readDouble(p["balance"], data.preview.balance);
        data.preview.out_scale = readDouble(p["out_scale"], data.preview.out_scale);
        data.preview.focal_scale = readDouble(p["focal_scale"], data.preview.focal_scale);
        data.preview.cx_offset = readDouble(p["cx_offset"], data.preview.cx_offset);
        data.preview.cy_offset = readDouble(p["cy_offset"], data.preview.cy_offset);
        data.preview.crop_enable = readBool(p["crop_enable"], data.preview.crop_enable);
        data.preview.crop_x = readDouble(p["crop_x"], data.preview.crop_x);
        data.preview.crop_y = readDouble(p["crop_y"], data.preview.crop_y);
        data.preview.crop_w = readDouble(p["crop_w"], data.preview.crop_w);
        data.preview.crop_h = readDouble(p["crop_h"], data.preview.crop_h);
    }

    if (data.preferred_model != "standard" && data.preferred_model != "fisheye") {
        data.preferred_model = (!data.fisheye_K.empty() && !data.fisheye_D.empty()) ? "fisheye" : "standard";
    }
    return true;
}

static void printUsage(const char* exe) {
    std::cout
        << "Usage:\n"
        << "  " << exe << " --calib <calibration_params.json> --image <input_image> [--output <out_image>]\n"
        << "       [--balance <v>] [--out-scale <v>] [--focal-scale <v>]\n"
        << "       [--cx-offset <v>] [--cy-offset <v>] [--crop-enable <0|1>]\n"
        << "       [--crop-x <v>] [--crop-y <v>] [--crop-w <v>] [--crop-h <v>]\n";
}

int main(int argc, char** argv) {
    std::string calib_path, image_path, output_path;
    bool has_balance = false, has_out_scale = false, has_focal_scale = false;
    bool has_cx = false, has_cy = false, has_crop_enable = false;
    bool has_crop_x = false, has_crop_y = false, has_crop_w = false, has_crop_h = false;
    double balance = 0.0, out_scale = 1.0, focal_scale = 1.0, cx_offset = 0.0, cy_offset = 0.0;
    bool crop_enable = false;
    double crop_x = 0.05, crop_y = 0.05, crop_w = 0.90, crop_h = 0.90;

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        auto needValue = [&](const std::string& k) -> std::string {
            if (i + 1 >= argc) {
                std::cerr << "Missing value for " << k << "\n";
                std::exit(2);
            }
            return argv[++i];
        };
        if (a == "--calib") calib_path = needValue(a);
        else if (a == "--image") image_path = needValue(a);
        else if (a == "--output") output_path = needValue(a);
        else if (a == "--balance") { balance = std::stod(needValue(a)); has_balance = true; }
        else if (a == "--out-scale") { out_scale = std::stod(needValue(a)); has_out_scale = true; }
        else if (a == "--focal-scale") { focal_scale = std::stod(needValue(a)); has_focal_scale = true; }
        else if (a == "--cx-offset") { cx_offset = std::stod(needValue(a)); has_cx = true; }
        else if (a == "--cy-offset") { cy_offset = std::stod(needValue(a)); has_cy = true; }
        else if (a == "--crop-enable") { crop_enable = (std::stoi(needValue(a)) != 0); has_crop_enable = true; }
        else if (a == "--crop-x") { crop_x = std::stod(needValue(a)); has_crop_x = true; }
        else if (a == "--crop-y") { crop_y = std::stod(needValue(a)); has_crop_y = true; }
        else if (a == "--crop-w") { crop_w = std::stod(needValue(a)); has_crop_w = true; }
        else if (a == "--crop-h") { crop_h = std::stod(needValue(a)); has_crop_h = true; }
        else if (a == "--help" || a == "-h") {
            printUsage(argv[0]);
            return 0;
        } else {
            std::cerr << "Unknown arg: " << a << "\n";
            printUsage(argv[0]);
            return 2;
        }
    }

    if (calib_path.empty() || image_path.empty()) {
        printUsage(argv[0]);
        return 2;
    }

    CalibData calib;
    if (!loadCalibration(calib_path, calib)) {
        std::cerr << "Failed to load calibration file: " << calib_path << "\n";
        return 1;
    }

    cv::Mat img = cv::imread(image_path, cv::IMREAD_COLOR);
    if (img.empty()) {
        std::cerr << "Failed to read image: " << image_path << "\n";
        return 1;
    }

    PreviewParams p = calib.preview;
    if (has_balance) p.balance = balance;
    if (has_out_scale) p.out_scale = out_scale;
    if (has_focal_scale) p.focal_scale = focal_scale;
    if (has_cx) p.cx_offset = cx_offset;
    if (has_cy) p.cy_offset = cy_offset;
    if (has_crop_enable) p.crop_enable = crop_enable;
    if (has_crop_x) p.crop_x = crop_x;
    if (has_crop_y) p.crop_y = crop_y;
    if (has_crop_w) p.crop_w = crop_w;
    if (has_crop_h) p.crop_h = crop_h;

    p.balance = clipd(p.balance, 0.0, 1.0);
    p.out_scale = clipd(p.out_scale, 0.5, 3.0);
    p.focal_scale = clipd(p.focal_scale, 0.4, 2.5);

    const int w = img.cols;
    const int h = img.rows;
    const int out_w = std::max(1, (int)std::lround(w * p.out_scale));
    const int out_h = std::max(1, (int)std::lround(h * p.out_scale));
    p.cx_offset = clipd(p.cx_offset, -out_w, out_w);
    p.cy_offset = clipd(p.cy_offset, -out_h, out_h);

    p.crop_x = clipd(p.crop_x, 0.0, 0.99);
    p.crop_y = clipd(p.crop_y, 0.0, 0.99);
    p.crop_w = clipd(p.crop_w, 0.01, 1.0 - p.crop_x);
    p.crop_h = clipd(p.crop_h, 0.01, 1.0 - p.crop_y);

    cv::Mat undist;
    const cv::Size in_size(w, h);
    const cv::Size out_size(out_w, out_h);

    if (calib.preferred_model == "fisheye" && !calib.fisheye_K.empty() && !calib.fisheye_D.empty()) {
        cv::Mat newK;
        cv::fisheye::estimateNewCameraMatrixForUndistortRectify(
            calib.fisheye_K, calib.fisheye_D, in_size, cv::Mat::eye(3, 3, CV_64F), newK, p.balance, out_size
        );
        newK.at<double>(0, 0) *= p.focal_scale;
        newK.at<double>(1, 1) *= p.focal_scale;
        newK.at<double>(0, 2) += p.cx_offset;
        newK.at<double>(1, 2) += p.cy_offset;

        cv::Mat m1, m2;
        cv::fisheye::initUndistortRectifyMap(
            calib.fisheye_K, calib.fisheye_D, cv::Mat::eye(3, 3, CV_64F), newK, out_size, CV_16SC2, m1, m2
        );
        cv::remap(img, undist, m1, m2, cv::INTER_LINEAR, cv::BORDER_CONSTANT);
    } else if (!calib.K.empty() && !calib.dist.empty()) {
        cv::Mat newK;
        cv::getOptimalNewCameraMatrix(calib.K, calib.dist, in_size, 0.0, out_size, nullptr, false).copyTo(newK);
        newK.at<double>(0, 0) *= p.focal_scale;
        newK.at<double>(1, 1) *= p.focal_scale;
        newK.at<double>(0, 2) += p.cx_offset;
        newK.at<double>(1, 2) += p.cy_offset;
        cv::undistort(img, undist, calib.K, calib.dist, newK);
    } else {
        std::cerr << "Calibration parameters are incomplete.\n";
        return 1;
    }

    if (p.crop_enable && !undist.empty()) {
        const int x0 = std::clamp((int)std::lround(p.crop_x * out_w), 0, undist.cols - 1);
        const int y0 = std::clamp((int)std::lround(p.crop_y * out_h), 0, undist.rows - 1);
        const int ww = std::max(1, (int)std::lround(p.crop_w * out_w));
        const int hh = std::max(1, (int)std::lround(p.crop_h * out_h));
        const int x1 = std::clamp(x0 + ww, x0 + 1, undist.cols);
        const int y1 = std::clamp(y0 + hh, y0 + 1, undist.rows);
        undist = undist(cv::Rect(x0, y0, x1 - x0, y1 - y0)).clone();
    }

    if (output_path.empty()) {
        fs::path in_path(image_path);
        fs::path out_name = in_path.stem().string() + "_undistorted.jpg";
        output_path = (in_path.parent_path() / out_name).string();
    }

    if (!cv::imwrite(output_path, undist)) {
        std::cerr << "Failed to write output image: " << output_path << "\n";
        return 1;
    }

    std::cout << "input : " << image_path << "\n";
    std::cout << "output: " << output_path << "\n";
    std::cout << "model : " << calib.preferred_model << "\n";
    return 0;
}


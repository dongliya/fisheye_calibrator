#include "Undistort.h"

#include <opencv2/core/persistence.hpp>
#include <opencv2/opencv.hpp>

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <string>

namespace fs = std::filesystem;

struct CalibFileData {
    UndistortInit init;
    UndistortParams preview;
};

struct CliOptions {
    std::string calib_path;
    std::string image_path;
    std::string output_path;

    bool has_balance = false;
    bool has_out_scale = false;
    bool has_focal_scale = false;
    bool has_cx = false;
    bool has_cy = false;
    bool has_crop_enable = false;
    bool has_crop_x = false;
    bool has_crop_y = false;
    bool has_crop_w = false;
    bool has_crop_h = false;

    double balance = 0.0;
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

static double readDouble(const cv::FileNode& node, double fallback) {
    if (node.empty()) return fallback;
    try { return (double)node; } catch (...) { return fallback; }
}

static bool readBool(const cv::FileNode& node, bool fallback) {
    if (node.empty()) return fallback;
    try { return ((int)node) != 0; } catch (...) { return fallback; }
}

static bool readMatFromNestedSeq(const cv::FileNode& node, cv::Mat& out) {
    if (node.empty() || node.type() != cv::FileNode::SEQ) return false;
    const int h = (int)node.size();
    if (h <= 0) return false;
    const cv::FileNode first = *node.begin();
    if (first.type() != cv::FileNode::SEQ) return false;
    const int w = (int)first.size();
    if (w <= 0) return false;
    out.create(h, w, CV_64F);
    int y = 0;
    for (const auto& rowNode : node) {
        if (rowNode.type() != cv::FileNode::SEQ || (int)rowNode.size() != w) return false;
        int x = 0;
        for (const auto& v : rowNode) out.at<double>(y, x++) = (double)v;
        ++y;
    }
    return true;
}

static bool readVecAsColMat(const cv::FileNode& node, cv::Mat& out) {
    if (node.empty() || node.type() != cv::FileNode::SEQ) return false;
    const int n = (int)node.size();
    if (n <= 0) return false;
    out.create(n, 1, CV_64F);
    int i = 0;
    for (const auto& e : node) out.at<double>(i++, 0) = (double)e;
    return true;
}

static bool loadCalibration(const std::string& path, CalibFileData& data) {
    // Parse project-exported JSON calibration file.
    cv::FileStorage f(path, cv::FileStorage::READ | cv::FileStorage::FORMAT_JSON);
    if (!f.isOpened()) return false;

    if (!f["preferred_model"].empty()) data.init.preferred_model = (std::string)f["preferred_model"];
    readMatFromNestedSeq(f["K"], data.init.K);
    readVecAsColMat(f["dist"], data.init.dist);
    readMatFromNestedSeq(f["fisheye_K"], data.init.fisheye_K);
    readVecAsColMat(f["fisheye_D"], data.init.fisheye_D);

    data.preview.balance = readDouble(f["fisheye_balance"], data.preview.balance);
    cv::FileNode p = f["preview_params"];
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

    if (data.init.preferred_model != "standard" && data.init.preferred_model != "fisheye") {
        data.init.preferred_model = (!data.init.fisheye_K.empty() && !data.init.fisheye_D.empty()) ? "fisheye" : "standard";
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

static bool parseArgs(int argc, char** argv, CliOptions& opt) {
    // Parse CLI flags; unknown flags are treated as errors.
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        auto needValue = [&](const std::string& key) -> std::string {
            if (i + 1 >= argc) {
                std::cerr << "Missing value for " << key << "\n";
                std::exit(2);
            }
            return argv[++i];
        };

        if (a == "--calib") opt.calib_path = needValue(a);
        else if (a == "--image") opt.image_path = needValue(a);
        else if (a == "--output") opt.output_path = needValue(a);
        else if (a == "--balance") { opt.balance = std::stod(needValue(a)); opt.has_balance = true; }
        else if (a == "--out-scale") { opt.out_scale = std::stod(needValue(a)); opt.has_out_scale = true; }
        else if (a == "--focal-scale") { opt.focal_scale = std::stod(needValue(a)); opt.has_focal_scale = true; }
        else if (a == "--cx-offset") { opt.cx_offset = std::stod(needValue(a)); opt.has_cx = true; }
        else if (a == "--cy-offset") { opt.cy_offset = std::stod(needValue(a)); opt.has_cy = true; }
        else if (a == "--crop-enable") { opt.crop_enable = (std::stoi(needValue(a)) != 0); opt.has_crop_enable = true; }
        else if (a == "--crop-x") { opt.crop_x = std::stod(needValue(a)); opt.has_crop_x = true; }
        else if (a == "--crop-y") { opt.crop_y = std::stod(needValue(a)); opt.has_crop_y = true; }
        else if (a == "--crop-w") { opt.crop_w = std::stod(needValue(a)); opt.has_crop_w = true; }
        else if (a == "--crop-h") { opt.crop_h = std::stod(needValue(a)); opt.has_crop_h = true; }
        else if (a == "--help" || a == "-h") {
            printUsage(argv[0]);
            return false;
        } else {
            std::cerr << "Unknown arg: " << a << "\n";
            printUsage(argv[0]);
            return false;
        }
    }
    return true;
}

static UndistortParams mergeParams(const UndistortParams& base, const CliOptions& opt) {
    // Override preview defaults with explicitly provided CLI args.
    UndistortParams p = base;
    if (opt.has_balance) p.balance = opt.balance;
    if (opt.has_out_scale) p.out_scale = opt.out_scale;
    if (opt.has_focal_scale) p.focal_scale = opt.focal_scale;
    if (opt.has_cx) p.cx_offset = opt.cx_offset;
    if (opt.has_cy) p.cy_offset = opt.cy_offset;
    if (opt.has_crop_enable) p.crop_enable = opt.crop_enable;
    if (opt.has_crop_x) p.crop_x = opt.crop_x;
    if (opt.has_crop_y) p.crop_y = opt.crop_y;
    if (opt.has_crop_w) p.crop_w = opt.crop_w;
    if (opt.has_crop_h) p.crop_h = opt.crop_h;
    return p;
}

static std::string buildOutputPath(const std::string& image_path, const std::string& output_path) {
    if (!output_path.empty()) return output_path;
    fs::path in_path(image_path);
    fs::path out_name = in_path.stem().string() + "_undistorted.jpg";
    return (in_path.parent_path() / out_name).string();
}

int main(int argc, char** argv) {
    CliOptions opt;
    if (!parseArgs(argc, argv, opt)) return 2;
    if (opt.calib_path.empty() || opt.image_path.empty()) {
        printUsage(argv[0]);
        return 2;
    }

    CalibFileData calib;
    if (!loadCalibration(opt.calib_path, calib)) {
        std::cerr << "Failed to load calibration file: " << opt.calib_path << "\n";
        return 1;
    }

    cv::Mat img = cv::imread(opt.image_path, cv::IMREAD_COLOR);
    if (img.empty()) {
        std::cerr << "Failed to read image: " << opt.image_path << "\n";
        return 1;
    }

    // Build runtime params from saved preview params + CLI overrides.
    const UndistortParams runtime_params = mergeParams(calib.preview, opt);
    Undistort undistorter(calib.init, runtime_params);

    cv::Mat undist;
    std::string err;
    if (!undistorter.apply(img, undist, &err)) {
        std::cerr << err << "\n";
        return 1;
    }

    const std::string out_path = buildOutputPath(opt.image_path, opt.output_path);
    if (!cv::imwrite(out_path, undist)) {
        std::cerr << "Failed to write output image: " << out_path << "\n";
        return 1;
    }

    std::cout << "input : " << opt.image_path << "\n";
    std::cout << "output: " << out_path << "\n";
    std::cout << "model : " << calib.init.preferred_model << "\n";
    return 0;
}

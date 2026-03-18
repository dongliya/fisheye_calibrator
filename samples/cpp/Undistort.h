#pragma once

#include <opencv2/opencv.hpp>
#include <string>

// Calibration matrices used to initialize the undistortion engine.
struct UndistortInit {
    std::string preferred_model = "standard";  // "standard" or "fisheye".
    cv::Mat K;          // 3x3 intrinsic matrix for standard model.
    cv::Mat dist;       // Distortion vector for standard model.
    cv::Mat fisheye_K;  // 3x3 intrinsic matrix for fisheye model.
    cv::Mat fisheye_D;  // Distortion vector for fisheye model.
};

// Runtime undistortion parameters.
struct UndistortParams {
    double balance = 0.6;      // Fisheye-only balance in [0, 1].
    double out_scale = 1.0;    // Output canvas scale factor.
    double focal_scale = 1.0;  // Focal multiplier after rectification.
    double cx_offset = 0.0;    // Principal point X offset in pixels.
    double cy_offset = 0.0;    // Principal point Y offset in pixels.
    bool crop_enable = false;  // Enable normalized crop rectangle.
    double crop_x = 0.05;      // Crop origin X in [0, 1).
    double crop_y = 0.05;      // Crop origin Y in [0, 1).
    double crop_w = 0.90;      // Crop width in (0, 1].
    double crop_h = 0.90;      // Crop height in (0, 1].
};

// Core undistortion engine.
//
// This class is intentionally narrow in scope:
// - Initialized once with calibration matrices.
// - Accepts image input and returns corrected output.
// - Internally caches remap maps for repeated calls with same parameters.
class Undistort {
public:
    // Constructs the engine with calibration data and initial runtime params.
    explicit Undistort(const UndistortInit& init, const UndistortParams& params = UndistortParams{});

    // Updates runtime undistortion parameters used by subsequent apply() calls.
    void setParams(const UndistortParams& params);

    // Applies undistortion to src_bgr and writes result to dst_bgr.
    //
    // Returns true on success. When false, optional err contains a human-readable
    // message and dst_bgr is left in unspecified state.
    bool apply(const cv::Mat& src_bgr, cv::Mat& dst_bgr, std::string* err = nullptr);

private:
    static double clipd(double v, double lo, double hi);
    bool buildOrReuseMap(const cv::Size& in_size, const cv::Size& out_size, const UndistortParams& p);
    static UndistortParams clampParams(const UndistortParams& in, int in_w, int in_h);

private:
    UndistortInit init_;
    UndistortParams params_;

    cv::Mat map1_;
    cv::Mat map2_;
    bool cache_valid_ = false;
    std::string cache_model_;
    cv::Size cache_in_size_;
    cv::Size cache_out_size_;
    double cache_balance_ = 0.0;
    double cache_focal_scale_ = 0.0;
    double cache_cx_offset_ = 0.0;
    double cache_cy_offset_ = 0.0;
};

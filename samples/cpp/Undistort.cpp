#include "Undistort.h"

#include <algorithm>
#include <cmath>

Undistort::Undistort(const UndistortInit& init, const UndistortParams& params)
    : init_(init), params_(params) {}

void Undistort::setParams(const UndistortParams& params) {
    params_ = params;
}

double Undistort::clipd(double v, double lo, double hi) {
    return std::min(std::max(v, lo), hi);
}

UndistortParams Undistort::clampParams(const UndistortParams& in, int in_w, int in_h) {
    UndistortParams p = in;
    p.balance = clipd(p.balance, 0.0, 1.0);
    p.out_scale = clipd(p.out_scale, 0.5, 3.0);
    p.focal_scale = clipd(p.focal_scale, 0.4, 2.5);

    const int out_w = std::max(1, (int)std::lround(in_w * p.out_scale));
    const int out_h = std::max(1, (int)std::lround(in_h * p.out_scale));
    p.cx_offset = clipd(p.cx_offset, -out_w, out_w);
    p.cy_offset = clipd(p.cy_offset, -out_h, out_h);

    p.crop_x = clipd(p.crop_x, 0.0, 0.99);
    p.crop_y = clipd(p.crop_y, 0.0, 0.99);
    p.crop_w = clipd(p.crop_w, 0.01, 1.0 - p.crop_x);
    p.crop_h = clipd(p.crop_h, 0.01, 1.0 - p.crop_y);
    return p;
}

bool Undistort::buildOrReuseMap(const cv::Size& in_size, const cv::Size& out_size, const UndistortParams& p) {
    const std::string model = init_.preferred_model;
    const bool same_model = (cache_model_ == model);
    const bool same_in = (cache_in_size_ == in_size);
    const bool same_out = (cache_out_size_ == out_size);
    const bool same_params =
        std::abs(cache_balance_ - p.balance) < 1e-12 &&
        std::abs(cache_focal_scale_ - p.focal_scale) < 1e-12 &&
        std::abs(cache_cx_offset_ - p.cx_offset) < 1e-12 &&
        std::abs(cache_cy_offset_ - p.cy_offset) < 1e-12;

    // Fast path: reuse cached remap maps when model/size/params are unchanged.
    if (cache_valid_ && same_model && same_in && same_out && same_params && !map1_.empty() && !map2_.empty()) {
        return true;
    }

    cv::Mat newK;
    // Rebuild map when cache miss happens.
    if (model == "fisheye" && !init_.fisheye_K.empty() && !init_.fisheye_D.empty()) {
        static const cv::Mat I = cv::Mat::eye(3, 3, CV_64F);
        cv::fisheye::estimateNewCameraMatrixForUndistortRectify(
            init_.fisheye_K, init_.fisheye_D, in_size, I, newK, p.balance, out_size
        );
        newK.at<double>(0, 0) *= p.focal_scale;
        newK.at<double>(1, 1) *= p.focal_scale;
        newK.at<double>(0, 2) += p.cx_offset;
        newK.at<double>(1, 2) += p.cy_offset;
        cv::fisheye::initUndistortRectifyMap(
            init_.fisheye_K, init_.fisheye_D, I, newK, out_size, CV_16SC2, map1_, map2_
        );
    } else if (!init_.K.empty() && !init_.dist.empty()) {
        cv::getOptimalNewCameraMatrix(init_.K, init_.dist, in_size, 0.0, out_size, nullptr, false).copyTo(newK);
        newK.at<double>(0, 0) *= p.focal_scale;
        newK.at<double>(1, 1) *= p.focal_scale;
        newK.at<double>(0, 2) += p.cx_offset;
        newK.at<double>(1, 2) += p.cy_offset;
        cv::initUndistortRectifyMap(init_.K, init_.dist, cv::Mat(), newK, out_size, CV_16SC2, map1_, map2_);
    } else {
        return false;
    }

    cache_valid_ = true;
    cache_model_ = model;
    cache_in_size_ = in_size;
    cache_out_size_ = out_size;
    cache_balance_ = p.balance;
    cache_focal_scale_ = p.focal_scale;
    cache_cx_offset_ = p.cx_offset;
    cache_cy_offset_ = p.cy_offset;
    return true;
}

bool Undistort::apply(const cv::Mat& src_bgr, cv::Mat& dst_bgr, std::string* err) {
    if (src_bgr.empty()) {
        if (err) *err = "Input image is empty";
        return false;
    }

    const int w = src_bgr.cols;
    const int h = src_bgr.rows;
    const UndistortParams p = clampParams(params_, w, h);
    const int out_w = std::max(1, (int)std::lround(w * p.out_scale));
    const int out_h = std::max(1, (int)std::lround(h * p.out_scale));

    if (!buildOrReuseMap(cv::Size(w, h), cv::Size(out_w, out_h), p)) {
        if (err) *err = "Calibration parameters are incomplete";
        return false;
    }

    // Remap is the hot path; map cache amortizes its preparation cost.
    cv::remap(src_bgr, dst_bgr, map1_, map2_, cv::INTER_LINEAR, cv::BORDER_CONSTANT);

    if (p.crop_enable && !dst_bgr.empty()) {
        const int x0 = std::clamp((int)std::lround(p.crop_x * out_w), 0, dst_bgr.cols - 1);
        const int y0 = std::clamp((int)std::lround(p.crop_y * out_h), 0, dst_bgr.rows - 1);
        const int ww = std::max(1, (int)std::lround(p.crop_w * out_w));
        const int hh = std::max(1, (int)std::lround(p.crop_h * out_h));
        const int x1 = std::clamp(x0 + ww, x0 + 1, dst_bgr.cols);
        const int y1 = std::clamp(y0 + hh, y0 + 1, dst_bgr.rows);
        dst_bgr = dst_bgr(cv::Rect(x0, y0, x1 - x0, y1 - y0)).clone();
    }
    return true;
}

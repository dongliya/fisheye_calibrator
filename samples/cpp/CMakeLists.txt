cmake_minimum_required(VERSION 3.12)
project(undistort_demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(OpenCV REQUIRED)

add_executable(undistort_demo undistort_demo.cpp)
target_link_libraries(undistort_demo PRIVATE ${OpenCV_LIBS})
target_include_directories(undistort_demo PRIVATE ${OpenCV_INCLUDE_DIRS})

message(STATUS "OpenCV version: ${OpenCV_VERSION}")


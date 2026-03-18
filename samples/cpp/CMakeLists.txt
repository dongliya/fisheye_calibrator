cmake_minimum_required(VERSION 3.12)
project(undistort_demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs calib3d)

set(DEMO_SOURCES
  undistort_demo.cpp
  Undistort.cpp
)

set(DEMO_HEADERS
  Undistort.h
)

add_executable(undistort_demo)
target_sources(undistort_demo PRIVATE ${DEMO_SOURCES} ${DEMO_HEADERS})
target_link_libraries(undistort_demo PRIVATE ${OpenCV_LIBS})
target_include_directories(undistort_demo PRIVATE ${OpenCV_INCLUDE_DIRS})

if (MSVC)
  target_compile_options(undistort_demo PRIVATE /W4)
else()
  target_compile_options(undistort_demo PRIVATE -Wall -Wextra -Wpedantic)
endif()

message(STATUS "OpenCV version: ${OpenCV_VERSION}")

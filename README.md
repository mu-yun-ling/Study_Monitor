# 🚀 StudyMonitor: 专注力实时监控系统

**StudyMonitor** 是一款基于计算机视觉的智能专注力辅助工具。通过摄像头实时追踪用户的头部姿态、面部特征及眨眼频率，智能识别“走神”、“疲劳”及“离岗”状态，并根据不同的使用场景（学习/作业）提供定制化的监控逻辑。

---

## ✨ 核心特性

* **🎬 双模式智能监控**:
*     **学习模式**: 针对电脑办公场景。当系统检测到用户长时间走神时触发预警。
*     **作业模式**: 针对纸质读写场景。当系统检测到用户长时间走神时触发预警。


* **👁️ 疲劳监测**: 通过 EAR 算法精准计算眨眼频率与闭眼时长，识别深度疲劳状态。
* **📐 头部姿态估计**: 基于 `MediaPipe` 468点人脸网格，计算 Pitch（俯仰）、Yaw（偏转）和 Roll（翻滚），全方位感知视觉焦点。
* **📊 个人化自动校准**: 系统启动时自动采集用户的眼睛特征基准值，适应不同个体的眼部差异。
* **🌐 实时 Web 交互**: 采用 Flask-SocketIO 实现低延迟画面传输与实时数据看板。

---

## 🛠️ 技术栈

* **算法层**: Python, OpenCV, MediaPipe, NumPy
* **后端**: Flask, Flask-SocketIO (WebSocket 实时通信)
* **前端**: HTML5, CSS3, JavaScript (支持实时视频流与图表展示)

---

## 📦 快速开始

### 1. 环境准备

确保您的电脑已安装 Python 3.8+，并拥有可用的摄像头。

### 2. 安装依赖

```bash
pip install opencv-python mediapipe numpy flask flask-socketio

```

### 3. 运行程序

```bash
python function.py

```

启动后，在浏览器访问：`http://127.0.0.1:5000`

---

## 📐 算法原理

项目核心逻辑位于 `monitor.py` 中，主要包含以下数学模型：

### 头部姿态监测

系统通过解算 PnP 问题获取旋转向量，进而转化为欧拉角：

* **Pitch**: 用于判断抬头/低头。
* **Yaw**: 用于判断左右转头。

### 眼睛纵横比 (EAR)

通过计算眼睛关键点之间的距离比例来判定闭眼状态：


---

## ⚙️ 参数配置

您可以在 Web 界面或 `update_settings` API 中动态调整以下阈值：

| 参数 | 描述 | 默认值 |
| --- | --- | --- |
| `EAR_THRESHOLD` | 闭眼判定阈值（校准后自动更新） | 0.35 |
| `PITCH_THRESHOLD_UP` | 作业模式抬头走神阈值 | 2° |
| `PITCH_THRESHOLD_DOWN` | 学习模式低头走神阈值 | 0° |
| `DROWSY_TIME` | 触发疲劳预警的持续闭眼时间 | 30s |
| `DISTRACTION_TIME` | 触发走神预警的持续偏移时间 | 120s |

---

## 📂 项目结构

```text
├── monitor.py          # 核心算法：姿态计算、状态判定逻辑
├── function.py         # Web 服务：Flask 路由与 WebSocket 通信
├── custom/
│   └── face_geometry.py # 几何辅助计算：PCF 与坐标变换
└── web/                # 前端界面文件
    ├── start.html      # 入口页面
    └── monitor.html    # 实时监控看板
└── myenv               # 为本次项目创建的虚拟环境
    


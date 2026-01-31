=================本项目是南开大学Python语言程序设计期末大作业=======================



🚀 StudyMonitor: 专注力实时监控系统
StudyMonitor 是一款基于计算机视觉的智能专注力辅助工具。通过摄像头实时追踪用户的头部姿态、面部特征及眨眼频率，智能识别“走神”、“疲劳”及“离岗”状态，并根据不同的使用场景（学习/作业）提供定制化的监控逻辑。

🌟 项目亮点
🎭 双场景模式切换：

学习模式 (STUDY)：锁定电脑屏幕。持续低头（如看手机）超过 2 分钟即判定为走神。

作业模式 (HOMEWORK)：锁定书本桌面。持续抬头（如看电视、发呆）超过 2 分钟即判定为走神。

🧠 智能疲劳分析：不仅监测闭眼，还能通过滑动窗口平滑数据，精准区分“眨眼”与“困倦”。

⚖️ 动态自动校准：系统启动前 60 帧自动采集个人 EAR（眼睛纵横比）基准值，适配不同眼型。

⚡ 毫秒级实时响应：基于 Flask-SocketIO，实现视频流与算法数据的同步推送，延迟极低。

🛠️ 技术栈
算法层: Python, OpenCV, MediaPipe, NumPy
后端: Flask, Flask-SocketIO (WebSocket 实时通信)
前端: HTML5, CSS3, JavaScript (支持实时视频流与图表展示)
📦 快速开始
1. 环境准备
确保您的电脑已安装 Python 3.8+，并拥有可用的摄像头。

2. 安装依赖
pip install opencv-python mediapipe numpy flask flask-socketio

4. 运行程序
运行 function.py 文件
系统将自动打开网页，也可自行在浏览器访问：http://127.0.0.1:5000

📐 算法原理
项目核心逻辑位于 monitor.py 中，主要包含以下算法

头部姿态监测
系统通过解算 PnP 问题获取旋转向量，进而转化为欧拉角

Pitch: 用于判断抬头/低头。
Yaw: 用于判断左右转头。
眼睛纵横比 (EAR)
通过计算眼睛关键点之间的距离比例来判定闭眼状态：

⚙️ 参数配置
您可以在 Web 界面或 update_settings API 中根据自身情况动态调整以下阈值

参数	描述	默认值
EAR_THRESHOLD	闭眼判定阈值（校准后自动更新）	0.35
PITCH_THRESHOLD_UP	作业模式抬头走神阈值	2°
PITCH_THRESHOLD_DOWN	学习模式低头走神阈值	0°
DROWSY_TIME	触发疲劳预警的持续闭眼时间	30s
DISTRACTION_TIME	触发走神预警的持续偏移时间	120s  

📂 项目结构

├── videosource.py      # 视频流驱动：负责摄像头调度与帧提取
├── settings.json       # 配置文件：存储用户的个性化阈值与模式设定
├── monitor.py          # 核心算法：姿态计算、状态判定逻辑
├── function.py         # Web 服务：Flask 路由与 WebSocket 通信
├── custom/              # 几何辅助计算
│   └── face_geometry.py # 几何辅助计算：PCF 与坐标变换
└── web/                # 前端界面文件
    ├── start.html      # 入口页面
    └── monitor.html    # 实时监控看板
└── myenv               # 为本次项目创建的虚拟环境
    

import cv2
import mediapipe as mp
import numpy as np
from datetime import datetime
import time
from enum import Enum
from collections import deque
import base64
import threading

from custom.face_geometry import (
    PCF,
    get_metric_landmarks,
    procrustes_landmark_basis,
)

# MediaPipe 关键点索引
LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

points_idx = [33, 263, 61, 291, 199]
points_idx = points_idx + [key for (key, val) in procrustes_landmark_basis]
points_idx = list(set(points_idx))
points_idx.sort()


class Mode(Enum):
    STUDY = "学习模式"      # 电脑工作，抬头正常，持续低头则判定为走神
    HOMEWORK = "作业模式"   # 写作业阅读，低头正常，持续抬头则判定为走神


class AlertLevel(Enum):
    NONE = 0
    GENTLE = 1
    WARNING = 2
    CRITICAL = 3


class FocusMonitorCore:
    """核心监控逻辑，供Web调用"""

    def __init__(self):
        # 帧尺寸
        self.frame_height = 720
        self.frame_width = 1280

        # 相机参数
        focal_length = self.frame_width
        center = (self.frame_width / 2, self.frame_height / 2)
        self.camera_matrix = np.array(
            [[focal_length, 0, center[0]], [0, focal_length, center[1]], [0, 0, 1]],
            dtype="double",
        )

        # PCF
        self.pcf = PCF(
            near=1,
            far=10000,
            frame_height=self.frame_height,
            frame_width=self.frame_width,
            fy=self.camera_matrix[1, 1],
        )

        # MediaPipe
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        # 模式
        self.mode = Mode.STUDY

        # ===== 可调阈值 =====
        self.EAR_THRESHOLD = 0.35
        self.EAR_CALIBRATION_RATIO = 0.7
        
        # 学习模式：低头阈值（pitch低于此值视为低头走神，如玩手机）
        self.PITCH_THRESHOLD_HEAD_DOWN = 0
        
        # 作业模式：抬头阈值（pitch高于此值视为抬头走神，如发呆）
        self.PITCH_THRESHOLD_HEAD_UP = 2
        
        # 转头阈值（通用）
        self.YAW_THRESHOLD = 30

        # 时间阈值（秒）
        self.STUDY_DISTRACTION_TIME = 120      # 学习模式：低头超过2分钟
        self.HOMEWORK_DISTRACTION_TIME = 120   # 作业模式：抬头超过2分钟
        self.DROWSY_TIME = 30                  # 闭眼超过30秒
        self.TURN_HEAD_TIME = 30               # 转头超过30秒
        self.FACE_LOST_TIMEOUT = 5

        # 眨眼检测
        self.BLINK_FRAMES_THRESHOLD = 3
        self.eye_closed_frames = 0
        self.blink_counter = 0

        # 状态追踪
        self.distraction_start = None  # 统一用一个变量追踪走神开始时间
        self.head_turn_start = None
        self.drowsy_start = None
        self.face_lost_start = None
        self.is_distracted = False
        self.distraction_reason = ""
        self.current_alert_level = AlertLevel.NONE

        # 滑动窗口
        self.pitch_history = deque(maxlen=10)
        self.yaw_history = deque(maxlen=10)
        self.ear_history = deque(maxlen=10)

        # 校准
        self.ear_samples = []
        self.calibrated = False
        self.personal_ear_baseline = None
        self.calibration_frames = 60
        self.calibration_progress = 0

        # 统计
        self.total_distraction_count = 0
        self.session_start = datetime.now()

        # 当前数据（供前端读取）
        self.current_data = {
            'pitch': 0,
            'yaw': 0,
            'roll': 0,
            'ear': 0,
            'face_detected': False,
            'calibrated': False,
            'calibration_progress': 0,
            'is_distracted': False,
            'distraction_reason': '',
            'alert_level': 0,
            'mode': 'STUDY',
            'distraction_count': 0,
            'session_duration': '00:00:00',
            'blink_count': 0,
            'timers': {}
        }

        # 运行状态
        self.running = False
        self.cap = None

    def calculate_ear(self, landmarks, eye_indices):
        """计算眼睛纵横比"""
        eye_points = np.array([(landmarks[i].x, landmarks[i].y) for i in eye_indices])
        vertical_1 = np.linalg.norm(eye_points[1] - eye_points[5])
        vertical_2 = np.linalg.norm(eye_points[2] - eye_points[4])
        horizontal = np.linalg.norm(eye_points[0] - eye_points[3])
        if horizontal == 0:
            return 0.5
        return (vertical_1 + vertical_2) / (2.0 * horizontal)

    def get_head_pose_angles(self, rotation_vector):
        """获取头部姿态角度"""
        rotation_mat, _ = cv2.Rodrigues(rotation_vector)
        sy = np.sqrt(rotation_mat[0, 0] ** 2 + rotation_mat[1, 0] ** 2)
        singular = sy < 1e-6

        if not singular:
            pitch = np.arctan2(-rotation_mat[2, 0], sy)
            yaw = np.arctan2(rotation_mat[1, 0], rotation_mat[0, 0])
            roll = np.arctan2(rotation_mat[2, 1], rotation_mat[2, 2])
        else:
            pitch = np.arctan2(-rotation_mat[2, 0], sy)
            yaw = np.arctan2(-rotation_mat[1, 2], rotation_mat[1, 1])
            roll = 0

        return np.degrees(pitch), np.degrees(yaw), np.degrees(roll)

    def calibrate_ear(self, ear):
        """EAR校准"""
        if self.calibrated:
            return

        self.ear_samples.append(ear)
        self.calibration_progress = len(self.ear_samples) / self.calibration_frames * 100

        if len(self.ear_samples) >= self.calibration_frames:
            sorted_samples = sorted(self.ear_samples)
            trim_count = len(sorted_samples) // 10
            if trim_count > 0:
                trimmed = sorted_samples[trim_count:-trim_count]
            else:
                trimmed = sorted_samples

            self.personal_ear_baseline = np.mean(trimmed)
            self.EAR_THRESHOLD = self.personal_ear_baseline * self.EAR_CALIBRATION_RATIO
            self.calibrated = True

    def get_smoothed_values(self, pitch, yaw, ear):
        """滑动窗口平滑"""
        self.pitch_history.append(pitch)
        self.yaw_history.append(yaw)
        self.ear_history.append(ear)

        return (
            np.median(self.pitch_history),
            np.median(self.yaw_history),
            np.mean(self.ear_history)
        )

    def detect_drowsy_vs_blink(self, ear):
        """区分眨眼和闭眼"""
        if ear < self.EAR_THRESHOLD:
            self.eye_closed_frames += 1
        else:
            if 0 < self.eye_closed_frames < self.BLINK_FRAMES_THRESHOLD:
                self.blink_counter += 1
            self.eye_closed_frames = 0

        return self.eye_closed_frames >= self.BLINK_FRAMES_THRESHOLD

    def get_alert_level(self, elapsed_time, threshold_time):
        """获取警告等级"""
        if elapsed_time is None or threshold_time <= 0:
            return AlertLevel.NONE

        ratio = elapsed_time / threshold_time
        if ratio < 0.5:
            return AlertLevel.NONE
        elif ratio < 0.75:
            return AlertLevel.GENTLE
        elif ratio < 1.0:
            return AlertLevel.WARNING
        else:
            return AlertLevel.CRITICAL

    def check_focus_state(self, pitch, yaw, ear, current_time):
        """检查专注状态 - 修正后的逻辑"""
        if self.is_distracted:
            return

        max_alert = AlertLevel.NONE
        timers = {}

        # 1. 检测犯困（闭眼）- 两种模式通用
        is_truly_closed = self.detect_drowsy_vs_blink(ear)
        if is_truly_closed:
            if self.drowsy_start is None:
                self.drowsy_start = current_time
            else:
                elapsed = current_time - self.drowsy_start
                timers['drowsy'] = {'elapsed': elapsed, 'threshold': self.DROWSY_TIME}
                alert = self.get_alert_level(elapsed, self.DROWSY_TIME)
                if alert.value > max_alert.value:
                    max_alert = alert
                if elapsed > self.DROWSY_TIME:
                    self.is_distracted = True
                    self.distraction_reason = "检测到犯困 (长时间闭眼)"
                    self.current_alert_level = AlertLevel.CRITICAL
                    return
        else:
            self.drowsy_start = None

        # 2. 检测转头 - 两种模式通用
        if abs(yaw) > self.YAW_THRESHOLD:
            if self.head_turn_start is None:
                self.head_turn_start = current_time
            else:
                elapsed = current_time - self.head_turn_start
                timers['turn'] = {'elapsed': elapsed, 'threshold': self.TURN_HEAD_TIME}
                alert = self.get_alert_level(elapsed, self.TURN_HEAD_TIME)
                if alert.value > max_alert.value:
                    max_alert = alert
                if elapsed > self.TURN_HEAD_TIME:
                    self.is_distracted = True
                    direction = "左" if yaw > 0 else "右"
                    self.distraction_reason = f"长时间转头看{direction}边"
                    self.current_alert_level = AlertLevel.CRITICAL
                    return
        else:
            self.head_turn_start = None

        # 3. 根据模式检查抬头/低头
        if self.mode == Mode.STUDY:
            # 学习模式：用电脑，正常应该抬头看屏幕
            # 低头（pitch < 阈值）视为走神（玩手机、打瞌睡）
            if pitch < self.PITCH_THRESHOLD_HEAD_DOWN:
                if self.distraction_start is None:
                    self.distraction_start = current_time
                else:
                    elapsed = current_time - self.distraction_start
                    timers['head_down'] = {'elapsed': elapsed, 'threshold': self.STUDY_DISTRACTION_TIME}
                    alert = self.get_alert_level(elapsed, self.STUDY_DISTRACTION_TIME)
                    if alert.value > max_alert.value:
                        max_alert = alert
                    if elapsed > self.STUDY_DISTRACTION_TIME:
                        self.is_distracted = True
                        self.distraction_reason = f"长时间低头 (已持续 {int(elapsed/60)} 分钟)，请专注屏幕"
                        self.current_alert_level = AlertLevel.CRITICAL
                        return
            else:
                self.distraction_start = None

        elif self.mode == Mode.HOMEWORK:
            # 作业模式：写作业/阅读，正常应该低头看桌面
            # 抬头（pitch > 阈值）视为走神（发呆、看别处）
            if pitch > self.PITCH_THRESHOLD_HEAD_UP:
                if self.distraction_start is None:
                    self.distraction_start = current_time
                else:
                    elapsed = current_time - self.distraction_start
                    timers['head_up'] = {'elapsed': elapsed, 'threshold': self.HOMEWORK_DISTRACTION_TIME}
                    alert = self.get_alert_level(elapsed, self.HOMEWORK_DISTRACTION_TIME)
                    if alert.value > max_alert.value:
                        max_alert = alert
                    if elapsed > self.HOMEWORK_DISTRACTION_TIME:
                        self.is_distracted = True
                        self.distraction_reason = f"长时间抬头发呆 (已持续 {int(elapsed/60)} 分钟)，请专注作业"
                        self.current_alert_level = AlertLevel.CRITICAL
                        return
            else:
                self.distraction_start = None

        self.current_alert_level = max_alert
        self.current_data['timers'] = timers

    def reset_distraction(self):
        """重置开小差状态"""
        self.is_distracted = False
        self.distraction_start = None
        self.head_turn_start = None
        self.drowsy_start = None
        self.current_alert_level = AlertLevel.NONE
        self.eye_closed_frames = 0
        self.total_distraction_count += 1

    def reset_calibration(self):
        """重置校准"""
        self.ear_samples = []
        self.calibrated = False
        self.personal_ear_baseline = None
        self.EAR_THRESHOLD = 0.35
        self.calibration_progress = 0

    def set_mode(self, mode_str):
        """设置模式"""
        if mode_str == 'STUDY':
            self.mode = Mode.STUDY
        else:
            self.mode = Mode.HOMEWORK
        # 切换模式时重置计时器
        self.distraction_start = None
        self.head_turn_start = None

    def reset_session(self):
        """重置会话"""
        self.total_distraction_count = 0
        self.session_start = datetime.now()
        self.blink_counter = 0

    def process_frame(self, frame):
        """处理单帧图像"""
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(frame_rgb)

        if results.multi_face_landmarks:
            self.face_lost_start = None
            face_landmarks = results.multi_face_landmarks[0]

            landmarks = np.array(
                [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            )
            landmarks = landmarks.T
            landmarks = landmarks[:, :468]

            metric_landmarks, pose_transform_mat = get_metric_landmarks(
                landmarks.copy(), self.pcf
            )

            pose_transform_mat[1:3, :] = -pose_transform_mat[1:3, :]
            mp_rotation_vector, _ = cv2.Rodrigues(pose_transform_mat[:3, :3])

            raw_pitch, raw_yaw, raw_roll = self.get_head_pose_angles(mp_rotation_vector)

            left_ear = self.calculate_ear(face_landmarks.landmark, LEFT_EYE_INDICES)
            right_ear = self.calculate_ear(face_landmarks.landmark, RIGHT_EYE_INDICES)
            raw_ear = (left_ear + right_ear) / 2.0

            self.calibrate_ear(raw_ear)
            pitch, yaw, ear = self.get_smoothed_values(raw_pitch, raw_yaw, raw_ear)

            current_time = time.time()
            self.check_focus_state(pitch, yaw, ear, current_time)

            # 更新当前数据
            elapsed_session = datetime.now() - self.session_start
            self.current_data.update({
                'pitch': round(pitch, 1),
                'yaw': round(yaw, 1),
                'roll': round(raw_roll, 1),
                'ear': round(ear, 3),
                'face_detected': True,
                'calibrated': self.calibrated,
                'calibration_progress': round(self.calibration_progress, 1),
                'is_distracted': self.is_distracted,
                'distraction_reason': self.distraction_reason,
                'alert_level': self.current_alert_level.value,
                'mode': self.mode.name,
                'distraction_count': self.total_distraction_count,
                'session_duration': str(elapsed_session).split('.')[0],
                'blink_count': self.blink_counter,
                'ear_threshold': round(self.EAR_THRESHOLD, 3),
                'pitch_down_threshold': self.PITCH_THRESHOLD_HEAD_DOWN,
                'pitch_up_threshold': self.PITCH_THRESHOLD_HEAD_UP,
                'yaw_threshold': self.YAW_THRESHOLD,
            })

            return True
        else:
            current_time = time.time()
            if self.face_lost_start is None:
                self.face_lost_start = current_time
            elif current_time - self.face_lost_start > self.FACE_LOST_TIMEOUT:
                self.distraction_start = None
                self.head_turn_start = None
                self.drowsy_start = None

            self.current_data['face_detected'] = False
            return False

    def get_settings(self):
        """获取当前设置"""
        return {
            'ear_threshold': self.EAR_THRESHOLD,
            'pitch_head_down': self.PITCH_THRESHOLD_HEAD_DOWN,
            'pitch_head_up': self.PITCH_THRESHOLD_HEAD_UP,
            'yaw_threshold': self.YAW_THRESHOLD,
            'study_time': self.STUDY_DISTRACTION_TIME,
            'homework_time': self.HOMEWORK_DISTRACTION_TIME,
            'drowsy_time': self.DROWSY_TIME,
            'turn_time': self.TURN_HEAD_TIME,
            'mode': self.mode.name,
        }

    def update_settings(self, settings):
        """更新设置"""
        if 'ear_threshold' in settings:
            self.EAR_THRESHOLD = float(settings['ear_threshold'])
        if 'pitch_head_down' in settings:
            self.PITCH_THRESHOLD_HEAD_DOWN = int(settings['pitch_head_down'])
        if 'pitch_head_up' in settings:
            self.PITCH_THRESHOLD_HEAD_UP = int(settings['pitch_head_up'])
        if 'yaw_threshold' in settings:
            self.YAW_THRESHOLD = int(settings['yaw_threshold'])
        if 'study_time' in settings:
            self.STUDY_DISTRACTION_TIME = int(settings['study_time'])
        if 'homework_time' in settings:
            self.HOMEWORK_DISTRACTION_TIME = int(settings['homework_time'])
        if 'drowsy_time' in settings:
            self.DROWSY_TIME = int(settings['drowsy_time'])
        if 'turn_time' in settings:
            self.TURN_HEAD_TIME = int(settings['turn_time'])
        if 'mode' in settings:
            self.set_mode(settings['mode'])
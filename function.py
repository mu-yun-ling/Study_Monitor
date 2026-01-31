from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO
import cv2
import base64
import webbrowser
import threading
import json
import os
from monitor import FocusMonitorCore

app = Flask(__name__, template_folder='web', static_folder='web', static_url_path='')
app.config['SECRET_KEY'] = 'dev_key'
socketio = SocketIO(app, cors_allowed_origins="*")

monitor = FocusMonitorCore()
is_streaming = False

# 配置文件路径
SETTINGS_FILE = 'settings.json'

def load_saved_settings():
    """启动时加载保存的设置"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                monitor.update_settings(settings)
                print(f"✅ 已加载保存的设置: {settings}")
        except Exception as e:
            print(f"⚠️ 加载设置失败: {e}")

def save_settings_to_file(settings):
    """保存设置到文件"""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        print(f"✅ 设置已保存到 {SETTINGS_FILE}")
    except Exception as e:
        print(f"⚠️ 保存设置失败: {e}")

def background_thread():
    global is_streaming
    cap = cv2.VideoCapture(0)
    while is_streaming:
        success, frame = cap.read()
        if not success:
            socketio.sleep(0.1)
            continue
        
        monitor.process_frame(frame)
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
        frame_data = base64.b64encode(buffer).decode('utf-8')
        
        socketio.emit('frame', {'image': frame_data})
        socketio.emit('monitor_data', monitor.current_data) 
        socketio.sleep(0.04)
    cap.release()

@app.route('/')
def index(): 
    return render_template('start.html')

@app.route('/monitor')
def monitor_page(): 
    return render_template('monitor.html')

@app.route('/api/start', methods=['POST'])
def start():
    global is_streaming
    if not is_streaming:
        is_streaming = True
        socketio.start_background_task(background_thread)
    return jsonify({'status': 'ok'})

@app.route('/api/stop', methods=['POST'])
def stop():
    global is_streaming
    is_streaming = False
    return jsonify({'status': 'ok'})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """获取当前设置"""
    return jsonify({
        'status': 'ok',
        'settings': {
            'ear_threshold': monitor.EAR_THRESHOLD,
            'pitch_head_down': monitor.PITCH_THRESHOLD_HEAD_DOWN,
            'pitch_head_up': monitor.PITCH_THRESHOLD_HEAD_UP,
            'yaw_threshold': monitor.YAW_THRESHOLD
        }
    })

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """更新并保存设置"""
    settings = request.json
    monitor.update_settings(settings)
    save_settings_to_file(settings)
    return jsonify({'status': 'ok'})

@app.route('/api/mode', methods=['POST'])
def set_mode():
    monitor.set_mode(request.json.get('mode', 'STUDY'))
    return jsonify({'status': 'ok'})

@app.route('/api/reset_distraction', methods=['POST'])
def reset_distraction():
    monitor.reset_distraction()
    return jsonify({'status': 'ok'})

def open_browser():
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    print("\n" + "="*50)
    print("学习监督系统启动中...")
    print("="*50)
    
    # 加载保存的设置
    load_saved_settings()
    
    threading.Timer(1.5, open_browser).start()
    
    print("系统就绪！浏览器将自动打开...")
    print("也可以手动访问: http://127.0.0.1:5000")
    print("\n关闭此窗口将停止程序")
    print("="*50 + "\n")
    
    socketio.run(app, debug=False, host='127.0.0.1', port=5000)
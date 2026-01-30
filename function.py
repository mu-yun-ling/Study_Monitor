from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO
import cv2
import base64
from monitor import FocusMonitorCore

app = Flask(__name__, template_folder='web', static_folder='web', static_url_path='')
app.config['SECRET_KEY'] = 'dev_key'
socketio = SocketIO(app, cors_allowed_origins="*")

monitor = FocusMonitorCore()
is_streaming = False

def background_thread():
    global is_streaming
    cap = cv2.VideoCapture(0)
    while is_streaming:
        success, frame = cap.read()
        if not success:
            socketio.sleep(0.1)
            continue
        
        # 核心：计算数据
        monitor.process_frame(frame)
        
        # 编码画面
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
        frame_data = base64.b64encode(buffer).decode('utf-8')
        
        # 推送：画面 + 完整算法数据 (含 ear, pitch, yaw)
        socketio.emit('frame', {'image': frame_data})
        socketio.emit('monitor_data', monitor.current_data) 
        socketio.sleep(0.04)
    cap.release()

@app.route('/')
def index(): return render_template('start.html')

@app.route('/monitor')
def monitor_page(): return render_template('monitor.html')

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

@app.route('/api/settings', methods=['POST'])
def update_settings():
    monitor.update_settings(request.json)
    return jsonify({'status': 'ok'})

@app.route('/api/mode', methods=['POST'])
def set_mode():
    monitor.set_mode(request.json.get('mode', 'STUDY'))
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("\n🚀 系统就绪！访问: http://127.0.0.1:5000")
    # debug=False 解决“复读机”输出问题
    socketio.run(app, debug=False, host='127.0.0.1', port=5000)
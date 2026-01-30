document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    let selectedMode = 'STUDY';

    // 1. 模式切换
    document.querySelectorAll('.mode-card').forEach(card => {
        card.onclick = function() {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            selectedMode = this.dataset.mode;
        };
    });

    // 2. 滑动条数字实时变化
    const sliders = [
        { id: 'ear_threshold', valId: 'earThresholdValue', suffix: '' },
        { id: 'pitch_extreme_low', valId: 'pitchExtremeLowValue', suffix: '°' }
    ];
    sliders.forEach(item => {
        const s = document.getElementById(item.id);
        const v = document.getElementById(item.valId);
        if (s && v) {
            s.oninput = function() { v.innerText = this.value + item.suffix; };
        }
    });

    // 3. 调试弹窗与摄像头开启
    const modal = document.getElementById('settingsModal');
    const debugVideo = document.getElementById('debugVideo');

    document.getElementById('settingsBtn').onclick = () => {
        modal.classList.add('active'); // CSS中需确保 .modal.active 是 display:flex
        modal.style.display = 'flex'; 
        fetch('/api/start', { method: 'POST' }); // 开启推流
    };

    document.getElementById('closeModal').onclick = () => {
        modal.style.display = 'none';
        fetch('/api/stop', { method: 'POST' }); // 关闭推流省资源
    };

    // 4. 接收后端实时数据和画面
    socket.on('frame', (data) => {
        if (debugVideo) debugVideo.src = 'data:image/jpeg;base64,' + data.image;
    });

    socket.on('monitor_data', (data) => {
        // 实时填充左侧的绿色数字
        if (document.getElementById('live_ear')) document.getElementById('live_ear').innerText = (data.ear || 0).toFixed(3);
        if (document.getElementById('live_pitch')) document.getElementById('live_pitch').innerText = Math.round(data.pitch || 0) + '°';
        if (document.getElementById('live_yaw')) document.getElementById('live_yaw').innerText = Math.round(data.yaw || 0) + '°';
    });

    // 5. 保存设置并进入
    document.getElementById('saveSettingsBtn').onclick = async () => {
        const settings = {
            ear_threshold: document.getElementById('ear_threshold').value,
            pitch_extreme_low: document.getElementById('pitch_extreme_low').value
        };
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        modal.style.display = 'none';
    };

    document.getElementById('startBtn').onclick = async () => {
        await fetch('/api/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: selectedMode })
        });
        window.location.href = '/monitor';
    };
});
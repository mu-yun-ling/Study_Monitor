const socket = io();
const videoImg = document.getElementById('videoFeed');

socket.on('frame', (data) => {
    videoImg.src = 'data:image/jpeg;base64,' + data.image;
});

socket.on('monitor_data', (data) => {
    // 这里更新页面上的文字
    document.getElementById('score').innerText = data.focus_score || 0;
    document.getElementById('blinks').innerText = data.blink_count || 0;
    document.getElementById('status').innerText = data.is_distracted ? "⚠️ 走神了" : "✅ 专注中";
    document.getElementById('pose').innerText = `P:${data.pitch}° Y:${data.yaw}°`;
});

function startBtn() {
    fetch('/api/start', { method: 'POST' });
}

function stopBtn() {
    fetch('/api/stop', { method: 'POST' });
    videoImg.src = "";
}
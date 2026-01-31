document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    let selectedMode = 'STUDY';

    // ========== 加载统计数据 ==========
    function loadStats() {
        const history = JSON.parse(localStorage.getItem('focus-monitor-history') || '[]');
        const score = parseInt(localStorage.getItem('focus-monitor-score') || '0');
        
        let totalTime = 0;
        let totalPomodoros = 0;
        let totalTasks = 0;
        
        history.forEach(item => {
            totalTime += item.duration || 0;
            totalPomodoros += item.pomodoros || 0;
            totalTasks += item.tasks || 0;
        });
        
        document.getElementById('totalScore').textContent = score;
        document.getElementById('totalTime').textContent = totalTime >= 60 
            ? Math.floor(totalTime / 60) + 'h' 
            : totalTime + 'm';
        document.getElementById('totalPomodoros').textContent = totalPomodoros;
        document.getElementById('totalTasks').textContent = totalTasks;
    }
    
    loadStats();

    // ========== 模式切换 ==========
    document.querySelectorAll('.mode-card').forEach(card => {
        card.onclick = function() {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            selectedMode = this.dataset.mode;
        };
    });

    // ========== 滑动条 ==========
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

    // ========== 调试弹窗 ==========
    const settingsModal = document.getElementById('settingsModal');
    const debugVideo = document.getElementById('debugVideo');

    document.getElementById('settingsBtn').onclick = () => {
        settingsModal.style.display = 'flex';
        fetch('/api/start', { method: 'POST' });
    };

    document.getElementById('closeModal').onclick = () => {
        settingsModal.style.display = 'none';
        fetch('/api/stop', { method: 'POST' });
    };

    // ========== 学习记录弹窗 ==========
    const recordModal = document.getElementById('recordModal');
    
    document.getElementById('recordBtn').onclick = () => {
        recordModal.style.display = 'flex';
        loadRecordData('today');
    };
    
    document.getElementById('closeRecordModal').onclick = () => {
        recordModal.style.display = 'none';
    };
    
    // Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadRecordData(this.dataset.tab);
        };
    });
    
    function loadRecordData(period) {
        const history = JSON.parse(localStorage.getItem('focus-monitor-history') || '[]');
        const now = new Date();
        let filtered = [];
        
        if (period === 'today') {
            const today = now.toDateString();
            filtered = history.filter(item => new Date(item.date).toDateString() === today);
        } else if (period === 'week') {
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            filtered = history.filter(item => new Date(item.date) >= weekAgo);
        } else {
            filtered = history;
        }
        
        // 计算汇总
        let totalTime = 0, totalScore = 0, totalPomodoros = 0, totalTasks = 0, totalDistractions = 0;
        
        filtered.forEach(item => {
            totalTime += item.duration || 0;
            totalScore += item.score || 0;
            totalPomodoros += item.pomodoros || 0;
            totalTasks += item.tasks || 0;
            totalDistractions += item.distractions || 0;
        });
        
        document.getElementById('recordTime').textContent = totalTime + ' 分钟';
        document.getElementById('recordScore').textContent = '+' + totalScore;
        document.getElementById('recordPomodoros').textContent = totalPomodoros + ' 个';
        document.getElementById('recordTasks').textContent = totalTasks + ' 个';
        document.getElementById('recordDistractions').textContent = totalDistractions + ' 次';
        
        // 渲染历史列表
        const historyList = document.getElementById('historyList');
        if (filtered.length === 0) {
            historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
        } else {
            historyList.innerHTML = filtered.slice(0, 20).map(item => {
                const date = new Date(item.date);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                return `
                    <div class="history-item">
                        <span class="history-date">${dateStr}</span>
                        <span class="history-detail">${item.duration}分钟 | 🍅${item.pomodoros} | ✅${item.tasks}</span>
                        <span class="history-score">+${item.score || 0}</span>
                    </div>
                `;
            }).join('');
        }
    }
    
    document.getElementById('clearRecordBtn').onclick = () => {
        if (confirm('确定要清空所有学习记录吗？此操作不可撤销！')) {
            localStorage.removeItem('focus-monitor-history');
            localStorage.removeItem('focus-monitor-score');
            loadRecordData('today');
            loadStats();
        }
    };

    // ========== Socket 数据 ==========
    socket.on('frame', (data) => {
        if (debugVideo) debugVideo.src = 'data:image/jpeg;base64,' + data.image;
    });

    socket.on('monitor_data', (data) => {
        if (document.getElementById('live_ear')) {
            document.getElementById('live_ear').innerText = (data.ear || 0).toFixed(3);
        }
        if (document.getElementById('live_pitch')) {
            document.getElementById('live_pitch').innerText = Math.round(data.pitch || 0) + '°';
        }
        if (document.getElementById('live_yaw')) {
            document.getElementById('live_yaw').innerText = Math.round(data.yaw || 0) + '°';
        }
    });

    // ========== 保存设置 ==========
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
        settingsModal.style.display = 'none';
        fetch('/api/stop', { method: 'POST' });
    };

    // ========== 开始学习 ==========
    document.getElementById('startBtn').onclick = async () => {
        localStorage.setItem('study-mode', selectedMode);
        await fetch('/api/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: selectedMode })
        });
        window.location.href = '/monitor';
    };
});
// ========== Socket 连接 ==========
const socket = io();

// ========== DOM 元素 ==========
const elements = {
    backBtn: document.getElementById('backBtn'),
    modeBadge: document.getElementById('modeBadge'),
    currentScore: document.getElementById('currentScore'),
    scoreChange: document.getElementById('scoreChange'),
    sessionTimer: document.getElementById('sessionTimer'),
    statusIndicator: document.getElementById('statusIndicator'),
    
    pomodoroTime: document.getElementById('pomodoroTime'),
    pomodoroLabel: document.getElementById('pomodoroLabel'),
    pomodoroCycle: document.getElementById('pomodoroCycle'),
    pomodoroCount: document.getElementById('pomodoroCount'),
    pomodoroStartBtn: document.getElementById('pomodoroStartBtn'),
    pomodoroResetBtn: document.getElementById('pomodoroResetBtn'),
    progressRing: document.getElementById('progressRing'),
    focusDuration: document.getElementById('focusDuration'),
    breakDuration: document.getElementById('breakDuration'),
    cycleCount: document.getElementById('cycleCount'),
    
    todoInput: document.getElementById('todoInput'),
    addTodoBtn: document.getElementById('addTodoBtn'),
    todoList: document.getElementById('todoList'),
    todoCompleted: document.getElementById('todoCompleted'),
    todoTotal: document.getElementById('todoTotal'),
    
    videoFeed: document.getElementById('videoFeed'),
    pipContainer: document.getElementById('pipContainer'),
    pipHeader: document.getElementById('pipHeader'),
    pipToggle: document.getElementById('pipToggle'),
    pipDockBtn: document.getElementById('pipDockBtn'),
    pipContent: document.getElementById('pipContent'),
    pipData: document.getElementById('pipData'),
    faceStatus: document.getElementById('faceStatus'),
    poseData: document.getElementById('poseData'),
    
    pipDock: document.querySelector('.pip-dock'),
    pipDockPlaceholder: document.querySelector('.pip-dock-placeholder'),
    
    alertBorder: document.getElementById('alertBorder'),
    distractionOverlay: document.getElementById('distractionOverlay'),
    distractionReason: document.getElementById('distractionReason'),
    backToFocusBtn: document.getElementById('backToFocusBtn'),
    
    toastContainer: document.getElementById('toastContainer')
};

// ========== 状态管理 ==========
const state = {
    sessionStart: Date.now(),
    currentScore: 0,
    distractionCount: 0,
    
    pomodoroRunning: false,
    pomodoroPhase: 'focus',
    pomodoroTimeLeft: 25 * 60,
    pomodoroCompleted: 0,
    focusDuration: 25,
    breakDuration: 5,
    cycleCount: 4,
    currentCycle: 1,
    pomodoroTimer: null,
    
    todos: [],
    completedTodos: 0,
    
    pipDragging: false,
    pipOffset: { x: 0, y: 0 },
    pipPosition: null,
    pipDocked: true,
    pipMinimized: false,
    
    lastAlertLevel: 0
};

// ========== 本地存储 ==========
const STORAGE_KEYS = {
    SCORE: 'focus-monitor-score',
    TODOS: 'focus-monitor-todos',
    RECORDS: 'focus-monitor-records',
    PIP_STATE: 'focus-monitor-pip-state'
};

function loadState() {
    const savedScore = localStorage.getItem(STORAGE_KEYS.SCORE);
    if (savedScore) {
        state.currentScore = parseInt(savedScore) || 0;
    }
    
    const savedTodos = localStorage.getItem(STORAGE_KEYS.TODOS);
    if (savedTodos) {
        try {
            state.todos = JSON.parse(savedTodos);
        } catch (e) {
            state.todos = [];
        }
    }
    
    const savedPipState = localStorage.getItem(STORAGE_KEYS.PIP_STATE);
    if (savedPipState) {
        try {
            const pipState = JSON.parse(savedPipState);
            state.pipDocked = pipState.docked !== false;
            state.pipPosition = pipState.position || null;
        } catch (e) {
            state.pipDocked = true;
        }
    }
    
    updateScoreDisplay();
    renderTodos();
}

function saveState() {
    localStorage.setItem(STORAGE_KEYS.SCORE, state.currentScore.toString());
    localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(state.todos));
}

function savePipState() {
    localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify({
        docked: state.pipDocked,
        position: state.pipPosition
    }));
}

function saveRecord(points, reason, type = 'score') {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '[]');
    
    records.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        type: type,
        points: points,
        reason: reason
    });
    
    if (records.length > 500) records.pop();
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
}

// ========== 系统通知 ==========
function showSystemNotification(title, message, options = {}) {
    const {
        requireInteraction = false,
        tag = '',
        onClick = null
    } = options;
    
    if (!('Notification' in window)) {
        console.log('浏览器不支持系统通知');
        return null;
    }
    
    if (Notification.permission !== 'granted') {
        console.log('系统通知权限未授予');
        return null;
    }
    
    try {
        // 使用时间戳确保每次都是新通知，不会被合并
        const notification = new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: tag ? tag + '-' + Date.now() : Date.now().toString(),
            requireInteraction: requireInteraction,
            silent: false
        });
        
        // 非持久通知5秒后自动关闭
        if (!requireInteraction) {
            setTimeout(() => notification.close(), 5000);
        }
        
        if (onClick) {
            notification.onclick = () => {
                window.focus();
                onClick();
                notification.close();
            };
        }
        
        return notification;
    } catch (e) {
        console.error('创建系统通知失败:', e);
        return null;
    }
}

// ========== Toast 通知系统 ==========
function showToast(options) {
    const {
        type = 'info',
        icon = '💡',
        title = '通知',
        message = '',
        duration = 5000,
        sound = false,
        onClick = null,
        systemNotify = true
    } = options;
    
    // 页面内 Toast
    let container = elements.toastContainer;
    if (!container) {
        container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        elements.toastContainer = container;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">×</button>
        ${duration > 0 ? `<div class="toast-progress"><div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div></div>` : ''}
    `;
    
    toast.querySelector('.toast-close').onclick = (e) => {
        e.stopPropagation();
        removeToast(toast);
    };
    
    if (onClick) {
        toast.style.cursor = 'pointer';
        toast.onclick = (e) => {
            if (!e.target.closest('.toast-close')) {
                onClick();
                removeToast(toast);
            }
        };
    }
    
    container.appendChild(toast);
    toast.offsetHeight;
    requestAnimationFrame(() => toast.classList.add('show'));
    
    if (sound) {
        playNotificationSound(type);
    }
    
    if (duration > 0) {
        setTimeout(() => removeToast(toast), duration);
    }
    
    // 系统通知
    if (systemNotify) {
        showSystemNotification(title, message, {
            requireInteraction: duration === 0,
            tag: type,
            onClick: onClick
        });
    }
    
    return toast;
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.classList.remove('show');
    toast.classList.add('hide');
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

function playNotificationSound(type) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        const frequencies = {
            success: [523, 659, 784],
            warning: [440, 440],
            danger: [330, 330, 330],
            info: [523, 659]
        };
        
        const freqs = frequencies[type] || frequencies.info;
        
        freqs.forEach((freq, i) => {
            oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);
        });
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + freqs.length * 0.15 + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + freqs.length * 0.15 + 0.2);
    } catch (e) {}
}

// ========== 警告通知 ==========
let lastWarningToast = null;

function showAlertToast(level, timers) {
    if (level >= 3) {
        if (lastWarningToast) {
            removeToast(lastWarningToast);
            lastWarningToast = null;
        }
        return;
    }
    
    if (level === state.lastAlertLevel) return;
    state.lastAlertLevel = level;
    
    if (lastWarningToast) {
        removeToast(lastWarningToast);
        lastWarningToast = null;
    }
    
    if (level === 0) return;
    
    let maxTimer = null;
    let maxRatio = 0;
    
    for (const [key, timer] of Object.entries(timers || {})) {
        const ratio = timer.elapsed / timer.threshold;
        if (ratio > maxRatio) {
            maxRatio = ratio;
            maxTimer = { key, ...timer };
        }
    }
    
    if (!maxTimer) return;
    
    const timerNames = {
        drowsy: '闭眼',
        turn: '转头',
        head_down: '低头',
        head_up: '抬头'
    };
    
    const remaining = Math.max(0, Math.ceil(maxTimer.threshold - maxTimer.elapsed));
    const timerName = timerNames[maxTimer.key] || '走神';
    
    let type, icon, title, message;
    
    if (level === 1) {
        type = 'info';
        icon = '👀';
        title = '轻微提醒';
        message = `检测到${timerName}，还有 ${remaining} 秒`;
    } else if (level === 2) {
        type = 'warning';
        icon = '⚠️';
        title = '注意警告';
        message = `持续${timerName}中，${remaining} 秒后判定走神`;
    }
    
    lastWarningToast = showToast({
        type,
        icon,
        title,
        message,
        duration: 3000,
        sound: level >= 2,
        systemNotify: level >= 2
    });
}

// ========== 走神警告 ==========
let distractionShown = false;
let distractionToastShown = false;

function showDistraction(reason) {
    if (!distractionShown) {
        distractionShown = true;
        state.distractionCount++;
        addScore(-5, '走神: ' + (reason || '注意力分散'));
        
        elements.distractionReason.textContent = reason || '请保持专注';
        elements.distractionOverlay.classList.add('show');
    }
    
    if (!distractionToastShown) {
        distractionToastShown = true;
        
        showToast({
            type: 'danger',
            icon: '🚨',
            title: '走神警告！',
            message: reason || '请立即回神！',
            duration: 0,
            sound: true,
            systemNotify: true,
            onClick: () => {
                window.focus();
                elements.backToFocusBtn.click();
            }
        });
    }
}

function hideDistraction() {
    distractionShown = false;
    distractionToastShown = false;
    elements.distractionOverlay.classList.remove('show');
    state.lastAlertLevel = 0;
    
    const dangerToasts = document.querySelectorAll('.toast-danger');
    dangerToasts.forEach(toast => removeToast(toast));
}

// ========== 画中画 ==========
function initPipDraggable() {
    const pip = elements.pipContainer;
    const header = elements.pipHeader;
    const dock = elements.pipDock;
    
    if (!pip || !header || !dock) return;
    
    function dockPip() {
        state.pipDocked = true;
        pip.classList.add('docked');
        pip.classList.remove('floating');
        dock.classList.remove('empty');
        
        pip.style.left = '';
        pip.style.top = '';
        
        dock.appendChild(pip);
        updateDockButton();
        savePipState();
    }
    
    function undockPip() {
        state.pipDocked = false;
        pip.classList.remove('docked');
        pip.classList.add('floating');
        dock.classList.add('empty');
        
        document.body.appendChild(pip);
        
        if (!state.pipPosition) {
            state.pipPosition = { left: window.innerWidth - 300, top: 100 };
        }
        setPipPosition(state.pipPosition.left, state.pipPosition.top);
        
        updateDockButton();
        savePipState();
    }
    
    function updateDockButton() {
        if (elements.pipDockBtn) {
            elements.pipDockBtn.textContent = state.pipDocked ? '⇲' : '⇱';
        }
    }
    
    function setPipPosition(left, top) {
        const maxLeft = window.innerWidth - pip.offsetWidth - 10;
        const maxTop = window.innerHeight - pip.offsetHeight - 10;
        
        left = Math.max(10, Math.min(left, maxLeft));
        top = Math.max(70, Math.min(top, maxTop));
        
        pip.style.left = left + 'px';
        pip.style.top = top + 'px';
    }
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.pip-btn')) return;
        
        if (state.pipDocked) {
            const rect = pip.getBoundingClientRect();
            state.pipPosition = { left: rect.left, top: rect.top };
            undockPip();
        }
        
        state.pipDragging = true;
        state.pipOffset = {
            x: e.clientX - pip.offsetLeft,
            y: e.clientY - pip.offsetTop
        };
        
        pip.classList.add('dragging');
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!state.pipDragging) return;
        setPipPosition(e.clientX - state.pipOffset.x, e.clientY - state.pipOffset.y);
        
        const dockRect = dock.getBoundingClientRect();
        const pipRect = pip.getBoundingClientRect();
        const distance = Math.hypot(pipRect.left - dockRect.left, pipRect.top - dockRect.top);
        dock.classList.toggle('highlight', distance < 80);
    });
    
    document.addEventListener('mouseup', () => {
        if (state.pipDragging) {
            state.pipDragging = false;
            pip.classList.remove('dragging');
            document.body.style.userSelect = '';
            dock.classList.remove('highlight');
            
            const dockRect = dock.getBoundingClientRect();
            const pipRect = pip.getBoundingClientRect();
            const distance = Math.hypot(pipRect.left - dockRect.left, pipRect.top - dockRect.top);
            
            if (distance < 80) {
                dockPip();
            } else {
                state.pipPosition = { left: pip.offsetLeft, top: pip.offsetTop };
                savePipState();
            }
        }
    });
    
    if (elements.pipDockBtn) {
        elements.pipDockBtn.addEventListener('click', () => {
            if (state.pipDocked) undockPip();
            else dockPip();
        });
    }
    
    if (elements.pipDockPlaceholder) {
        elements.pipDockPlaceholder.addEventListener('click', () => {
            if (!state.pipDocked) dockPip();
        });
    }
    
    if (state.pipDocked) dockPip();
    else undockPip();
}

function togglePip() {
    state.pipMinimized = !state.pipMinimized;
    elements.pipContainer.classList.toggle('minimized', state.pipMinimized);
    elements.pipToggle.textContent = state.pipMinimized ? '+' : '−';
}

// ========== 积分系统 ==========
function addScore(points, reason) {
    state.currentScore += points;
    if (state.currentScore < 0) state.currentScore = 0;
    
    updateScoreDisplay();
    showScoreChange(points);
    saveState();
    
    saveRecord(points, reason, points < 0 ? 'penalty' : 'reward');
}

function updateScoreDisplay() {
    elements.currentScore.textContent = state.currentScore;
}

function showScoreChange(points) {
    const el = elements.scoreChange;
    el.textContent = (points > 0 ? '+' : '') + points;
    el.className = 'score-change ' + (points > 0 ? 'positive' : 'negative');
    el.classList.add('show');
    
    setTimeout(() => el.classList.remove('show'), 1500);
}

// ========== 会话计时器 ==========
setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    elements.sessionTimer.textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}, 1000);

// ========== 番茄钟 ==========
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 100;

function initPomodoro() {
    elements.progressRing.style.strokeDasharray = PROGRESS_CIRCUMFERENCE;
    
    state.focusDuration = parseInt(elements.focusDuration.value) || 25;
    state.breakDuration = parseInt(elements.breakDuration.value) || 5;
    state.cycleCount = parseInt(elements.cycleCount.value) || 4;
    state.pomodoroTimeLeft = state.focusDuration * 60;
    
    updatePomodoroDisplay();
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updatePomodoroDisplay() {
    elements.pomodoroTime.textContent = formatTime(state.pomodoroTimeLeft);
    
    const totalTime = state.pomodoroPhase === 'focus' 
        ? state.focusDuration * 60 
        : state.breakDuration * 60;
    const progress = totalTime > 0 ? state.pomodoroTimeLeft / totalTime : 0;
    const offset = PROGRESS_CIRCUMFERENCE * (1 - progress);
    elements.progressRing.style.strokeDashoffset = offset;
    
    if (state.pomodoroPhase === 'focus') {
        elements.pomodoroLabel.textContent = '🎯 专注时间';
        elements.progressRing.style.stroke = '#6c5ce7';
    } else {
        elements.pomodoroLabel.textContent = '☕ 休息时间';
        elements.progressRing.style.stroke = '#27ae60';
    }
    
    elements.pomodoroCycle.textContent = `第 ${state.currentCycle} / ${state.cycleCount} 轮`;
    elements.pomodoroCount.textContent = state.pomodoroCompleted;
}

// 同步番茄钟设置（输入框变化时自动调用）
function syncPomodoroSettings() {
    // 只有在未运行时才��动更新
    if (!state.pomodoroRunning) {
        const newFocus = Math.max(1, Math.min(1440, parseInt(elements.focusDuration.value) || 25));
        const newBreak = Math.max(1, Math.min(1440, parseInt(elements.breakDuration.value) || 5));
        const newCycle = Math.max(1, Math.min(20, parseInt(elements.cycleCount.value) || 4));
        
        state.focusDuration = newFocus;
        state.breakDuration = newBreak;
        state.cycleCount = newCycle;
        
        // 如果还没开始（第1轮专注阶段），更新时间显示
        if (state.currentCycle === 1 && state.pomodoroPhase === 'focus') {
            state.pomodoroTimeLeft = state.focusDuration * 60;
        }
        
        // 同步输入框显示（防止非法值）
        elements.focusDuration.value = newFocus;
        elements.breakDuration.value = newBreak;
        elements.cycleCount.value = newCycle;
        
        updatePomodoroDisplay();
    }
}

function startPomodoro() {
    if (state.pomodoroRunning) {
        // 暂停
        state.pomodoroRunning = false;
        clearInterval(state.pomodoroTimer);
        state.pomodoroTimer = null;
        elements.pomodoroStartBtn.textContent = '▶ 继续';
    } else {
        // 开始
        state.pomodoroRunning = true;
        elements.pomodoroStartBtn.textContent = '⏸ 暂停';
        
        state.pomodoroTimer = setInterval(() => {
            state.pomodoroTimeLeft--;
            updatePomodoroDisplay();
            
            if (state.pomodoroTimeLeft === 10) {
                showToast({
                    type: 'info',
                    icon: '⏱️',
                    title: '倒计时',
                    message: `${state.pomodoroPhase === 'focus' ? '专注' : '休息'}时间还剩 10 秒`,
                    duration: 3000,
                    sound: true,
                    systemNotify: true
                });
            }
            
            if (state.pomodoroTimeLeft <= 0) {
                completePhase();
            }
        }, 1000);
    }
}

function completePhase() {
    clearInterval(state.pomodoroTimer);
    state.pomodoroTimer = null;
    
    if (state.pomodoroPhase === 'focus') {
        state.pomodoroCompleted++;
        addScore(25, '完成番茄钟');
        
        if (state.currentCycle >= state.cycleCount) {
            state.pomodoroRunning = false;
            elements.pomodoroStartBtn.textContent = '▶ 开始';
            
            showToast({
                type: 'success',
                icon: '🎉',
                title: '全部完成！',
                message: `太棒了！完成了 ${state.cycleCount} 轮番茄钟`,
                duration: 0,
                sound: true,
                systemNotify: true,
                onClick: () => window.focus()
            });
            
            state.currentCycle = 1;
            state.pomodoroPhase = 'focus';
            state.pomodoroTimeLeft = state.focusDuration * 60;
            updatePomodoroDisplay();
            return;
        }
        
        state.pomodoroPhase = 'break';
        state.pomodoroTimeLeft = state.breakDuration * 60;
        
        showToast({
            type: 'success',
            icon: '🍅',
            title: '专注完成！',
            message: `第 ${state.currentCycle} 轮完成，休息 ${state.breakDuration} 分钟`,
            duration: 5000,
            sound: true,
            systemNotify: true
        });
        
        updatePomodoroDisplay();
        state.pomodoroTimer = setInterval(() => {
            state.pomodoroTimeLeft--;
            updatePomodoroDisplay();
            
            if (state.pomodoroTimeLeft === 10) {
                showToast({
                    type: 'info',
                    icon: '⏱️',
                    title: '休息即将结束',
                    message: '还有 10 秒，准备下一轮',
                    duration: 3000,
                    sound: true,
                    systemNotify: true
                });
            }
            
            if (state.pomodoroTimeLeft <= 0) {
                completePhase();
            }
        }, 1000);
        
    } else {
        state.currentCycle++;
        state.pomodoroPhase = 'focus';
        state.pomodoroTimeLeft = state.focusDuration * 60;
        
        showToast({
            type: 'info',
            icon: '💪',
            title: '休息结束',
            message: `开始第 ${state.currentCycle} 轮专注！`,
            duration: 5000,
            sound: true,
            systemNotify: true
        });
        
        updatePomodoroDisplay();
        state.pomodoroTimer = setInterval(() => {
            state.pomodoroTimeLeft--;
            updatePomodoroDisplay();
            
            if (state.pomodoroTimeLeft === 10) {
                showToast({
                    type: 'info',
                    icon: '⏱️',
                    title: '倒计时',
                    message: '专注时间还剩 10 秒',
                    duration: 3000,
                    sound: true,
                    systemNotify: true
                });
            }
            
            if (state.pomodoroTimeLeft <= 0) {
                completePhase();
            }
        }, 1000);
    }
}

function resetPomodoro() {
    clearInterval(state.pomodoroTimer);
    state.pomodoroTimer = null;
    state.pomodoroRunning = false;
    state.pomodoroPhase = 'focus';
    state.currentCycle = 1;
    
    state.focusDuration = Math.max(1, Math.min(1440, parseInt(elements.focusDuration.value) || 25));
    state.breakDuration = Math.max(1, Math.min(1440, parseInt(elements.breakDuration.value) || 5));
    state.cycleCount = Math.max(1, Math.min(20, parseInt(elements.cycleCount.value) || 4));
    
    elements.focusDuration.value = state.focusDuration;
    elements.breakDuration.value = state.breakDuration;
    elements.cycleCount.value = state.cycleCount;
    
    state.pomodoroTimeLeft = state.focusDuration * 60;
    
    elements.pomodoroStartBtn.textContent = '▶ 开始';
    updatePomodoroDisplay();
}

// ========== 待办清单 ==========
function renderTodos() {
    const list = elements.todoList;
    list.innerHTML = '';
    
    state.completedTodos = state.todos.filter(t => t.done).length;
    elements.todoCompleted.textContent = state.completedTodos;
    elements.todoTotal.textContent = state.todos.length;
    
    if (state.todos.length === 0) {
        list.innerHTML = '<li class="todo-empty">暂无任务，添加一个开始学习吧！</li>';
        return;
    }
    
    state.todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = 'todo-item' + (todo.done ? ' done' : '');
        
        li.innerHTML = `
            <label class="todo-checkbox">
                <input type="checkbox" ${todo.done ? 'checked' : ''} data-index="${index}">
                <span class="checkmark"></span>
            </label>
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="todo-delete" data-index="${index}">×</button>
        `;
        
        list.appendChild(li);
    });
    
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => toggleTodo(parseInt(e.target.dataset.index)));
    });
    
    list.querySelectorAll('.todo-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteTodo(parseInt(e.target.dataset.index)));
    });
}

function addTodo() {
    const text = elements.todoInput.value.trim();
    if (!text) return;
    
    state.todos.push({ text, done: false, createdAt: Date.now() });
    elements.todoInput.value = '';
    
    renderTodos();
    saveState();
}

function toggleTodo(index) {
    const todo = state.todos[index];
    if (!todo) return;
    
    const wasDone = todo.done;
    todo.done = !todo.done;
    
    if (todo.done && !wasDone) {
        addScore(10, '完成任务: ' + (todo.text.length > 15 ? todo.text.substring(0, 15) + '...' : todo.text));
        showToast({
            type: 'success',
            icon: '✅',
            title: '任务完成',
            message: todo.text.length > 20 ? todo.text.substring(0, 20) + '...' : todo.text,
            duration: 2000,
            systemNotify: false
        });
    }
    
    renderTodos();
    saveState();
}

function deleteTodo(index) {
    state.todos.splice(index, 1);
    renderTodos();
    saveState();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== Socket 事件 ==========
socket.on('frame', (data) => {
    elements.videoFeed.src = 'data:image/jpeg;base64,' + data.image;
});

socket.on('monitor_data', (data) => {
    elements.poseData.textContent = `P:${Math.round(data.pitch || 0)}° Y:${Math.round(data.yaw || 0)}°`;
    
    if (data.face_detected) {
        if (data.is_distracted) {
            elements.faceStatus.textContent = '😴 走神了';
            elements.faceStatus.className = 'face-status warning';
            showDistraction(data.distraction_reason);
        } else {
            elements.faceStatus.textContent = '😊 专注中';
            elements.faceStatus.className = 'face-status';
            hideDistraction();
        }
    } else {
        elements.faceStatus.textContent = '❓ 未检测到';
        elements.faceStatus.className = 'face-status warning';
    }
    
    updateAlertBorder(data.alert_level || 0);
    showAlertToast(data.alert_level || 0, data.timers);
});

function updateAlertBorder(level) {
    elements.alertBorder.className = 'alert-border';
    if (level === 1) elements.alertBorder.classList.add('gentle');
    else if (level === 2) elements.alertBorder.classList.add('warning');
    else if (level >= 3) elements.alertBorder.classList.add('critical');
}

// ========== 事件绑定 ==========
function bindEvents() {
    elements.backBtn.addEventListener('click', () => {
        fetch('/api/stop', { method: 'POST' });
        window.location.href = '/';
    });
    
    elements.pomodoroStartBtn.addEventListener('click', startPomodoro);
    elements.pomodoroResetBtn.addEventListener('click', resetPomodoro);
    
    // 番茄钟设置实时同步
    elements.focusDuration.addEventListener('change', syncPomodoroSettings);
    elements.breakDuration.addEventListener('change', syncPomodoroSettings);
    elements.cycleCount.addEventListener('change', syncPomodoroSettings);
    elements.focusDuration.addEventListener('input', syncPomodoroSettings);
    elements.breakDuration.addEventListener('input', syncPomodoroSettings);
    elements.cycleCount.addEventListener('input', syncPomodoroSettings);
    
    elements.addTodoBtn.addEventListener('click', addTodo);
    elements.todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    
    elements.pipToggle.addEventListener('click', togglePip);
    
    elements.backToFocusBtn.addEventListener('click', () => {
        hideDistraction();
        fetch('/api/reset_distraction', { method: 'POST' });
    });
}

// ========== 初始化 ==========
function init() {
    // 请求系统通知权限
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast({
                        type: 'success',
                        icon: '🔔',
                        title: '通知已开启',
                        message: '你将收到系统级通知提醒',
                        duration: 3000,
                        systemNotify: false
                    });
                }
            });
        }
    }
    
    loadState();
    initPomodoro();
    initPipDraggable();
    bindEvents();
    
    fetch('/api/start', { method: 'POST' });
    
    const mode = localStorage.getItem('study-mode') || 'STUDY';
    elements.modeBadge.textContent = mode === 'STUDY' ? '💻 学习模式' : '📖 作业模式';
    
    showToast({
        type: 'success',
        icon: '🚀',
        title: '监控已启动',
        message: '开始专注学习吧！',
        duration: 3000,
        systemNotify: false
    });
}

init();
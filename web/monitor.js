// ========== Socket 连接 ==========
const socket = io();

// ========== DOM 元素 ==========
const elements = {
    // 顶部
    backBtn: document.getElementById('backBtn'),
    modeBadge: document.getElementById('modeBadge'),
    currentScore: document.getElementById('currentScore'),
    scoreChange: document.getElementById('scoreChange'),
    sessionTimer: document.getElementById('sessionTimer'),
    statusIndicator: document.getElementById('statusIndicator'),
    
    // 番茄钟
    pomodoroSection: document.getElementById('pomodoroSection'),
    pomodoroTime: document.getElementById('pomodoroTime'),
    pomodoroLabel: document.getElementById('pomodoroLabel'),
    pomodoroCount: document.getElementById('pomodoroCount'),
    pomodoroStartBtn: document.getElementById('pomodoroStartBtn'),
    pomodoroResetBtn: document.getElementById('pomodoroResetBtn'),
    progressRing: document.getElementById('progressRing'),
    focusDuration: document.getElementById('focusDuration'),
    breakDuration: document.getElementById('breakDuration'),
    
    // 待办
    todoInput: document.getElementById('todoInput'),
    addTodoBtn: document.getElementById('addTodoBtn'),
    todoList: document.getElementById('todoList'),
    todoCompleted: document.getElementById('todoCompleted'),
    todoTotal: document.getElementById('todoTotal'),
    
    // 画中画
    videoFeed: document.getElementById('videoFeed'),
    pipContainer: document.getElementById('pipContainer'),
    pipHeader: document.getElementById('pipHeader'),
    pipToggle: document.getElementById('pipToggle'),
    pipDockBtn: document.querySelector('#pipContainer .pip-actions #pipDock'),
    pipContent: document.getElementById('pipContent'),
    pipData: document.getElementById('pipData'),
    faceStatus: document.getElementById('faceStatus'),
    poseData: document.getElementById('poseData'),
    
    // 凹槽
    pipDock: document.querySelector('.pip-dock'),
    pipDockPlaceholder: document.querySelector('.pip-dock-placeholder'),
    
    // 警告
    alertBorder: document.getElementById('alertBorder'),
    distractionOverlay: document.getElementById('distractionOverlay'),
    distractionReason: document.getElementById('distractionReason'),
    backToFocusBtn: document.getElementById('backToFocusBtn')
};

// ========== 状态管理 ==========
const state = {
    // 会话
    sessionStart: Date.now(),
    currentScore: 0,
    distractionCount: 0,
    
    // 番茄钟
    pomodoroRunning: false,
    pomodoroPhase: 'focus',
    pomodoroTimeLeft: 25 * 60,
    pomodoroCompleted: 0,
    focusDuration: 25,
    breakDuration: 5,
    pomodoroTimer: null,
    
    // 待办
    todos: [],
    completedTodos: 0,
    
    // 画中画
    pipDragging: false,
    pipOffset: { x: 0, y: 0 },
    pipPosition: null,
    pipDocked: true,      // 是否停靠在凹槽
    pipMinimized: false
};

// ========== ���地存储 ==========
const STORAGE_KEYS = {
    SCORE: 'focus-monitor-score',
    STATS: 'focus-monitor-stats',
    TODOS: 'focus-monitor-todos',
    HISTORY: 'focus-monitor-history',
    PIP_STATE: 'focus-monitor-pip-state'
};

function loadState() {
    const savedScore = localStorage.getItem(STORAGE_KEYS.SCORE);
    if (savedScore) state.currentScore = parseInt(savedScore) || 0;
    
    const savedTodos = localStorage.getItem(STORAGE_KEYS.TODOS);
    if (savedTodos) {
        try {
            state.todos = JSON.parse(savedTodos);
        } catch (e) {
            state.todos = [];
        }
    }
    
    // 加载画中画状态
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

function saveSessionToHistory() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
    const sessionDuration = Math.floor((Date.now() - state.sessionStart) / 1000 / 60);
    
    if (sessionDuration > 0) {
        history.unshift({
            date: new Date().toISOString(),
            duration: sessionDuration,
            score: state.currentScore,
            pomodoros: state.pomodoroCompleted,
            tasks: state.completedTodos,
            distractions: state.distractionCount
        });
        
        if (history.length > 100) history.pop();
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    }
}

// ========== 画中画：停靠与拖动 ==========
function initPipDraggable() {
    const pip = elements.pipContainer;
    const header = elements.pipHeader;
    const dock = elements.pipDock;
    
    // 应用初始状态
    function applyPipState() {
        if (state.pipDocked) {
            dockPip();
        } else {
            undockPip();
            if (state.pipPosition) {
                setPipPosition(state.pipPosition.left, state.pipPosition.top);
            }
        }
    }
    
    // 停靠到凹槽
    function dockPip() {
        state.pipDocked = true;
        pip.classList.add('docked');
        pip.classList.remove('floating');
        dock.classList.remove('empty');
        
        // 清除位置样式
        pip.style.left = '';
        pip.style.top = '';
        pip.style.right = '';
        pip.style.bottom = '';
        
        // 移动到凹槽内
        dock.appendChild(pip);
        
        updateDockButton();
        savePipState();
    }
    
    // 从凹槽分离
    function undockPip() {
        state.pipDocked = false;
        pip.classList.remove('docked');
        pip.classList.add('floating');
        dock.classList.add('empty');
        
        // 移动到 body
        document.body.appendChild(pip);
        
        // 设置初始浮动位置（如果没有保存的位置）
        if (!state.pipPosition) {
            const dockRect = dock.getBoundingClientRect();
            state.pipPosition = {
                left: dockRect.left,
                top: dockRect.top
            };
        }
        setPipPosition(state.pipPosition.left, state.pipPosition.top);
        
        updateDockButton();
        savePipState();
    }
    
    // 切换停靠状态
    function toggleDock() {
        if (state.pipDocked) {
            undockPip();
        } else {
            dockPip();
        }
    }
    
    // 更新按钮图标
    function updateDockButton() {
        if (elements.pipDockBtn) {
            elements.pipDockBtn.textContent = state.pipDocked ? '⇲' : '⇱';
            elements.pipDockBtn.title = state.pipDocked ? '分离窗口' : '停靠窗口';
        }
    }
    
    // 设置浮动位置
    function setPipPosition(left, top) {
        const maxLeft = window.innerWidth - pip.offsetWidth - 10;
        const maxTop = window.innerHeight - pip.offsetHeight - 10;
        
        left = Math.max(10, Math.min(left, maxLeft));
        top = Math.max(70, Math.min(top, maxTop));
        
        pip.style.left = left + 'px';
        pip.style.top = top + 'px';
    }
    
    // 鼠标按下 - 开始拖动
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.pip-btn')) return;
        
        // 如果是停靠状态，先分离
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
    
    // 鼠标移动
    document.addEventListener('mousemove', (e) => {
        if (!state.pipDragging) return;
        
        const left = e.clientX - state.pipOffset.x;
        const top = e.clientY - state.pipOffset.y;
        
        setPipPosition(left, top);
        
        // 检查是否靠近凹槽
        const dockRect = dock.getBoundingClientRect();
        const pipRect = pip.getBoundingClientRect();
        const distance = Math.hypot(
            pipRect.left - dockRect.left,
            pipRect.top - dockRect.top
        );
        
        if (distance < 80) {
            dock.classList.add('highlight');
        } else {
            dock.classList.remove('highlight');
        }
    });
    
    // 鼠标释放
    document.addEventListener('mouseup', () => {
        if (state.pipDragging) {
            state.pipDragging = false;
            pip.classList.remove('dragging');
            document.body.style.userSelect = '';
            dock.classList.remove('highlight');
            
            // 检查是否要停靠
            const dockRect = dock.getBoundingClientRect();
            const pipRect = pip.getBoundingClientRect();
            const distance = Math.hypot(
                pipRect.left - dockRect.left,
                pipRect.top - dockRect.top
            );
            
            if (distance < 80) {
                // 靠近凹槽，自动停靠
                dockPip();
            } else {
                // 保存浮动位置
                state.pipPosition = {
                    left: pip.offsetLeft,
                    top: pip.offsetTop
                };
                savePipState();
            }
        }
    });
    
    // 触摸支持
    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('.pip-btn')) return;
        
        const touch = e.touches[0];
        
        if (state.pipDocked) {
            const rect = pip.getBoundingClientRect();
            state.pipPosition = { left: rect.left, top: rect.top };
            undockPip();
        }
        
        state.pipDragging = true;
        state.pipOffset = {
            x: touch.clientX - pip.offsetLeft,
            y: touch.clientY - pip.offsetTop
        };
        
        pip.classList.add('dragging');
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!state.pipDragging) return;
        
        const touch = e.touches[0];
        const left = touch.clientX - state.pipOffset.x;
        const top = touch.clientY - state.pipOffset.y;
        
        setPipPosition(left, top);
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        if (state.pipDragging) {
            state.pipDragging = false;
            pip.classList.remove('dragging');
            
            const dockRect = dock.getBoundingClientRect();
            const pipRect = pip.getBoundingClientRect();
            const distance = Math.hypot(
                pipRect.left - dockRect.left,
                pipRect.top - dockRect.top
            );
            
            if (distance < 80) {
                dockPip();
            } else {
                state.pipPosition = {
                    left: pip.offsetLeft,
                    top: pip.offsetTop
                };
                savePipState();
            }
        }
    });
    
    // 停靠按钮
    if (elements.pipDockBtn) {
        elements.pipDockBtn.addEventListener('click', toggleDock);
    }
    
    // 点击凹槽占位符，回归停靠
    if (elements.pipDockPlaceholder) {
        elements.pipDockPlaceholder.addEventListener('click', () => {
            if (!state.pipDocked) {
                dockPip();
            }
        });
    }
    
    // 窗口大小变化
    window.addEventListener('resize', () => {
        if (!state.pipDocked && state.pipPosition) {
            setPipPosition(state.pipPosition.left, state.pipPosition.top);
        }
    });
    
    // 初始化
    applyPipState();
}

// ========== 画中画折叠 ==========
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
    
    console.log(`积分变化: ${points > 0 ? '+' : ''}${points} (${reason})`);
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
function updateSessionTimer() {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    elements.sessionTimer.textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

setInterval(updateSessionTimer, 1000);

// ========== 番茄钟 ==========
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 100;

function initPomodoro() {
    elements.progressRing.style.strokeDasharray = PROGRESS_CIRCUMFERENCE;
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
    const progress = state.pomodoroTimeLeft / totalTime;
    const offset = PROGRESS_CIRCUMFERENCE * (1 - progress);
    elements.progressRing.style.strokeDashoffset = offset;
    
    elements.pomodoroLabel.textContent = state.pomodoroPhase === 'focus' ? '专注时间' : '休息时间';
    elements.pomodoroCount.textContent = state.pomodoroCompleted;
    
    elements.progressRing.style.stroke = state.pomodoroPhase === 'focus' ? '#6c5ce7' : '#27ae60';
}

function startPomodoro() {
    if (state.pomodoroRunning) {
        state.pomodoroRunning = false;
        clearInterval(state.pomodoroTimer);
        elements.pomodoroStartBtn.textContent = '▶ 继续';
    } else {
        state.pomodoroRunning = true;
        elements.pomodoroStartBtn.textContent = '⏸ 暂停';
        
        state.pomodoroTimer = setInterval(() => {
            state.pomodoroTimeLeft--;
            
            if (state.pomodoroTimeLeft <= 0) {
                completePomodoro();
            } else {
                updatePomodoroDisplay();
            }
        }, 1000);
    }
}

function completePomodoro() {
    clearInterval(state.pomodoroTimer);
    state.pomodoroRunning = false;
    
    if (state.pomodoroPhase === 'focus') {
        state.pomodoroCompleted++;
        addScore(25, '完成番茄钟');
        playNotification('🍅 番茄完成！休息一下吧');
        
        state.pomodoroPhase = 'break';
        state.pomodoroTimeLeft = state.breakDuration * 60;
    } else {
        playNotification('⏰ 休息结束，继续加油！');
        
        state.pomodoroPhase = 'focus';
        state.pomodoroTimeLeft = state.focusDuration * 60;
    }
    
    elements.pomodoroStartBtn.textContent = '▶ 开始';
    updatePomodoroDisplay();
}

function resetPomodoro() {
    clearInterval(state.pomodoroTimer);
    state.pomodoroRunning = false;
    state.pomodoroPhase = 'focus';
    
    // 获取输入值，限制在 1-1440 分钟（24小时）
    let focusVal = parseInt(elements.focusDuration.value) || 25;
    let breakVal = parseInt(elements.breakDuration.value) || 5;
    
    focusVal = Math.max(1, Math.min(1440, focusVal));
    breakVal = Math.max(1, Math.min(1440, breakVal));
    
    elements.focusDuration.value = focusVal;
    elements.breakDuration.value = breakVal;
    
    state.focusDuration = focusVal;
    state.breakDuration = breakVal;
    state.pomodoroTimeLeft = state.focusDuration * 60;
    
    elements.pomodoroStartBtn.textContent = '▶ 开始';
    updatePomodoroDisplay();
}

function playNotification(message) {
    if (Notification.permission === 'granted') {
        new Notification('专注助手', { body: message });
    }
    alert(message);
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
        addScore(10, '完成任务');
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

// ========== Socket 事件处理 ==========
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
});

function updateAlertBorder(level) {
    elements.alertBorder.className = 'alert-border';
    if (level === 1) elements.alertBorder.classList.add('gentle');
    else if (level === 2) elements.alertBorder.classList.add('warning');
    else if (level >= 3) elements.alertBorder.classList.add('critical');
}

let distractionShown = false;

function showDistraction(reason) {
    if (distractionShown) return;
    distractionShown = true;
    
    state.distractionCount++;
    addScore(-5, '走神扣分');
    
    elements.distractionReason.textContent = reason || '请保持专注';
    elements.distractionOverlay.classList.add('show');
}

function hideDistraction() {
    distractionShown = false;
    elements.distractionOverlay.classList.remove('show');
}

// ========== 事件绑定 ==========
function bindEvents() {
    elements.backBtn.addEventListener('click', () => {
        saveSessionToHistory();
        fetch('/api/stop', { method: 'POST' });
        window.location.href = '/';
    });
    
    elements.pomodoroStartBtn.addEventListener('click', startPomodoro);
    elements.pomodoroResetBtn.addEventListener('click', resetPomodoro);
    elements.focusDuration.addEventListener('change', resetPomodoro);
    elements.breakDuration.addEventListener('change', resetPomodoro);
    
    elements.addTodoBtn.addEventListener('click', addTodo);
    elements.todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    
    elements.pipToggle.addEventListener('click', togglePip);
    
    elements.backToFocusBtn.addEventListener('click', () => {
        hideDistraction();
        fetch('/api/reset_distraction', { method: 'POST' });
    });
    
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ========== 初始化 ==========
function init() {
    loadState();
    initPomodoro();
    initPipDraggable();
    bindEvents();
    
    fetch('/api/start', { method: 'POST' });
    
    const mode = localStorage.getItem('study-mode') || 'STUDY';
    elements.modeBadge.textContent = mode === 'STUDY' ? '📖 学习模式' : '✍️ 作业模式';
}

init();
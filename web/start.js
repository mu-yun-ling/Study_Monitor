document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    let selectedMode = 'STUDY';

    const STORAGE_KEYS = {
        SCORE: 'focus-monitor-score',
        RECORDS: 'focus-monitor-records',
        DIARY: 'focus-monitor-diary'
    };

    const PAGE_SIZE = 15;
    let recordCurrentPage = 1;
    let recordCurrentFilter = 'today';
    let recordCurrentMonth = '';
    let recordSortOrder = 'desc';
    let diaryCurrentPage = 1;
    let diaryCurrentMonth = '';
    let diarySortOrder = 'desc';

    // ========== 加载统计数据 ==========
    function loadStats() {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '[]');
        const score = parseInt(localStorage.getItem(STORAGE_KEYS.SCORE) || '0');
        
        let totalDistractions = records.filter(r => r.type === 'penalty').length;
        
        document.getElementById('totalScore').textContent = score;
        document.getElementById('totalDistractions').textContent = totalDistractions;
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
        { id: 'pitch_head_down', valId: 'pitchHeadDownValue', suffix: '°' },
        { id: 'pitch_head_up', valId: 'pitchHeadUpValue', suffix: '°' },
        { id: 'yaw_threshold', valId: 'yawThresholdValue', suffix: '°' }
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
        recordCurrentPage = 1;
        recordCurrentFilter = 'today';
        recordCurrentMonth = '';
        recordSortOrder = 'desc';
        document.getElementById('monthFilterContainer').style.display = 'none';
        document.getElementById('sortOrder').value = 'desc';
        document.querySelectorAll('.filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-tabs .tab-btn[data-tab="today"]').classList.add('active');
        updateMonthFilterOptions();
        loadRecordData();
    };
    
    document.getElementById('closeRecordModal').onclick = () => {
        recordModal.style.display = 'none';
    };
    
    document.querySelectorAll('.filter-tabs .tab-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            recordCurrentFilter = this.dataset.tab;
            recordCurrentPage = 1;
            
            const monthContainer = document.getElementById('monthFilterContainer');
            if (recordCurrentFilter === 'all') {
                monthContainer.style.display = 'block';
            } else {
                monthContainer.style.display = 'none';
                recordCurrentMonth = '';
            }
            
            loadRecordData();
        };
    });
    
    document.getElementById('monthFilter').onchange = function() {
        recordCurrentMonth = this.value;
        recordCurrentPage = 1;
        loadRecordData();
    };
    
    document.getElementById('sortOrder').onchange = function() {
        recordSortOrder = this.value;
        recordCurrentPage = 1;
        loadRecordData();
    };
    
    function updateMonthFilterOptions() {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '[]');
        const months = new Set();
        
        records.forEach(item => {
            const date = new Date(item.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months.add(monthKey);
        });
        
        const select = document.getElementById('monthFilter');
        select.innerHTML = '<option value="">全部月份</option>';
        
        Array.from(months).sort().reverse().forEach(month => {
            const [year, m] = month.split('-');
            select.innerHTML += `<option value="${month}">${year}年${parseInt(m)}月</option>`;
        });
    }
    
    function loadRecordData() {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '[]');
        const now = new Date();
        let filtered = [];
        
        if (recordCurrentFilter === 'today') {
            const today = now.toDateString();
            filtered = records.filter(item => new Date(item.date).toDateString() === today);
        } else if (recordCurrentFilter === 'week') {
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            filtered = records.filter(item => new Date(item.date) >= weekAgo);
        } else if (recordCurrentFilter === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = records.filter(item => new Date(item.date) >= monthStart);
        } else {
            filtered = records;
            if (recordCurrentMonth) {
                filtered = filtered.filter(item => {
                    const date = new Date(item.date);
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    return monthKey === recordCurrentMonth;
                });
            }
        }
        
        // 排序
        filtered.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return recordSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
        
        // 计算汇总
        let totalScore = 0;
        let distractionCount = 0;
        
        filtered.forEach(item => {
            totalScore += item.points || 0;
            if (item.type === 'penalty') {
                distractionCount++;
            }
        });
        
        const scoreEl = document.getElementById('recordScore');
        scoreEl.textContent = (totalScore >= 0 ? '+' : '') + totalScore;
        scoreEl.className = 'summary-value ' + (totalScore >= 0 ? 'positive' : 'negative');
        document.getElementById('recordDistractions').textContent = distractionCount + ' 次';
        document.getElementById('recordCount').textContent = `共 ${filtered.length} 条`;
        
        // 分页
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const startIndex = (recordCurrentPage - 1) * PAGE_SIZE;
        const pageData = filtered.slice(startIndex, startIndex + PAGE_SIZE);
        
        // 渲染列表
        const historyList = document.getElementById('historyList');
        if (pageData.length === 0) {
            historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
        } else {
            historyList.innerHTML = pageData.map(item => {
                const date = new Date(item.date);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
                const points = item.points || 0;
                const isPositive = points >= 0;
                const scoreClass = isPositive ? 'positive' : 'negative';
                const scoreText = isPositive ? `+${points}` : points;
                const icon = item.type === 'penalty' ? '😴' : (item.reason.includes('番茄') ? '🍅' : '✅');
                
                return `
                    <div class="history-item ${item.type === 'penalty' ? 'penalty' : ''}">
                        <span class="history-icon">${icon}</span>
                        <span class="history-date">${dateStr}</span>
                        <span class="history-time">${timeStr}</span>
                        <span class="history-reason">${escapeHtml(item.reason)}</span>
                        <span class="history-score ${scoreClass}">${scoreText}</span>
                        <button class="history-delete" data-id="${item.id}" title="删除">×</button>
                    </div>
                `;
            }).join('');
            
            historyList.querySelectorAll('.history-delete').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    deleteRecordItem(parseInt(btn.dataset.id));
                };
            });
        }
        
        renderPagination('recordPagination', totalPages, recordCurrentPage, (page) => {
            recordCurrentPage = page;
            loadRecordData();
        });
    }
    
    function deleteRecordItem(id) {
        if (!confirm('确定要删除这条记录吗？')) return;
        
        let records = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '[]');
        records = records.filter(item => item.id !== id);
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        
        loadRecordData();
        loadStats();
    }
    
    function renderPagination(containerId, totalPages, currentPage, onPageChange) {
        const container = document.getElementById(containerId);
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        
        if (currentPage > 1) {
            html += `<button class="page-btn" data-page="${currentPage - 1}">‹</button>`;
        }
        
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="page-ellipsis">...</span>`;
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-ellipsis">...</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }
        
        if (currentPage < totalPages) {
            html += `<button class="page-btn" data-page="${currentPage + 1}">›</button>`;
        }
        
        container.innerHTML = html;
        
        container.querySelectorAll('.page-btn').forEach(btn => {
            btn.onclick = () => onPageChange(parseInt(btn.dataset.page));
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 学习日记弹窗 ==========
    const diaryModal = document.getElementById('diaryModal');
    const diaryViewModal = document.getElementById('diaryViewModal');
    let currentEditingDiaryId = null;
    
    document.getElementById('diaryBtn').onclick = () => {
        diaryModal.style.display = 'flex';
        document.getElementById('diaryDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('diaryContent').value = '';
        diaryCurrentPage = 1;
        diaryCurrentMonth = '';
        diarySortOrder = 'desc';
        document.getElementById('diarySortOrder').value = 'desc';
        updateDiaryMonthFilter();
        loadDiaryList();
    };
    
    document.getElementById('closeDiaryModal').onclick = () => {
        diaryModal.style.display = 'none';
    };
    
    document.getElementById('diaryMonthFilter').onchange = function() {
        diaryCurrentMonth = this.value;
        diaryCurrentPage = 1;
        loadDiaryList();
    };
    
    document.getElementById('diarySortOrder').onchange = function() {
        diarySortOrder = this.value;
        diaryCurrentPage = 1;
        loadDiaryList();
    };
    
    function updateDiaryMonthFilter() {
        const diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        const months = new Set();
        
        diaries.forEach(diary => {
            const date = new Date(diary.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months.add(monthKey);
        });
        
        const select = document.getElementById('diaryMonthFilter');
        select.innerHTML = '<option value="">全部月份</option>';
        
        Array.from(months).sort().reverse().forEach(month => {
            const [year, m] = month.split('-');
            select.innerHTML += `<option value="${month}">${year}年${parseInt(m)}月</option>`;
        });
    }
    
    document.getElementById('saveDiaryBtn').onclick = () => {
        const date = document.getElementById('diaryDate').value;
        const content = document.getElementById('diaryContent').value.trim();
        
        if (!date) { alert('请选择日期！'); return; }
        if (!content) { alert('请输入日记内容！'); return; }
        
        const diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        const existingIndex = diaries.findIndex(d => d.date === date);
        
        const diaryEntry = {
            id: existingIndex >= 0 ? diaries[existingIndex].id : Date.now(),
            date: date,
            content: content,
            updatedAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            if (confirm('该日期已有日记，是否覆盖？')) {
                diaries[existingIndex] = diaryEntry;
            } else {
                return;
            }
        } else {
            diaries.unshift(diaryEntry);
        }
        
        localStorage.setItem(STORAGE_KEYS.DIARY, JSON.stringify(diaries));
        document.getElementById('diaryContent').value = '';
        updateDiaryMonthFilter();
        loadDiaryList();
        alert('日记保存成功！');
    };
    
    function loadDiaryList() {
        let diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        
        if (diaryCurrentMonth) {
            diaries = diaries.filter(diary => {
                const date = new Date(diary.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return monthKey === diaryCurrentMonth;
            });
        }
        
        // 排序
        diaries.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return diarySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
        
        document.getElementById('diaryCount').textContent = `共 ${diaries.length} 篇`;
        
        const totalPages = Math.ceil(diaries.length / PAGE_SIZE);
        const startIndex = (diaryCurrentPage - 1) * PAGE_SIZE;
        const pageData = diaries.slice(startIndex, startIndex + PAGE_SIZE);
        
        const diaryList = document.getElementById('diaryList');
        if (pageData.length === 0) {
            diaryList.innerHTML = '<div class="diary-empty">还没有日记</div>';
        } else {
            diaryList.innerHTML = pageData.map(diary => {
                const date = new Date(diary.date);
                const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
                const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
                const preview = diary.content.length > 50 ? diary.content.substring(0, 50) + '...' : diary.content;
                
                return `
                    <div class="diary-item" data-id="${diary.id}">
                        <div class="diary-item-header">
                            <span class="diary-item-date">${dateStr} ${weekDay}</span>
                        </div>
                        <div class="diary-item-preview">${escapeHtml(preview)}</div>
                    </div>
                `;
            }).join('');
            
            diaryList.querySelectorAll('.diary-item').forEach(item => {
                item.onclick = () => viewDiary(parseInt(item.dataset.id));
            });
        }
        
        renderPagination('diaryPagination', totalPages, diaryCurrentPage, (page) => {
            diaryCurrentPage = page;
            loadDiaryList();
        });
    }
    
    function viewDiary(id) {
        const diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        const diary = diaries.find(d => d.id === id);
        if (!diary) return;
        
        currentEditingDiaryId = id;
        
        const date = new Date(diary.date);
        const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
        
        document.getElementById('diaryViewDate').textContent = `${dateStr} ${weekDay}`;
        document.getElementById('diaryViewContent').textContent = diary.content;
        document.getElementById('diaryEditContent').value = diary.content;
        
        setDiaryViewMode('view');
        diaryViewModal.style.display = 'flex';
    }
    
    function setDiaryViewMode(mode) {
        const viewContent = document.getElementById('diaryViewContent');
        const editContent = document.getElementById('diaryEditContent');
        const editBtn = document.getElementById('editDiaryBtn');
        const saveBtn = document.getElementById('saveEditDiaryBtn');
        const cancelBtn = document.getElementById('cancelEditDiaryBtn');
        const deleteBtn = document.getElementById('deleteDiaryBtn');
        
        if (mode === 'edit') {
            viewContent.style.display = 'none';
            editContent.style.display = 'block';
            editBtn.style.display = 'none';
            saveBtn.style.display = 'inline-flex';
            cancelBtn.style.display = 'inline-flex';
            deleteBtn.style.display = 'none';
        } else {
            viewContent.style.display = 'block';
            editContent.style.display = 'none';
            editBtn.style.display = 'inline-flex';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            deleteBtn.style.display = 'inline-flex';
        }
    }
    
    document.getElementById('closeDiaryViewModal').onclick = () => {
        diaryViewModal.style.display = 'none';
        currentEditingDiaryId = null;
    };
    
    document.getElementById('editDiaryBtn').onclick = () => setDiaryViewMode('edit');
    
    document.getElementById('cancelEditDiaryBtn').onclick = () => {
        const diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        const diary = diaries.find(d => d.id === currentEditingDiaryId);
        if (diary) document.getElementById('diaryEditContent').value = diary.content;
        setDiaryViewMode('view');
    };
    
    document.getElementById('saveEditDiaryBtn').onclick = () => {
        const newContent = document.getElementById('diaryEditContent').value.trim();
        if (!newContent) { alert('日记内容不能为空！'); return; }
        
        const diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        const diaryIndex = diaries.findIndex(d => d.id === currentEditingDiaryId);
        
        if (diaryIndex >= 0) {
            diaries[diaryIndex].content = newContent;
            diaries[diaryIndex].updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_KEYS.DIARY, JSON.stringify(diaries));
            
            document.getElementById('diaryViewContent').textContent = newContent;
            setDiaryViewMode('view');
            loadDiaryList();
            alert('日记已更新！');
        }
    };
    
    document.getElementById('deleteDiaryBtn').onclick = () => {
        if (!confirm('确定要删除这篇日记吗？')) return;
        
        let diaries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || '[]');
        diaries = diaries.filter(d => d.id !== currentEditingDiaryId);
        localStorage.setItem(STORAGE_KEYS.DIARY, JSON.stringify(diaries));
        
        diaryViewModal.style.display = 'none';
        updateDiaryMonthFilter();
        loadDiaryList();
    };

    // ========== Socket 数据 ==========
    socket.on('frame', (data) => {
        if (debugVideo) debugVideo.src = 'data:image/jpeg;base64,' + data.image;
    });

    socket.on('monitor_data', (data) => {
        const liveEar = document.getElementById('live_ear');
        const livePitch = document.getElementById('live_pitch');
        const liveYaw = document.getElementById('live_yaw');
        
        if (liveEar) liveEar.innerText = (data.ear || 0).toFixed(3);
        if (livePitch) livePitch.innerText = Math.round(data.pitch || 0) + '°';
        if (liveYaw) liveYaw.innerText = Math.round(data.yaw || 0) + '°';
    });

    // ========== 保存设置 ==========
    document.getElementById('saveSettingsBtn').onclick = async () => {
        const settings = {
            ear_threshold: document.getElementById('ear_threshold').value,
            pitch_head_down: document.getElementById('pitch_head_down').value,
            pitch_head_up: document.getElementById('pitch_head_up').value,
            yaw_threshold: document.getElementById('yaw_threshold').value
        };
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        settingsModal.style.display = 'none';
        fetch('/api/stop', { method: 'POST' });
        alert('参数已保存！');
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
    
    // ========== 点击弹窗外部关闭 ==========
    window.onclick = (e) => {
        if (e.target === recordModal) recordModal.style.display = 'none';
        if (e.target === diaryModal) diaryModal.style.display = 'none';
        if (e.target === diaryViewModal) diaryViewModal.style.display = 'none';
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
            fetch('/api/stop', { method: 'POST' });
        }
    };
});
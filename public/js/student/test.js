const user = Auth.requireAuth('student');
if (!user) throw new Error('Not authenticated');

const params = new URLSearchParams(window.location.search);
const attemptId = params.get('attempt');
if (!attemptId) window.location.href = '/student/dashboard.html';

let examData = null;
let currentIndex = 0;
let timerInterval = null;
let answers = {}; // question_id -> selected_option
let saveTimeout = null;

async function init() {
  try {
    const data = await api.get(`/student/attempts/${attemptId}`);
    if (data.attempt.is_completed) {
      window.location.href = `/student/results.html?attempt=${attemptId}`;
      return;
    }
    examData = data;

    // Load pre-saved answers
    data.questions.forEach(q => {
      if (q.selected_option) answers[q.id] = q.selected_option;
    });

    document.getElementById('exam-title').textContent = data.test.title;
    document.getElementById('exam-subtitle').textContent = `${data.questions.length} questions — Good luck!`;

    buildQGrid();
    renderQuestion(0);
    updateProgress();

    if (data.test.time_limit_minutes) {
      startTimer(data.attempt.started_at, data.test.time_limit_minutes);
    }

    document.getElementById('prev-btn').addEventListener('click', () => navigate(-1));
    document.getElementById('next-btn').addEventListener('click', () => navigate(1));
    document.getElementById('submit-btn').addEventListener('click', openSubmitModal);
    document.getElementById('cancel-submit-btn').addEventListener('click', () => {
      document.getElementById('submit-modal').classList.add('hidden');
    });
    document.getElementById('confirm-submit-btn').addEventListener('click', submitExam);

  } catch (err) {
    if (err.status === 401) Auth.logout();
    document.getElementById('question-main').innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error loading exam</h3><p>${err.message}</p></div>`;
  }
}

function buildQGrid() {
  const grid = document.getElementById('q-grid');
  grid.innerHTML = examData.questions.map((q, i) => `
    <button class="q-dot ${answers[q.id] ? 'answered' : ''} ${i === currentIndex ? 'current' : ''}"
      id="qdot-${i}" onclick="goTo(${i})">${i + 1}</button>
  `).join('');
}

function goTo(index) {
  currentIndex = index;
  renderQuestion(index);
  updateProgress();
  syncQGrid();
}

function navigate(dir) {
  const next = currentIndex + dir;
  if (next < 0 || next >= examData.questions.length) return;
  goTo(next);
}

function renderQuestion(index) {
  const q = examData.questions[index];
  const total = examData.questions.length;
  const selected = answers[q.id] || null;

  document.getElementById('progress-label').textContent = `Question ${index + 1} of ${total}`;

  const optLabels = ['a', 'b', 'c', 'd'];
  const optTexts = [q.option_a, q.option_b, q.option_c, q.option_d];

  document.getElementById('question-main').innerHTML = `
    <div class="question-card" id="question-card">
      <div class="question-card-number">Question ${index + 1} of ${total}</div>
      <div class="question-card-text">${escHtml(q.question_text)}</div>
      <div class="options-list">
        ${optLabels.map((opt, i) => `
          <div class="option-item ${selected === opt ? 'selected' : ''}"
            id="opt-${opt}" onclick="selectOption('${q.id}', '${opt}', ${index})" role="button" tabindex="0">
            <div class="option-badge" id="badge-${opt}">${opt.toUpperCase()}</div>
            <div class="option-text">${escHtml(optTexts[i])}</div>
          </div>
        `).join('')}
      </div>
    </div>`;

  // Keyboard navigation
  document.querySelectorAll('.option-item').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') el.click();
    });
  });

  // Prev/Next/Submit buttons
  document.getElementById('prev-btn').disabled = index === 0;
  const isLast = index === total - 1;
  document.getElementById('next-btn').style.display = isLast ? 'none' : 'inline-flex';
  document.getElementById('submit-btn').style.display = isLast ? 'inline-flex' : 'none';
  document.getElementById('nav-center').textContent = `${Object.keys(answers).length} of ${total} answered`;
}

function selectOption(questionId, option, index) {
  answers[questionId] = option;

  // Update UI
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  document.getElementById(`opt-${option}`)?.classList.add('selected');

  // Update q-grid dot
  const dot = document.getElementById(`qdot-${index}`);
  if (dot) dot.classList.add('answered');

  updateProgress();

  // Debounced save to server
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveAnswer(attemptId, questionId, option), 500);
}

async function saveAnswer(attemptId, questionId, option) {
  try {
    await api.put(`/student/attempts/${attemptId}/answer`, {
      question_id: parseInt(questionId),
      selected_option: option,
    });
  } catch (err) {
    console.warn('Auto-save failed:', err.message);
  }
}

function updateProgress() {
  const total = examData.questions.length;
  const answered = Object.keys(answers).length;
  const pct = total > 0 ? (answered / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('answered-count').textContent = `${answered} answered`;
  document.getElementById('nav-center').textContent = `${answered} of ${total} answered`;
}

function syncQGrid() {
  examData.questions.forEach((q, i) => {
    const dot = document.getElementById(`qdot-${i}`);
    if (!dot) return;
    dot.className = `q-dot ${answers[q.id] ? 'answered' : ''} ${i === currentIndex ? 'current' : ''}`;
  });
}

function startTimer(startedAt, limitMinutes) {
  const startTime = new Date(startedAt).getTime();
  const endTime = startTime + limitMinutes * 60 * 1000;
  const timerEl = document.getElementById('timer-display');
  const timerText = document.getElementById('timer-text');
  timerEl.classList.remove('hidden');

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerText.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    timerEl.classList.remove('warning', 'danger');
    if (remaining <= 60000) timerEl.classList.add('danger');
    else if (remaining <= 300000) timerEl.classList.add('warning');

    if (remaining === 0) {
      clearInterval(timerInterval);
      timerText.textContent = '00:00';
      submitExam(true);
    }
  }, 1000);
}

function openSubmitModal() {
  const total = examData.questions.length;
  const answered = Object.keys(answers).length;
  const unanswered = total - answered;
  const warningEl = document.getElementById('unanswered-warning');
  if (unanswered > 0) {
    warningEl.textContent = `⚠️ You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Unanswered questions will be marked incorrect.`;
    warningEl.style.display = 'flex';
  } else {
    warningEl.style.display = 'none';
  }
  document.getElementById('submit-modal').classList.remove('hidden');
}

async function submitExam(autoSubmit = false) {
  if (!autoSubmit) document.getElementById('submit-modal').classList.add('hidden');
  const btn = document.getElementById('confirm-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting...'; }

  clearInterval(timerInterval);
  try {
    await api.post(`/student/attempts/${attemptId}/submit`);
    window.location.href = `/student/results.html?attempt=${attemptId}`;
  } catch (err) {
    if (err.status === 409) {
      window.location.href = `/student/results.html?attempt=${attemptId}`;
    } else {
      alert('Failed to submit exam. Please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Now'; }
    }
  }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

init();

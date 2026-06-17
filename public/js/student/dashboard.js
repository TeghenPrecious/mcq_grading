const user = Auth.requireAuth('student');
if (user) {
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-initial').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('welcome-msg').textContent = `Hello, ${user.name.split(' ')[0]} 👋`;
  document.getElementById('logout-btn').addEventListener('click', Auth.logout);
  loadDashboard();
}

async function loadDashboard() {
  try {
    const [testsData, attemptsData] = await Promise.all([
      api.get('/student/tests'),
      api.get('/student/my-attempts'),
    ]);
    renderTests(testsData.tests);
    renderResults(attemptsData.attempts.filter(a => a.is_completed));
  } catch (err) {
    if (err.status === 401) Auth.logout();
  }
}

function renderTests(tests) {
  const el = document.getElementById('tests-container');
  if (!tests.length) {
    el.innerHTML = `<div class="empty-state" style="padding:60px 20px">
      <div class="empty-state-icon">📝</div>
      <h3>No tests available</h3>
      <p>Your instructor hasn't published any tests yet</p>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="test-grid">${tests.map(t => {
    const isCompleted = !!t.completed_attempt_id;
    const isInProgress = !!t.in_progress_attempt_id && !isCompleted;
    let cardClass = 'student-test-card';
    let btnHtml = '';
    let statusBadge = '';

    if (isCompleted) {
      cardClass += ' completed';
      statusBadge = '<span class="badge badge-success">✅ Completed</span>';
      btnHtml = `<a href="/student/results.html?attempt=${t.completed_attempt_id}" class="btn btn-success btn-full btn-sm">View Results</a>`;
    } else if (isInProgress) {
      cardClass += ' in-progress';
      statusBadge = '<span class="badge badge-warning">⏳ In Progress</span>';
      btnHtml = `<a href="/student/test.html?attempt=${t.in_progress_attempt_id}" class="btn btn-primary btn-full btn-sm">Continue Exam</a>`;
    } else {
      statusBadge = '<span class="badge badge-primary">📝 Available</span>';
      btnHtml = `<button class="btn btn-primary btn-full btn-sm" onclick="startTest(${t.id})" id="start-btn-${t.id}">Start Exam</button>`;
    }

    return `
      <div class="${cardClass}">
        <div class="flex justify-between items-center mb-2">
          <div class="test-card-title">${escHtml(t.title)}</div>
          ${statusBadge}
        </div>
        <div class="test-card-desc">${t.description ? escHtml(t.description) : 'No description provided.'}</div>
        <div class="test-card-stats">
          <div class="test-card-stat">❓ ${t.question_count} question${t.question_count !== 1 ? 's' : ''}</div>
          ${t.time_limit_minutes ? `<div class="test-card-stat">⏱️ ${t.time_limit_minutes} min</div>` : '<div class="test-card-stat">⏱️ No limit</div>'}
        </div>
        <div class="test-card-footer">
          ${btnHtml}
        </div>
      </div>`;
  }).join('')}</div>`;
}

async function startTest(testId) {
  const btn = document.getElementById(`start-btn-${testId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting...'; }
  try {
    const data = await api.post(`/student/tests/${testId}/start`);
    window.location.href = `/student/test.html?attempt=${data.attempt_id}`;
  } catch (err) {
    if (err.status === 409) {
      window.location.href = `/student/results.html?attempt=${err.message}`;
    } else {
      alert(err.message || 'Could not start test.');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Exam'; }
    }
  }
}

function renderResults(attempts) {
  const el = document.getElementById('results-container');
  if (!attempts.length) return;
  el.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Test</th><th>Score</th><th>Result</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${attempts.map(a => `
              <tr>
                <td style="font-weight:600">${escHtml(a.test_title)}</td>
                <td>${a.score} / ${a.total_questions}</td>
                <td>
                  <span class="score-pill ${a.percentage>=70?'score-high':a.percentage>=50?'score-mid':'score-low'}">
                    ${a.percentage}%
                  </span>
                </td>
                <td class="text-muted text-sm">${formatDate(a.submitted_at)}</td>
                <td><a href="/student/results.html?attempt=${a.id}" class="btn btn-secondary btn-sm">Review</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

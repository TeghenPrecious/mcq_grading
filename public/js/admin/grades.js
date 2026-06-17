const user = Auth.requireAuth('admin');
if (user) {
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-initial').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('logout-btn').addEventListener('click', Auth.logout);
  initGrades();
}

async function initGrades() {
  await Promise.all([loadTests(), loadGrades()]);

  document.getElementById('test-filter').addEventListener('change', loadGrades);
  document.getElementById('export-btn').addEventListener('click', exportPDF);
}

async function loadTests() {
  try {
    const data = await api.get('/admin/tests');
    const sel = document.getElementById('test-filter');
    data.tests.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title;
      sel.appendChild(opt);
    });
  } catch (err) {
    if (err.status === 401) Auth.logout();
  }
}

async function loadGrades() {
  const testId = document.getElementById('test-filter').value;
  const endpoint = testId ? `/admin/grades?test_id=${testId}` : '/admin/grades';
  const el = document.getElementById('grades-container');
  el.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const data = await api.get(endpoint);
    updateStats(data.grades);
    renderGrades(data.grades);
  } catch (err) {
    el.innerHTML = '<p class="text-muted text-center">Failed to load grades.</p>';
  }
}

function updateStats(grades) {
  const statsEl = document.getElementById('grade-stats');
  if (!grades.length) { statsEl.style.display = 'none'; return; }
  statsEl.style.display = 'grid';

  const unique = new Set(grades.map(g => g.user_id)).size;
  const avg = Math.round(grades.reduce((s, g) => s + g.percentage, 0) / grades.length);
  const high = Math.max(...grades.map(g => g.percentage));

  document.getElementById('gs-students').textContent = unique;
  document.getElementById('gs-avg').textContent = avg + '%';
  document.getElementById('gs-high').textContent = high + '%';
}

function renderGrades(grades) {
  const el = document.getElementById('grades-container');
  if (!grades.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No grades yet</h3><p>Students haven't completed any tests</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="table">
        <thead><tr>
          <th>#</th>
          <th>Student</th>
          <th>Test</th>
          <th>Score</th>
          <th>Result</th>
          <th>Submitted</th>
        </tr></thead>
        <tbody>
          ${grades.map((g, i) => `
            <tr>
              <td class="text-muted text-sm">${i + 1}</td>
              <td>
                <div style="font-weight:600">${escHtml(g.student_name)}</div>
                <div class="text-sm text-muted">${g.student_email}</div>
              </td>
              <td>${escHtml(g.test_title)}</td>
              <td>
                <div style="font-weight:700">${g.score} / ${g.total_questions}</div>
                <div class="progress-bar mt-1" style="max-width:100px">
                  <div class="progress-fill" style="width:${g.percentage}%"></div>
                </div>
              </td>
              <td>
                <span class="score-pill ${g.percentage>=70?'score-high':g.percentage>=50?'score-mid':'score-low'}">
                  ${g.percentage}%
                </span>
              </td>
              <td class="text-muted text-sm">${formatDate(g.submitted_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function exportPDF() {
  const testId = document.getElementById('test-filter').value;
  const url = testId ? `/api/admin/grades/export?test_id=${testId}` : '/api/admin/grades/export';
  setLoading('export-btn', true, 'Generating PDF...');
  try {
    const token = localStorage.getItem('ef_token');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `examflow-grades-${Date.now()}.pdf`;
    a.click();
    showAlert('alert-container', 'PDF exported successfully!', 'success');
  } catch (err) {
    showAlert('alert-container', 'Failed to export PDF.');
  } finally {
    setLoading('export-btn', false, '📄 Export PDF');
  }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

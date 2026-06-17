const user = Auth.requireAuth('admin');
if (user) {
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-initial').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('logout-btn').addEventListener('click', Auth.logout);
  loadDashboard();
}

async function loadDashboard() {
  try {
    const [testsData, studentsData, gradesData] = await Promise.all([
      api.get('/admin/tests'),
      api.get('/admin/students'),
      api.get('/admin/grades'),
    ]);

    document.getElementById('stat-tests').textContent = testsData.tests.length;
    document.getElementById('stat-students').textContent = studentsData.students.length;
    document.getElementById('stat-attempts').textContent = gradesData.grades.length;

    const avg = gradesData.grades.length
      ? Math.round(gradesData.grades.reduce((s, g) => s + g.percentage, 0) / gradesData.grades.length)
      : 0;
    document.getElementById('stat-avg').textContent = avg + '%';

    renderRecentGrades(gradesData.grades.slice(0, 8));
  } catch (err) {
    if (err.status === 401 || err.status === 403) Auth.logout();
  }
}

function renderRecentGrades(grades) {
  const el = document.getElementById('recent-grades-content');
  if (!grades.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No submissions yet</h3><p>Students haven't completed any tests</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table class="table">
        <thead><tr>
          <th>Student</th><th>Test</th><th>Score</th><th>Date</th>
        </tr></thead>
        <tbody>
          ${grades.map(g => `
            <tr>
              <td>
                <div style="font-weight:600">${g.student_name}</div>
                <div class="text-sm text-muted">${g.student_email}</div>
              </td>
              <td>${g.test_title}</td>
              <td>
                <span class="score-pill ${g.percentage>=70?'score-high':g.percentage>=50?'score-mid':'score-low'}">
                  ${g.score}/${g.total_questions} (${g.percentage}%)
                </span>
              </td>
              <td class="text-muted text-sm">${formatDate(g.submitted_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

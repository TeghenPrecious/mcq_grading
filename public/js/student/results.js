const user = Auth.requireAuth('student');
if (!user) throw new Error('Not authenticated');
document.getElementById('logout-btn').addEventListener('click', Auth.logout);

const params = new URLSearchParams(window.location.search);
const attemptId = params.get('attempt');
if (!attemptId) window.location.href = '/student/dashboard.html';

async function loadResults() {
  try {
    const data = await api.get(`/student/attempts/${attemptId}/results`);
    renderHero(data.attempt, data.test);
    renderFeedback(data.questions);
    document.getElementById('results-body').style.display = 'block';
  } catch (err) {
    if (err.status === 401) Auth.logout();
    document.getElementById('results-hero').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Error loading results</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

function getGrade(pct) {
  if (pct >= 90) return { label: 'Excellent!', emoji: '🏆', color: 'var(--success)' };
  if (pct >= 70) return { label: 'Good Job!', emoji: '👍', color: 'var(--accent)' };
  if (pct >= 50) return { label: 'Average', emoji: '📚', color: 'var(--warning)' };
  return { label: 'Keep Practicing', emoji: '💪', color: 'var(--danger)' };
}

function renderHero(attempt, test) {
  const grade = getGrade(attempt.percentage);
  const correct = attempt.score;
  const incorrect = attempt.total_questions - attempt.score;

  document.getElementById('results-hero').innerHTML = `
    <div style="max-width:500px;margin:0 auto">
      <p class="text-muted mb-2" style="font-size:0.9rem">${test.title}</p>
      <h1 style="font-size:1.8rem;margin-bottom:24px">${grade.emoji} ${grade.label}</h1>

      <div class="score-circle" style="margin-bottom:32px">
        <div class="score-circle-bg"></div>
        <div class="score-pct gradient-text">${attempt.percentage}%</div>
        <div class="score-label">Score</div>
      </div>

      <div class="score-details">
        <div class="score-detail">
          <div class="score-detail-value" style="color:var(--success)">${correct}</div>
          <div class="score-detail-label">Correct</div>
        </div>
        <div class="score-detail">
          <div class="score-detail-value" style="color:var(--danger)">${incorrect}</div>
          <div class="score-detail-label">Incorrect</div>
        </div>
        <div class="score-detail">
          <div class="score-detail-value">${attempt.total_questions}</div>
          <div class="score-detail-label">Total</div>
        </div>
      </div>

      <div class="progress-bar" style="max-width:300px;margin:24px auto 0;height:8px">
        <div class="progress-fill" style="width:${attempt.percentage}%"></div>
      </div>
      <p class="text-muted text-sm mt-2">Submitted: ${formatDate(attempt.submitted_at)}</p>
    </div>`;
}

function renderFeedback(questions) {
  const el = document.getElementById('feedback-list');
  el.innerHTML = questions.map((q, i) => {
    const skipped = !q.selected_option;
    const correct = q.is_correct === 1;
    const itemClass = skipped ? 'skipped-q' : correct ? 'correct-q' : 'wrong-q';
    const statusIcon = skipped ? '⚪' : correct ? '✅' : '❌';

    const optLabels = ['a', 'b', 'c', 'd'];
    const optTexts = [q.option_a, q.option_b, q.option_c, q.option_d];

    return `
      <div class="feedback-item ${itemClass}">
        <div class="feedback-header">
          <span class="feedback-status-icon">${statusIcon}</span>
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Question ${q.index}</div>
            <div class="feedback-q-text">${escHtml(q.question_text)}</div>
          </div>
        </div>
        <div class="feedback-options">
          ${optLabels.map((opt, i) => {
            const isCorrect = opt === q.correct_option;
            const isSelected = opt === q.selected_option;
            const isWrongSelected = isSelected && !isCorrect;
            let optClass = '';
            if (isCorrect) optClass = 'correct-ans';
            else if (isWrongSelected) optClass = 'wrong-ans';
            const icon = isCorrect ? '✓' : isWrongSelected ? '✗' : opt.toUpperCase();
            return `
              <div class="feedback-option ${optClass}">
                <div class="feedback-option-label">${icon}</div>
                <span>${escHtml(optTexts[i])}</span>
                ${isSelected && !isCorrect ? ' <span style="font-size:0.75rem;opacity:0.7">(your answer)</span>' : ''}
              </div>`;
          }).join('')}
        </div>
        ${skipped ? '<p class="text-sm text-muted mt-2">⚠️ This question was not answered</p>' : ''}
      </div>`;
  }).join('');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

loadResults();

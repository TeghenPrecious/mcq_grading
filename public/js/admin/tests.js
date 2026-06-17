const user = Auth.requireAuth('admin');
if (user) {
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-initial').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('logout-btn').addEventListener('click', Auth.logout);
  initTests();
}

let allTests = [];
let deleteTarget = null;

function initTests() {
  loadTests();

  // Modals open/close
  document.getElementById('create-test-btn').addEventListener('click', () => openTestModal());
  document.getElementById('close-test-modal').addEventListener('click', closeTestModal);
  document.getElementById('cancel-test-btn').addEventListener('click', closeTestModal);
  document.getElementById('close-q-modal').addEventListener('click', closeQModal);
  document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });

  // Click outside modal to close
  document.getElementById('test-modal').addEventListener('click', (e) => {
    if (e.target.id === 'test-modal') closeTestModal();
  });
  document.getElementById('questions-modal').addEventListener('click', (e) => {
    if (e.target.id === 'questions-modal') closeQModal();
  });

  // Form submissions
  document.getElementById('test-form').addEventListener('submit', saveTest);
  document.getElementById('question-form').addEventListener('submit', addQuestion);
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
}

async function loadTests() {
  try {
    const data = await api.get('/admin/tests');
    allTests = data.tests;
    renderTests(allTests);
  } catch (err) {
    if (err.status === 401) Auth.logout();
    showAlert('alert-container', 'Failed to load tests.');
  }
}

function renderTests(tests) {
  const el = document.getElementById('tests-container');
  if (!tests.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <h3>No tests yet</h3>
        <p>Create your first test to get started</p>
        <button class="btn btn-primary mt-4" onclick="openTestModal()">+ Create Test</button>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="grid grid-2" style="gap:20px">
    ${tests.map(t => `
      <div class="test-card" id="test-card-${t.id}">
        <div class="test-card-header">
          <div style="flex:1">
            <div class="flex items-center gap-2 mb-1">
              <h3 style="font-size:1rem">${escHtml(t.title)}</h3>
              <span class="badge ${t.is_active ? 'badge-success' : 'badge-muted'}">${t.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p class="text-sm text-muted">${t.description ? escHtml(t.description) : 'No description'}</p>
          </div>
          <div class="test-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="toggleActive(${t.id}, ${t.is_active})">
              ${t.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openTestModal(${t.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="openDelete(${t.id}, '${escHtml(t.title)}')">Del</button>
          </div>
        </div>
        <div class="test-card-meta">
          <div class="test-card-meta-item">❓ ${t.question_count} question${t.question_count !== 1 ? 's' : ''}</div>
          <div class="test-card-meta-item">✅ ${t.attempt_count} attempt${t.attempt_count !== 1 ? 's' : ''}</div>
          ${t.time_limit_minutes ? `<div class="test-card-meta-item">⏱️ ${t.time_limit_minutes} min</div>` : ''}
        </div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          <button class="btn btn-primary btn-sm btn-full" onclick="openQModal(${t.id}, '${escHtml(t.title)}')">
            📚 Manage Questions
          </button>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ── Test Modal ────────────────────────────────────────────────
function openTestModal(testId = null) {
  const form = document.getElementById('test-form');
  form.reset();
  document.getElementById('modal-alert').innerHTML = '';

  if (testId) {
    const t = allTests.find(x => x.id === testId);
    if (!t) return;
    document.getElementById('modal-title').textContent = 'Edit Test';
    document.getElementById('test-id').value = t.id;
    document.getElementById('test-title').value = t.title;
    document.getElementById('test-desc').value = t.description || '';
    document.getElementById('test-time').value = t.time_limit_minutes || '';
  } else {
    document.getElementById('modal-title').textContent = 'Create New Test';
    document.getElementById('test-id').value = '';
  }
  document.getElementById('test-modal').classList.remove('hidden');
}

function closeTestModal() {
  document.getElementById('test-modal').classList.add('hidden');
}

async function saveTest(e) {
  e.preventDefault();
  const id = document.getElementById('test-id').value;
  const title = document.getElementById('test-title').value.trim();
  const description = document.getElementById('test-desc').value.trim();
  const time_limit_minutes = parseInt(document.getElementById('test-time').value) || null;

  if (!title) return showAlert('modal-alert', 'Title is required.');
  setLoading('save-test-btn', true, 'Saving...');

  try {
    if (id) {
      await api.put(`/admin/tests/${id}`, { title, description, time_limit_minutes });
    } else {
      await api.post('/admin/tests', { title, description, time_limit_minutes });
    }
    closeTestModal();
    await loadTests();
    showAlert('alert-container', `Test ${id ? 'updated' : 'created'} successfully!`, 'success');
  } catch (err) {
    showAlert('modal-alert', err.message || 'Failed to save test.');
  } finally {
    setLoading('save-test-btn', false, 'Save Test');
  }
}

async function toggleActive(id, currentState) {
  try {
    await api.put(`/admin/tests/${id}`, { is_active: currentState ? 0 : 1 });
    await loadTests();
  } catch (err) {
    showAlert('alert-container', 'Failed to update test status.');
  }
}

// ── Delete Modal ──────────────────────────────────────────────
function openDelete(id, title) {
  deleteTarget = id;
  document.getElementById('delete-modal-title').textContent = `Delete "${title}"?`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  try {
    await api.delete(`/admin/tests/${deleteTarget}`);
    document.getElementById('delete-modal').classList.add('hidden');
    deleteTarget = null;
    await loadTests();
    showAlert('alert-container', 'Test deleted.', 'success');
  } catch (err) {
    showAlert('alert-container', 'Failed to delete test.');
  }
}

// ── Questions Modal ───────────────────────────────────────────
async function openQModal(testId, testTitle) {
  document.getElementById('q-test-id').value = testId;
  document.getElementById('q-modal-title').textContent = `Questions — ${testTitle}`;
  document.getElementById('q-modal-alert').innerHTML = '';
  document.getElementById('question-form').reset();
  document.getElementById('questions-modal').classList.remove('hidden');
  await loadQuestions(testId);
}

function closeQModal() {
  document.getElementById('questions-modal').classList.add('hidden');
  loadTests();
}

async function loadQuestions(testId) {
  const el = document.getElementById('questions-list');
  el.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    const data = await api.get(`/admin/tests/${testId}/questions`);
    renderQuestions(data.questions);
    document.getElementById('q-modal-subtitle').textContent = `${data.questions.length} question${data.questions.length !== 1 ? 's' : ''}`;
  } catch (err) {
    el.innerHTML = '<p class="text-muted text-sm">Failed to load questions.</p>';
  }
}

function renderQuestions(questions) {
  const el = document.getElementById('questions-list');
  if (!questions.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-state-icon" style="font-size:2rem">❓</div><p>No questions yet. Add one below.</p></div>`;
    return;
  }
  el.innerHTML = questions.map((q, i) => `
    <div class="question-item">
      <div class="flex items-center gap-3 mb-2">
        <div class="question-number">${i + 1}</div>
        <div style="flex:1;font-weight:600;font-size:0.9rem">${escHtml(q.question_text)}</div>
        <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">✕</button>
      </div>
      <div class="question-options">
        ${['a','b','c','d'].map(opt => `
          <div class="question-option">
            <div class="option-label ${q.correct_option === opt ? 'correct' : 'wrong'}">${opt.toUpperCase()}</div>
            <span>${escHtml(q['option_' + opt])}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function addQuestion(e) {
  e.preventDefault();
  const testId = document.getElementById('q-test-id').value;
  const payload = {
    question_text: document.getElementById('q-text').value.trim(),
    option_a: document.getElementById('q-opt-a').value.trim(),
    option_b: document.getElementById('q-opt-b').value.trim(),
    option_c: document.getElementById('q-opt-c').value.trim(),
    option_d: document.getElementById('q-opt-d').value.trim(),
    correct_option: document.getElementById('q-correct').value,
  };
  if (Object.values(payload).some(v => !v)) {
    return showAlert('q-modal-alert', 'All fields are required.');
  }
  setLoading('add-q-btn', true, 'Adding...');
  try {
    await api.post(`/admin/tests/${testId}/questions`, payload);
    document.getElementById('question-form').reset();
    await loadQuestions(testId);
  } catch (err) {
    showAlert('q-modal-alert', err.message || 'Failed to add question.');
  } finally {
    setLoading('add-q-btn', false, 'Add Question');
  }
}

async function deleteQuestion(qId) {
  if (!confirm('Delete this question?')) return;
  const testId = document.getElementById('q-test-id').value;
  try {
    await api.delete(`/admin/questions/${qId}`);
    await loadQuestions(testId);
  } catch (err) {
    showAlert('q-modal-alert', 'Failed to delete question.');
  }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

// Shared auth utilities
const Auth = {
  getToken: () => localStorage.getItem('ef_token'),
  getUser: () => {
    const u = localStorage.getItem('ef_user');
    return u ? JSON.parse(u) : null;
  },
  save: (token, user) => {
    localStorage.setItem('ef_token', token);
    localStorage.setItem('ef_user', JSON.stringify(user));
  },
  logout: () => {
    localStorage.removeItem('ef_token');
    localStorage.removeItem('ef_user');
    window.location.href = '/';
  },
  requireAuth: (expectedRole) => {
    const token = localStorage.getItem('ef_token');
    const user = Auth.getUser();
    if (!token || !user) {
      window.location.href = '/';
      return null;
    }
    if (expectedRole && user.role !== expectedRole) {
      window.location.href = user.role === 'admin' ? '/admin/dashboard.html' : '/student/dashboard.html';
      return null;
    }
    return user;
  },
  redirectIfLoggedIn: () => {
    const user = Auth.getUser();
    const token = localStorage.getItem('ef_token');
    if (token && user) {
      window.location.href = user.role === 'admin' ? '/admin/dashboard.html' : '/student/dashboard.html';
    }
  },
};

// UI Helpers
function showAlert(containerId, message, type = 'error') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="alert alert-${type}">
      <span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
      ${message}
    </div>`;
  setTimeout(() => { if (container) container.innerHTML = ''; }, 5000);
}

function setLoading(btnId, loading, text = 'Loading...') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${text}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || text;
    btn.disabled = false;
  }
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

window.Auth = Auth;
window.showAlert = showAlert;
window.setLoading = setLoading;
window.timeAgo = timeAgo;
window.formatDate = formatDate;

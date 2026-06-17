const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const PDFDocument = require('pdfkit');

// All admin routes require auth + admin role
router.use(authMiddleware, requireAdmin);

// ─── TESTS ──────────────────────────────────────────────────────────────────

// GET /api/admin/tests
router.get('/tests', (req, res) => {
  const tests = db.prepare(`
    SELECT t.*, u.name as creator_name,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count,
    (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.is_completed = 1) as attempt_count
    FROM tests t
    LEFT JOIN users u ON t.created_by = u.id
    ORDER BY t.created_at DESC
  `).all();
  res.json({ tests });
});

// POST /api/admin/tests
router.post('/tests', (req, res) => {
  const { title, description, time_limit_minutes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(
    'INSERT INTO tests (title, description, time_limit_minutes, created_by) VALUES (?, ?, ?, ?)'
  ).run(title, description || null, time_limit_minutes || null, req.user.id);

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ test });
});

// PUT /api/admin/tests/:id
router.put('/tests/:id', (req, res) => {
  const { title, description, time_limit_minutes, is_active } = req.body;
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  db.prepare(`
    UPDATE tests SET title = ?, description = ?, time_limit_minutes = ?, is_active = ?
    WHERE id = ?
  `).run(
    title ?? test.title,
    description ?? test.description,
    time_limit_minutes !== undefined ? time_limit_minutes : test.time_limit_minutes,
    is_active !== undefined ? is_active : test.is_active,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  res.json({ test: updated });
});

// DELETE /api/admin/tests/:id
router.delete('/tests/:id', (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  db.prepare('DELETE FROM tests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Test deleted successfully' });
});

// ─── QUESTIONS ───────────────────────────────────────────────────────────────

// GET /api/admin/tests/:id/questions
router.get('/tests/:id/questions', (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  const questions = db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY id').all(req.params.id);
  res.json({ test, questions });
});

// POST /api/admin/tests/:id/questions
router.post('/tests/:id/questions', (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_option } = req.body;

  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
    return res.status(400).json({ error: 'All question fields are required' });
  }
  if (!['a', 'b', 'c', 'd'].includes(correct_option.toLowerCase())) {
    return res.status(400).json({ error: 'correct_option must be a, b, c, or d' });
  }

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const result = db.prepare(`
    INSERT INTO questions (test_id, question_text, option_a, option_b, option_c, option_d, correct_option)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, question_text, option_a, option_b, option_c, option_d, correct_option.toLowerCase());

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ question });
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_option } = req.body;
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found' });

  db.prepare(`
    UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?
    WHERE id = ?
  `).run(
    question_text ?? q.question_text,
    option_a ?? q.option_a,
    option_b ?? q.option_b,
    option_c ?? q.option_c,
    option_d ?? q.option_d,
    correct_option ? correct_option.toLowerCase() : q.correct_option,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  res.json({ question: updated });
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found' });
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Question deleted successfully' });
});

// ─── GRADES ──────────────────────────────────────────────────────────────────

// GET /api/admin/grades
router.get('/grades', (req, res) => {
  const { test_id } = req.query;
  let query = `
    SELECT a.id as attempt_id, a.score, a.total_questions, a.submitted_at, a.is_completed,
           u.id as user_id, u.name as student_name, u.email as student_email,
           t.id as test_id, t.title as test_title
    FROM attempts a
    JOIN users u ON a.user_id = u.id
    JOIN tests t ON a.test_id = t.id
    WHERE a.is_completed = 1
  `;
  const params = [];
  if (test_id) {
    query += ' AND t.id = ?';
    params.push(test_id);
  }
  query += ' ORDER BY a.submitted_at DESC';

  const grades = db.prepare(query).all(...params);

  // Add percentage
  const gradesWithPct = grades.map(g => ({
    ...g,
    percentage: g.total_questions > 0 ? Math.round((g.score / g.total_questions) * 100) : 0
  }));

  res.json({ grades: gradesWithPct });
});

// GET /api/admin/grades/export (PDF)
router.get('/grades/export', (req, res) => {
  const { test_id } = req.query;
  let query = `
    SELECT a.score, a.total_questions, a.submitted_at,
           u.name as student_name, u.email as student_email,
           t.title as test_title
    FROM attempts a
    JOIN users u ON a.user_id = u.id
    JOIN tests t ON a.test_id = t.id
    WHERE a.is_completed = 1
  `;
  const params = [];
  if (test_id) {
    query += ' AND t.id = ?';
    params.push(test_id);
  }
  query += ' ORDER BY t.title, a.submitted_at DESC';
  const grades = db.prepare(query).all(...params);

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="examflow-grades-${Date.now()}.pdf"`);
  doc.pipe(res);

  // Header
  doc.rect(0, 0, doc.page.width, 100).fill('#4F46E5');
  doc.fillColor('#FFFFFF').fontSize(28).font('Helvetica-Bold').text('ExamFlow', 50, 30);
  doc.fontSize(12).font('Helvetica').text('Grade Report', 50, 62);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, 50, 78);
  doc.fillColor('#000000').moveDown(4);

  if (grades.length === 0) {
    doc.fontSize(14).text('No completed grades found.', { align: 'center' });
    doc.end();
    return;
  }

  // Group by test
  const byTest = {};
  grades.forEach(g => {
    if (!byTest[g.test_title]) byTest[g.test_title] = [];
    byTest[g.test_title].push(g);
  });

  Object.entries(byTest).forEach(([testTitle, records]) => {
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#4F46E5').text(testTitle, { underline: false });
    doc.moveDown(0.3);

    // Table header
    const startX = 50;
    const colWidths = [180, 160, 60, 60, 60];
    const headers = ['Student Name', 'Email', 'Score', 'Total', '%'];
    const rowHeight = 22;

    doc.rect(startX, doc.y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#EEF2FF');
    let x = startX;
    const headerY = doc.y + 5;
    doc.fillColor('#1E1B4B').fontSize(10).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x + 5, headerY, { width: colWidths[i] - 10, lineBreak: false });
      x += colWidths[i];
    });
    doc.moveDown(1.2);

    records.forEach((r, idx) => {
      const pct = r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0;
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      const rowY = doc.y;

      doc.rect(startX, rowY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(bg);
      x = startX;
      const vals = [r.student_name, r.student_email, String(r.score), String(r.total_questions), `${pct}%`];
      doc.fillColor('#111827').fontSize(9).font('Helvetica');
      vals.forEach((v, i) => {
        doc.text(v, x + 5, rowY + 6, { width: colWidths[i] - 10, lineBreak: false });
        x += colWidths[i];
      });
      doc.moveDown(1.2);
    });

    // Summary row
    const avg = records.reduce((sum, r) => sum + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0), 0) / records.length;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#4F46E5')
      .text(`  ${records.length} student(s) | Average: ${avg.toFixed(1)}%`, startX, doc.y + 4);
    doc.moveDown(1.5);
  });

  doc.end();
});

// GET /api/admin/students
router.get('/students', (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           COUNT(DISTINCT a.id) as attempts_count
    FROM users u
    LEFT JOIN attempts a ON u.id = a.user_id AND a.is_completed = 1
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY u.name
  `).all();
  res.json({ students });
});

module.exports = router;

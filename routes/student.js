const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Fisher-Yates shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Shuffle options for a question while tracking the new correct option label
function shuffleOptions(question) {
  const options = [
    { label: 'a', text: question.option_a },
    { label: 'b', text: question.option_b },
    { label: 'c', text: question.option_c },
    { label: 'd', text: question.option_d },
  ];
  const shuffled = shuffle(options);
  const newCorrect = shuffled.findIndex(o => o.label === question.correct_option);
  const correctLabels = ['a', 'b', 'c', 'd'];

  return {
    ...question,
    option_a: shuffled[0].text,
    option_b: shuffled[1].text,
    option_c: shuffled[2].text,
    option_d: shuffled[3].text,
    shuffled_correct: correctLabels[newCorrect],
    original_labels: shuffled.map(o => o.label), // mapping: new position -> original label
  };
}

// GET /api/student/tests — List active tests
router.get('/tests', (req, res) => {
  const tests = db.prepare(`
    SELECT t.id, t.title, t.description, t.time_limit_minutes, t.created_at,
           (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count,
           (SELECT id FROM attempts a WHERE a.user_id = ? AND a.test_id = t.id AND a.is_completed = 1 LIMIT 1) as completed_attempt_id,
           (SELECT id FROM attempts a WHERE a.user_id = ? AND a.test_id = t.id AND a.is_completed = 0 LIMIT 1) as in_progress_attempt_id
    FROM tests t
    WHERE t.is_active = 1
    ORDER BY t.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json({ tests });
});

// GET /api/student/tests/:id — Test details
router.get('/tests/:id', (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions WHERE test_id = ?').get(req.params.id);
  res.json({ test: { ...test, question_count: questionCount.count } });
});

// POST /api/student/tests/:id/start — Start or resume attempt
router.post('/tests/:id/start', (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  // Check for existing completed attempt
  const completed = db.prepare(
    'SELECT * FROM attempts WHERE user_id = ? AND test_id = ? AND is_completed = 1'
  ).get(req.user.id, req.params.id);
  if (completed) {
    return res.status(409).json({ error: 'You have already completed this test', attempt_id: completed.id });
  }

  // Check for in-progress attempt (resume)
  const inProgress = db.prepare(
    'SELECT * FROM attempts WHERE user_id = ? AND test_id = ? AND is_completed = 0'
  ).get(req.user.id, req.params.id);
  if (inProgress) {
    return res.json({ attempt_id: inProgress.id, resumed: true });
  }

  // Get all questions and shuffle them
  const questions = db.prepare('SELECT * FROM questions WHERE test_id = ?').all(req.params.id);
  if (questions.length === 0) {
    return res.status(400).json({ error: 'This test has no questions yet' });
  }

  const shuffledQuestions = shuffle(questions).map(q => {
    const shuffledOpts = shuffleOptions(q);
    return {
      id: q.id,
      option_a: shuffledOpts.option_a,
      option_b: shuffledOpts.option_b,
      option_c: shuffledOpts.option_c,
      option_d: shuffledOpts.option_d,
      shuffled_correct: shuffledOpts.shuffled_correct,
      original_labels: shuffledOpts.original_labels,
    };
  });

  // Store shuffled order + option mapping in attempt
  const result = db.prepare(`
    INSERT INTO attempts (user_id, test_id, total_questions, shuffled_order)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, req.params.id, questions.length, JSON.stringify(shuffledQuestions));

  // Pre-create answer slots
  const insertAnswer = db.prepare(
    'INSERT INTO attempt_answers (attempt_id, question_id) VALUES (?, ?)'
  );
  const insertMany = db.transaction((attemptId, qs) => {
    qs.forEach(q => insertAnswer.run(attemptId, q.id));
  });
  insertMany(result.lastInsertRowid, shuffledQuestions);

  res.status(201).json({ attempt_id: result.lastInsertRowid, resumed: false });
});

// GET /api/student/attempts/:id — Get attempt + questions (shuffled, no correct answers)
router.get('/attempts/:id', (req, res) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(attempt.test_id);
  const shuffledOrder = JSON.parse(attempt.shuffled_order || '[]');

  // Get saved answers
  const savedAnswers = db.prepare('SELECT question_id, selected_option FROM attempt_answers WHERE attempt_id = ?').all(req.params.id);
  const answerMap = {};
  savedAnswers.forEach(a => { answerMap[a.question_id] = a.selected_option; });

  // Build questions without revealing correct answer
  const questions = shuffledOrder.map((sq, index) => ({
    index,
    id: sq.id,
    question_text: db.prepare('SELECT question_text FROM questions WHERE id = ?').get(sq.id)?.question_text,
    option_a: sq.option_a,
    option_b: sq.option_b,
    option_c: sq.option_c,
    option_d: sq.option_d,
    selected_option: answerMap[sq.id] || null,
  }));

  res.json({
    attempt: {
      id: attempt.id,
      test_id: attempt.test_id,
      started_at: attempt.started_at,
      is_completed: attempt.is_completed,
      total_questions: attempt.total_questions,
    },
    test: { id: test.id, title: test.title, time_limit_minutes: test.time_limit_minutes },
    questions,
  });
});

// PUT /api/student/attempts/:id/answer — Save an answer
router.put('/attempts/:id/answer', (req, res) => {
  const { question_id, selected_option } = req.body;
  if (!question_id || !selected_option) {
    return res.status(400).json({ error: 'question_id and selected_option are required' });
  }
  if (!['a', 'b', 'c', 'd'].includes(selected_option)) {
    return res.status(400).json({ error: 'selected_option must be a, b, c, or d' });
  }

  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.is_completed) return res.status(409).json({ error: 'Attempt already submitted' });

  db.prepare(
    'UPDATE attempt_answers SET selected_option = ? WHERE attempt_id = ? AND question_id = ?'
  ).run(selected_option, req.params.id, question_id);

  res.json({ saved: true });
});

// POST /api/student/attempts/:id/submit — Submit attempt
router.post('/attempts/:id/submit', (req, res) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.is_completed) return res.status(409).json({ error: 'Already submitted' });

  const shuffledOrder = JSON.parse(attempt.shuffled_order || '[]');
  const answers = db.prepare('SELECT * FROM attempt_answers WHERE attempt_id = ?').all(req.params.id);

  // Compute score using shuffled correct option
  let score = 0;
  const updateAnswer = db.prepare(
    'UPDATE attempt_answers SET is_correct = ? WHERE attempt_id = ? AND question_id = ?'
  );

  const scoreTransaction = db.transaction(() => {
    shuffledOrder.forEach(sq => {
      const answer = answers.find(a => a.question_id === sq.id);
      const isCorrect = answer && answer.selected_option === sq.shuffled_correct ? 1 : 0;
      if (isCorrect) score++;
      updateAnswer.run(isCorrect, req.params.id, sq.id);
    });

    db.prepare(`
      UPDATE attempts SET is_completed = 1, submitted_at = CURRENT_TIMESTAMP, score = ?
      WHERE id = ?
    `).run(score, req.params.id);
  });

  scoreTransaction();

  res.json({ score, total_questions: attempt.total_questions, attempt_id: attempt.id });
});

// GET /api/student/attempts/:id/results — Results with feedback
router.get('/attempts/:id/results', (req, res) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (!attempt.is_completed) return res.status(400).json({ error: 'Attempt not yet submitted' });

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(attempt.test_id);
  const shuffledOrder = JSON.parse(attempt.shuffled_order || '[]');
  const answers = db.prepare('SELECT * FROM attempt_answers WHERE attempt_id = ?').all(req.params.id);
  const answerMap = {};
  answers.forEach(a => { answerMap[a.question_id] = a; });

  const questions = shuffledOrder.map((sq, index) => {
    const original = db.prepare('SELECT * FROM questions WHERE id = ?').get(sq.id);
    const ans = answerMap[sq.id];
    return {
      index: index + 1,
      question_text: original.question_text,
      option_a: sq.option_a,
      option_b: sq.option_b,
      option_c: sq.option_c,
      option_d: sq.option_d,
      correct_option: sq.shuffled_correct,
      selected_option: ans ? ans.selected_option : null,
      is_correct: ans ? ans.is_correct : 0,
    };
  });

  res.json({
    attempt: {
      id: attempt.id,
      score: attempt.score,
      total_questions: attempt.total_questions,
      percentage: Math.round((attempt.score / attempt.total_questions) * 100),
      submitted_at: attempt.submitted_at,
    },
    test: { id: test.id, title: test.title },
    questions,
  });
});

// GET /api/student/my-attempts — Student's history
router.get('/my-attempts', (req, res) => {
  const attempts = db.prepare(`
    SELECT a.id, a.score, a.total_questions, a.submitted_at, a.is_completed, a.started_at,
           t.title as test_title, t.id as test_id
    FROM attempts a
    JOIN tests t ON a.test_id = t.id
    WHERE a.user_id = ?
    ORDER BY a.started_at DESC
  `).all(req.user.id);

  const attemptsWithPct = attempts.map(a => ({
    ...a,
    percentage: a.total_questions > 0 && a.is_completed ? Math.round((a.score / a.total_questions) * 100) : null,
  }));

  res.json({ attempts: attemptsWithPct });
});

module.exports = router;

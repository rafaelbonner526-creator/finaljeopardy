import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf8"));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function groupByTopic(data) {
  const grouped = {};
  data.forEach(q => {
    if (!grouped[q.topic]) grouped[q.topic] = [];
    grouped[q.topic].push(q);
  });
  for (const topic in grouped) grouped[topic].sort((a, b) => a.value - b.value);
  return grouped;
}

app.get("/api/questions", (req, res) => res.json(groupByTopic(questions)));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evaluateAnswerFallback(studentAnswer, correctAnswer, questionId) {
  if (!studentAnswer) return { grade: "incorrect", feedback: "No answer provided." };
  const ans = studentAnswer.toLowerCase();

  if (questionId === "q2") {
    const keywords = ["bank", "shopping", "website", "social media"];
    const matches = keywords.filter(k => ans.includes(k)).length;
    if (matches >= 2)
      return { grade: "correct", feedback: "Excellent — you identified multiple real-world online risks!" };
    if (matches === 1)
      return { grade: "partially correct", feedback: "Good start — list at least two distinct risks." };
    return { grade: "incorrect", feedback: "Think about where personal or financial data might be exposed online." };
  }

  if (questionId === "q3") {
    const keywords = ["form", "google", "facebook", "mail", "email", "login", "remove"];
    const matches = keywords.filter(k => ans.includes(k)).length;
    if (matches >= 2)
      return { grade: "correct", feedback: "Excellent — you identified multiple correct privacy practices." };
    if (matches === 1)
      return { grade: "partially correct", feedback: "Good start — add one more example." };
    return { grade: "incorrect", feedback: "Consider how organizations can legitimately use and protect your data." };
  }

  if (questionId === "q4") {
    const keywords = ["buy", "donate", "recycle", "green"];
    const matches = keywords.filter(k => ans.includes(k)).length;
    if (matches >= 2)
      return { grade: "correct", feedback: "Excellent — you identified multiple ways to reduce e-waste!" };
    if (matches === 1)
      return { grade: "partially correct", feedback: "Good start — list one more environmentally friendly action." };
    return { grade: "incorrect", feedback: "Think about reuse, recycling, and responsible purchasing." };
  }

  if (ans.includes("attackers") || ans.includes("threat"))
    return { grade: "correct", feedback: "Great job! You captured the key idea." };
  if (ans.split(" ").some(w => correctAnswer.toLowerCase().includes(w)))
    return { grade: "partially correct", feedback: "You're close! Review the key definitions." };

  return { grade: "incorrect", feedback: "Not quite — review the definition before trying again." };
}

async function evaluateAnswerAI(studentAnswer, correctAnswer, questionId) {
  if (!client) return evaluateAnswerFallback(studentAnswer, correctAnswer, questionId);
  if (!studentAnswer) return { grade: "incorrect", feedback: "No answer provided." };

  const prompt = `You are an educational assistant grading a student's short answer.

Question ID: ${questionId}
Reference answer: ${correctAnswer}
Student answer: ${studentAnswer}

Your task:
1. Evaluate conceptual understanding — do NOT require an exact word-for-word match.
   Accept answers that express the same meaning or key ideas, even if phrased differently.
2. Grade the response as one of: "correct", "partially correct", or "incorrect".
3. Provide a brief, encouraging explanation (1–2 sentences) that helps the student understand why.

Respond ONLY in JSON like this:
{
  "grade": "correct" | "partially correct" | "incorrect",
  "feedback": "your feedback here"
}`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.grade || !parsed.feedback) {
      return evaluateAnswerFallback(studentAnswer, correctAnswer, questionId);
    }
    return parsed;
  } catch (err) {
    console.error("OpenAI error, using fallback:", err.message || err);
    return evaluateAnswerFallback(studentAnswer, correctAnswer, questionId);
  }
}

app.post("/api/evaluate", async (req, res) => {
  const { questionId, studentAnswer } = req.body;

  let found = null;
  for (const t of questions)
    for (const q of t.questions)
      if (q.id === questionId) found = q;

  if (!found) return res.status(404).json({ error: "Not found" });

  const result = await evaluateAnswerAI(studentAnswer, found.answerText, questionId);

  await sleep(2000); // 2-second delay before sending feedback
  res.json({ ...result, correctAnswer: found.answerText });
});

app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`AI Study Tool v5 (Flexible AI Grading + Delay) running on port ${PORT}`)
);

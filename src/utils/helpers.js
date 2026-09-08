import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateLong(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function getDaysUntil(dateStr) {
  const today = new Date();
  const target = new Date(dateStr);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diff;
}

export function getGradeColor(grade) {
  const map = { 'O': '#10b981', 'A+': '#10b981', 'A': '#f97316', 'B+': '#06b6d4', 'B': '#f59e0b', 'C+': '#f97316', 'C': '#ef4444', 'F': '#dc2626' };
  return map[grade] || '#a1a1aa';
}

export function getSeverityClass(severity) {
  const map = { 'Low': 'severity-low', 'Medium': 'severity-medium', 'High': 'severity-high' };
  return map[severity] || 'severity-low';
}

export function getStatusClass(status) {
  const map = { 'Pending': 'status-pending', 'Resolved': 'status-resolved', 'Active': 'status-active' };
  return map[status] || 'status-pending';
}

export function calculateCGPA(results) {
  if (!results || results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + r.percentage, 0);
  return (total / results.length / 10).toFixed(2);
}

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));

const getRollNo = (student = {}) => (student.rollNo || student.roll_no || '').toString().trim().toUpperCase();

const normalizeAcademicScore = (student = {}, results = []) => {
  const btechScore = Number(student.btech) || 0;
  const cgpaScore = Number(student.cgpa) > 0 ? Number(student.cgpa) * 10 : 0;
  const backlogCount = Number(student.backlogs) || 0;

  const studentRollNo = getRollNo(student);
  const studentResults = Array.isArray(results)
    ? results.filter((result) => getRollNo(result) === studentRollNo)
    : [];

  const averageExamScore = studentResults.length
    ? studentResults.reduce((sum, result) => sum + (Number(result.percentage) || 0), 0) / studentResults.length
    : 0;

  const academicBase = [btechScore, cgpaScore].filter((value) => value > 0);
  const academicAverage = academicBase.length ? academicBase.reduce((sum, value) => sum + value, 0) / academicBase.length : 0;
  const academicScore = averageExamScore > 0 ? (academicAverage * 0.6) + (averageExamScore * 0.4) : academicAverage;
  const backlogPenalty = Math.min(backlogCount, 5) * 4;

  return clampScore(academicScore - backlogPenalty);
};

const normalizeGitHubScore = (githubStats = {}) => {
  if (!githubStats) return null;

  const repos = Number(githubStats.public_repos || githubStats.publicRepos || 0);
  const followers = Number(githubStats.followers || 0);
  const following = Number(githubStats.following || 0);
  const stars = Number(githubStats.totalStars || 0);

  const repoScore = Math.min(35, repos * 3.5);
  const followerScore = Math.min(20, Math.log10(followers + 1) * 10);
  const starScore = Math.min(25, Math.log10(stars + 1) * 12);
  const activityScore = Math.min(20, Math.max(0, repos - Math.floor(following / 2)) * 2);

  return clampScore(repoScore + followerScore + starScore + activityScore);
};

const normalizeLeetCodeScore = (leetcode = {}) => {
  if (!leetcode) return null;

  const solved = Number(leetcode.lc_total_progarms || leetcode.lc_total_programs || 0);
  const easy = Number(leetcode.lc_easy || 0);
  const medium = Number(leetcode.lc_medium || 0);
  const hard = Number(leetcode.lc_hard || 0);
  const rank = Number(leetcode.lc_rank || 0);

  const solvedScore = Math.min(45, solved * 1.4);
  const difficultyScore = Math.min(35, (easy * 0.6) + (medium * 1.1) + (hard * 2.2));
  const rankScore = rank > 0 ? Math.max(0, 20 - Math.log10(rank) * 3.5) : 0;

  return clampScore(solvedScore + difficultyScore + rankScore);
};

const normalizeGfgScore = (gfg = {}) => {
  if (!gfg) return null;

  const score = Number(gfg.gfg_score || 0);
  const problems = Number(gfg.gfg_total_problems || 0);
  const streak = Number(gfg.gfg_streak || 0);

  return clampScore((score * 0.7) + Math.min(20, problems * 0.5) + Math.min(10, streak));
};

const normalizeCodeChefScore = (codechef = {}) => {
  if (!codechef) return null;

  const rating = Number(codechef.rating || 0);
  const stars = Number(codechef.star_rating || 0);
  const solved = Number(codechef.total_problems || 0);
  const contests = Number(codechef.contests || 0);
  const streak = Number(codechef.streak || 0);

  return clampScore(
    Math.min(55, rating / 20) +
    Math.min(20, stars * 12) +
    Math.min(15, solved * 0.35) +
    Math.min(5, contests * 0.5) +
    Math.min(5, streak)
  );
};

const normalizeHackerRankScore = (hackerrank = {}) => {
  if (!hackerrank) return null;

  const badges = Number(hackerrank.hr_badges || 0);
  const stars = Number(hackerrank.hr_total_stars || 0);
  const languages = Number(hackerrank.hr_c || 0) + Number(hackerrank.hr_cpp || 0) + Number(hackerrank.hr_java || 0) + Number(hackerrank.hr_python || 0);

  return clampScore(
    Math.min(35, badges * 8) +
    Math.min(25, stars * 10) +
    Math.min(40, languages * 10)
  );
};

const normalizeCodingScore = (codingProfiles = {}) => {
  const scores = [
    normalizeLeetCodeScore(codingProfiles.leetcode),
    normalizeGfgScore(codingProfiles.gfg),
    normalizeCodeChefScore(codingProfiles.codechef),
    normalizeHackerRankScore(codingProfiles.hackerrank),
  ].filter((score) => typeof score === 'number');

  if (scores.length === 0) return null;
  return clampScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
};

export function calculatePlacementIndex(student = {}, results = [], options = {}) {
  const academicScore = normalizeAcademicScore(student, results);
  const githubScore = normalizeGitHubScore(options.githubStats || student.githubStats);
  const codingScore = normalizeCodingScore(options.codingProfiles);

  const components = [
    { score: academicScore, weight: 0.25 },
    { score: githubScore, weight: 0.2 },
    { score: codingScore, weight: 0.3 },
  ].filter((component) => typeof component.score === 'number');

  const studentRollNo = getRollNo(student);
  const studentResults = Array.isArray(results)
    ? results.filter((result) => getRollNo(result) === studentRollNo)
    : [];
  const examScore = studentResults.length
    ? studentResults.reduce((sum, result) => sum + (Number(result.percentage) || 0), 0) / studentResults.length
    : null;

  if (typeof examScore === 'number') {
    components.push({ score: clampScore(examScore), weight: 0.25 });
  }

  if (components.length === 0) return 0;

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const weightedScore = components.reduce((sum, component) => sum + (component.score * component.weight), 0) / totalWeight;

  return clampScore(weightedScore);
}

export function getPercentage(marks, total) {
  return ((marks / total) * 100).toFixed(1);
}

export function truncate(str, len = 50) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function generateInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export function getAvatarColor(name) {
  const colors = ['#f97316', '#f59e0b', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];
  if (!name) return colors[0];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function exportToCSV(data, filename) {
  if (!data || data.length === 0) return;
  const keys = Object.keys(data[0]);
  const csvContent = [
    keys.join(','),
    ...data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getDifficultyColor(difficulty) {
  const map = { 'Easy': '#10b981', 'Medium': '#f59e0b', 'Hard': '#ef4444' };
  return map[difficulty] || '#a1a1aa';
}

export function getExamStatusColor(status) {
  const map = { 'upcoming': '#f97316', 'scheduled': '#06b6d4', 'completed': '#10b981', 'cancelled': '#ef4444' };
  return map[status] || '#a1a1aa';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

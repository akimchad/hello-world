// Clearly-labeled demo datasets so REMIX can be tried without real exports.

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const projects = [
  { name: 'pulse-api', description: 'Realtime metrics ingestion service with websockets and Redis streams.', language: 'TypeScript', status: 'Active', stars: 412, forks: 38, commits: 286, progress: 78, updated: day(0), topics: ['backend', 'realtime', 'redis'] },
  { name: 'lumen-ui', description: 'Accessible component library with dark-mode-first design tokens.', language: 'TypeScript', status: 'Active', stars: 1290, forks: 104, commits: 512, progress: 91, updated: day(1), topics: ['react', 'design-system'] },
  { name: 'tinyvec', description: 'SIMD-accelerated vector search in under 2k lines.', language: 'Rust', status: 'Active', stars: 873, forks: 41, commits: 198, progress: 64, updated: day(2), topics: ['search', 'simd', 'ml'] },
  { name: 'ledger-cli', description: 'Plain-text personal finance tracker for the terminal.', language: 'Go', status: 'Shipped', stars: 356, forks: 22, commits: 143, progress: 100, updated: day(9), topics: ['cli', 'finance'] },
  { name: 'notebook-gpt', description: 'Jupyter extension that explains cells and suggests refactors.', language: 'Python', status: 'Paused', stars: 204, forks: 17, commits: 88, progress: 45, updated: day(34), topics: ['ai', 'jupyter'] },
  { name: 'trailmap', description: 'Offline-first hiking route planner built with React Native.', language: 'TypeScript', status: 'Active', stars: 97, forks: 6, commits: 121, progress: 52, updated: day(3), topics: ['mobile', 'maps'] },
  { name: 'kernel-notes', description: 'Annotated walkthrough of a toy OS kernel, chapter by chapter.', language: 'C', status: 'Shipped', stars: 1840, forks: 211, commits: 77, progress: 100, updated: day(60), topics: ['os', 'learning'] },
  { name: 'shipit-bot', description: 'Slack bot that summarizes PRs and nudges stale reviews.', language: 'Python', status: 'Active', stars: 156, forks: 12, commits: 94, progress: 70, updated: day(4), topics: ['automation', 'slack'] },
  { name: 'fluxboard', description: 'Self-hosted kanban with keyboard-first navigation.', language: 'Go', status: 'Idea', stars: 8, forks: 0, commits: 12, progress: 10, updated: day(15), topics: ['productivity'] },
  { name: 'wasm-synth', description: 'Browser synthesizer compiled from Rust to WebAssembly.', language: 'Rust', status: 'Paused', stars: 341, forks: 19, commits: 66, progress: 38, updated: day(48), topics: ['audio', 'wasm'] },
  { name: 'dotfiles', description: 'My terminal, editor and window manager setup.', language: 'Shell', status: 'Active', stars: 61, forks: 9, commits: 230, progress: 95, updated: day(1), topics: ['config'] },
  { name: 'pixel-poster', description: 'Generative poster art from GitHub contribution graphs.', language: 'JavaScript', status: 'Idea', stars: 3, forks: 0, commits: 5, progress: 5, updated: day(21), topics: ['art', 'generative'] },
]

function activity() {
  const r = rng(42)
  const types = ['commit', 'commit', 'commit', 'pull_request', 'review', 'issue', 'release']
  const msgs: Record<string, string[]> = {
    commit: ['Refactor stream consumer', 'Fix flaky websocket test', 'Add dark tokens', 'Bump deps', 'Improve SIMD kernel', 'Tidy error handling', 'Add keyboard shortcuts', 'Optimize cold start'],
    pull_request: ['Merge auth middleware', 'Open PR: theming API', 'Merge offline sync'],
    review: ['Reviewed caching layer', 'Approved docs overhaul'],
    issue: ['Opened: memory leak on reconnect', 'Closed: broken dark mode toggle'],
    release: ['Released v1.4.0', 'Released v0.9.0-beta'],
  }
  const active = projects.filter((p) => p.status === 'Active')
  const out = []
  for (let i = 0; i < 48; i++) {
    const t = types[Math.floor(r() * types.length)]
    const p = active[Math.floor(r() * active.length)]
    out.push({ date: day(Math.floor(r() * r() * 30)), type: t, repo: p.name, message: msgs[t][Math.floor(r() * msgs[t].length)] })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

const tasks = [
  { task: 'Ship websocket reconnect backoff', project: 'pulse-api', priority: 'High', done: true, due: day(-1) },
  { task: 'Write migration guide for v2 tokens', project: 'lumen-ui', priority: 'Medium', done: false, due: day(-3) },
  { task: 'Benchmark HNSW vs flat index', project: 'tinyvec', priority: 'High', done: false, due: day(-2) },
  { task: 'Add CSV export', project: 'ledger-cli', priority: 'Low', done: true, due: day(5) },
  { task: 'Design onboarding screens', project: 'trailmap', priority: 'Medium', done: false, due: day(-6) },
  { task: 'Fix flaky CI on macOS', project: 'lumen-ui', priority: 'High', done: true, due: day(2) },
  { task: 'Set up release automation', project: 'shipit-bot', priority: 'Medium', done: true, due: day(7) },
  { task: 'Profile memory on large datasets', project: 'pulse-api', priority: 'High', done: false, due: day(-4) },
  { task: 'Record demo video', project: 'tinyvec', priority: 'Low', done: false, due: day(-9) },
  { task: 'Write README badges', project: 'dotfiles', priority: 'Low', done: true, due: day(12) },
  { task: 'Sketch architecture for fluxboard', project: 'fluxboard', priority: 'Medium', done: false, due: day(-14) },
  { task: 'Triage open issues', project: 'lumen-ui', priority: 'Medium', done: true, due: day(1) },
]

const learning = [
  { title: 'Rust for Systems Programmers', platform: 'Book', category: 'Systems', progress: 72 },
  { title: 'Designing Data-Intensive Applications', platform: 'Book', category: 'Architecture', progress: 55 },
  { title: 'Advanced TypeScript Patterns', platform: 'Course', category: 'Frontend', progress: 90 },
  { title: 'Build a Database from Scratch', platform: 'Tutorial', category: 'Systems', progress: 34 },
  { title: 'WebGPU Fundamentals', platform: 'Tutorial', category: 'Graphics', progress: 18 },
  { title: 'Distributed Systems Lecture Series', platform: 'Video', category: 'Architecture', progress: 61 },
]

export const githubSample = () =>
  JSON.stringify(
    {
      profile: { name: 'Alex Rivera', handle: 'alexcodes', location: 'San Francisco, CA', note: 'DEMO DATA — not a real account' },
      projects,
      activity: activity(),
      tasks,
      learning,
    },
    null,
    2,
  )

const csv = (rows: Record<string, unknown>[]) => {
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(';') : String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

export const studentSample = () =>
  csv([
    { assignment: 'Problem Set 4: Dynamic Programming', course: 'Algorithms', due: day(-2), status: 'In progress', grade: '', hours: 6, priority: 'High', done: false },
    { assignment: 'Lab 3: Cache Simulator', course: 'Computer Architecture', due: day(-5), status: 'Not started', grade: '', hours: 0, priority: 'High', done: false },
    { assignment: 'Essay: Ethics of Automation', course: 'Philosophy', due: day(3), status: 'Submitted', grade: 91, hours: 8, priority: 'Medium', done: true },
    { assignment: 'Midterm Review Sheet', course: 'Linear Algebra', due: day(-1), status: 'In progress', grade: '', hours: 3, priority: 'High', done: false },
    { assignment: 'Problem Set 3: Greedy', course: 'Algorithms', due: day(9), status: 'Graded', grade: 88, hours: 7, priority: 'Medium', done: true },
    { assignment: 'Reading Response 5', course: 'Philosophy', due: day(-8), status: 'Not started', grade: '', hours: 0, priority: 'Low', done: false },
    { assignment: 'Lab 2: Pipelining', course: 'Computer Architecture', due: day(12), status: 'Graded', grade: 94, hours: 9, priority: 'Medium', done: true },
    { assignment: 'Eigenvalues Worksheet', course: 'Linear Algebra', due: day(6), status: 'Graded', grade: 79, hours: 4, priority: 'Medium', done: true },
    { assignment: 'Group Project Proposal', course: 'Software Engineering', due: day(-4), status: 'In progress', grade: '', hours: 5, priority: 'High', done: false },
    { assignment: 'Sprint 1 Retro', course: 'Software Engineering', due: day(15), status: 'Submitted', grade: 96, hours: 2, priority: 'Low', done: true },
    { assignment: 'Final Paper Outline', course: 'Philosophy', due: day(-12), status: 'Not started', grade: '', hours: 0, priority: 'Medium', done: false },
    { assignment: 'Quiz 6 Prep', course: 'Linear Algebra', due: day(-3), status: 'In progress', grade: '', hours: 2, priority: 'Medium', done: false },
  ])

export const creatorSample = () =>
  csv([
    { title: 'I built an app in 60 minutes', platform: 'YouTube', status: 'Published', publish_date: day(3), views: 48200, likes: 3900, comments: 412, category: 'Tutorial' },
    { title: 'Desk setup 2026', platform: 'Instagram', status: 'Published', publish_date: day(6), views: 21800, likes: 2600, comments: 188, category: 'Lifestyle' },
    { title: 'Why I quit Notion', platform: 'YouTube', status: 'Published', publish_date: day(11), views: 91500, likes: 6100, comments: 1290, category: 'Opinion' },
    { title: '3 AI tools I use daily', platform: 'TikTok', status: 'Published', publish_date: day(1), views: 132000, likes: 15400, comments: 640, category: 'Tutorial' },
    { title: 'Behind the scenes: editing', platform: 'Instagram', status: 'Scheduled', publish_date: day(-2), views: 0, likes: 0, comments: 0, category: 'Behind the scenes' },
    { title: 'Coding live: building REMIX', platform: 'YouTube', status: 'Scheduled', publish_date: day(-5), views: 0, likes: 0, comments: 0, category: 'Livestream' },
    { title: 'Morning routine as a dev', platform: 'TikTok', status: 'Drafting', publish_date: day(-8), views: 0, likes: 0, comments: 0, category: 'Lifestyle' },
    { title: 'React vs Svelte in 2026', platform: 'YouTube', status: 'Idea', publish_date: day(-14), views: 0, likes: 0, comments: 0, category: 'Opinion' },
    { title: 'Mini vlog: SF hackathon', platform: 'TikTok', status: 'Published', publish_date: day(17), views: 56700, likes: 7200, comments: 302, category: 'Vlog' },
    { title: 'Thread: lessons from 100k subs', platform: 'X', status: 'Published', publish_date: day(8), views: 38400, likes: 2100, comments: 156, category: 'Opinion' },
    { title: 'Carousel: 5 design tips', platform: 'Instagram', status: 'Idea', publish_date: day(-18), views: 0, likes: 0, comments: 0, category: 'Tutorial' },
    { title: 'Q&A stream', platform: 'YouTube', status: 'Published', publish_date: day(24), views: 17300, likes: 1100, comments: 870, category: 'Livestream' },
  ])

export const SAMPLES = [
  {
    key: 'github',
    label: 'GitHub developer profile',
    fileName: 'github-profile.json',
    blurb: 'Projects, activity, tasks, learning',
    make: githubSample,
    prompt:
      'Create a personal developer command center. Show my projects, programming languages, recent activity, and development progress. Organize everything into a clean dashboard.',
    appName: 'Developer Command Center',
  },
  {
    key: 'student',
    label: 'Student coursework',
    fileName: 'assignments.csv',
    blurb: 'Assignments, deadlines, grades',
    make: studentSample,
    prompt: 'Build me a study planner that tracks my assignments, upcoming deadlines, grades by course, and how much I still have to do.',
    appName: 'Study Planner',
  },
  {
    key: 'creator',
    label: 'Content creator calendar',
    fileName: 'posts.csv',
    blurb: 'Posts, platforms, performance',
    make: creatorSample,
    prompt: 'Make a creator studio showing my content pipeline, publishing schedule, views by platform, and my best performing posts.',
    appName: 'Creator Studio',
  },
] as const

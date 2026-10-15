// Ayush Basu: résumé source. Render: typst compile resume.typ
// ATS rules: one column, real text, contact in the body, standard headings, one date format.

// Shared fields (name, title, contact) live in ONE place, read by the site too.
#let r = json("/src/content/resume.json")
#set document(title: r.name + " - Résumé", author: r.name)
#set page(paper: "us-letter", margin: (x: 0.55in, y: 0.45in))
#set text(font: "Libertinus Serif", size: 10.5pt, lang: "en")
#set par(justify: false, leading: 0.5em, spacing: 0.5em)
#set list(indent: 0.6em, body-indent: 0.5em, spacing: 0.42em, marker: [•])
#show link: it => underline(offset: 2pt, stroke: 0.4pt, it)

#let section(title) = {
  v(0.6em)
  block(width: 100%, stroke: (bottom: 0.6pt), inset: (bottom: 2.5pt),
    text(size: 11.5pt, weight: "semibold", upper(title)))
  v(0.1em)
}

// One line: left (bold title | italic detail), right-aligned dates.
#let entry(title, detail, ..rest) = {
  let dates = rest.pos().at(0, default: [])
  v(0.15em)
  grid(
    columns: (1fr, auto),
    [*#title* | _#detail _],
    dates,
  )
  v(-0.1em)
}

#let role(title, team, dates) = {
  v(0.1em)
  grid(columns: (1fr, auto), [*#title*#if team != none [ | _#team _]], dates)
  v(-0.15em)
}

#align(center)[
  #text(size: 20pt, weight: "bold")[#r.name]
  #v(0.1em)
  #text(size: 11.5pt)[#r.title]
  #v(0.1em)
  #link("mailto:" + r.email)[#r.email] •
  #link(r.linkedin)[#r.linkedin.replace("https://www.", "")] •
  #link(r.github)[#r.github.replace("https://", "")]
]

#section[Work Experience]

#text(size: 11pt, weight: "bold")[SAP]

#role[Machine Learning Engineering Specialist][Application AI][Aug 2026 – Present]
- Building the team's first automated eval pipeline: a Docker image and GitHub Actions build, with Kubernetes jobs running scheduled Langfuse LLM-as-judge evals against a 28-query golden dataset
- Traced a production retrieval agent in Langfuse with two engineers, identifying context bloat that caused redundant retrieval calls and missing search-mode routing that sent 60–70% of queries down the slow path
- Partnering with the lead engineer on the agent's architecture rework: splitting an overloaded planning node into focused nodes, adding an explicit stop decision, and validating plans before retrieval

#role[Software Developer, SAP Academy Rotational Program][Experience Generation][Jan 2026 – Aug 2026]
- Designed and built the reasoning interface for a multi-agent research feature end to end: a typed server-to-UI event contract that simplified front-end parsing, and a subagent view with live reasoning streaming that made multi-agent research legible to users. Well received by internal customers ahead of the external production launch
- Co-designed the multi-agent research architecture: separate research and writing phases, a shared virtual file system as memory across sub-researchers, and bounded rounds and timeouts to cap cost
- Designed and led Plan Mode, a human-in-the-loop step where agents pause for users to review and approve their plan before executing: wrote the technical spec and guided interns through implementation
- Integrated Langfuse observability into LangGraph multi-agent pipelines with full hierarchical tracing, and connected user feedback scores to trace events to close the loop from user signal to model evaluation
- Researched and prototyped a Python sandbox for AI-generated code under enterprise platform constraints, with a phased plan from thread-based isolation to a subprocess worker pool

#role[Software Developer, SAP Academy Rotational Program][SuccessFactors Mobile][Jul 2025 – Jan 2026]
- Prototyped an on-device ML model for automated manager approvals, using request context and historical behavior to cut a 5-minute manual workflow to under 1 minute

#role([Software Engineering Intern (Part-time)], none, [Jun 2023 – Jun 2025])
- Sole developer of a customer-facing 3-way merge editor with intelligent auto-merge, speeding customer upgrades to newer SAP versions and reducing upgrade-related support debt; multi-year project still releasing

#section[Projects]

#entry[#link("https://github.com/ayushb3/BubblyChef")[BubblyChef]][Next.js, FastAPI, LangGraph, Supabase, Gemini API][Mar 2026 – Present]
- Built and deployed a solo, open-source AI kitchen app: receipt scanning, recipe import from social media, a pantry-aware chat assistant that returns full meal cards, expiry-aware recipe generation, and guided cooking; \~690 tests
- Designed a playful, cohesive UI with its own identity: a kitchen home scene that fills with decorations as users earn in-app currency by cooking and scanning, with an expressive mascot guide throughout
- Built an autonomous agent loop that develops the app itself, from issue to reviewed PR: 20 merged PRs across 21 runs, with its adversarial multi-agent review catching real bugs in 7 of 9 reviewed runs

#section[Leadership]
- Taught an agentic development session ("Vibe Coding 101", May 2026) to \~20 engineers: a plan, implement and validate loop, context management, multi-agent orchestration, and when to use skills, hooks and MCP
- Co-lead, SAP Academy Social Committee: run technical lunch-and-learns for professional development, and social events that connect junior developers across cohorts in the Bay Area

#section[Education]
#entry[University of Illinois Urbana-Champaign][Bachelor of Science in Computer Science | GPA: 3.96/4.0][Aug 2021 – May 2025]

#section[Technical Skills]
- *Languages:* Python, TypeScript/JavaScript, Go, Java, C/C++, SQL
- *Agentic & evals:* LangGraph, LangChain, Langfuse, LLM-as-judge, Claude Code
- *Frameworks:* FastAPI, Next.js, React, NumPy, pandas
- *Infra & tools:* Git, Docker, Kubernetes, GitHub Actions, PostgreSQL, Supabase, CI/CD

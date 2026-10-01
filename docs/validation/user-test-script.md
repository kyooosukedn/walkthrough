# User test script - 15-minute observed session

One facilitator, one newcomer, screen share + audio. The newcomer works; the facilitator watches and timestamps. **Do not teach during phase A.** Do not help until the newcomer asks or the timer ends; note every ask instead.

## Setup (before the participant joins - ~10 min)

1. Clone the session's repo at the SHA pinned in its path doc. Run install + the prerequisites listed under its deterministic success check.
2. Open two terminals in the clone. Verify the check command runs (baseline pass) - a broken environment invalidates the session.
3. Facilitator view: `metrics-template.csv` open, timer ready, path doc open but **not shared**.

## Phase A - current workflow, unaided (5 min)

> Script: "Here's a TypeScript repository and an issue from its tracker: [paste issue link]. You have 5 minutes to get as far as you can toward making this change, using whatever you'd normally use - search, docs, AI tools, anything. Think out loud. I won't help; I'm just observing how you approach it."

Start timer at go. Record:

- **T0.1** Locates the relevant file(s) (first meaningful navigation, not landing on README)
- **T0.2** States a correct plan for the change (out loud)
- **T0.3** First useful edit (a real diff toward the fix - not a comment or whitespace)
- Tools used (repo search / global grep / AI assistant / other) - tick all
- Confidence at minute 5: 1-5, asked aloud

At 5:00, stop. If they finished early, note the time and let the edit stand.

## Phase B - the path (7 min)

> Script: "Now here's a guided path for the same issue. Walk it top to bottom. Same rules: think out loud, no help from me unless you're blocked for more than a minute."

Share the path doc. Record:

- **T1.1** Reaches the bug site / decision point in the path
- **T1.2** First useful edit under the path (diff toward the fix or the exercise test written)
- **T1.3** Runs the deterministic check and interprets the result correctly
- Steps actually used (which of the 5-8), steps skipped, steps that read as wrong or stale
- Confusion points - quote them verbatim; this is the highest-value data in the session
- Exercise outcome: failed-to-reproduce / reproduced-but-stuck / completed / completed-and-extended

## Phase C - wrap (3 min)

Ask aloud, in this order, noting exact words for 3-4:

1. "With the path in hand from the start, could you have finished the issue on your own?"
2. "What was missing from it?"
3. "Would you use one of these again on another repo - yes or no?" (repeat-use metric; count only an unprompted yes)
4. "Would you have found this contribution without it?"

Then: point them at the real issue and the PR conventions (post-session, on their own time). Thank them. Stop recording.

## Facilitator rules

- Never edit the newcomer's code. Never name a file they're looking for in phase A.
- If the environment breaks, fix it silently and note it in `env_issues` - do not count that time in T-metrics.
- One session = one row in the metrics sheet. Fill it the same hour.

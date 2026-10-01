# Metrics sheet - sprint 1

One row per session in `metrics-template.csv`, filled by the facilitator the same hour (see `user-test-script.md` for definitions). Store only what's listed here - minimum data, no accounts, no personal identifiers beyond a participant-chosen label.

## Per-session fields

| Field | Type | Notes |
| --- | --- | --- |
| `session_id` | S01... | sequential |
| `date` | ISO | |
| `repo` | vueuse / storybook / medusa | |
| `participant_label` | text | self-chosen alias |
| `oss_experience` | none / 1-2 PRs / 3+ PRs | asked at recruitment |
| `t01_locate_unaided` | seconds or empty | phase A: found relevant file |
| `t02_plan_unaided` | seconds or empty | phase A: stated correct plan |
| `t03_first_edit_unaided` | seconds or empty | phase A: first useful edit |
| `t11_locate_path` | seconds | phase B: reached bug site via path |
| `t12_first_edit_path` | seconds | phase B: first useful edit |
| `t13_check_run` | seconds or empty | phase B: ran check, read result correctly |
| `exercise_outcome` | reproduced / stuck / completed / extended | |
| `steps_used` | e.g. 1,3-7 | of the path's 5-8 |
| `stale_links` | count | links that didn't match reality |
| `confusion_quotes` | verbatim quotes | highest-value data |
| `tools_phase_a` | grep / search / AI / none | |
| `would_use_again` | yes / no | **unprompted yes only** |
| `env_issues` | text | anything that broke |
| `notes` | text | |

## Aggregate view (compute weekly)

- **Completion rate**: sessions with `exercise_outcome` in {completed, completed-and-extended} / total
- **Delta**: median `t12_first_edit_path` vs median `t03_first_edit_unaided`
- **Staleness rate**: `stale_links` total / links shipped (watch after week 1)
- **Repeat-intent**: count of unprompted `would_use_again = yes`
- **Maintainer interest**: maintainers asked vs maintainers who want a path linked in their repo

## Decision gate (end of week 2)

Proceed to the conditional build only if **all three** hold:

1. At least 5 of at least 10 observed newcomers complete the micro-task using the path
2. At least 2 maintainers want to link or maintain a path for their repo
3. At least 3 newcomers voluntarily ask for another path / would use one again unprompted

These thresholds are provisional, chosen to challenge the idea - not market-size claims. On any miss: record the failure mode, revisit the direction shortlist in `PROJECT_DIRECTION_PLAN.md`; do not lower the bar to pass.

# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multiline bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments with `jq` and fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with the appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`. The `gh` CLI does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if the repo treats external pull requests as feature requests. The `/triage` skill reads this flag.

When set to `yes`, pull requests use the same labels and states as issues:

- **Read a pull request**: Run `gh pr view <number> --comments` and `gh pr diff <number>`.
- **List external pull requests for triage**: Run `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`. Keep only pull requests whose `authorAssociation` is `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.
- **Comment, label, or close**: Use `gh pr comment`, `gh pr edit --add-label`, `gh pr edit --remove-label`, or `gh pr close`.

GitHub shares one number space across issues and pull requests. For a bare reference such as `#42`, run `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The `/wayfinder` skill uses one issue as a map and links child issues as tickets.

- **Map**: Create one issue with the `wayfinder:map` label. Its body holds Notes, Decisions-so-far, and Fog.
- **Child ticket**: Link the issue to the map with GitHub's sub-issues API. If sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Apply one `wayfinder:<type>` label: `research`, `prototype`, `grilling`, or `task`. Assign the ticket to the driving developer once claimed.
- **Blocking**: Use GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Fetch the blocker's numeric database ID with `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. If dependencies are unavailable, add `Blocked by: #<n>, #<n>` at the top of the child body.
- **Frontier query**: List the map's open children. Drop issues with an open blocker or an assignee. The first remaining issue in map order wins.
- **Claim**: Run `gh issue edit <n> --add-assignee @me`. This is the session's first write.
- **Resolve**: Comment with the answer, close the issue, then add a short context pointer and link to the map's Decisions-so-far section.

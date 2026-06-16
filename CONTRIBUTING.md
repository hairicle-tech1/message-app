# Team Workflow

This project uses a simple branch-per-person workflow. `main` always
contains the final, working code — nobody pushes directly to `main`.

## Rules

1. **`main` is protected.** Only the project lead can merge into `main`,
   and only via a reviewed Pull Request (PR).
2. **Each team member works on their own branch.** Use your name as the
   branch name (e.g. `sethi`, `leang`, `Theng`).
3. **Push only to your own branch.** Never push to `main` or to a
   teammate's branch.
4. **Open a PR when your work is ready.** The lead reviews and merges it
   into `main`.

## One-time setup

```bash
# Clone the repo (first time only)
git clone https://github.com/hairicle-tech1/message-app.git
cd message-app

# Switch to your personal branch
git checkout <your-branch-name>
```

If your branch doesn't exist yet, ask the lead to create it, or create it
yourself from the latest `main`:

```bash
git checkout main
git pull
git checkout -b <your-branch-name>
git push -u origin <your-branch-name>
```

## Daily workflow

1. **Start of the day — get the latest `main` into your branch:**

   ```bash
   git checkout main
   git pull
   git checkout <your-branch-name>
   git merge main
   ```

2. **Do your work**, then commit as usual:

   ```bash
   git add <files>
   git commit -m "Describe what you changed"
   ```

3. **Before pushing, pull the latest `main` into your branch** so you're
   working on top of the newest code and conflicts are caught early:

   ```bash
   git checkout main
   git pull
   git checkout <your-branch-name>
   git merge main
   ```

4. **Push to your own branch only:**

   ```bash
   git push
   ```

   (First push from a new branch: `git push -u origin <your-branch-name>`)

## When your feature is ready

1. Pull the latest `main` into your branch (step 3 above) one more time,
   resolve any conflicts, and push.
2. Open a Pull Request on GitHub: `<your-branch-name>` → `main`.
3. The lead reviews the PR, requests changes if needed, and merges it
   into `main`.
4. After it's merged, update your branch with the latest `main`
   (step 1 of "Daily workflow") before starting new work.

## Quick reference

| Action | Command |
|---|---|
| Switch to your branch | `git checkout <your-branch-name>` |
| Get latest `main` | `git checkout main && git pull` |
| Bring `main` updates into your branch | `git checkout <your-branch-name> && git merge main` |
| Save your work | `git add <files> && git commit -m "..."` |
| Push your work | `git push` |
| Open a PR | On GitHub, click "Compare & pull request" for your branch |

## Notes

- Never use `git push --force` on a shared branch.
- Never run `git push origin main` — PRs are the only way into `main`.
- If you get a merge conflict while merging `main` into your branch, resolve
  it locally, test that the app still runs, then commit and push.

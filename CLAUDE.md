@AGENTS.md

## Claude Code notes

- Run the test runner with the Bash tool (Git Bash): `bash deploy/ci/remote-test.sh <label> backend|frontend|all`. It uploads your uncommitted working tree, so there is no need to commit before testing.
- Do not start preview or dev servers, and do not use `npm`, `pip` or `python` locally. The only runtime is the Ubuntu server.
- Write files with LF line endings.

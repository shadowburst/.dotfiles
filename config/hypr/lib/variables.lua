local M = {}

M.mod = "SUPER"
M.terminal = os.getenv("TERMINAL") or "kitty"
M.browser = os.getenv("BROWSER") or "brave"

return M

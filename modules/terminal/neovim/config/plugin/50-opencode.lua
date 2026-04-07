vim.pack.add({
  "https://github.com/NickvanDyke/opencode.nvim",
})

---@module "opencode"
---@type opencode.Opts
vim.g.opencode_opts = {
  events = {
    permissions = { enabled = false },
  },
}

Snacks.keymap.set(
  "n",
  "go",
  function() return require("opencode").operator("@this ") end,
  { expr = true, desc = "Add range to opencode" }
)
Snacks.keymap.set(
  "n",
  "goo",
  function() return require("opencode").operator("@this ") .. "_" end,
  { expr = true, desc = "Add line to opencode" }
)

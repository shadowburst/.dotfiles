vim.pack.add({
  "https://github.com/nickjvandyke/opencode.nvim",
})

---@module "opencode"
---@type opencode.Opts
vim.g.opencode_opts = {
  events = {
    permissions = { enabled = false },
  },
}

Snacks.keymap.set("n", "<leader>a", function()
  Snacks.input({
    prompt = "Ask OpenCode",
    win = { relative = "cursor", row = -3, col = 0 },
  }, function(input)
    if input and input ~= "" then
      require("opencode").prompt("@this - " .. input .. "\n ")
    end
  end)
end, { desc = "Ask OpenCode about line" })

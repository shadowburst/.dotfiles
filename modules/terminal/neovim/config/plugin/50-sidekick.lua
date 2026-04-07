vim.pack.add({
  "https://github.com/folke/sidekick.nvim",
})

require("sidekick").setup({
  nes = {
    enabled = function() return vim.g.sidekick_nes ~= false and vim.b.sidekick_nes ~= false and vim.fn.mode() ~= "s" end,
    diff = { show = "cursor" },
  },
})

Snacks.keymap.set("n", "<tab>", function()
  if not require("sidekick").nes_jump_or_apply() then
    return "<cmd>Sidekick nes update<cr><tab>"
  end
end, { expr = true, desc = "Next edit suggestion" })

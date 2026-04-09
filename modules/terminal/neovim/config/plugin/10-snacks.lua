vim.pack.add({
  "https://github.com/folke/snacks.nvim",
})

local header = [[
                                                                   
      ████ ██████           █████      ██                    
     ███████████             █████                            
     █████████ ███████████████████ ███   ███████████  
    █████████  ███    █████████████ █████ ██████████████  
   █████████ ██████████ █████████ █████ █████ ████ █████  
 ███████████ ███    ███ █████████ █████ █████ ████ █████ 
██████  █████████████████████ ████ █████ █████ ████ ██████]]

---@type snacks.picker.Config
local picker_config = {
  hidden = true,
  ignored = true,
  exclude = {
    "storage/**",
    "node_modules/**",
    "vendor/**",
  },
  filter = { cwd = true },
}

require("snacks").setup({
  bigfile = {},
  dashboard = {
    preset = {
      keys = {
        { icon = " ", key = "q", desc = "Quit", action = ":q" },
      },
      header = header,
    },
    sections = {
      { section = "header" },
      { section = "recent_files", cwd = true, limit = 9, gap = 1, padding = 1 },
      { section = "keys", padding = 1 },
    },
  },
  debug = {},
  gitbrowse = {},
  image = {
    doc = { inline = false },
  },
  indent = {
    indent = { char = " " },
    chunk = {
      enabled = true,
      char = {
        corner_top = "╭",
        corner_bottom = "╰",
        arrow = "─",
      },
    },
  },
  input = {},
  notifier = {
    top_down = false,
    width = { max = 0.25 },
  },
  picker = {
    sources = {
      buffers = vim.tbl_extend("force", picker_config, {
        current = false,
        unloaded = false,
      }),
      files = picker_config,
      grep = picker_config,
      recent = picker_config,
    },
    layout = { preset = "default" },
    layouts = {
      default = {
        layout = {
          fullscreen = true,
          border = vim.g.border,
          box = "vertical",
          { win = "preview" },
          {
            win = "input",
            height = 1,
            title = "{source} {live}",
            title_pos = "center",
            border = "top",
          },
          {
            win = "list",
            border = "top",
            height = 0.4,
          },
        },
      },
    },
    win = {
      input = {
        keys = {
          ["<C-u>"] = { "preview_scroll_up", mode = { "i", "n" } },
          ["<C-d>"] = { "preview_scroll_down", mode = { "i", "n" } },
        },
      },
      list = {
        keys = {
          ["<C-u>"] = { "preview_scroll_up", mode = { "i", "n" } },
          ["<C-d>"] = { "preview_scroll_down", mode = { "i", "n" } },
        },
      },
    },
    previewers = {
      diff = { style = "terminal" },
    },
  },
  quickfile = {},
  scope = {
    cursor = false,
    treesitter = { enabled = false },
    linewise = true,
  },
  statuscolumn = {},
  styles = {
    zen = {
      width = 0.8,
      backdrop = {
        transparent = false,
        win = {
          wo = { winhighlight = "NormalFloat:Normal" },
        },
      },
    },
  },
  terminal = {},
  words = {},
  zen = {
    toggles = { dim = false },
    show = { statusline = true },
  },
})

_G.dd = function(...) Snacks.debug.inspect(...) end
_G.bt = function() Snacks.debug.backtrace() end

Snacks.util.on_key("<esc>", function()
  vim.cmd("noh")
  if vim.snippet then
    vim.snippet.stop()
  end
end)

Snacks.toggle.option("spell", { name = "spelling" }):map("<leader>ts")
Snacks.toggle.option("wrap", { name = "wrap" }):map("<leader>tw")
Snacks.toggle.diagnostics({ name = "diagnostics" }):map("<leader>td")
Snacks.toggle.profiler():map("<leader>tp")
Snacks.toggle.zen():map("<leader>z")

Snacks.keymap.set("n", "<leader>bc", function() Snacks.bufdelete() end, { desc = "Delete buffer" })
Snacks.keymap.set("n", "<leader>bo", function()
  Snacks.bufdelete({ filter = function(buf) return #vim.fn.win_findbuf(buf) == 0 end })
end, { desc = "Close other buffers" })

Snacks.keymap.set("n", "<leader>go", function() Snacks.gitbrowse() end, { desc = "Open repo" })

Snacks.keymap.set(
  "n",
  "<leader>db",
  function()
    Snacks.terminal.toggle({ "sqlit", "--theme", "textual-ansi" }, {
      win = {
        width = 0,
        height = 0,
      },
    })
  end,
  { desc = "Toggle sqlit" }
)
Snacks.keymap.set(
  "n",
  "<leader>dd",
  function()
    Snacks.terminal.toggle({ "lazydocker" }, {
      win = {
        width = 0,
        height = 0,
      },
    })
  end,
  { desc = "Toggle lazydocker" }
)
Snacks.keymap.set("n", "<leader>tt", function() Snacks.terminal.toggle() end, { desc = "Toggle terminal" })

Snacks.keymap.set("n", "[[", function() Snacks.words.jump(-vim.v.count1) end, { desc = "Prev reference" })
Snacks.keymap.set("n", "]]", function() Snacks.words.jump(vim.v.count1) end, { desc = "Next reference" })

Snacks.keymap.set("n", "<leader><leader>", function() Snacks.picker.smart() end, { desc = "Smart find" })
Snacks.keymap.set("n", "<leader>,", function() Snacks.picker.buffers() end, { desc = "Buffers" })
Snacks.keymap.set("n", "<leader>:", function() Snacks.picker.command_history() end, { desc = "Command history" })
Snacks.keymap.set("n", "<leader>.", function() Snacks.picker.resume() end, { desc = "Resume" })
Snacks.keymap.set("n", "<leader>ff", function() Snacks.picker.files() end, { desc = "Find files" })
Snacks.keymap.set("n", "<leader>fg", function() Snacks.picker.grep() end, { desc = "Grep files" })
Snacks.keymap.set("n", "<leader>fr", function() Snacks.picker.recent() end, { desc = "Recent files" })
Snacks.keymap.set("n", "<leader>gc", function() Snacks.picker.git_log() end, { desc = "Commit history" })
Snacks.keymap.set("n", "<leader>gl", function() Snacks.picker.git_log_line() end, { desc = "Line history" })
Snacks.keymap.set("n", "<leader>gs", function() Snacks.picker.git_status() end, { desc = "Git status" })
Snacks.keymap.set("n", "<leader>nn", function() Snacks.picker.notifications() end, { desc = "All notifications" })
Snacks.keymap.set("n", "<leader>sb", function() Snacks.picker.lines() end, { desc = "Buffer lines" })
Snacks.keymap.set("n", "<leader>sc", function() Snacks.picker.commands() end, { desc = "Commands" })
Snacks.keymap.set("n", "<leader>sd", function() Snacks.picker.diagnostics() end, { desc = "Diagnostics" })
Snacks.keymap.set("n", "<leader>sh", function() Snacks.picker.help() end, { desc = "Help pages" })
Snacks.keymap.set("n", "<leader>sH", function() Snacks.picker.highlights() end, { desc = "Highlights" })
Snacks.keymap.set("n", "<leader>sk", function() Snacks.picker.keymaps() end, { desc = "Keymaps" })
Snacks.keymap.set("n", "<leader>sm", function() Snacks.picker.man() end, { desc = "Man Pages" })
Snacks.keymap.set(
  { "n", "x" },
  "<leader>sw",
  function() Snacks.picker.grep_word({ dirs = { vim.fn.expand("%") } }) end,
  { desc = "Visual selection or word" }
)
Snacks.keymap.set(
  { "n", "x" },
  "<leader>sW",
  function() Snacks.picker.grep_word() end,
  { desc = "Visual selection or word in cwd" }
)
Snacks.keymap.set(
  "n",
  "gd",
  function() Snacks.picker.lsp_definitions() end,
  { desc = "LSP definitions", lsp = { method = "textDocument/definition" } }
)
Snacks.keymap.set(
  "n",
  "grr",
  function() Snacks.picker.lsp_references() end,
  { desc = "LSP references", lsp = { method = "textDocument/references" } }
)
Snacks.keymap.set(
  "n",
  "<leader>ss",
  function() Snacks.picker.lsp_symbols() end,
  { desc = "LSP symbols", lsp = { method = "textDocument/documentSymbol" } }
)

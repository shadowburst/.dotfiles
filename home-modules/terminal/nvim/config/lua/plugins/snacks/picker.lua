---@type snacks.picker.Config
local source_config = {
  hidden = true,
  ignored = true,
  exclude = {
    "storage/**",
    "node_modules/**",
    "vendor/**",
  },
  filter = { cwd = true },
}

local config = require("config")

return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      picker = {
        sources = {
          buffers = vim.tbl_extend("force", source_config, {
            current = false,
            unloaded = false,
          }),
          files = source_config,
          grep = source_config,
          recent = source_config,
        },
        layout = { preset = "default" },
        layouts = {
          default = {
            layout = {
              fullscreen = true,
              border = config.border,
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
        previewers = {
          git = { native = true },
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
      },
    },
    keys = {
      {
        "<leader><leader>",
        function() Snacks.picker.smart() end,
        desc = "Smart find",
      },
      {
        "<leader>,",
        function()
          Snacks.picker.smart({
            title = "Buffers",
            finder = "buffers",
            format = "buffer",
            multi = false,
            current = false,
            win = {
              input = {
                keys = {
                  ["<c-x>"] = {
                    "bufdelete",
                    mode = { "n", "i" },
                  },
                },
              },
              list = { keys = { ["dd"] = "bufdelete" } },
            },
          })
        end,
        desc = "Buffers",
      },
      {
        "<leader>:",
        function() Snacks.picker.command_history() end,
        desc = "Command history",
      },
      {
        "<leader>.",
        function() Snacks.picker.resume() end,
        desc = "Resume",
      },
      -- find
      {
        "<leader>ff",
        function() Snacks.picker.files() end,
        desc = "Find files",
      },
      {
        "<leader>fg",
        function() Snacks.picker.grep() end,
        desc = "Grep",
      },
      {
        "<leader>fr",
        function() Snacks.picker.recent() end,
        desc = "Recent",
      },
      -- git
      {
        "<leader>gc",
        function() Snacks.picker.git_log_file() end,
        desc = "Commit history",
      },
      {
        "<leader>gl",
        function() Snacks.picker.git_log_line() end,
        desc = "Line history",
      },
      {
        "<leader>gs",
        function() Snacks.picker.git_status() end,
        desc = "Git status",
      },
      -- notifications
      {
        "<leader>nn",
        function() Snacks.picker.notifications() end,
        desc = "All notifications",
      },
      -- Search
      {
        "<leader>sb",
        function() Snacks.picker.lines() end,
        desc = "Buffer lines",
      },
      {
        "<leader>sc",
        function() Snacks.picker.commands() end,
        desc = "Commands",
      },
      {
        "<leader>sd",
        function() Snacks.picker.diagnostics() end,
        desc = "Diagnostics",
      },
      {
        "<leader>sh",
        function() Snacks.picker.help() end,
        desc = "Help pages",
      },
      {
        "<leader>sH",
        function() Snacks.picker.highlights() end,
        desc = "Highlights",
      },
      {
        "<leader>sk",
        function() Snacks.picker.keymaps() end,
        desc = "Keymaps",
      },
      {
        "<leader>sm",
        function() Snacks.picker.man() end,
        desc = "Man Pages",
      },
      {
        "<leader>sw",
        function() Snacks.picker.grep_word({ dirs = { vim.fn.expand("%") } }) end,
        desc = "Visual selection or word",
        mode = { "n", "x" },
      },
      {
        "<leader>sW",
        function() Snacks.picker.grep_word() end,
        desc = "Visual selection or word in cwd",
        mode = { "n", "x" },
      },
      -- LSP
      {
        "gd",
        function() Snacks.picker.lsp_definitions() end,
        desc = "Goto Definition",
      },
      {
        "gr",
        function() Snacks.picker.lsp_references() end,
        nowait = true,
        desc = "References",
      },
      {
        "<leader>ss",
        function() Snacks.picker.lsp_symbols() end,
        desc = "LSP Symbols",
      },
    },
  },
}

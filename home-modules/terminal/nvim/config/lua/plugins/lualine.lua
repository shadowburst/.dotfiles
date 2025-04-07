return {
  {
    "nvim-lualine/lualine.nvim",
    dependencies = {
      "catppuccin/nvim",
      "cbochs/grapple.nvim",
      "echasnovski/mini.icons",
    },
    event = { "VeryLazy" },
    opts = function()
      local lualine_require = require("lualine_require")
      lualine_require.require = require
      local lualine_mode = require("lualine.utils.mode")

      ---@type CtpColors<string>
      local palette = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour)

      local theme = require("lualine.themes.catppuccin-macchiato")

      theme.normal.c.bg = palette.base

      local conditions = {
        buffer_not_empty = function() return vim.fn.empty(vim.fn.expand("%:t")) ~= 1 end,
        hide_in_width = function() return vim.fn.winwidth(0) > 80 end,
        check_git_workspace = function()
          local filepath = vim.fn.expand("%:p:h")
          local gitdir = vim.fn.finddir(".git", filepath .. ";")
          return gitdir and #gitdir > 0 and #gitdir < #filepath
        end,
        recording_macro = function() return vim.fn.reg_recording() ~= "" end,
      }

      local mode_color = {
        ["NORMAL"] = palette.blue,
        ["O-PENDING"] = palette.yellow,
        ["INSERT"] = palette.teal,
        ["VISUAL"] = palette.mauve,
        ["V-LINE"] = palette.mauve,
        ["V-BLOCK"] = palette.mauve,
        ["SELECT"] = palette.pink,
        ["S-LINE"] = palette.pink,
        ["S-BLOCK"] = palette.pink,
        ["REPLACE"] = palette.sapphire,
        ["V-REPLACE"] = palette.sapphire,
        ["EX"] = palette.red,
        ["MORE"] = palette.red,
        ["COMMAND"] = palette.lavender,
        ["SHELL"] = palette.lavender,
        ["CONFIRM"] = palette.lavender,
        ["TERMINAL"] = palette.red,
      }

      return {
        options = {
          theme = theme,
          component_separators = "",
          section_separators = "",
          globalstatus = true,
          disabled_filetypes = {
            statusline = { "snacks_dashboard", "lazy" },
          },
        },
        sections = {
          lualine_a = {},
          lualine_b = {},
          lualine_c = {
            { "location" },
            {
              "mode",
              fmt = function(mode)
                local icon = ""
                if mode == "NORMAL" then
                  return icon .. " "
                else
                  return icon .. " " .. mode
                end
              end,
              padding = 1,
              color = function() return { fg = mode_color[lualine_mode.get_mode()], gui = "bold" } end,
            },
            {
              function()
                local grapple = require("grapple")
                return grapple.app().settings.statusline.icon .. grapple.name_or_index()
              end,
              cond = function() return package.loaded["grapple"] and require("grapple").exists() end,
              padding = { left = 1, right = 0 },
              color = { fg = palette.blue },
            },
            {
              "filename",
              cond = conditions.buffer_not_empty,
              padding = 1,
              symbols = {
                modified = "",
                readonly = "",
              },
              color = function()
                return vim.bo.modified and { fg = palette.red, gui = "bold" } or { fg = palette.text, gui = "bold" }
              end,
            },
            {
              "diagnostics",
              padding = 1,
              sources = { "nvim_diagnostic" },
              symbols = { error = " ", warn = " ", info = " " },
              diagnostics_color = {
                color_error = { fg = palette.red },
                color_warn = { fg = palette.yellow },
                color_info = { fg = palette.sky },
              },
            },
            {
              function() return "%=" end,
            },
            {
              "macro-recording",
              fmt = function() return "Recording @" .. vim.fn.reg_recording() end,
              cond = conditions.recording_macro,
              padding = 1,
              color = { fg = palette.maroon, gui = "bold" },
            },
          },
          lualine_x = {
            {
              "diff",
              cond = conditions.hide_in_width,
              padding = 1,
              symbols = { added = " ", modified = " ", removed = " " },
            },
            {
              "branch",
              cond = conditions.check_git_workspace,
              padding = 1,
              icon = "",
              color = { fg = palette.mauve, gui = "bold" },
            },
          },
          lualine_y = {},
          lualine_z = {},
        },
        inactive_sections = {
          lualine_a = {},
          lualine_b = {},
          lualine_c = {},
          lualine_x = {},
          lualine_y = {},
          lualine_z = {},
        },
      }
    end,
  },
}

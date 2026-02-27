return {
  {
    "nvim-lualine/lualine.nvim",
    dependencies = {
      "catppuccin/nvim",
      "nvim-mini/mini.icons",
    },
    event = { "VeryLazy" },
    opts = function(_, opts)
      local auto = require("lualine.themes.auto")

      local colors = require("catppuccin.palettes").get_palette("mocha")

      local function separator(separator_opts)
        return vim.tbl_deep_extend("force", {
          function() return "│" end,
          color = { fg = colors.surface0, bg = "NONE", gui = "bold" },
          padding = { left = 0, right = 0 },
        }, separator_opts or {})
      end

      local modes = { "normal", "insert", "visual", "replace", "command", "inactive", "terminal" }
      for _, mode in ipairs(modes) do
        if auto[mode] and auto[mode].c then
          auto[mode].c.bg = "NONE"
        end
      end

      opts.options = vim.tbl_deep_extend("force", opts.options or {}, {
        theme = auto,
        component_separators = "",
        section_separators = "",
        globalstatus = true,
        disabled_filetypes = { statusline = { "snacks_dashboard" } },
      })

      opts.sections = {
        lualine_a = {
          {
            "mode",
            fmt = function(str) return str:sub(1, 1) end,
            padding = { left = 1, right = 1 },
          },
        },
        lualine_b = {
          {
            "filetype",
            icon_only = true,
            colored = false,
            color = { fg = colors.blue, bg = "none" },
            padding = { left = 1, right = 0 },
          },
          {
            "filename",
            file_status = true,
            path = 4,
            shorting_target = 20,
            symbols = {
              modified = "[]",
              readonly = "[]",
              unnamed = "[?]",
              newfile = "[!]",
            },
            color = function()
              return vim.bo.modified and { fg = colors.mauve, bg = "none", gui = "bold" }
                or { fg = colors.lavender, bg = "none" }
            end,
            padding = { left = 1, right = 1 },
          },
        },
        lualine_c = {
          {
            "diagnostics",
            sources = { "nvim_diagnostic" },
            sections = { "error", "warn", "info", "hint" },
            diagnostics_color = {
              error = function()
                local count = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.ERROR })
                return { fg = (count == 0) and colors.green or colors.red, bg = "none", gui = "bold" }
              end,
              warn = function()
                local count = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.WARN })
                return { fg = (count == 0) and colors.green or colors.yellow, bg = "none", gui = "bold" }
              end,
              info = function()
                local count = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.INFO })
                return { fg = (count == 0) and colors.green or colors.blue, bg = "none", gui = "bold" }
              end,
              hint = function()
                local count = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.HINT })
                return { fg = (count == 0) and colors.green or colors.teal, bg = "none", gui = "bold" }
              end,
            },
            symbols = {
              error = "󰅚 ",
              warn = "󰀪 ",
              info = "󰋽 ",
              hint = "󰌶 ",
            },
            colored = true,
            update_in_insert = false,
            always_visible = false,
            padding = { left = 1, right = 1 },
          },
        },
        lualine_x = {
          {
            "macro-recording",
            fmt = function() return "󰻃 " .. vim.fn.reg_recording() end,
            cond = function() return vim.fn.reg_recording() ~= "" end,
            padding = 1,
            color = { fg = colors.maroon, gui = "bold" },
          },
          separator({
            cond = function() return vim.fn.reg_recording() ~= "" end,
          }),
        },
        lualine_y = {
          {
            function()
              local bufnr_list = vim.fn.getbufinfo({ buflisted = 1 })
              local total = #bufnr_list
              local current_bufnr = vim.api.nvim_get_current_buf()
              local current_index = 0

              for i, buf in ipairs(bufnr_list) do
                if buf.bufnr == current_bufnr then
                  current_index = i
                  break
                end
              end

              return string.format(" %d/%d", current_index, total)
            end,
            color = { fg = colors.yellow, bg = "none" },
            padding = { left = 1, right = 1 },
          },
        },
        lualine_z = {
          separator(),
          {
            "location",
            color = { fg = colors.red, bg = "none" },
            padding = { left = 1, right = 1 },
          },
        },
      }

      return opts
    end,
  },
}

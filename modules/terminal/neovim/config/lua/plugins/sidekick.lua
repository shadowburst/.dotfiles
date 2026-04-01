return {
  {
    "folke/sidekick.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'sidekick'
    ---@class sidekick.Config
    opts = {
      nes = {
        enabled = function()
          return vim.g.sidekick_nes ~= false and vim.b.sidekick_nes ~= false and vim.fn.mode() ~= "s"
        end,
        diff = { show = "cursor" },
      },
    },
    keys = {
      {
        "<tab>",
        function()
          if not require("sidekick").nes_jump_or_apply() then
            return "<cmd>Sidekick nes update<cr><tab>"
          end
        end,
        expr = true,
        desc = "Next edit suggestion",
      },
    },
  },
  {
    "folke/sidekick.nvim", -- TODO: remove when upstream is fixed
    opts = function(_, opts)
      local Config = require("sidekick.config")
      local Nes = require("sidekick.nes")

      opts = opts or {}

      if Nes._sync_safe_update_patched then
        return opts
      end

      Nes._sync_safe_update_patched = true
      Nes._request_generation = {}

      do
        local handler = Nes._handler

        Nes._handler = function(err, res, ctx)
          if not ctx or not ctx.client_id then
            return
          end

          local generation = ctx._sidekick_generation
          if generation and Nes._request_generation[ctx.client_id] ~= generation then
            return
          end

          if ctx.request_id then
            Nes._requests[ctx.client_id] = ctx.request_id
          end

          return handler(err, res, ctx)
        end
      end

      Nes.update = function()
        local buf = vim.api.nvim_get_current_buf()
        Nes.clear()

        local enabled = Nes.enabled and Config.nes.enabled or false
        if not (vim.api.nvim_buf_is_valid(buf) and vim.api.nvim_buf_is_loaded(buf)) then
          return
        end
        if type(enabled) == "function" then
          enabled = enabled(buf) or false
        else
          enabled = enabled ~= false
        end
        if not enabled then
          return
        end

        local client = Config.get_client(buf)
        if not client then
          return
        end

        local params = vim.lsp.util.make_position_params(0, client.offset_encoding)
        params.textDocument.version = vim.lsp.util.buf_versions[buf]
        params.context = { triggerKind = 2 }

        local generation = (Nes._request_generation[client.id] or 0) + 1
        local pending
        local ok
        local request_id
        Nes._request_generation[client.id] = generation

        ok, request_id = client:request("textDocument/copilotInlineEdit", params, function(err, res, ctx)
          ctx = ctx or { client_id = client.id }
          ctx.client_id = ctx.client_id or client.id
          ctx.request_id = ctx.request_id or request_id
          ctx._sidekick_generation = generation

          if not request_id then
            pending = { err, res, ctx }
            return
          end

          Nes._handler(err, res, ctx)
        end)
        if ok and request_id then
          Nes._requests[client.id] = request_id

          if pending then
            pending[3].request_id = pending[3].request_id or request_id
            vim.schedule(function() Nes._handler(pending[1], pending[2], pending[3]) end)
          end
        end
      end

      return opts
    end,
  },
}

return {
  {
    "nvim-mini/mini.visits",
    event = { "BufEnter" },
    opts = {
      store = { autowrite = true },
    },
    keys = {
      {
        "<s-h>",
        function()
          local visits = require("mini.visits")
          visits.iterate_paths("forward", nil, { sort = visits.gen_sort.default({ recency_weight = 1 }) })
        end,
        desc = "Go to previous file",
      },
      {
        "<s-l>",
        function()
          local visits = require("mini.visits")
          visits.iterate_paths("backward", nil, { sort = visits.gen_sort.default({ recency_weight = 1 }) })
        end,
        desc = "Go to next file",
      },
    },
  },
}

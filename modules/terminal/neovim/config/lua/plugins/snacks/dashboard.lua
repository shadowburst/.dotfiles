return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      dashboard = {
        preset = {
          keys = {
            { icon = " ", key = "q", desc = "Quit", action = ":q" },
          },
          header = [[
                                                                   
      ████ ██████           █████      ██                    
     ███████████             █████                            
     █████████ ███████████████████ ███   ███████████  
    █████████  ███    █████████████ █████ ██████████████  
   █████████ ██████████ █████████ █████ █████ ████ █████  
 ███████████ ███    ███ █████████ █████ █████ ████ █████ 
██████  █████████████████████ ████ █████ █████ ████ ██████]],
        },
        sections = {
          { section = "header" },
          { section = "recent_files", cwd = true, limit = 9, gap = 1, padding = 1 },
          { section = "keys", padding = 1 },
          { section = "startup" },
        },
      },
    },
  },
}

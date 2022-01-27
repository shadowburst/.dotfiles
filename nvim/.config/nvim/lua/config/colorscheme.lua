vim.cmd [[
try
  colorscheme dracula
  au ColorScheme * hi Normal ctermbg=none guibg=none
  au ColorScheme * hi SignColumn ctermbg=none guibg=none
  au ColorScheme * hi NormalNC ctermbg=none guibg=none
  au ColorScheme * hi MsgArea ctermbg=none guibg=none
  au ColorScheme * hi TelescopeBorder ctermbg=none guibg=none
  au ColorScheme * hi NvimTreeNormal ctermbg=none guibg=none
  let &fcs='eob: '
catch /^Vim\%((\a\+)\)\=:E185/
  colorscheme default
  set background=dark
endtry
]]

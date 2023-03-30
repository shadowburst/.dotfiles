local options = {
	-- shell = "fish",
	backup = false,
	clipboard = "unnamedplus",
	cmdheight = 1,
	completeopt = { "menuone", "noselect" },
	conceallevel = 0,
	encoding = "utf-8",
	fileencoding = "utf-8",
	hlsearch = true,
	ignorecase = true,
	mouse = "a",
	pumheight = 10,
	showmode = false,
	showtabline = 2,
	smartcase = true,
	smartindent = true,
	splitbelow = true,
	splitright = true,
	swapfile = false,
	termguicolors = true,
	timeout = true,
	timeoutlen = 500,
	undofile = true,
	updatetime = 100,
	writebackup = false,
	expandtab = true,
	shiftwidth = 4,
	tabstop = 4,
	cursorline = true,
	cursorcolumn = false,
	number = true,
	relativenumber = true,
	numberwidth = 2,
	signcolumn = "yes",
	wrap = true,
	scrolloff = 8,
	sidescrolloff = 8,
	-- guifont = "JetBrainsMono Nerd Font Mono:h10",
	foldmethod = "expr",
	foldexpr = "nvim_treesitter#foldexpr()",
	foldlevel = 99,
	spelllang = "en,fr",
}

vim.opt.shortmess:append("c")

for k, v in pairs(options) do
	vim.opt[k] = v
end

vim.cmd([[set whichwrap+=<,>,[,],h,l]])
vim.cmd([[set iskeyword+=-]])
vim.cmd([[set formatoptions-=cro]])
vim.cmd([[autocmd BufEnter *.md setlocal nospell]])

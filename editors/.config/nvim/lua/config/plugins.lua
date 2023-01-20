local fn = vim.fn

-- Automatically install packer
local install_path = fn.stdpath("data") .. "/site/pack/packer/start/packer.nvim"
if fn.empty(fn.glob(install_path)) > 0 then
	PACKER_BOOTSTRAP = fn.system({
		"git",
		"clone",
		"--depth",
		"1",
		"https://github.com/wbthomason/packer.nvim",
		install_path,
	})
	print("Installing packer close and reopen Neovim...")
	vim.cmd([[packadd packer.nvim]])
end

-- Autocommand that reloads neovim whenever you save the plugins.lua file
vim.cmd([[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerSync
  augroup end
]])

-- Use a protected call so we don't error out on first use
local status_ok, packer = pcall(require, "packer")
if not status_ok then
	return
end

-- Have packer use a popup window
packer.init({
	display = {
		open_fn = function()
			return require("packer.util").float({ border = "rounded" })
		end,
	},
})

-- Install your plugins here
packer.startup(function(use)
	-- Global plugins
	use("wbthomason/packer.nvim") -- Have packer manage itself
	use("nvim-lua/popup.nvim") -- An implementation of the Popup API from vim in Neovim
	use("nvim-lua/plenary.nvim") -- Useful lua functions used ny lots of plugins

	-- UI
	use("folke/which-key.nvim")
	use("akinsho/toggleterm.nvim")
	use("nvim-telescope/telescope.nvim")
	use("ahmedkhalf/project.nvim")
	use("kyazdani42/nvim-tree.lua")
	use("akinsho/bufferline.nvim")
	use("kyazdani42/nvim-web-devicons")
	use("goolord/alpha-nvim")
	use("nvim-lualine/lualine.nvim")
	use({
		"nvim-treesitter/nvim-treesitter",
		run = ":TSUpdate",
	})
	use("JoosepAlviste/nvim-ts-context-commentstring")
	use("norcalli/nvim-colorizer.lua")
	use("karb94/neoscroll.nvim")
	use("lewis6991/gitsigns.nvim")
	use({ "NTBBloodbath/doom-one.nvim",
		setup = function()
			vim.g.doom_one_cursor_coloring = false
			-- Set :terminal colors
			vim.g.doom_one_terminal_colors = true
			-- Enable italic comments
			vim.g.doom_one_italic_comments = false
			-- Enable TS support
			vim.g.doom_one_enable_treesitter = true
			-- Color whole diagnostic text or only underline
			vim.g.doom_one_diagnostics_text_color = false
			-- Enable transparent background
			vim.g.doom_one_transparent_background = true

			-- Pumblend transparency
			vim.g.doom_one_pumblend_enable = false
			vim.g.doom_one_pumblend_transparency = 20

			-- Plugins integration
			vim.g.doom_one_plugin_neorg = true
			vim.g.doom_one_plugin_barbar = false
			vim.g.doom_one_plugin_telescope = false
			vim.g.doom_one_plugin_neogit = true
			vim.g.doom_one_plugin_nvim_tree = true
			vim.g.doom_one_plugin_dashboard = true
			vim.g.doom_one_plugin_startify = true
			vim.g.doom_one_plugin_whichkey = true
			vim.g.doom_one_plugin_indent_blankline = true
			vim.g.doom_one_plugin_vim_illuminate = true
			vim.g.doom_one_plugin_lspsaga = false
		end,
		config = function()
			vim.cmd("colorscheme doom-one")
		end,
	})

	-- Input
	use("lambdalisue/suda.vim") -- Save file with sudo
	use("ggandor/lightspeed.nvim")
	use("antoinemadec/FixCursorHold.nvim") -- This is needed to fix lsp doc highlight
	use("windwp/nvim-autopairs")
	use("windwp/nvim-ts-autotag")
	use("tpope/vim-surround")
	use("lukas-reineke/indent-blankline.nvim")
	use("numToStr/Comment.nvim") -- Easily comment stuff

	-- LSP
	use("neovim/nvim-lspconfig")
	use("williamboman/mason.nvim")
	use("williamboman/mason-lspconfig.nvim")
	use("jay-babu/mason-null-ls.nvim")
	use("jose-elias-alvarez/null-ls.nvim")
	use("mfussenegger/nvim-dap")
	use("jayp0521/mason-nvim-dap.nvim")

	use("tamago324/nlsp-settings.nvim") -- language server settings defined in json for

	-- cmp plugins
	use("hrsh7th/nvim-cmp") -- The completion plugin
	use("hrsh7th/cmp-buffer") -- buffer completions
	use("hrsh7th/cmp-path") -- path completions
	use("hrsh7th/cmp-cmdline") -- cmdline completions
	use("saadparwaiz1/cmp_luasnip") -- snippet completions
	use("hrsh7th/cmp-nvim-lsp")
	use("hrsh7th/cmp-nvim-lua")

	-- snippets
	use("L3MON4D3/LuaSnip") --snippet engine
	use("rafamadriz/friendly-snippets") -- a bunch of snippets to use

	-- other
	use("kazhala/close-buffers.nvim")
	use("lewis6991/impatient.nvim")
	use("kalvinpearce/gitignore-gen.nvim")

	-- Automatically set up your configuration after cloning packer.nvim
	-- Put this at the end after all plugins
	if PACKER_BOOTSTRAP then
		require("packer").sync()
	end
end)

require("config.plugins-settings.cmp")
require("config.plugins-settings.telescope")
require("config.plugins-settings.treesitter")
require("config.plugins-settings.autopairs")
require("config.plugins-settings.comment")
require("config.plugins-settings.gitsigns")
require("config.plugins-settings.nvim-tree")
require("config.plugins-settings.bufferline")
require("config.plugins-settings.lualine")
require("config.plugins-settings.toggleterm")
require("config.plugins-settings.project")
require("config.plugins-settings.impatient")
require("config.plugins-settings.indentline")
require("config.plugins-settings.alpha")
require("config.plugins-settings.whichkey")
require("config.plugins-settings.autocommands")
require("config.plugins-settings.neoscroll")
require("config.plugins-settings.lightspeed")
require("config.plugins-settings.colorizer")

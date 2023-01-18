local dap_status_ok, dap = pcall(require, "dap")
if not dap_status_ok then
	return
end

require("mason-nvim-dap").setup({
	automatic_installation = true,
	automatic_setup = true,

	ensure_installed = {
		"chrome",
		"php",
	},
})

require("mason-nvim-dap").setup_handlers({
	function(source_name)
		require("mason-nvim-dap.automatic_setup")(source_name)
	end,
})

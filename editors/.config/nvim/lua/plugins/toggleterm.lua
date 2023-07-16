local function next_id()
	local all = require("toggleterm.terminal").get_all(true)
	for index, term in pairs(all) do
		if index ~= term.id then
			return index
		end
	end
	return #all + 1
end

return {
	{
		"akinsho/toggleterm.nvim",
		event = "VeryLazy",
		keys = {
			{
				"²",
				function()
					local terminals = require("toggleterm.terminal")

					if terminals.get(1) then
						require("toggleterm").toggle_all()
					else
						terminals.Terminal:new({ direction = "tab" }):toggle()
					end
				end,
				desc = "Open terminal tab",
			},
			{
				"²",
				function()
					local terminals = require("toggleterm.terminal")

					for _, terminal in pairs(terminals.get_all()) do
						terminal:close()
					end
				end,
				desc = "Close terminal",
				mode = "t",
			},
			{
				"<C-w>s",
				function()
					require("toggleterm").toggle(next_id(), nil, nil, "vertical")
				end,
				desc = "Split terminal horizontally",
				mode = "t",
			},
			{
				"<C-w>v",
				function()
					require("toggleterm").toggle(next_id(), nil, nil, "horizontal")
				end,
				desc = "Split terminal vertically",
				mode = "t",
			},
			{
				"<C-h>",
				[[<C-\><C-n><C-W>h]],
				desc = "Go to left window",
				mode = "t",
			},
			{
				"<C-j>",
				[[<C-\><C-n><C-W>j]],
				desc = "Go to lower window",
				mode = "t",
			},
			{
				"<C-k>",
				[[<C-\><C-n><C-W>k]],
				desc = "Go to upper window",
				mode = "t",
			},
			{
				"<C-l>",
				[[<C-\><C-n><C-W>l]],
				desc = "Go to right window",
				mode = "t",
			},
		},
		opts = {
			open_mapping = [[<C-\>]],
			hide_numbers = true,
			shade_filetypes = {},
			shade_terminals = false,
			shading_factor = 2,
			start_in_insert = true,
			insert_mappings = true,
			persist_size = true,
			persist_mode = false,
			direction = "tab",
			close_on_exit = true,
			shell = vim.o.shell,
		},
	},
}

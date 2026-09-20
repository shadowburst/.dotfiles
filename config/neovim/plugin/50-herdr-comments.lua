local comments = require("herdr-comments")

Snacks.keymap.set("n", "<leader>ac", comments.comment_line, { desc = "Comment line for agent" })
Snacks.keymap.set("x", "<leader>ac", comments.comment_selection, { desc = "Comment selection for agent" })
Snacks.keymap.set("n", "<leader>al", comments.pick_comments, { desc = "List agent comments" })
Snacks.keymap.set("n", "<leader>as", comments.append, { desc = "Append comments to agent" })
Snacks.keymap.set("n", "<leader>aS", comments.submit, { desc = "Submit comments to agent" })
Snacks.keymap.set("n", "<leader>ax", comments.clear_file, { desc = "Clear file comments" })
Snacks.keymap.set("n", "<leader>aX", comments.clear_repo, { desc = "Clear repo comments" })

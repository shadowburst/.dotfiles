local helpers = {}

helpers.colorize_text = function(text, color)
	return '<span color="' .. color .. '">' .. text .. '</span>'
end

return helpers

local helpers = {}

helpers.colorize_text = function(text, color)
	return '<span color="' .. color .. '">' .. text .. '</span>'
end

helpers.count = function(text, pattern)
	return select(2, text:gsub(pattern, pattern))
end


return helpers

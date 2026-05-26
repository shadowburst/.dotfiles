local M = {}

local function read_hostname()
  local file = io.open("/etc/hostname", "r")
  if not file then
    return os.getenv("HOSTNAME") or ""
  end

  local hostname = file:read("*l") or ""
  file:close()
  return hostname
end

local function module_exists(name)
  if package.searchpath then
    return package.searchpath(name, package.path) ~= nil
  end

  local module_path = name:gsub("%.", "/"):gsub("%%", "%%%%")
  for template in package.path:gmatch("[^;]+") do
    local path = template:gsub("%?", module_path)
    local file = io.open(path, "r")
    if file then
      file:close()
      return true
    end
  end

  return false
end

M.hostname = read_hostname()

function M.is_host(name) return M.hostname == name end

function M.load()
  if M.hostname == "" then
    return false
  end

  local module = "host." .. M.hostname
  if not module_exists(module) then
    return false
  end

  require(module)
  return true
end

M.loaded = M.load()

return M

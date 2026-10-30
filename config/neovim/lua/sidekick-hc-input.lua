local Util = require("sidekick.util")

local M = {}
local MAX_FRAME = 16 * 1024 * 1024

local function u32(n)
  return string.char(n % 256, math.floor(n / 256) % 256, math.floor(n / 65536) % 256, math.floor(n / 16777216))
end

local function number(s, at)
  local a, b, c, d = s:byte(at, at + 3)
  return a + b * 256 + c * 65536 + d * 16777216
end

local function frame(channel, kind, data) return u32(channel) .. string.char(kind) .. u32(#data) .. data end

local function rpc(id, method, params)
  return vim.json.encode({ jsonrpc = "2.0", id = id, method = method, params = params })
end

--- `hc send` submits. Only a framed attach stream accepts bytes without Enter.
--- A zero size leaves the app's terminal size unchanged.
function M.send(address, text, focus)
  if #text > MAX_FRAME then
    Util.error("hc input exceeds the 16 MiB frame limit")
    return false
  end

  local process, channel, failure
  local buffer, framed, done = "", false, false
  local function fail(message)
    failure = message
    process:write(nil)
  end
  local function consume()
    if not framed then
      local nl = buffer:find("\n", 1, true)
      if not nl then
        return
      end
      local hello = vim.json.decode(buffer:sub(1, nl - 1))
      buffer = buffer:sub(nl + 1)
      if
        hello.id ~= 1
        or hello.error
        or not (hello.result and hello.result.generation == 1 and hello.result.framed == true)
      then
        fail("hc refused the framed handshake: " .. vim.inspect(hello))
        return
      end
      framed = true
      process:write(frame(0, 0, rpc(2, "terminal.attach", { terminal = address, cols = 0, rows = 0 })))
    end
    while #buffer >= 9 and not failure and not done do
      local ch, kind, size = number(buffer, 1), buffer:byte(5), number(buffer, 6)
      assert(size <= MAX_FRAME, "hc returned an oversized frame")
      if #buffer < 9 + size then
        return
      end
      local payload = buffer:sub(10, 9 + size)
      buffer = buffer:sub(10 + size)
      if ch == 0 and kind == 0 then
        local reply = vim.json.decode(payload)
        if reply.id == 2 then
          if reply.error then
            fail("hc attach failed: " .. vim.inspect(reply.error))
            return
          end
          channel = reply.result and reply.result.channel
          assert(
            type(channel) == "number" and channel > 0 and channel < 2 ^ 32 and channel % 1 == 0,
            "invalid hc channel"
          )
          local function input()
            if not failure and not done then
              process:write(frame(channel, 0, text) .. frame(channel, 2, ""))
            end
          end
          if focus then
            process:write(frame(channel, 4, "\1"))
            vim.defer_fn(input, 50)
          else
            input()
          end
        end
      elseif ch ~= 0 and kind == 0 then
        process:write(frame(ch, 1, u32(size))) -- discard paint without exhausting stream credit
      elseif ch == channel and kind == 2 then
        if payload ~= "" then
          fail("hc closed the terminal before input completed: " .. payload)
          return
        end
        done = true -- core processed the DATA frames; the program may not have read them yet
        process:write(nil)
      end
    end
  end

  local ok, result = pcall(function()
    process = vim.system({ "hc", "connect" }, {
      stdin = true,
      stdout = function(err, data)
        if failure or done then
          return
        end
        if err then
          fail(err)
        elseif data then
          buffer = buffer .. data
          local parsed, message = pcall(consume)
          if not parsed then
            fail(tostring(message))
          end
        end
      end,
    })
    process:write(rpc(1, "hello", { generation = 1, framed = true }) .. "\n")
    -- SystemObj:wait() does not run scheduled timers such as the focus delay.
    if not vim.wait(5000, function() return done or failure ~= nil end, 10) then
      failure = "timed out; input may have arrived, inspect the terminal before retrying"
    end
    if failure then
      process:kill(15)
    end
    return process:wait(1000)
  end)
  if not ok or failure or not done or result.code ~= 0 then
    if process and not ok then
      process:kill(15)
    end
    Util.error(
      "hc input failed: " .. (failure or (ok and result.stderr ~= "" and result.stderr) or vim.inspect(result))
    )
    return false
  end
  return true
end

return M

hl.config({
  animations = { enabled = true },
})

hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "default", style = "slide" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 2, bezier = "default", style = "slide" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 3, bezier = "default" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 3, bezier = "default", style = "gnomed" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 1, bezier = "default", style = "gnomed" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 3, bezier = "default", style = "slidefadevert" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "default" })
hl.animation({ leaf = "fadeDim", enabled = true, speed = 4, bezier = "default" })
hl.animation({ leaf = "border", enabled = true, speed = 4, bezier = "default" })

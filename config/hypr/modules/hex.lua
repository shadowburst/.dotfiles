hl.bind("F8", hl.dsp.exec_cmd("hex dictation start"))
hl.bind("F8", hl.dsp.exec_cmd("hex dictation stop"), { release = true, ignore_mods = true, non_consuming = true })

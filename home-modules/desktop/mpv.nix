{pkgs, ...}: {
  programs.mpv = {
    enable = true;
    bindings = {
      a = "cycle audio";
      h = "seek -5 exact";
      l = "seek +5 exact";
      j = "seek -60 exact";
      k = "seek +60 exact";
      H = "playlist-prev";
      L = "playlist-next";
      f = "cycle fullscreen";
      m = "cycle mute";
      p = "cycle pause";
      q = "quit";
      i = "show-text \"\${filename}\"";
      S = "add sub-delay -0.1";
      s = "add sub-delay +0.1";
      RIGHT = "seek +5 exact";
      LEFT = "seek -5 exact";
      DOWN = "seek -60 exact";
      UP = "seek +60 exact";
      ESC = "set fullscreen no";
      SPACE = "cycle pause";
      BS = "set speed 1.0";
      "." = "frame-step";
      "+" = "add audio-delay 0.100";
      "-" = "add audio-delay -0.100";
      "[" = "multiply speed 0.9";
      "]" = "multiply speed 1.1";
      "{" = "multiply speed 0.5";
      "}" = "multiply speed 2.0";
    };
    defaultProfiles = ["gpu-hq"];
    config = {
      fs = true;
      osc = false;
      scale = "ewa_lanczossharp";
      cscale = "ewa_lanczossharp";
      tscale = "oversample";
      interpolation = "";
      video-sync = "display-resample";
      hwdec = "vaapi";
      vo = "gpu";
      gpu-context = "wayland";
      no-window-dragging = "";
      no-osd-bar = "";
    };
    scripts = with pkgs.mpvScripts; [
      mpris
      thumbfast
      modernx
    ];
  };
}

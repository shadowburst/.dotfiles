_: {
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      piNpmPrefix = "${config.xdg.dataHome}/pi/npm";
      piNpmCache = "${config.xdg.cacheHome}/pi/npm";
      nodejsLts = pkgs.nodejs;

      browserTools = pkgs.buildNpmPackage {
        pname = "pi-browser-tools";
        version = "1.0.0";
        src = ../config/pi/extensions/browser;
        npmDepsHash = "sha256-lzux0pks+POBqQknAlMCy/Agh6Rpee5QLqoti2oyGTg=";
        dontNpmBuild = true;
        doCheck = true;
        checkPhase = ''
          runHook preCheck
          node --test state.test.ts index.integration.test.ts
          runHook postCheck
        '';
        installPhase = ''
          runHook preInstall
          mkdir -p $out
          cp -r index.ts state.ts package.json package-lock.json node_modules $out/
          runHook postInstall
        '';
      };

      piWithNpmExtensions = pkgs.symlinkJoin {
        name = "pi-coding-agent-with-npm-extensions";
        paths = [ pkgs.pi-coding-agent ];
        nativeBuildInputs = [ pkgs.makeWrapper ];

        postBuild = ''
          wrapProgram $out/bin/pi \
            --set NPM_CONFIG_PREFIX ${lib.escapeShellArg piNpmPrefix} \
            --set NPM_CONFIG_CACHE ${lib.escapeShellArg piNpmCache} \
            --set PLAYWRIGHT_BROWSERS_PATH ${pkgs.playwright-driver.browsers} \
            --prefix PATH : ${lib.escapeShellArg "${lib.makeBinPath [ nodejsLts pkgs.cutaway pkgs.ffmpeg ]}:${piNpmPrefix}/bin"}
        '';
      };

      mkPiConfigSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      programs.pi-coding-agent = {
        enable = true;
        package = piWithNpmExtensions;
        context = ''
          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.
        '';
        keybindings = {
          "tui.select.up" = [
            "up"
            "ctrl+p"
          ];
          "tui.select.down" = [
            "down"
            "ctrl+n"
          ];
          "app.model.cycleForward" = [ ];
        };
      };

      home.file = {
        ".pi/agent/themes" = mkPiConfigSymlink "config/pi/themes";
        ".pi/agent/settings.json" = mkPiConfigSymlink "config/pi/settings.json";
        ".pi/agent/skills/subagents" = mkPiConfigSymlink "config/pi/skills/subagents";
        ".pi/agent/tasks-config.json" = mkPiConfigSymlink "config/pi/tasks-config.json";
        ".pi/agent/extensions/prompt" = mkPiConfigSymlink "config/pi/extensions/prompt";
        ".pi/agent/extensions/auto-title.ts" = mkPiConfigSymlink "config/pi/extensions/auto-title.ts";
        ".pi/agent/extensions/footer" = mkPiConfigSymlink "config/pi/extensions/footer";
        ".pi/agent/extensions/question" = mkPiConfigSymlink "config/pi/extensions/question";
        ".pi/agent/extensions/subagents" = mkPiConfigSymlink "config/pi/extensions/subagents";
        ".pi/agent/extensions/tasks".source = pkgs.pi-tasks;
        ".pi/agent/extensions/usage" = mkPiConfigSymlink "config/pi/extensions/usage";
        ".pi/agent/extensions/pi-web-access".source = pkgs.pi-web-access;
        ".pi/agent/extensions/browser".source = browserTools;
        ".pi/agent/extensions/ponytail".source = pkgs.ponytail;
      };
    };
}

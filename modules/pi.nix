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

      webTools = pkgs.buildNpmPackage {
        pname = "pi-web-tools";
        version = "0.1.0";
        src = ../config/pi/extensions/web-tools;
        npmDepsHash = "sha256-9LeHrOjnUY8Y5G8P/eMi5euNMfzLd1Rb9PyqWNGduRc=";
        dontNpmBuild = true;
        installPhase = ''
          runHook preInstall
          mkdir -p $out
          cp *.ts package.json package-lock.json $out/
          cp -r node_modules $out/
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
            --prefix PATH : ${lib.escapeShellArg "${lib.makeBinPath [ nodejsLts ]}:${piNpmPrefix}/bin"}
        '';
      };

      mkPiConfigSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      home.packages = [ piWithNpmExtensions ];

      home.file = {
        ".pi/agent/APPEND_SYSTEM.md" = mkPiConfigSymlink "config/pi/APPEND_SYSTEM.md";
        ".pi/agent/themes" = mkPiConfigSymlink "config/pi/themes";
        ".pi/agent/settings.json" = mkPiConfigSymlink "config/pi/settings.json";
        ".pi/agent/keybindings.json" = mkPiConfigSymlink "config/pi/keybindings.json";
        ".pi/agent/extensions/git-commands.ts" = mkPiConfigSymlink "config/pi/extensions/git-commands.ts";
        ".pi/agent/extensions/pi-kitty.ts" = mkPiConfigSymlink "config/pi/extensions/pi-kitty.ts";
        ".pi/agent/extensions/web-tools".source = webTools;
      };
    };
}

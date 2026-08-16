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

      buildPiPackage =
        {
          owner,
          repo,
          version,
          hash,
          npmDepsHash,
        }:
        pkgs.buildNpmPackage {
          pname = repo;
          inherit version npmDepsHash;
          forceEmptyCache = true;
          src = pkgs.fetchFromGitHub {
            inherit owner repo hash;
            tag = "v${version}";
          };
          postPatch = ''
            ${pkgs.nodejs}/bin/npm pkg delete devDependencies
            ${pkgs.nodejs}/bin/npm install --package-lock-only --ignore-scripts --legacy-peer-deps
          '';
          npmInstallFlags = [
            "--omit=dev"
            "--legacy-peer-deps"
          ];
          dontNpmBuild = true;
          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r ./* $out/
            runHook postInstall
          '';
        };

      webAccess = buildPiPackage {
        owner = "nicobailon";
        repo = "pi-web-access";
        version = "0.21.0";
        hash = "sha256-4KdCTOEPXo0rI6pl72ko9nhC8mXSOmza7BY1+4cjdjs=";
        npmDepsHash = "sha256-YpHJ/HUt/XARhX8yYjtWrRFhGcYtAzhCSUL67AiXjH8=";
      };

      mcpAdapter = buildPiPackage {
        owner = "nicobailon";
        repo = "pi-mcp-adapter";
        version = "2.21.1";
        hash = "sha256-voO8gCDjGtXoSiEQM/D4lL4JXrz5be3HZ5ol7KYVCzI=";
        npmDepsHash = "sha256-WGcZrFz/g17NdyhhQ2xaHkNe0TqNMD3UrCHKm8S3Mi4=";
      };

      ponytail = buildPiPackage {
        owner = "DietrichGebert";
        repo = "ponytail";
        version = "4.9.0";
        hash = "sha256-8cYggVltBAlZ/Zj4pl1bOu7mQdZFXCmDGW4RSpvRA+w=";
        npmDepsHash = "sha256-ksR69uIv1y7z216SMgiYUC1kUrA3duodwjrTMj73SaQ=";
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
        ".pi/agent/extensions/pi-kitty.ts" = mkPiConfigSymlink "config/pi/extensions/pi-kitty.ts";
        ".pi/agent/extensions/question" = mkPiConfigSymlink "config/pi/extensions/question";
        ".pi/agent/extensions/pi-mcp-adapter".source = mcpAdapter;
        ".pi/agent/extensions/pi-web-access".source = webAccess;
        ".pi/agent/extensions/ponytail".source = ponytail;
      };
    };
}

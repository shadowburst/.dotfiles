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
          rev ? "v${version}",
        }:
        pkgs.buildNpmPackage {
          pname = repo;
          inherit version npmDepsHash;
          forceEmptyCache = true;
          src = pkgs.fetchFromGitHub {
            inherit
              owner
              repo
              hash
              rev
              ;
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

      browserTools = pkgs.buildNpmPackage {
        pname = "pi-browser-tools";
        version = "1.0.0";
        src = ../config/pi/extensions/browser;
        npmDepsHash = "sha256-aVy1q1BEsarAT1Ow6CcAFgwM9sR/Q8vjxuzzd+fPYj0=";
        dontNpmBuild = true;
        doCheck = true;
        checkPhase = ''
          runHook preCheck
          ${pkgs.nodejs}/bin/node --test state.test.ts
          runHook postCheck
        '';
        installPhase = ''
          runHook preInstall
          mkdir -p $out
          cp -r index.ts state.ts package.json package-lock.json node_modules $out/
          runHook postInstall
        '';
      };

      webAccess = buildPiPackage {
        owner = "nicobailon";
        repo = "pi-web-access";
        version = "0.27.0";
        hash = "sha256-q7o4PMNr2zZR+UXjL9ZGMuedehJEYayuoSH03QBBB68=";
        npmDepsHash = "sha256-d1RsJxvXHtaXlNTyDe9wemjTPdHMSlRbHKNmdqxAFGk=";
      };

      mcpAdapter = buildPiPackage {
        owner = "nicobailon";
        repo = "pi-mcp-adapter";
        version = "2.30.0";
        rev = "f3192880de5e87a2ceb2cb5820e50a91eb5ebcb2";
        hash = "sha256-cEJZqX/Rd8hIn0qRB4OhjmpU1bxOYbL6jaAa5bEbhq0=";
        npmDepsHash = "sha256-MrAt37DvVNwtMtSZmSeICtEkue9CoNQQPtQfYrUXmzI=";
      };

      tasks = buildPiPackage {
        owner = "tintinweb";
        repo = "pi-tasks";
        version = "0.9.0";
        rev = "29180d72498bdd77d5601dc77a9093d25da42102";
        hash = "sha256-2Wa+lUHQP6qvnRERaqFNu1IkOD4d5etb+x6oTCqh6Vg=";
        npmDepsHash = "sha256-A1JP5lX9TApIlOT/IO+1IEpyX9WEn2hiDmPFFolbX1Y=";
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
        ".pi/agent/tasks-config.json" = mkPiConfigSymlink "config/pi/tasks-config.json";
        ".pi/agent/extensions/pi-kitty.ts" = mkPiConfigSymlink "config/pi/extensions/pi-kitty.ts";
        ".pi/agent/extensions/auto-title.ts" = mkPiConfigSymlink "config/pi/extensions/auto-title.ts";
        ".pi/agent/extensions/browser".source = browserTools;
        ".pi/agent/extensions/footer" = mkPiConfigSymlink "config/pi/extensions/footer";
        ".pi/agent/extensions/question" = mkPiConfigSymlink "config/pi/extensions/question";
        ".pi/agent/extensions/subagents" = mkPiConfigSymlink "config/pi/extensions/subagents";
        ".pi/agent/extensions/tasks".source = tasks;
        ".pi/agent/extensions/usage" = mkPiConfigSymlink "config/pi/extensions/usage";
        ".pi/agent/extensions/pi-mcp-adapter".source = mcpAdapter;
        ".pi/agent/extensions/pi-web-access".source = webAccess;
        ".pi/agent/extensions/ponytail".source = ponytail;
      };
    };
}

{ self, ... }:
{
  flake.nixosModules.laravel =
    { ... }:
    {
      virtualisation.podman = {
        enable = true;
        dockerCompat = false;
        defaultNetwork.settings.dns_enabled = true;
      };

      virtualisation.containers.containersConf.settings.engine.runtime = "crun";

      users.users.${self.username}.linger = true;
    };

  flake.homeModules.laravel =
    { lib, pkgs, ... }:
    let
      version = "1.25.0";
      lerd = pkgs.stdenv.mkDerivation {
        pname = "lerd";
        inherit version;

        src = pkgs.fetchurl {
          url = "https://github.com/geodro/lerd/releases/download/v${version}/lerd_${version}_linux_amd64.tar.gz";
          hash = "sha256-xuRYbPlWbGPT9rx5Li6OLhx8DnDibkHadX0sEZ0EXCw=";
        };

        sourceRoot = ".";

        nativeBuildInputs = [ pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.stdenv.cc.cc.lib ];

        installPhase = ''
          runHook preInstall
          install -Dm755 lerd $out/bin/lerd
          runHook postInstall
        '';

        meta = with lib; {
          description = "Rootless Podman-based local PHP dev environment";
          homepage = "https://geodro.github.io/lerd";
          license = licenses.mit;
          platforms = [ "x86_64-linux" ];
          mainProgram = "lerd";
        };
      };
    in
    {
      home.packages = [
        lerd
        pkgs.nssTools
        pkgs.stripe-cli
        pkgs.tableplus
      ];

      home.file.".local/bin/lerd".source = lib.getExe lerd;
    };
}

_: {
  flake.homeModules.lerd =
    { lib, pkgs, ... }:
    let
      version = "1.18.0";
      lerd = pkgs.stdenv.mkDerivation {
        pname = "lerd";
        inherit version;

        src = pkgs.fetchurl {
          url = "https://github.com/geodro/lerd/releases/download/v${version}/lerd_${version}_linux_amd64.tar.gz";
          hash = "sha256-UUWBEedppAxpdVCbZ0c9tZUNWN2tbnEib6CFCdUja1U=";
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
      ];

      home.file.".local/bin/lerd".source = lib.getExe lerd;
    };
}

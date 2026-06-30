_:
let
  mkLerd =
    { lib, pkgs }:
    pkgs.stdenv.mkDerivation (finalAttrs: {
      pname = "lerd";
      version = "1.26.0";

      src = pkgs.fetchurl {
        url = "https://github.com/geodro/lerd/releases/download/v${finalAttrs.version}/lerd_${finalAttrs.version}_linux_amd64.tar.gz";
        hash = "sha256-KdUZwWggu+ZxKEn5LVG2CgrmxgXOFJAsN+gmDVSdbvI=";
      };

      sourceRoot = ".";

      nativeBuildInputs = [ pkgs.autoPatchelfHook ];
      buildInputs = [ pkgs.stdenv.cc.cc.lib ];

      installPhase = ''
        runHook preInstall
        install -Dm755 lerd $out/bin/lerd
        runHook postInstall
      '';

      meta = {
        description = "Rootless Podman-based local PHP dev environment";
        homepage = "https://geodro.github.io/lerd";
        license = lib.licenses.mit;
        platforms = [ "x86_64-linux" ];
        mainProgram = "lerd";
      };
    });
in
{
  flake.overlays.default = final: _prev: {
    lerd = mkLerd {
      lib = final.lib;
      pkgs = final;
    };
  };

  perSystem =
    { lib, pkgs, ... }:
    {
      packages.lerd = mkLerd { inherit lib pkgs; };
    };
}

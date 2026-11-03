{ pkgs }:
pkgs.buildNpmPackage {
  pname = "ponytail";
  version = "5.3.3";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "DietrichGebert";
    repo = "ponytail";
    rev = "v5.3.3";
    hash = "sha256-CY0EifTY0UVc6/FPGVJjEfYEf/8QLsINQmoYYKZYh98=";
  };

  npmDepsHash = "sha256-K39qZ0Ymq3Md3kHyfj2Gv6crFR9hRKhNgMDMbpvvVo8=";

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
}
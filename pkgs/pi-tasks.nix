{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-tasks";
  version = "0.9.1";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-tasks";
    rev = "c820715be1bf05db36d0739e88061b97b8c2c9d3";
    hash = "sha256-H+l6YII6IyYCBdTARP4W3MyYiHMANgjOJWrMHDZolJk=";
  };

  npmDepsHash = "sha256-ZrfJPUSca80MT+T7mb5zP8yiWulD7hF8DInzDbza5fs=";

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
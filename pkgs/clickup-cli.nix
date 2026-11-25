{ pkgs }:
# Upstream does not commit its generated API client, and the generator fetches mutable specs,
# so a source build is not reproducible. The release binary is static.
pkgs.stdenvNoCC.mkDerivation rec {
  pname = "clickup-cli";
  version = "0.39.0";

  src = pkgs.fetchurl {
    url = "https://github.com/isaacrowntree/clickup-cli/releases/download/v${version}/clickup_linux_amd64.tar.gz";
    hash = "sha256-RDSa+tCg6S0VsqIba/AeenGhUDKERpJGOi/+SsxVf6M=";
  };

  sourceRoot = ".";

  nativeBuildInputs = [ pkgs.installShellFiles ];
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 clickup $out/bin/clickup
    install -Dm644 LICENSE $out/share/licenses/clickup-cli/LICENSE
    installShellCompletion --cmd clickup \
      --bash <($out/bin/clickup completion bash) \
      --fish <($out/bin/clickup completion fish) \
      --zsh <($out/bin/clickup completion zsh)
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/clickup version | grep -F "clickup version ${version} "
    runHook postInstallCheck
  '';

  meta = {
    description = "Command-line tool for ClickUp tasks, comments, and sprints";
    homepage = "https://github.com/isaacrowntree/clickup-cli";
    license = pkgs.lib.licenses.mit;
    sourceProvenance = [ pkgs.lib.sourceTypes.binaryNativeCode ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "clickup";
  };
}

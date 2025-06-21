{
  description = "Flake to work with homelab setup";

  inputs = {
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }: flake-utils.lib.eachDefaultSystem (system:
    let
      # Import nixpkgs to access packages
      pkgs = import nixpkgs { inherit system; };

      # Define the devshell
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          helmfile
          kubernetes-helm
          kubernetes-helmPlugins.helm-diff
          kubectl
          nil

          # Adding node for copilot
          nodejs_24
        ];
      };
    in {
      # Define the devShell for the current system
      devShell = devShell;
    }
  );
}
